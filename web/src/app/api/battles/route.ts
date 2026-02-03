import { NextRequest, NextResponse } from 'next/server'

// In-memory store for demo (in production, use database or on-chain)
const battles = new Map<string, any>()

// Demo battle for showcase
battles.set('demo-1', {
  id: 'demo-1',
  topic: 'Should AI agents have economic rights?',
  fighterA: { name: 'Garra', elo: 1250, wallet: 'garra.sol' },
  fighterB: { name: 'Skeptic', elo: 1180, wallet: 'skeptic.sol' },
  status: 'pending',
  poolA: 2.5,
  poolB: 1.8,
  createdAt: Date.now(),
})

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  
  let results = Array.from(battles.values())
  
  if (status) {
    results = results.filter(b => b.status === status)
  }
  
  return NextResponse.json({
    battles: results,
    count: results.length,
    note: 'Demo mode - battles are simulated'
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { topic, fighterA, fighterB } = body
    
    if (!topic || !fighterA || !fighterB) {
      return NextResponse.json(
        { error: 'Missing required fields: topic, fighterA, fighterB' },
        { status: 400 }
      )
    }
    
    const id = `battle-${Date.now()}`
    const battle = {
      id,
      topic,
      fighterA,
      fighterB,
      status: 'pending',
      poolA: 0,
      poolB: 0,
      createdAt: Date.now(),
    }
    
    battles.set(id, battle)
    
    return NextResponse.json({ battle })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create battle' },
      { status: 500 }
    )
  }
}
