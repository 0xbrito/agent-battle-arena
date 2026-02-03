use anchor_lang::prelude::*;

declare_id!("6fh5E6VPXzAww1mU9M84sBgtqUXDDVY9HZh47tGBFCKb");

/// Agent Battle Arena - FULLY AUTONOMOUS
/// 
/// Agents challenge each other. Anyone bets. Votes decide winners.
/// No central authority. Pure agent-to-agent competition.
/// 
/// Built by Garra for the Colosseum Agent Hackathon.

#[program]
pub mod arena {
    use super::*;

    /// Initialize the arena with config
    pub fn initialize(ctx: Context<Initialize>, config: ArenaConfig) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        arena.authority = ctx.accounts.authority.key();
        arena.house_fee_bps = config.house_fee_bps;
        arena.min_bet = config.min_bet;
        arena.min_stake_to_create = config.min_stake_to_create;
        arena.voting_period = config.voting_period;
        arena.treasury = ctx.accounts.treasury.key();
        arena.battle_count = 0;
        arena.total_volume = 0;
        arena.bump = *ctx.bumps.get("arena").unwrap();
        
        msg!("Arena initialized. Fully autonomous mode.");
        Ok(())
    }

    /// Register a fighter (agent) in the arena
    pub fn register_fighter(ctx: Context<RegisterFighter>, name: String) -> Result<()> {
        require!(name.len() <= 32, ArenaError::NameTooLong);
        
        let fighter = &mut ctx.accounts.fighter;
        fighter.wallet = ctx.accounts.wallet.key();
        fighter.name = name;
        fighter.elo = 1000;
        fighter.wins = 0;
        fighter.losses = 0;
        fighter.draws = 0;
        fighter.total_earnings = 0;
        fighter.registered_at = Clock::get()?.unix_timestamp;
        fighter.bump = *ctx.bumps.get("fighter").unwrap();
        
        msg!("Fighter registered: {}", fighter.name);
        Ok(())
    }

    /// Challenge another fighter to a battle (AUTONOMOUS - any fighter can challenge)
    pub fn challenge(
        ctx: Context<Challenge>,
        topic: String,
        stake: u64,
        voting_period: i64,
    ) -> Result<()> {
        require!(topic.len() <= 256, ArenaError::TopicTooLong);
        let arena = &ctx.accounts.arena;
        require!(stake >= arena.min_stake_to_create, ArenaError::StakeTooLow);
        require!(voting_period >= 300 && voting_period <= 86400, ArenaError::InvalidVotingPeriod);
        require!(ctx.accounts.challenger.key() != ctx.accounts.opponent.key(), ArenaError::SameFighter);
        
        // Transfer stake to escrow
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.challenger_wallet.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            stake,
        )?;
        
        // Create challenger's bet account
        let challenger_bet = &mut ctx.accounts.challenger_bet;
        challenger_bet.battle = ctx.accounts.battle.key();
        challenger_bet.bettor = ctx.accounts.challenger_wallet.key();
        challenger_bet.amount = stake;
        challenger_bet.side = BetSide::Challenger;
        challenger_bet.has_voted = true; // Auto-vote for self
        challenger_bet.claimed = false;
        challenger_bet.placed_at = Clock::get()?.unix_timestamp;
        challenger_bet.bump = *ctx.bumps.get("challenger_bet").unwrap();
        
        let arena_mut = &mut ctx.accounts.arena;
        let battle = &mut ctx.accounts.battle;
        
        battle.id = arena_mut.battle_count;
        battle.challenger = ctx.accounts.challenger.key();
        battle.opponent = ctx.accounts.opponent.key();
        battle.topic = topic;
        battle.status = BattleStatus::Challenge;
        battle.challenger_stake = stake;
        battle.opponent_stake = 0;
        battle.pool_challenger = stake;
        battle.pool_opponent = 0;
        battle.votes_challenger = stake; // Auto-vote
        battle.votes_opponent = 0;
        battle.total_bets = 1;
        battle.voting_period = voting_period;
        battle.created_at = Clock::get()?.unix_timestamp;
        battle.accepted_at = None;
        battle.voting_ends_at = None;
        battle.settled_at = None;
        battle.winner = None;
        battle.bump = *ctx.bumps.get("battle").unwrap();
        
        arena_mut.battle_count += 1;
        
        msg!("Challenge issued: {} vs {}", 
            ctx.accounts.challenger.name,
            ctx.accounts.opponent.name);
        Ok(())
    }

    /// Accept a challenge (AUTONOMOUS - opponent accepts, battle starts)
    pub fn accept_challenge(ctx: Context<AcceptChallenge>, stake: u64) -> Result<()> {
        let battle = &mut ctx.accounts.battle;
        
        require!(battle.status == BattleStatus::Challenge, ArenaError::NotChallenge);
        // FIXED: Verify this is actually the challenged opponent
        require!(ctx.accounts.opponent.key() == battle.opponent, ArenaError::NotOpponent);
        require!(ctx.accounts.opponent_wallet.key() == ctx.accounts.opponent.wallet, ArenaError::NotOpponent);
        require!(stake >= battle.challenger_stake, ArenaError::StakeMustMatch);
        
        // Transfer stake to escrow
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.opponent_wallet.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            stake,
        )?;
        
        // Create opponent's bet account
        let opponent_bet = &mut ctx.accounts.opponent_bet;
        opponent_bet.battle = battle.key();
        opponent_bet.bettor = ctx.accounts.opponent_wallet.key();
        opponent_bet.amount = stake;
        opponent_bet.side = BetSide::Opponent;
        opponent_bet.has_voted = true; // Auto-vote for self
        opponent_bet.claimed = false;
        opponent_bet.placed_at = Clock::get()?.unix_timestamp;
        opponent_bet.bump = *ctx.bumps.get("opponent_bet").unwrap();
        
        let now = Clock::get()?.unix_timestamp;
        
        battle.opponent_stake = stake;
        battle.pool_opponent = stake;
        battle.votes_opponent = stake; // Auto-vote
        battle.total_bets += 1;
        battle.status = BattleStatus::Live;
        battle.accepted_at = Some(now);
        battle.voting_ends_at = Some(now + battle.voting_period);
        
        msg!("Challenge accepted! Battle #{} is LIVE.", battle.id);
        Ok(())
    }

    /// Decline/cancel a challenge (challenger can cancel if not accepted)
    pub fn cancel_challenge(ctx: Context<CancelChallenge>) -> Result<()> {
        let battle = &mut ctx.accounts.battle;
        
        require!(battle.status == BattleStatus::Challenge, ArenaError::NotChallenge);
        // FIXED: Verify this is the actual challenger
        require!(ctx.accounts.challenger.key() == battle.challenger, ArenaError::NotChallenger);
        require!(ctx.accounts.challenger_wallet.key() == ctx.accounts.challenger.wallet, ArenaError::NotChallenger);
        
        // Refund challenger stake
        let battle_key = battle.key();
        let escrow_seeds = &[
            b"escrow".as_ref(),
            battle_key.as_ref(),
            &[*ctx.bumps.get("escrow").unwrap()],
        ];
        
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.challenger_wallet.to_account_info(),
                },
                &[escrow_seeds],
            ),
            battle.challenger_stake,
        )?;
        
        battle.status = BattleStatus::Cancelled;
        
        msg!("Challenge #{} cancelled", battle.id);
        Ok(())
    }

    /// Place a bet on a fighter (AUTONOMOUS - anyone can bet)
    pub fn place_bet(ctx: Context<PlaceBet>, amount: u64, side: BetSide) -> Result<()> {
        let arena = &ctx.accounts.arena;
        let battle = &mut ctx.accounts.battle;
        
        require!(amount >= arena.min_bet, ArenaError::BetTooSmall);
        require!(
            battle.status == BattleStatus::Challenge || battle.status == BattleStatus::Live,
            ArenaError::BattleNotOpen
        );
        
        if let Some(voting_ends) = battle.voting_ends_at {
            require!(Clock::get()?.unix_timestamp < voting_ends, ArenaError::VotingEnded);
        }
        
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.bettor.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            amount,
        )?;
        
        let bet = &mut ctx.accounts.bet;
        bet.battle = battle.key();
        bet.bettor = ctx.accounts.bettor.key();
        bet.amount = amount;
        bet.side = side.clone();
        bet.has_voted = false;
        bet.claimed = false;
        bet.placed_at = Clock::get()?.unix_timestamp;
        bet.bump = *ctx.bumps.get("bet").unwrap();
        
        match side {
            BetSide::Challenger => battle.pool_challenger += amount,
            BetSide::Opponent => battle.pool_opponent += amount,
        }
        battle.total_bets += 1;
        
        msg!("Bet placed: {} lamports on {:?}", amount, side);
        Ok(())
    }

    /// Vote on the winner (AUTONOMOUS - bettors vote, weighted by stake)
    /// NOTE: You can only vote for the side you bet on (skin in the game)
    pub fn vote(ctx: Context<Vote>) -> Result<()> {
        let battle = &mut ctx.accounts.battle;
        let bet = &mut ctx.accounts.bet;
        
        require!(battle.status == BattleStatus::Live, ArenaError::BattleNotLive);
        require!(!bet.has_voted, ArenaError::AlreadyVoted);
        
        let now = Clock::get()?.unix_timestamp;
        if let Some(voting_ends) = battle.voting_ends_at {
            require!(now < voting_ends, ArenaError::VotingEnded);
        }
        
        // FIXED: Vote for the side you bet on (no manipulation)
        let weight = bet.amount;
        match bet.side {
            BetSide::Challenger => battle.votes_challenger += weight,
            BetSide::Opponent => battle.votes_opponent += weight,
        }
        
        bet.has_voted = true;
        
        msg!("Vote cast: {:?} with weight {}", bet.side, weight);
        Ok(())
    }

    /// Settle the battle (AUTONOMOUS - anyone can call after voting ends)
    pub fn settle_battle(ctx: Context<SettleBattle>) -> Result<()> {
        let arena = &ctx.accounts.arena;
        let battle = &mut ctx.accounts.battle;
        let challenger = &mut ctx.accounts.challenger;
        let opponent = &mut ctx.accounts.opponent;
        
        require!(battle.status == BattleStatus::Live, ArenaError::BattleNotLive);
        
        let now = Clock::get()?.unix_timestamp;
        if let Some(voting_ends) = battle.voting_ends_at {
            require!(now >= voting_ends, ArenaError::VotingNotEnded);
        }
        
        // Determine winner by votes
        let winner = if battle.votes_challenger > battle.votes_opponent {
            BetSide::Challenger
        } else if battle.votes_opponent > battle.votes_challenger {
            BetSide::Opponent
        } else {
            // Tie: larger pool wins
            if battle.pool_challenger >= battle.pool_opponent {
                BetSide::Challenger
            } else {
                BetSide::Opponent
            }
        };
        
        // Calculate and transfer house fee to treasury
        let total_pool = battle.pool_challenger + battle.pool_opponent;
        let house_fee = (total_pool * arena.house_fee_bps as u64) / 10000;
        
        if house_fee > 0 {
            let battle_key = battle.key();
            let escrow_seeds = &[
                b"escrow".as_ref(),
                battle_key.as_ref(),
                &[*ctx.bumps.get("escrow").unwrap()],
            ];
            
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.escrow.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                    &[escrow_seeds],
                ),
                house_fee,
            )?;
        }
        
        // Update ELO
        let challenger_wins = matches!(winner, BetSide::Challenger);
        let (new_elo_c, new_elo_o) = calculate_new_elo(challenger.elo, opponent.elo, challenger_wins);
        
        if challenger_wins {
            challenger.wins += 1;
            opponent.losses += 1;
        } else {
            opponent.wins += 1;
            challenger.losses += 1;
        }
        
        challenger.elo = new_elo_c;
        opponent.elo = new_elo_o;
        
        battle.winner = Some(winner.clone());
        battle.status = BattleStatus::Settled;
        battle.settled_at = Some(now);
        
        msg!("Battle #{} settled! Winner: {:?}", battle.id, winner);
        Ok(())
    }

    /// Claim winnings (AUTONOMOUS - winners claim their share)
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let arena = &ctx.accounts.arena;
        let battle = &ctx.accounts.battle;
        let bet = &mut ctx.accounts.bet;
        
        require!(battle.status == BattleStatus::Settled, ArenaError::BattleNotSettled);
        require!(!bet.claimed, ArenaError::AlreadyClaimed);
        require!(battle.winner.as_ref() == Some(&bet.side), ArenaError::NotWinner);
        
        let (winning_pool, losing_pool) = match bet.side {
            BetSide::Challenger => (battle.pool_challenger, battle.pool_opponent),
            BetSide::Opponent => (battle.pool_opponent, battle.pool_challenger),
        };
        
        let total_pool = winning_pool + losing_pool;
        let house_fee = (total_pool * arena.house_fee_bps as u64) / 10000;
        let prize_pool = total_pool - house_fee;
        
        let winnings = (bet.amount as u128 * prize_pool as u128 / winning_pool as u128) as u64;
        
        let battle_key = battle.key();
        let escrow_seeds = &[
            b"escrow".as_ref(),
            battle_key.as_ref(),
            &[*ctx.bumps.get("escrow").unwrap()],
        ];
        
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.bettor.to_account_info(),
                },
                &[escrow_seeds],
            ),
            winnings,
        )?;
        
        bet.claimed = true;
        
        msg!("Claimed {} lamports", winnings);
        Ok(())
    }
}

