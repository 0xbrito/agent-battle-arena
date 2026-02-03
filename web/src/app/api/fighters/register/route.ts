import { NextRequest, NextResponse } from 'next/server'
import { PublicKey } from '@solana/web3.js'

const ARENA_PROGRAM_ID = new PublicKey('EVqQ3yQgvG9YwZtYBfwAVjYKCTmpXsCTZnPkF1srwqDx')

// In-memory registry for agents without on-chain registration
// In production, use a database
const offChainRegistry = new Map<string, {
  wallet: string
  name: string
  endpoint?: string
  elo: number
  registeredAt: number
}>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, name, endpoint } = body
    
    if (!wallet || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: wallet, name' },
        { status: 400 }
      )
    }
    
    if (name.length > 32) {
      return NextResponse.json(
        { error: 'Name must be 32 characters or less' },
        { status: 400 }
      )
    }
    
    // Validate wallet address
    try {
      new PublicKey(wallet)
    } catch {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      )
    }
    
    // Check if already registered
    if (offChainRegistry.has(wallet)) {
      const existing = offChainRegistry.get(wallet)!
      return NextResponse.json(
        { 
          error: 'Already registered',
          fighter: existing
        },
        { status: 409 }
      )
    }
    
    // Register off-chain
    const fighter = {
      wallet,
      name,
      endpoint: endpoint || null,
      elo: 1000,
      registeredAt: Date.now(),
    }
    
    offChainRegistry.set(wallet, fighter)
    
    return NextResponse.json({
      success: true,
      fighter,
      message: 'Registered in Arena (off-chain). For on-chain registration, use POST /api/register',
      onChainRegistration: {
        endpoint: '/api/register',
        description: 'Returns a transaction to sign for permanent on-chain registration',
      }
    })
    
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Registration failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  const fighters = Array.from(offChainRegistry.values())
  fighters.sort((a, b) => b.elo - a.elo)
  
  return NextResponse.json({
    fighters,
    count: fighters.length,
    note: 'Off-chain registry. On-chain fighters available at GET /api/fighters'
  })
}
