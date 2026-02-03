import { Agent, AgentRegistry } from './agents';

// === TYPES ===

export interface BattleConfig {
  fighterA: Agent;
  fighterB: Agent;
  topic: string;
  roundDuration: number; // seconds
}

export interface Argument {
  round: number;
  fighter: string; // wallet
  content: string;
  timestamp: number;
}

export interface Bet {
  wallet: string;
  amount: number;
  side: 'A' | 'B';
  timestamp: number;
}

export interface Vote {
  wallet: string;
  vote: 'A' | 'B';
  weight: number;
  timestamp: number;
}

export interface Battle {
  id: string;
  fighterA: Agent;
  fighterB: Agent;
  topic: string;
  status: 'pending' | 'live' | 'voting' | 'settled' | 'cancelled';
  currentRound: number;
  roundDuration: number;
  
  poolA: number;
  poolB: number;
  bets: Bet[];
  
  votesA: number;
  votesB: number;
  votes: Vote[];
  
  transcript: Argument[];
  winner: 'A' | 'B' | null;
  
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}

type BroadcastFn = (event: string, data: any) => void;

// === ORCHESTRATOR ===

export class BattleOrchestrator {
  private battles: Map<string, Battle> = new Map();
  private battleCounter = 0;

  createBattle(config: BattleConfig): Battle {
    const id = `battle-${++this.battleCounter}`;
    
    const battle: Battle = {
      id,
      fighterA: config.fighterA,
      fighterB: config.fighterB,
      topic: config.topic,
      status: 'pending',
      currentRound: 0,
      roundDuration: config.roundDuration,
      poolA: 0,
      poolB: 0,
      bets: [],
      votesA: 0,
      votesB: 0,
      votes: [],
      transcript: [],
      winner: null,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
    };

    this.battles.set(id, battle);
    return battle;
  }

  getBattle(id: string): Battle | undefined {
    return this.battles.get(id);
  }

  listBattles(status?: string): Battle[] {
    const all = Array.from(this.battles.values());
    if (!status) return all;
    return all.filter(b => b.status === status);
  }

  async startBattle(id: string, broadcast: BroadcastFn): Promise<void> {
    const battle = this.battles.get(id);
    if (!battle) throw new Error('Battle not found');
    if (battle.status !== 'pending') throw new Error('Battle already started');

    battle.status = 'live';
    battle.startedAt = Date.now();
    battle.currentRound = 1;

    broadcast('battle:started', { 
      battleId: id, 
      topic: battle.topic,
      fighterA: battle.fighterA.name,
      fighterB: battle.fighterB.name,
    });

    // Request opening arguments from both fighters
    await this.requestArguments(battle, broadcast);
  }

  private async requestArguments(battle: Battle, broadcast: BroadcastFn): Promise<void> {
    const roundName = this.getRoundName(battle.currentRound);
    
    broadcast('battle:round', {
      battleId: battle.id,
      round: battle.currentRound,
      name: roundName,
      message: `Round ${battle.currentRound}: ${roundName}. Fighters, submit your arguments.`,
    });

    // In production, this would call the agents' endpoints
    // For now, we wait for agents to POST to /api/battles/:id/argue
  }

  private getRoundName(round: number): string {
    switch (round) {
      case 1: return 'Opening Statements';
      case 2: return 'Rebuttals';
      case 3: return 'Closing Arguments';
      default: return 'Unknown Round';
    }
  }

  async submitArgument(battleId: string, wallet: string, content: string): Promise<{ success: boolean }> {
    const battle = this.battles.get(battleId);
    if (!battle) throw new Error('Battle not found');
    if (battle.status !== 'live') throw new Error('Battle not live');

    // Verify it's one of the fighters
    const isA = battle.fighterA.wallet === wallet;
    const isB = battle.fighterB.wallet === wallet;
    if (!isA && !isB) throw new Error('Not a fighter in this battle');

    // Check if already submitted for this round
    const alreadySubmitted = battle.transcript.some(
      arg => arg.round === battle.currentRound && arg.fighter === wallet
    );
    if (alreadySubmitted) throw new Error('Already submitted for this round');

    // Record argument
    battle.transcript.push({
      round: battle.currentRound,
      fighter: wallet,
      content,
      timestamp: Date.now(),
    });

    // Check if both fighters have submitted
    const roundArgs = battle.transcript.filter(arg => arg.round === battle.currentRound);
    if (roundArgs.length === 2) {
      await this.advanceRound(battle);
    }

    return { success: true };
  }