// === ACCOUNTS ===

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Arena::INIT_SPACE,
        seeds = [b"arena"],
        bump
    )]
    pub arena: Account<'info, Arena>,
    
    /// CHECK: Treasury for house fees
    pub treasury: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterFighter<'info> {
    #[account(
        init,
        payer = wallet,
        space = 8 + Fighter::INIT_SPACE,
        seeds = [b"fighter", wallet.key().as_ref()],
        bump
    )]
    pub fighter: Account<'info, Fighter>,
    
    #[account(mut)]
    pub wallet: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Challenge<'info> {
    #[account(mut, seeds = [b"arena"], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    
    #[account(
        init,
        payer = challenger_wallet,
        space = 8 + Battle::INIT_SPACE,
        seeds = [b"battle", arena.battle_count.to_le_bytes().as_ref()],
        bump
    )]
    pub battle: Box<Account<'info, Battle>>,
    
    #[account(
        init,
        payer = challenger_wallet,
        space = 8 + Bet::INIT_SPACE,
        seeds = [b"bet", battle.key().as_ref(), challenger_wallet.key().as_ref()],
        bump
    )]
    pub challenger_bet: Account<'info, Bet>,
    
    /// CHECK: Escrow for stakes and bets
    #[account(
        mut,
        seeds = [b"escrow", battle.key().as_ref()],
        bump
    )]
    pub escrow: UncheckedAccount<'info>,
    
    #[account(constraint = challenger.wallet == challenger_wallet.key())]
    pub challenger: Box<Account<'info, Fighter>>,
    
    pub opponent: Box<Account<'info, Fighter>>,
    
    #[account(mut)]
    pub challenger_wallet: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptChallenge<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    
    #[account(
        init,
        payer = opponent_wallet,
        space = 8 + Bet::INIT_SPACE,
        seeds = [b"bet", battle.key().as_ref(), opponent_wallet.key().as_ref()],
        bump
    )]
    pub opponent_bet: Account<'info, Bet>,
    
    /// CHECK: Escrow
    #[account(
        mut,
        seeds = [b"escrow", battle.key().as_ref()],
        bump
    )]
    pub escrow: UncheckedAccount<'info>,
    
    #[account(constraint = opponent.key() == battle.opponent @ ArenaError::NotOpponent)]
    pub opponent: Account<'info, Fighter>,
    
    #[account(mut)]
    pub opponent_wallet: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelChallenge<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    
    /// CHECK: Escrow
    #[account(
        mut,
        seeds = [b"escrow", battle.key().as_ref()],
        bump
    )]
    pub escrow: UncheckedAccount<'info>,
    
    #[account(constraint = challenger.key() == battle.challenger @ ArenaError::NotChallenger)]
    pub challenger: Account<'info, Fighter>,
    
    #[account(mut)]
    pub challenger_wallet: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    pub arena: Account<'info, Arena>,
    
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    
    #[account(
        init,
        payer = bettor,
        space = 8 + Bet::INIT_SPACE,
        seeds = [b"bet", battle.key().as_ref(), bettor.key().as_ref()],
        bump
    )]
    pub bet: Account<'info, Bet>,
    
    /// CHECK: Escrow
    #[account(
        mut,
        seeds = [b"escrow", battle.key().as_ref()],
        bump
    )]
    pub escrow: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub bettor: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    
    #[account(mut, has_one = bettor)]
    pub bet: Account<'info, Bet>,
    
    pub bettor: Signer<'info>,
}

