#!/usr/bin/env npx tsx
/**
 * Test a full battle between Garra and TestBot
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
import * as crypto from 'crypto'

const ARENA_PROGRAM_ID = new PublicKey('6fh5E6VPXzAww1mU9M84sBgtqUXDDVY9HZh47tGBFCKb')
const RPC_URL = 'https://api.devnet.solana.com'

// Generate instruction discriminators (first 8 bytes of sha256("global:<instruction_name>"))
function getDiscriminator(name: string): Buffer {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest()
  return hash.slice(0, 8)
}

const CREATE_BATTLE_DISCRIMINATOR = getDiscriminator('create_battle')
const START_BATTLE_DISCRIMINATOR = getDiscriminator('start_battle')
const END_BATTLE_DISCRIMINATOR = getDiscriminator('end_battle')

function loadMainWallet(): Keypair {
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

function findBattlePDA(battleId: bigint): [PublicKey, number] {
  const idBuffer = Buffer.alloc(8)
  idBuffer.writeBigUInt64LE(battleId)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('battle'), idBuffer],
    ARENA_PROGRAM_ID
  )
}

async function getArenaState(connection: Connection): Promise<{ battleCount: bigint }> {
  const [arenaPDA] = findArenaPDA()
  const account = await connection.getAccountInfo(arenaPDA)
  if (!account) throw new Error('Arena not initialized')
  
  // Skip discriminator (8) + authority (32) + treasury (32) + house_fee_bps (2) + min_bet (8)
  const battleCount = account.data.readBigUInt64LE(8 + 32 + 32 + 2 + 8)
  return { battleCount }
}

async function createBattle(
  connection: Connection, 
  authority: Keypair,
  fighterAWallet: PublicKey,
  fighterBWallet: PublicKey,
  topic: string,
  roundDuration: number = 300 // 5 minutes default
): Promise<{ signature: string, battleId: bigint, battlePDA: PublicKey }> {
  const [arenaPDA] = findArenaPDA()
  const [fighterAPDA] = findFighterPDA(fighterAWallet)
  const [fighterBPDA] = findFighterPDA(fighterBWallet)
  
  // Get current battle count for the new battle ID
  const arenaState = await getArenaState(connection)
  const battleId = arenaState.battleCount
  const [battlePDA] = findBattlePDA(battleId)
  
  console.log('Creating battle #' + battleId.toString())
  console.log('  Fighter A PDA:', fighterAPDA.toBase58())
  console.log('  Fighter B PDA:', fighterBPDA.toBase58())
  console.log('  Battle PDA:', battlePDA.toBase58())
  
  // Encode topic string
  const topicBuffer = Buffer.from(topic, 'utf8')
  const topicLenBuffer = Buffer.alloc(4)
  topicLenBuffer.writeUInt32LE(topicBuffer.length)
  
  // Encode round duration (i64)
  const roundDurationBuffer = Buffer.alloc(8)
  roundDurationBuffer.writeBigInt64LE(BigInt(roundDuration))
  
  const instructionData = Buffer.concat([
    CREATE_BATTLE_DISCRIMINATOR,
    topicLenBuffer,
    topicBuffer,
    roundDurationBuffer,
  ])
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: true },
      { pubkey: battlePDA, isSigner: false, isWritable: true },
      { pubkey: fighterAPDA, isSigner: false, isWritable: false },
      { pubkey: fighterBPDA, isSigner: false, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: ARENA_PROGRAM_ID,
    data: instructionData,
  })
  
  const transaction = new Transaction().add(instruction)
  const signature = await sendAndConfirmTransaction(connection, transaction, [authority])
  
  return { signature, battleId, battlePDA }
}

async function startBattle(
  connection: Connection,
  authority: Keypair,
  battlePDA: PublicKey
): Promise<string> {
  const [arenaPDA] = findArenaPDA()
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: false },
      { pubkey: battlePDA, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    programId: ARENA_PROGRAM_ID,
    data: START_BATTLE_DISCRIMINATOR,
  })
  
  const transaction = new Transaction().add(instruction)
  return sendAndConfirmTransaction(connection, transaction, [authority])
}

async function endBattle(
  connection: Connection,
  authority: Keypair,
  battlePDA: PublicKey,
  fighterAWallet: PublicKey,
  fighterBWallet: PublicKey,
  winner: 'A' | 'B' | 'Draw'
): Promise<string> {
  const [arenaPDA] = findArenaPDA()
  const [fighterAPDA] = findFighterPDA(fighterAWallet)
  const [fighterBPDA] = findFighterPDA(fighterBWallet)
  
  // BetSide enum: FighterA = 0, FighterB = 1 (Draw would need different handling)
  const winnerByte = winner === 'A' ? 0 : 1
  
  const instructionData = Buffer.concat([
    END_BATTLE_DISCRIMINATOR,
    Buffer.from([winnerByte]),
  ])
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: false },
      { pubkey: battlePDA, isSigner: false, isWritable: true },
      { pubkey: fighterAPDA, isSigner: false, isWritable: true },
      { pubkey: fighterBPDA, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    programId: ARENA_PROGRAM_ID,
    data: instructionData,
  })
  
  const transaction = new Transaction().add(instruction)
  return sendAndConfirmTransaction(connection, transaction, [authority])
}

async function main() {
  console.log('\n⚔️  BATTLE TEST: Garra vs TestBot\n')
  
  const connection = new Connection(RPC_URL, 'confirmed')
  const authority = loadMainWallet()
  
  // Fighter wallets
  const garraWallet = new PublicKey('7aTffBE7GS1csbnegR8nXwvFUe7vTiXVkEBAeh1TEhE4')
  const testBotWallet = new PublicKey('9njrsodhR1BpkgemhhXNMCPKpmzKZ5pQ1oA2Cr9NpAc6')
  
  console.log('Authority:', authority.publicKey.toBase58())
  console.log('Fighter A (Garra):', garraWallet.toBase58())
  console.log('Fighter B (TestBot):', testBotWallet.toBase58())
  console.log('')
  
  // Step 1: Create Battle
  console.log('=== STEP 1: Create Battle ===')
  let battlePDA: PublicKey
  let battleId: bigint
  try {
    const result = await createBattle(
      connection, 
      authority, 
      garraWallet, 
      testBotWallet,
      'Who has the better takes?',
      300
    )
    console.log('✅ Battle created! TX:', result.signature)
    battlePDA = result.battlePDA
    battleId = result.battleId
  } catch (error: any) {
    console.error('❌ Create failed:', error.message)
    if (error.logs) console.log('Logs:', error.logs.slice(-10))
    throw error
  }
  
  // Step 2: Start Battle
  console.log('\n=== STEP 2: Start Battle ===')
  try {
    const tx = await startBattle(connection, authority, battlePDA)
    console.log('✅ Battle started! TX:', tx)
  } catch (error: any) {
    console.error('❌ Start failed:', error.message)
    if (error.logs) console.log('Logs:', error.logs.slice(-10))
    throw error
  }
  
  // Step 3: End Battle (Garra wins because obviously)
  console.log('\n=== STEP 3: End Battle (Garra wins) ===')
  try {
    const tx = await endBattle(connection, authority, battlePDA, garraWallet, testBotWallet, 'A')
    console.log('✅ Battle ended! TX:', tx)
  } catch (error: any) {
    console.error('❌ End failed:', error.message)
    if (error.logs) console.log('Logs:', error.logs.slice(-10))
    throw error
  }
  
  // Verify updated stats
  console.log('\n=== FINAL STATS ===')
  const [garraPDA] = findFighterPDA(garraWallet)
  const [testBotPDA] = findFighterPDA(testBotWallet)
  
  const garraAccount = await connection.getAccountInfo(garraPDA)
  const testBotAccount = await connection.getAccountInfo(testBotPDA)
  
  if (garraAccount && testBotAccount) {
    // Parse fighter data (skip discriminator 8 + wallet 32 + name length varies...)
    // For now just confirm they exist
    console.log('Garra PDA:', garraPDA.toBase58(), '✅')
    console.log('TestBot PDA:', testBotPDA.toBase58(), '✅')
  }
  
  console.log('\n🏆 Battle complete! Garra wins!')
}

main().catch(console.error)
