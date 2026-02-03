import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';

// Program ID (update after deploy)
export const ARENA_PROGRAM_ID = new PublicKey('ArenaBattleProgram11111111111111111111111111');

// === TYPES ===

export interface Fighter {
  wallet: PublicKey;
  name: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  totalEarnings: number;
  registeredAt: number;
}

export interface Battle {
  id: number;
  fighterA: PublicKey;
  fighterB: PublicKey;
  topic: string;
  status: BattleStatus;
  poolA: number;
  poolB: number;
  totalBets: number;
  roundDuration: number;
  currentRound: number;
  winner: BetSide | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}

export interface Bet {
  battle: PublicKey;
  bettor: PublicKey;
  amount: number;
  side: BetSide;
  claimed: boolean;
  placedAt: number;
}

export enum BattleStatus {
  Pending = 'pending',
  Live = 'live',
  Voting = 'voting',
  Settled = 'settled',
  Cancelled = 'cancelled',
}

export enum BetSide {
  FighterA = 'fighterA',
  FighterB = 'fighterB',
}

// === PDA HELPERS ===

export function findArenaPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('arena')],
    ARENA_PROGRAM_ID
  );
}

export function findFighterPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('fighter'), wallet.toBuffer()],
    ARENA_PROGRAM_ID
  );
}

export function findBattlePDA(battleId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('battle'), new BN(battleId).toArrayLike(Buffer, 'le', 8)],
    ARENA_PROGRAM_ID
  );
}

export function findBetPDA(battle: PublicKey, bettor: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bet'), battle.toBuffer(), bettor.toBuffer()],
    ARENA_PROGRAM_ID
  );
}

export function findEscrowPDA(battle: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), battle.toBuffer()],
    ARENA_PROGRAM_ID
  );
}

// === CLIENT ===

export class ArenaClient {
  private connection: Connection;
  private wallet: Keypair | null;

  constructor(rpcUrl: string, wallet?: Keypair) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.wallet = wallet || null;
  }

  // === READ METHODS ===

  async getFighter(wallet: PublicKey): Promise<Fighter | null> {
    const [pda] = findFighterPDA(wallet);
    const account = await this.connection.getAccountInfo(pda);
    if (!account) return null;
    // Decode account data (simplified - in production use Anchor's coder)
    return this.decodeFighter(account.data);
  }

  async getBattle(battleId: number): Promise<Battle | null> {
    const [pda] = findBattlePDA(battleId);
    const account = await this.connection.getAccountInfo(pda);
    if (!account) return null;
    return this.decodeBattle(account.data);
  }

  async getBet(battle: PublicKey, bettor: PublicKey): Promise<Bet | null> {
    const [pda] = findBetPDA(battle, bettor);
    const account = await this.connection.getAccountInfo(pda);
    if (!account) return null;
    return this.decodeBet(account.data);
  }

  async getLeaderboard(limit = 50): Promise<Fighter[]> {
    // In production, use getProgramAccounts with filters
    // For now, return empty - will implement with proper indexing
    return [];
  }

  async getActiveBattles(): Promise<Battle[]> {
    // In production, use getProgramAccounts with filters
    return [];
  }

  // === ODDS CALCULATION ===

  calculateOdds(battle: Battle): { oddsA: number; oddsB: number } {
    const poolA = battle.poolA || 1;
    const poolB = battle.poolB || 1;
    const total = poolA + poolB;
    
    return {
      oddsA: Number((total / poolA).toFixed(2)),
      oddsB: Number((total / poolB).toFixed(2)),
    };
  }

  calculatePotentialWinnings(battle: Battle, amount: number, side: BetSide): number {
    const { oddsA, oddsB } = this.calculateOdds(battle);
    const odds = side === BetSide.FighterA ? oddsA : oddsB;
    return Math.floor(amount * odds * 0.95); // 5% house fee
  }

  // === DECODE HELPERS ===
  // Simplified decoders - in production, use Anchor's BorshCoder

  private decodeFighter(data: Buffer): Fighter {
    // Skip 8-byte discriminator
    let offset = 8;
    const wallet = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.slice(offset, offset + nameLen).toString('utf8');
    offset += nameLen;
    
    const elo = data.readUInt32LE(offset);
    offset += 4;
    const wins = data.readUInt32LE(offset);
    offset += 4;
    const losses = data.readUInt32LE(offset);
    offset += 4;
    const draws = data.readUInt32LE(offset);
    offset += 4;
    
    const totalEarnings = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const registeredAt = Number(data.readBigInt64LE(offset));

    return { wallet, name, elo, wins, losses, draws, totalEarnings, registeredAt };
  }

  private decodeBattle(data: Buffer): Battle {
    // Simplified - would need proper implementation
    return {} as Battle;
  }

  private decodeBet(data: Buffer): Bet {
    // Simplified - would need proper implementation
    return {} as Bet;
  }
}

// === ELO CALCULATION ===

export function calculateEloChange(
  eloA: number,
  eloB: number,
  aWins: boolean
): { newEloA: number; newEloB: number; changeA: number; changeB: number } {
  const K = 32;
  
  const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const expectedB = 1 - expectedA;
  
  const scoreA = aWins ? 1 : 0;
  const scoreB = aWins ? 0 : 1;
  
  const changeA = Math.round(K * (scoreA - expectedA));
  const changeB = Math.round(K * (scoreB - expectedB));
  
  return {
    newEloA: Math.max(100, eloA + changeA),
    newEloB: Math.max(100, eloB + changeB),
    changeA,
    changeB,
  };
}

export default ArenaClient;
