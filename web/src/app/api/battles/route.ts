import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ARENA_PROGRAM_ID = new PublicKey('EVqQ3yQgvG9YwZtYBfwAVjYKCTmpXsCTZnPkF1srwqDx')
const RPC_URL = 'https://api.devnet.solana.com'

// Battle discriminator
const BATTLE_DISCRIMINATOR = Buffer.from([81, 148, 121, 71, 63, 166, 116, 24])

// Battle status enum
const BATTLE_STATUS = ['pending', 'live', 'voting', 'settled', 'cancelled']

interface Battle {
  id: number
  pubkey: string
  fighterA: string
  fighterB: string
  topic: string
  status: string
  poolA: number
  poolB: number
  totalBets: number
  winner: string | null
  createdAt: number
}

function parseBattleAccount(pubkey: PublicKey, data: Buffer): Battle | null {
  try {
    const discriminator = data.slice(0, 8)
    if (!discriminator.equals(BATTLE_DISCRIMINATOR)) {
      return null
    }
    
    let offset = 8
    
    // id (u64)
    const id = Number(data.readBigUInt64LE(offset))
    offset += 8
    
    // fighter_a (Pubkey - 32 bytes)
    const fighterA = new PublicKey(data.slice(offset, offset + 32)).toBase58()
    offset += 32
    
    // fighter_b (Pubkey - 32 bytes)
    const fighterB = new PublicKey(data.slice(offset, offset + 32)).toBase58()
    offset += 32
    
    // topic (4 byte length + string)
    const topicLen = data.readUInt32LE(offset)
    offset += 4
    const topic = data.slice(offset, offset + topicLen).toString('utf8')
    offset += topicLen
    
    // status (1 byte enum)
    const statusIndex = data.readUInt8(offset)
    const status = BATTLE_STATUS[statusIndex] || 'unknown'
    offset += 1
    
    // pool_a (u64)
    const poolA = Number(data.readBigUInt64LE(offset)) / 1e9
    offset += 8
    
    // pool_b (u64)
    const poolB = Number(data.readBigUInt64LE(offset)) / 1e9
    offset += 8
    
    // total_bets (u64)
    const totalBets = Number(data.readBigUInt64LE(offset))
    offset += 8
    
    // round_duration (i64) - skip
    offset += 8
    
    // current_round (u8) - skip
    offset += 1
    
    // winner (Option<BetSide>) - 1 byte for Some/None, 1 byte for value if Some
    const hasWinner = data.readUInt8(offset)
    offset += 1
    let winner: string | null = null
    if (hasWinner === 1) {
      const winnerSide = data.readUInt8(offset)
      winner = winnerSide === 0 ? 'A' : 'B'
    }
    offset += 1
    
    // created_at (i64)
    const createdAt = Number(data.readBigInt64LE(offset))
    
    return {
      id,
      pubkey: pubkey.toBase58(),
      fighterA,
      fighterB,
      topic,
      status,
      poolA,
      poolB,
      totalBets,
      winner,
      createdAt
    }
  } catch (e) {
    console.error('Failed to parse battle:', e)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const statusFilter = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '20')
    
    const connection = new Connection(RPC_URL, 'confirmed')
    const accounts = await connection.getProgramAccounts(ARENA_PROGRAM_ID)
    
    const battles: Battle[] = []
    
    for (const { pubkey, account } of accounts) {
      const battle = parseBattleAccount(pubkey, account.data)
      if (battle) {
        battles.push(battle)
      }
    }
    
    // Filter by status if provided
    let filtered = battles
    if (statusFilter) {
      filtered = battles.filter(b => b.status === statusFilter)
    }
    
    // Sort by created_at descending (most recent first)
    filtered.sort((a, b) => b.createdAt - a.createdAt)
    
    // Limit results
    const limited = filtered.slice(0, limit)
    
    return NextResponse.json({
      battles: limited,
      count: limited.length,
      total: battles.length,
      network: 'devnet'
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch battles' },
      { status: 500 }
    )
  }
}
