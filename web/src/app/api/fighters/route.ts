import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'

// Force dynamic rendering - MUST be at top level
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs' // Force serverless function, not edge cache

const ARENA_PROGRAM_ID = new PublicKey('6fh5E6VPXzAww1mU9M84sBgtqUXDDVY9HZh47tGBFCKb')
const RPC_URL = 'https://api.devnet.solana.com'

// Fighter account discriminator: sha256("account:Fighter")[0:8]
const FIGHTER_DISCRIMINATOR = Buffer.from([24, 221, 27, 113, 60, 210, 101, 211])

interface Fighter {
  wallet: string
  name: string
  elo: number
  wins: number
  losses: number
  draws: number
  totalEarnings: number
  registeredAt: number
}

function parseFighterAccount(data: Buffer): Fighter | null {
  try {
    // Check discriminator
    const discriminator = data.slice(0, 8)
    if (!discriminator.equals(FIGHTER_DISCRIMINATOR)) {
      return null
    }
    
    let offset = 8
    
    // wallet (32 bytes)
    const wallet = new PublicKey(data.slice(offset, offset + 32)).toBase58()
    offset += 32
    
    // name (4 byte length + string)
    const nameLen = data.readUInt32LE(offset)
    offset += 4
    const name = data.slice(offset, offset + nameLen).toString('utf8')
    offset += nameLen
    
    // elo (4 bytes u32)
    const elo = data.readUInt32LE(offset)
    offset += 4
    
    // wins (4 bytes u32)
    const wins = data.readUInt32LE(offset)
    offset += 4
    
    // losses (4 bytes u32)
    const losses = data.readUInt32LE(offset)
    offset += 4
    
    // draws (4 bytes u32)
    const draws = data.readUInt32LE(offset)
    offset += 4
    
    // totalEarnings (8 bytes u64)
    const totalEarnings = Number(data.readBigUInt64LE(offset)) / 1e9
    offset += 8
    
    // registeredAt (8 bytes i64)
    const registeredAt = Number(data.readBigInt64LE(offset))
    
    return { wallet, name, elo, wins, losses, draws, totalEarnings, registeredAt }
  } catch (e) {
    console.error('Failed to parse fighter:', e)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const connection = new Connection(RPC_URL, 'confirmed')
    
    // Get all program accounts owned by our program
    const accounts = await connection.getProgramAccounts(ARENA_PROGRAM_ID)
    
    const fighters: Fighter[] = []
    
    for (const { pubkey, account } of accounts) {
      const fighter = parseFighterAccount(account.data)
      if (fighter) {
        fighters.push(fighter)
      }
    }
    
    // Sort by ELO descending
    fighters.sort((a, b) => b.elo - a.elo)
    
    return NextResponse.json({
      fighters,
      count: fighters.length,
      network: 'devnet',
      fetchedAt: new Date().toISOString(),
      accountsFound: accounts.length
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch fighters' },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        }
      }
    )
  }
}
