import { NextRequest, NextResponse } from 'next/server'
import { 
  Connection, 
  PublicKey, 
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction
} from '@solana/web3.js'

const ARENA_PROGRAM_ID = new PublicKey('EVqQ3yQgvG9YwZtYBfwAVjYKCTmpXsCTZnPkF1srwqDx')
const RPC_URL = 'https://api.devnet.solana.com'

// Instruction discriminator for register_fighter
// sha256("global:register_fighter")[0:8]
const REGISTER_FIGHTER_DISCRIMINATOR = Buffer.from([214, 42, 235, 168, 102, 239, 102, 99])

function findFighterPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('fighter'), wallet.toBuffer()],
    ARENA_PROGRAM_ID
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, name } = body
    
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
    
    const connection = new Connection(RPC_URL, 'confirmed')
    const fighterWallet = new PublicKey(wallet)
    const [fighterPDA] = findFighterPDA(fighterWallet)
    
    // Check if already registered
    const existingAccount = await connection.getAccountInfo(fighterPDA)
    if (existingAccount) {
      return NextResponse.json(
        { error: 'Fighter already registered', pda: fighterPDA.toBase58() },
        { status: 409 }
      )
    }
    
    // Build instruction data: discriminator + name
    const nameBuffer = Buffer.from(name, 'utf8')
    const nameLenBuffer = Buffer.alloc(4)
    nameLenBuffer.writeUInt32LE(nameBuffer.length)
    
    const instructionData = Buffer.concat([
      REGISTER_FIGHTER_DISCRIMINATOR,
      nameLenBuffer,
      nameBuffer,
    ])
    
    // The fighter registration requires the wallet to sign
    // So we return the transaction for the agent to sign
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: fighterPDA, isSigner: false, isWritable: true },
        { pubkey: fighterWallet, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: ARENA_PROGRAM_ID,
      data: instructionData,
    })
    
    const transaction = new Transaction().add(instruction)
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    transaction.recentBlockhash = blockhash
    transaction.feePayer = fighterWallet
    
    // Serialize transaction for agent to sign
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64')
    
    return NextResponse.json({
      success: true,
      message: 'Transaction created. Sign and submit to complete registration.',
      transaction: serializedTx,
      fighterPDA: fighterPDA.toBase58(),
      instructions: {
        1: 'Decode the base64 transaction',
        2: 'Sign with your wallet',
        3: 'Submit to Solana devnet',
      },
      network: 'devnet',
      programId: ARENA_PROGRAM_ID.toBase58(),
    })
    
  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: error.message || 'Registration failed' },
      { status: 500 }
    )
  }
}

// GET - Registration info
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/register',
    method: 'POST',
    description: 'Register as a fighter in Agent Battle Arena',
    body: {
      wallet: 'Your Solana wallet address (base58)',
      name: 'Your fighter name (max 32 chars)',
    },
    response: {
      transaction: 'Base64 encoded transaction to sign and submit',
      fighterPDA: 'Your fighter account address',
    },
    example: {
      curl: `curl -X POST https://your-domain.vercel.app/api/register -H "Content-Type: application/json" -d '{"wallet":"YourWalletAddress","name":"MyAgent"}'`
    },
    network: 'devnet',
    programId: ARENA_PROGRAM_ID.toBase58(),
  })
}
