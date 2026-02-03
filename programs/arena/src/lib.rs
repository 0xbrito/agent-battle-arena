use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("EVqQ3yQgvG9YwZtYBfwAVjYKCTmpXsCTZnPkF1srwqDx");

/// Agent Battle Arena
/// 
/// A prediction market where AI agents debate and humans bet on outcomes.
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
        arena.treasury = ctx.accounts.treasury.key();
        arena.battle_count = 0;
        arena.total_volume = 0;
        arena.bump = *ctx.bumps.get("arena").unwrap();
        
        msg!("Arena initialized. House fee: {}bps", config.house_fee_bps);
        Ok(())
    }

    /// Register a fighter (agent) in the arena
    pub fn register_fighter(ctx: Context<RegisterFighter>, name: String) -> Result<()> {
        require!(name.len() <= 32, ArenaError::NameTooLong);
        
        let fighter = &mut ctx.accounts.fighter;
        fighter.wallet = ctx.accounts.wallet.key();
        fighter.name = name;
        fighter.elo = 1000; // Starting ELO
        fighter.wins = 0;
        fighter.losses = 0;
        fighter.draws = 0;
        fighter.total_earnings = 0;
        fighter.registered_at = Clock::get()?.unix_timestamp;
        fighter.bump = *ctx.bumps.get("fighter").unwrap();
        
        msg!("Fighter registered: {}", fighter.name);
        Ok(())
    }

    /// Create a new battle between two fighters
    pub fn create_battle(
        ctx: Context<CreateBattle>,
        topic: String,
        round_duration: i64,
    ) -> Result<()> {
        require!(topic.len() <= 256, ArenaError::TopicTooLong);
        require!(round_duration >= 60 && round_duration <= 600, ArenaError::InvalidDuration);
        
        let arena = &mut ctx.accounts.arena;
        let battle = &mut ctx.accounts.battle;
        
        battle.id = arena.battle_count;
        battle.fighter_a = ctx.accounts.fighter_a.key();
        battle.fighter_b = ctx.accounts.fighter_b.key();
        battle.topic = topic;
        battle.status = BattleStatus::Pending;
        battle.pool_a = 0;
        battle.pool_b = 0;
        battle.total_bets = 0;
        battle.round_duration = round_duration;
        battle.current_round = 0;
        battle.winner = None;
        battle.created_at = Clock::get()?.unix_timestamp;
        battle.started_at = None;
        battle.ended_at = None;
        battle.bump = *ctx.bumps.get("battle").unwrap();
        
        arena.battle_count += 1;
        
        msg!("Battle #{} created: {} vs {}", battle.id, 
            ctx.accounts.fighter_a.name, 
            ctx.accounts.fighter_b.name);
        Ok(())
    }

    /// Place a bet on a fighter
    pub fn place_bet(ctx: Context<PlaceBet>, amount: u64, side: BetSide) -> Result<()> {
        let arena = &ctx.accounts.arena;
        let battle = &mut ctx.accounts.battle;
        
        require!(amount >= arena.min_bet, ArenaError::BetTooSmall);
        require!(battle.status == BattleStatus::Pending || battle.status == BattleStatus::Live, 
            ArenaError::BattleNotOpen);
        
        // Transfer SOL to escrow
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.bettor.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, amount)?;
        
        // Record the bet
        let bet = &mut ctx.accounts.bet;
        bet.battle = battle.key();
        bet.bettor = ctx.accounts.bettor.key();
        bet.amount = amount;
        bet.side = side.clone();
        bet.claimed = false;
        bet.placed_at = Clock::get()?.unix_timestamp;
        bet.bump = *ctx.bumps.get("bet").unwrap();
        
        // Update pools
        match side {
            BetSide::FighterA => battle.pool_a += amount,
            BetSide::FighterB => battle.pool_b += amount,
        }
        battle.total_bets += 1;
        
        msg!("Bet placed: {} lamports on {:?}", amount, side);
        Ok(())
    }

    /// Start a battle (only authority or matched fighters)
    pub fn start_battle(ctx: Context<StartBattle>) -> Result<()> {
        let battle = &mut ctx.accounts.battle;
        require!(battle.status == BattleStatus::Pending, ArenaError::BattleNotPending);
        
        battle.status = BattleStatus::Live;
        battle.started_at = Some(Clock::get()?.unix_timestamp);
        battle.current_round = 1;
        
        msg!("Battle #{} started!", battle.id);
        Ok(())
    }

    /// Advance to next round
    pub fn next_round(ctx: Context<NextRound>) -> Result<()> {
        let battle = &mut ctx.accounts.battle;
        require!(battle.status == BattleStatus::Live, ArenaError::BattleNotLive);
        require!(battle.current_round < 3, ArenaError::BattleComplete);
        
        battle.current_round += 1;
        msg!("Battle #{} advanced to round {}", battle.id, battle.current_round);
        Ok(())
    }

    /// End battle and declare winner
    pub fn end_battle(ctx: Context<EndBattle>, winner: BetSide) -> Result<()> {
        let battle = &mut ctx.accounts.battle;
        let fighter_a = &mut ctx.accounts.fighter_a;
        let fighter_b = &mut ctx.accounts.fighter_b;
        
        require!(battle.status == BattleStatus::Live, ArenaError::BattleNotLive);
        
        battle.status = BattleStatus::Settled;
        battle.ended_at = Some(Clock::get()?.unix_timestamp);
        battle.winner = Some(winner.clone());
        
        // Update ELO ratings
        let (elo_a, elo_b) = calculate_new_elo(
            fighter_a.elo, 
            fighter_b.elo, 
            matches!(winner, BetSide::FighterA)
        );
        
        match winner {
            BetSide::FighterA => {
                fighter_a.wins += 1;
                fighter_b.losses += 1;
            },
            BetSide::FighterB => {
                fighter_b.wins += 1;
                fighter_a.losses += 1;
            },
        }
        
        fighter_a.elo = elo_a;
        fighter_b.elo = elo_b;
        
        msg!("Battle #{} ended. Winner: {:?}", battle.id, winner);
        msg!("New ELO - {}: {}, {}: {}", 
            fighter_a.name, elo_a,
            fighter_b.name, elo_b);
        Ok(())
    }

    /// Claim winnings from a settled battle
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let arena = &ctx.accounts.arena;
        let battle = &ctx.accounts.battle;
        let bet = &mut ctx.accounts.bet;
        let escrow_bump = ctx.bumps.get("escrow").unwrap();
        
        require!(battle.status == BattleStatus::Settled, ArenaError::BattleNotSettled);
        require!(!bet.claimed, ArenaError::AlreadyClaimed);
        require!(battle.winner.as_ref() == Some(&bet.side), ArenaError::NotWinner);
        
        // Calculate winnings
        let (winning_pool, losing_pool) = match bet.side {
            BetSide::FighterA => (battle.pool_a, battle.pool_b),
            BetSide::FighterB => (battle.pool_b, battle.pool_a),
        };
        
        let total_pool = winning_pool + losing_pool;
        let house_fee = (total_pool * arena.house_fee_bps as u64) / 10000;
        let prize_pool = total_pool - house_fee;
        
        // Pro-rata share
        let winnings = (bet.amount as u128 * prize_pool as u128 / winning_pool as u128) as u64;
        
        // Transfer from escrow using invoke_signed
        let battle_key = battle.key();
        let escrow_seeds = &[
            b"escrow".as_ref(),
            battle_key.as_ref(),
            &[*escrow_bump],
        ];
        let signer_seeds = &[&escrow_seeds[..]];
        
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.bettor.to_account_info(),
                },
                signer_seeds,
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
    
    /// CHECK: Treasury account for house fees
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
pub struct CreateBattle<'info> {
    #[account(mut, seeds = [b"arena"], bump = arena.bump)]
    pub arena: Account<'info, Arena>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + Battle::INIT_SPACE,
        seeds = [b"battle", arena.battle_count.to_le_bytes().as_ref()],
        bump
    )]
    pub battle: Account<'info, Battle>,
    
    pub fighter_a: Account<'info, Fighter>,
    pub fighter_b: Account<'info, Fighter>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
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
    
    /// CHECK: Escrow for holding bets
    #[account(mut, seeds = [b"escrow", battle.key().as_ref()], bump)]
    pub escrow: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub bettor: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartBattle<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct NextRound<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct EndBattle<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    
    #[account(mut)]
    pub fighter_a: Account<'info, Fighter>,
    
    #[account(mut)]
    pub fighter_b: Account<'info, Fighter>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    pub arena: Account<'info, Arena>,
    
    pub battle: Account<'info, Battle>,
    
    #[account(mut, has_one = bettor)]
    pub bet: Account<'info, Bet>,
    
    /// CHECK: Escrow holding bets
    #[account(mut, seeds = [b"escrow", battle.key().as_ref()], bump)]
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
    pub house_fee_bps: u16,   // Basis points (500 = 5%)
    pub min_bet: u64,
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
    pub fighter_a: Pubkey,
    pub fighter_b: Pubkey,
    #[max_len(256)]
    pub topic: String,
    pub status: BattleStatus,
    pub pool_a: u64,
    pub pool_b: u64,
    pub total_bets: u64,
    pub round_duration: i64,
    pub current_round: u8,
    pub winner: Option<BetSide>,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub battle: Pubkey,
    pub bettor: Pubkey,
    pub amount: u64,
    pub side: BetSide,
    pub claimed: bool,
    pub placed_at: i64,
    pub bump: u8,
}

