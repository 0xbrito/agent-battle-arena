import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '0.1.0',
    programId: 'EVqQ3yQgvG9YwZtYBfwAVjYKCTmpXsCTZnPkF1srwqDx',
    network: 'devnet',
    endpoints: {
      health: '/api/health',
      fighters: '/api/fighters',
      battles: '/api/battles',
    }
  })
}
