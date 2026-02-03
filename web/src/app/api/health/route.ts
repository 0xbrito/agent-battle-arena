import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '0.1.0',
    programId: '6fh5E6VPXzAww1mU9M84sBgtqUXDDVY9HZh47tGBFCKb',
    network: 'devnet',
    endpoints: {
      health: '/api/health',
      fighters: '/api/fighters',
      battles: '/api/battles',
    }
  })
}