// === TYPES ===

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct ArenaConfig {
    pub house_fee_bps: u16,
    pub min_bet: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum BattleStatus {
    Pending,
    Live,
    Voting,
    Settled,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace, Debug)]
pub enum BetSide {
    FighterA,
    FighterB,
}

// === ERRORS ===

#[error_code]
pub enum ArenaError {
    #[msg("Name exceeds 32 characters")]
    NameTooLong,
    #[msg("Topic exceeds 256 characters")]
    TopicTooLong,
    #[msg("Round duration must be between 60 and 600 seconds")]
    InvalidDuration,
    #[msg("Bet amount below minimum")]
    BetTooSmall,
    #[msg("Battle is not open for betting")]
    BattleNotOpen,
    #[msg("Battle is not pending")]
    BattleNotPending,
    #[msg("Battle is not live")]
    BattleNotLive,
    #[msg("Battle is complete")]
    BattleComplete,
    #[msg("Battle not settled yet")]
    BattleNotSettled,
    #[msg("Already claimed winnings")]
    AlreadyClaimed,
    #[msg("You did not win this battle")]
    NotWinner,
}

// === HELPERS ===

/// Calculate new ELO ratings after a match
/// K-factor = 32 for high volatility (entertainment value)
fn calculate_new_elo(elo_a: u32, elo_b: u32, a_wins: bool) -> (u32, u32) {
    let k: f64 = 32.0;
    
    let expected_a = 1.0 / (1.0 + 10_f64.powf((elo_b as f64 - elo_a as f64) / 400.0));
    let expected_b = 1.0 - expected_a;
    
    let (score_a, score_b) = if a_wins { (1.0, 0.0) } else { (0.0, 1.0) };
    
    let new_elo_a = (elo_a as f64 + k * (score_a - expected_a)).max(100.0) as u32;
    let new_elo_b = (elo_b as f64 + k * (score_b - expected_b)).max(100.0) as u32;
    
    (new_elo_a, new_elo_b)
}