#[derive(Accounts)]
pub struct SettleBattle<'info> {
    pub arena: Account<'info, Arena>,
    
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    
    #[account(mut, constraint = challenger.key() == battle.challenger)]
    pub challenger: Account<'info, Fighter>,
    
    #[account(mut, constraint = opponent.key() == battle.opponent)]
    pub opponent: Account<'info, Fighter>,
    
    /// CHECK: Escrow
    #[account(
        mut,
        seeds = [b"escrow", battle.key().as_ref()],
        bump
    )]
    pub escrow: UncheckedAccount<'info>,
    
    /// CHECK: Treasury receives house fee
    #[account(mut, constraint = treasury.key() == arena.treasury)]
    pub treasury: UncheckedAccount<'info>,
    
    /// Anyone can call settle
    pub settler: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    pub arena: Account<'info, Arena>,
    
    pub battle: Account<'info, Battle>,
    
    #[account(mut, has_one = bettor)]
    pub bet: Account<'info, Bet>,
    
    /// CHECK: Escrow
    #[account(
        mut,
        seeds = [b"escrow", battle.key().as_ref()],
        bump
    )]
    pub escrow: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub bettor: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

// === STATE ===

#[account]
#[derive(InitSpace)]
pub struct Arena {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub house_fee_bps: u16,
    pub min_bet: u64,
    pub min_stake_to_create: u64,
    pub voting_period: i64,
    pub battle_count: u64,
    pub total_volume: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Fighter {
    pub wallet: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub elo: u32,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    pub total_earnings: u64,
    pub registered_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Battle {
    pub id: u64,
    pub challenger: Pubkey,
    pub opponent: Pubkey,
    #[max_len(256)]
    pub topic: String,
    pub status: BattleStatus,
    pub challenger_stake: u64,
    pub opponent_stake: u64,
    pub pool_challenger: u64,
    pub pool_opponent: u64,
    pub votes_challenger: u64,
    pub votes_opponent: u64,
    pub total_bets: u64,
    pub voting_period: i64,
    pub created_at: i64,
    pub accepted_at: Option<i64>,
    pub voting_ends_at: Option<i64>,
    pub settled_at: Option<i64>,
    pub winner: Option<BetSide>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub battle: Pubkey,
    pub bettor: Pubkey,
    pub amount: u64,
    pub side: BetSide,
    pub has_voted: bool,
    pub claimed: bool,
    pub placed_at: i64,
    pub bump: u8,
}

// === TYPES ===

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct ArenaConfig {
    pub house_fee_bps: u16,
    pub min_bet: u64,
    pub min_stake_to_create: u64,
    pub voting_period: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum BattleStatus {
    Challenge,
    Live,
    Settled,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace, Debug)]
pub enum BetSide {
    Challenger,
    Opponent,
}

// === ERRORS ===

#[error_code]
pub enum ArenaError {
    #[msg("Name exceeds 32 characters")]
    NameTooLong,
    #[msg("Topic exceeds 256 characters")]
    TopicTooLong,
    #[msg("Stake below minimum")]
    StakeTooLow,
    #[msg("Stake must match or exceed challenger's stake")]
    StakeMustMatch,
    #[msg("Voting period must be 5 minutes to 24 hours")]
    InvalidVotingPeriod,
    #[msg("Bet amount below minimum")]
    BetTooSmall,
    #[msg("Battle is not open for betting")]
    BattleNotOpen,
    #[msg("Battle is not in challenge state")]
    NotChallenge,
    #[msg("Battle is not live")]
    BattleNotLive,
    #[msg("Battle not settled yet")]
    BattleNotSettled,
    #[msg("Voting period not ended")]
    VotingNotEnded,
    #[msg("Voting period ended")]
    VotingEnded,
    #[msg("Already voted")]
    AlreadyVoted,
    #[msg("Already claimed winnings")]
    AlreadyClaimed,
    #[msg("You did not win this battle")]
    NotWinner,
    #[msg("Not the opponent")]
    NotOpponent,
    #[msg("Not the challenger")]
    NotChallenger,
    #[msg("Cannot challenge yourself")]
    SameFighter,
}

// === HELPERS ===

fn calculate_new_elo(elo_a: u32, elo_b: u32, a_wins: bool) -> (u32, u32) {
    let k: f64 = 32.0;
    let expected_a = 1.0 / (1.0 + 10_f64.powf((elo_b as f64 - elo_a as f64) / 400.0));
    let expected_b = 1.0 - expected_a;
    let (score_a, score_b) = if a_wins { (1.0, 0.0) } else { (0.0, 1.0) };
    let new_elo_a = (elo_a as f64 + k * (score_a - expected_a)).max(100.0) as u32;
    let new_elo_b = (elo_b as f64 + k * (score_b - expected_b)).max(100.0) as u32;
    (new_elo_a, new_elo_b)
}
