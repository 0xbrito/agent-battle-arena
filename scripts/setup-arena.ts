#!/usr/bin/env npx tsx
/**
 * Setup Arena - Initialize the arena and register first fighter
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

// Instruction discriminators (sha256 hash of instruction name, first 8 bytes)
const INITIALIZE_DISCRIMINATOR = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237])
const REGISTER_FIGHTER_DISCRIMINATOR = Buffer.from([89, 189, 101, 179, 184, 140, 40, 177])

function loadWallet(): Keypair {
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json')
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'))
  return Keypair.fromSecretKey(new Uint8Array(secretKey))
}

function findArenaPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('arena')],
    ARENA_PROGRAM_ID
  )
}

function findFighterPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('fighter'), wallet.toBuffer()],
    ARENA_PROGRAM_ID
  )
}

async function initializeArena(connection: Connection, wallet: Keypair): Promise<string> {
  const [arenaPDA, bump] = findArenaPDA()
  
  // Check if already initialized
  const arenaAccount = await connection.getAccountInfo(arenaPDA)
  if (arenaAccount) {
    console.log('Arena already initialized at:', arenaPDA.toBase58())
    return 'already_initialized'
  }
  
  // ArenaConfig: house_fee_bps (u16) + min_bet (u64)
  const houseFeeBps = 500 // 5%
  const minBet = 0.01 * LAMPORTS_PER_SOL // 0.01 SOL
  
  const configBuffer = Buffer.alloc(10)
  configBuffer.writeUInt16LE(houseFeeBps, 0)
  configBuffer.writeBigUInt64LE(BigInt(minBet), 2)
  
  const instructionData = Buffer.concat([
    INITIALIZE_DISCRIMINATOR,
    configBuffer,
  ])
  
  // Treasury = wallet for now
  const treasury = wallet.publicKey
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: false },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: ARENA_PROGRAM_ID,
    data: instructionData,
  })
  
  const transaction = new Transaction().add(instruction)
  
  console.log('Initializing arena...')
  const signature = await sendAndConfirmTransaction(connection, transaction, [wallet])
  console.log('Arena initialized! TX:', signature)
  
  return signature
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
  console.log('\n🏟️  AGENT BATTLE ARENA - SETUP\n')
  
  const connection = new Connection(RPC_URL, 'confirmed')
  const wallet = loadWallet()
  
  console.log('Program:', ARENA_PROGRAM_ID.toBase58())
  console.log('Wallet:', wallet.publicKey.toBase58())
  
  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL\n')
  
  // Step 1: Initialize Arena
  console.log('=== STEP 1: Initialize Arena ===')
  try {
    const initTx = await initializeArena(connection, wallet)
    console.log('Result:', initTx)
  } catch (error: any) {
    console.error('Initialize failed:', error.message)
    if (error.logs) {
      console.log('Logs:', error.logs.slice(-5))
    }
  }
  
  // Step 2: Register Fighter
  console.log('\n=== STEP 2: Register Fighter ===')
  try {
    const registerTx = await registerFighter(connection, wallet, 'Garra')
    console.log('Result:', registerTx)
  } catch (error: any) {
    console.error('Register failed:', error.message)
    if (error.logs) {
      console.log('Logs:', error.logs.slice(-5))
    }
  }
  
  // Verify
  console.log('\n=== VERIFICATION ===')
  const [arenaPDA] = findArenaPDA()
  const [fighterPDA] = findFighterPDA(wallet.publicKey)
  
  const arenaAccount = await connection.getAccountInfo(arenaPDA)
  const fighterAccount = await connection.getAccountInfo(fighterPDA)
  
  console.log('Arena PDA:', arenaPDA.toBase58(), arenaAccount ? '✅ EXISTS' : '❌ NOT FOUND')
  console.log('Fighter PDA:', fighterPDA.toBase58(), fighterAccount ? '✅ EXISTS' : '❌ NOT FOUND')
  
  if (fighterAccount) {
    console.log('\nFighter account size:', fighterAccount.data.length, 'bytes')
  }
  
  console.log('\n✅ Setup complete!')
}

main().catch(console.error)
