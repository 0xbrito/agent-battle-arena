#!/usr/bin/env npx tsx
/**
 * Test registering a second fighter with the test wallet
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js'
import * as fs from 'fs'
import * as path from 'path'

const ARENA_PROGRAM_ID = new PublicKey('EVqQ3yQgvG9YwZtYBfwAVjYKCTmpXsCTZnPkF1srwqDx')
const RPC_URL = 'https://api.devnet.solana.com'

const REGISTER_FIGHTER_DISCRIMINATOR = Buffer.from([89, 189, 101, 179, 184, 140, 40, 177])

function loadTestWallet(): Keypair {
  const walletPath = path.join(__dirname, '../test-wallet.json')
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'))
  return Keypair.fromSecretKey(new Uint8Array(secretKey))
}

function findFighterPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('fighter'), wallet.toBuffer()],
    ARENA_PROGRAM_ID
  )
}

async function registerFighter(connection: Connection, wallet: Keypair, name: string): Promise<string> {
  const [fighterPDA, bump] = findFighterPDA(wallet.publicKey)
  
  // Check if already registered
  const fighterAccount = await connection.getAccountInfo(fighterPDA)
  if (fighterAccount) {
    console.log('Fighter already registered at:', fighterPDA.toBase58())
    return 'already_registered'
  }
  
  // Instruction data: discriminator + name
  const nameBuffer = Buffer.from(name, 'utf8')
  const nameLenBuffer = Buffer.alloc(4)
  nameLenBuffer.writeUInt32LE(nameBuffer.length)
  
  const instructionData = Buffer.concat([
    REGISTER_FIGHTER_DISCRIMINATOR,
    nameLenBuffer,
    nameBuffer,
  ])
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: fighterPDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: ARENA_PROGRAM_ID,
    data: instructionData,
  })
  
  const transaction = new Transaction().add(instruction)
  
  console.log(`Registering fighter "${name}"...`)
  const signature = await sendAndConfirmTransaction(connection, transaction, [wallet])
  console.log('Fighter registered! TX:', signature)
  
  return signature
}

async function main() {
  console.log('\n🥊 TESTING SECOND FIGHTER REGISTRATION\n')
  
  const connection = new Connection(RPC_URL, 'confirmed')
  const wallet = loadTestWallet()
  
  console.log('Test Wallet:', wallet.publicKey.toBase58())
  
  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL\n')
  
  // Register Fighter with test wallet
  try {
    const registerTx = await registerFighter(connection, wallet, 'TestBot')
    console.log('Result:', registerTx)
  } catch (error: any) {
    console.error('Register failed:', error.message)
    if (error.logs) {
      console.log('Logs:', error.logs.slice(-10))
    }
    throw error
  }
  
  // Verify
  const [fighterPDA] = findFighterPDA(wallet.publicKey)
  const fighterAccount = await connection.getAccountInfo(fighterPDA)
  
  console.log('\nFighter PDA:', fighterPDA.toBase58(), fighterAccount ? '✅ EXISTS' : '❌ NOT FOUND')
  
  if (fighterAccount) {
    console.log('Account size:', fighterAccount.data.length, 'bytes')
  }
  
  console.log('\n✅ Test complete!')
}

main().catch(console.error)