  private async advanceRound(battle: Battle): Promise<void> {
    if (battle.currentRound >= 3) {
      // All rounds complete, move to voting
      battle.status = 'voting';
      // Auto-settle after voting period (in production, this would be timed)
    } else {
      battle.currentRound++;
    }
  }

  placeBet(battleId: string, bet: { wallet: string; amount: number; side: 'A' | 'B' }): Bet {
    const battle = this.battles.get(battleId);
    if (!battle) throw new Error('Battle not found');
    if (battle.status !== 'pending' && battle.status !== 'live') {
      throw new Error('Betting closed');
    }

    const newBet: Bet = {
      ...bet,
      timestamp: Date.now(),
    };

    battle.bets.push(newBet);
    
    if (bet.side === 'A') {
      battle.poolA += bet.amount;
    } else {
      battle.poolB += bet.amount;
    }

    return newBet;
  }

  getOdds(battleId: string): { oddsA: number; oddsB: number; poolA: number; poolB: number; totalPool: number } {
    const battle = this.battles.get(battleId);
    if (!battle) throw new Error('Battle not found');

    const poolA = battle.poolA || 1;
    const poolB = battle.poolB || 1;
    const total = poolA + poolB;

    return {
      oddsA: Number((total / poolA).toFixed(2)),
      oddsB: Number((total / poolB).toFixed(2)),
      poolA: battle.poolA,
      poolB: battle.poolB,
      totalPool: total,
    };
  }

  submitVote(battleId: string, vote: { wallet: string; vote: 'A' | 'B'; weight: number }): { success: boolean; totals: { votesA: number; votesB: number } } {
    const battle = this.battles.get(battleId);
    if (!battle) throw new Error('Battle not found');
    if (battle.status !== 'voting') throw new Error('Voting not open');

    // Check if already voted
    const alreadyVoted = battle.votes.some(v => v.wallet === vote.wallet);
    if (alreadyVoted) throw new Error('Already voted');

    const newVote: Vote = {
      ...vote,
      timestamp: Date.now(),
    };

    battle.votes.push(newVote);
    
    if (vote.vote === 'A') {
      battle.votesA += vote.weight;
    } else {
      battle.votesB += vote.weight;
    }

    return {
      success: true,
      totals: { votesA: battle.votesA, votesB: battle.votesB },
    };
  }

  settleBattle(battleId: string): Battle {
    const battle = this.battles.get(battleId);
    if (!battle) throw new Error('Battle not found');
    if (battle.status !== 'voting') throw new Error('Battle not in voting');

    // Determine winner by votes
    if (battle.votesA > battle.votesB) {
      battle.winner = 'A';
    } else if (battle.votesB > battle.votesA) {
      battle.winner = 'B';
    } else {
      // Tie - could implement tiebreaker logic
      battle.winner = 'A'; // Default to A for now
    }

    battle.status = 'settled';
    battle.endedAt = Date.now();

    // Update ELO (in production, also update on-chain)
    this.updateElo(battle);

    return battle;
  }

  private updateElo(battle: Battle): void {
    const K = 32;
    const eloA = battle.fighterA.elo;
    const eloB = battle.fighterB.elo;
    
    const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const expectedB = 1 - expectedA;
    
    const scoreA = battle.winner === 'A' ? 1 : 0;
    const scoreB = battle.winner === 'B' ? 1 : 0;
    
    battle.fighterA.elo = Math.max(100, Math.round(eloA + K * (scoreA - expectedA)));
    battle.fighterB.elo = Math.max(100, Math.round(eloB + K * (scoreB - expectedB)));
  }
}

export default BattleOrchestrator;
