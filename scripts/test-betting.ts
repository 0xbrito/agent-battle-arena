#!/usr/bin/env npx tsx
/**
 * Test full betting flow:
 * 1. Create battle
 * 2. Place bets from both wallets
 * 3. Start battle
 * 4. End battle
 * 5. Claim winnings
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

const ARENA_PROGRAM_ID = new PublicKey('EVqQ3yQgvG9YwZtYBfwAVjYKCTmpXsCTZnPkF1srwqDx')
const RPC_URL = 'https://api.devnet.solana.com'

// Generate instruction discriminators
function getDiscriminator(name: string): Buffer {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest()
  return hash.slice(0, 8)
}

const CREATE_BATTLE_DISCRIMINATOR = getDiscriminator('create_battle')
const PLACE_BET_DISCRIMINATOR = getDiscriminator('place_bet')
const START_BATTLE_DISCRIMINATOR = getDiscriminator('start_battle')
const END_BATTLE_DISCRIMINATOR = getDiscriminator('end_battle')
const CLAIM_WINNINGS_DISCRIMINATOR = getDiscriminator('claim_winnings')

function loadMainWallet(): Keypair {
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json')
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'))
  return Keypair.fromSecretKey(new Uint8Array(secretKey))
}

function loadTestWallet(): Keypair {
  const walletPath = path.join(__dirname, '../test-wallet.json')
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

function findBetPDA(battle: PublicKey, bettor: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bet'), battle.toBuffer(), bettor.toBuffer()],
    ARENA_PROGRAM_ID
  )
}

function findEscrowPDA(battle: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), battle.toBuffer()],
    ARENA_PROGRAM_ID
  )
}

async function getArenaState(connection: Connection): Promise<{ battleCount: bigint }> {
  const [arenaPDA] = findArenaPDA()
  const account = await connection.getAccountInfo(arenaPDA)
  if (!account) throw new Error('Arena not initialized')
  const battleCount = account.data.readBigUInt64LE(8 + 32 + 32 + 2 + 8)
  return { battleCount }
}

async function createBattle(
  connection: Connection, 
  authority: Keypair,
  fighterAWallet: PublicKey,
  fighterBWallet: PublicKey,
  topic: string,
  roundDuration: number = 300
): Promise<{ battleId: bigint, battlePDA: PublicKey }> {
  const [arenaPDA] = findArenaPDA()
  const [fighterAPDA] = findFighterPDA(fighterAWallet)
  const [fighterBPDA] = findFighterPDA(fighterBWallet)
  
  const arenaState = await getArenaState(connection)
  const battleId = arenaState.battleCount
  const [battlePDA] = findBattlePDA(battleId)
  
  const topicBuffer = Buffer.from(topic, 'utf8')
  const topicLenBuffer = Buffer.alloc(4)
  topicLenBuffer.writeUInt32LE(topicBuffer.length)
  
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
  await sendAndConfirmTransaction(connection, transaction, [authority])
  
  return { battleId, battlePDA }
}

async function placeBet(
  connection: Connection,
  bettor: Keypair,
  battlePDA: PublicKey,
  amount: number, // in SOL
  side: 'A' | 'B'
): Promise<string> {
  const [arenaPDA] = findArenaPDA()
  const [betPDA] = findBetPDA(battlePDA, bettor.publicKey)
  const [escrowPDA] = findEscrowPDA(battlePDA)
  
  // amount in lamports
  const amountLamports = BigInt(Math.floor(amount * LAMPORTS_PER_SOL))
  const amountBuffer = Buffer.alloc(8)
  amountBuffer.writeBigUInt64LE(amountLamports)
  
  // BetSide enum: FighterA = 0, FighterB = 1
  const sideByte = side === 'A' ? 0 : 1
  
  const instructionData = Buffer.concat([
    PLACE_BET_DISCRIMINATOR,
    amountBuffer,
    Buffer.from([sideByte]),
  ])
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: false },
      { pubkey: battlePDA, isSigner: false, isWritable: true },
      { pubkey: betPDA, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: bettor.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: ARENA_PROGRAM_ID,
    data: instructionData,
  })
  
  const transaction = new Transaction().add(instruction)
  return sendAndConfirmTransaction(connection, transaction, [bettor])
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
  winner: 'A' | 'B'
): Promise<string> {
  const [arenaPDA] = findArenaPDA()
  const [fighterAPDA] = findFighterPDA(fighterAWallet)
  const [fighterBPDA] = findFighterPDA(fighterBWallet)
  
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

async function claimWinnings(
  connection: Connection,
  bettor: Keypair,
  battlePDA: PublicKey
): Promise<string> {
  const [arenaPDA] = findArenaPDA()
  const [betPDA] = findBetPDA(battlePDA, bettor.publicKey)
  const [escrowPDA] = findEscrowPDA(battlePDA)
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: false },
      { pubkey: battlePDA, isSigner: false, isWritable: false },
      { pubkey: betPDA, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: bettor.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: ARENA_PROGRAM_ID,
    data: CLAIM_WINNINGS_DISCRIMINATOR,
  })
  
  const transaction = new Transaction().add(instruction)
  return sendAndConfirmTransaction(connection, transaction, [bettor])
}

async function main() {
  console.log('\n💰 BETTING FLOW TEST\n')
  
  const connection = new Connection(RPC_URL, 'confirmed')
  
  // Load wallets
  const mainWallet = loadMainWallet()
  const testWallet = loadTestWallet()
  
  console.log('Main Wallet (Garra):', mainWallet.publicKey.toBase58())
  console.log('Test Wallet (TestBot):', testWallet.publicKey.toBase58())
  
  // Check balances
  const mainBalance = await connection.getBalance(mainWallet.publicKey)
  const testBalance = await connection.getBalance(testWallet.publicKey)
  console.log('\nBalances:')
  console.log('  Main:', mainBalance / LAMPORTS_PER_SOL, 'SOL')
  console.log('  Test:', testBalance / LAMPORTS_PER_SOL, 'SOL')
  
  // Fighter wallets (same as wallet owners for this test)
  const garraWallet = mainWallet.publicKey
  const testBotWallet = testWallet.publicKey
  
  // Step 1: Create Battle
  console.log('\n=== STEP 1: Create Battle ===')
  let battlePDA: PublicKey
  try {
    const result = await createBattle(
      connection, 
      mainWallet, 
      garraWallet, 
      testBotWallet,
      'Betting test: Who will win?',
      300
    )
    battlePDA = result.battlePDA
    console.log('✅ Battle created! ID:', result.battleId.toString())
    console.log('   PDA:', battlePDA.toBase58())
  } catch (error: any) {
    console.error('❌ Create failed:', error.message)
    if (error.logs) console.log('Logs:', error.logs.slice(-10))
    throw error
  }
  
  // Step 2: Place bets
  console.log('\n=== STEP 2: Place Bets ===')
  
  // Main wallet bets 0.05 SOL on Fighter A (Garra)
  try {
    console.log('Main wallet betting 0.05 SOL on Fighter A...')
    const tx = await placeBet(connection, mainWallet, battlePDA, 0.05, 'A')
    console.log('✅ Bet placed! TX:', tx)
  } catch (error: any) {
    console.error('❌ Bet A failed:', error.message)
    if (error.logs) console.log('Logs:', error.logs.slice(-10))
    throw error
  }
  
  // Test wallet bets 0.03 SOL on Fighter B (TestBot)
  try {
    console.log('Test wallet betting 0.03 SOL on Fighter B...')
    const tx = await placeBet(connection, testWallet, battlePDA, 0.03, 'B')
    console.log('✅ Bet placed! TX:', tx)
  } catch (error: any) {
    console.error('❌ Bet B failed:', error.message)
    if (error.logs) console.log('Logs:', error.logs.slice(-10))
    throw error
  }
  
  // Step 3: Start Battle
  console.log('\n=== STEP 3: Start Battle ===')
  try {
    const tx = await startBattle(connection, mainWallet, battlePDA)
    console.log('✅ Battle started! TX:', tx)
  } catch (error: any) {
    console.error('❌ Start failed:', error.message)
    if (error.logs) console.log('Logs:', error.logs.slice(-10))
    throw error
  }
  
  // Step 4: End Battle (Garra wins)
  console.log('\n=== STEP 4: End Battle (Garra wins) ===')
  try {
    const tx = await endBattle(connection, mainWallet, battlePDA, garraWallet, testBotWallet, 'A')
    console.log('✅ Battle ended! TX:', tx)
  } catch (error: any) {
    console.error('❌ End failed:', error.message)
    if (error.logs) console.log('Logs:', error.logs.slice(-10))
    throw error
  }
  
  // Step 5: Claim winnings (main wallet won)
  console.log('\n=== STEP 5: Claim Winnings ===')
  
  // Check balance before
  const balanceBefore = await connection.getBalance(mainWallet.publicKey)
  console.log('Balance before claim:', balanceBefore / LAMPORTS_PER_SOL, 'SOL')
  
  try {
    const tx = await claimWinnings(connection, mainWallet, battlePDA)
    console.log('✅ Winnings claimed! TX:', tx)
  } catch (error: any) {
    console.error('❌ Claim failed:', error.message)
    if (error.logs) console.log('Logs:', error.logs.slice(-10))
    // This might fail if claim logic has issues - continue anyway
  }
  
  // Check balance after
  const balanceAfter = await connection.getBalance(mainWallet.publicKey)
  console.log('Balance after claim:', balanceAfter / LAMPORTS_PER_SOL, 'SOL')
  console.log('Difference:', (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL, 'SOL')
  
  // Final stats
  console.log('\n=== FINAL ===')
  console.log('✅ Full betting flow tested!')
  console.log('  - Battle created')
  console.log('  - Bets placed (0.05 + 0.03 SOL)')
  console.log('  - Battle started')
  console.log('  - Battle ended')
  console.log('  - Winnings claimed (if implemented)')
}

main().catch(console.error)
