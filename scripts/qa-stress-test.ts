#!/usr/bin/env npx tsx
/**
 * QA Stress Test - Try to break everything
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

// Discriminators
function getDiscriminator(name: string): Buffer {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest()
  return hash.slice(0, 8)
}

const REGISTER_FIGHTER_DISCRIMINATOR = getDiscriminator('register_fighter')
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

// PDAs
function findArenaPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('arena')], ARENA_PROGRAM_ID)
}

function findFighterPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('fighter'), wallet.toBuffer()], ARENA_PROGRAM_ID)
}

function findBattlePDA(battleId: bigint): [PublicKey, number] {
  const idBuffer = Buffer.alloc(8)
  idBuffer.writeBigUInt64LE(battleId)
  return PublicKey.findProgramAddressSync([Buffer.from('battle'), idBuffer], ARENA_PROGRAM_ID)
}

function findBetPDA(battle: PublicKey, bettor: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('bet'), battle.toBuffer(), bettor.toBuffer()], ARENA_PROGRAM_ID)
}

function findEscrowPDA(battle: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('escrow'), battle.toBuffer()], ARENA_PROGRAM_ID)
}

async function getArenaState(connection: Connection): Promise<{ battleCount: bigint }> {
  const [arenaPDA] = findArenaPDA()
  const account = await connection.getAccountInfo(arenaPDA)
  if (!account) throw new Error('Arena not initialized')
  const battleCount = account.data.readBigUInt64LE(8 + 32 + 32 + 2 + 8)
  return { battleCount }
}

// Test result tracking
let passed = 0
let failed = 0
const results: { test: string; status: 'PASS' | 'FAIL'; error?: string }[] = []

async function expectSuccess(name: string, fn: () => Promise<any>) {
  try {
    await fn()
    console.log(`✅ ${name}`)
    passed++
    results.push({ test: name, status: 'PASS' })
  } catch (error: any) {
    console.log(`❌ ${name}: ${error.message}`)
    failed++
    results.push({ test: name, status: 'FAIL', error: error.message })
  }
}

async function expectFailure(name: string, fn: () => Promise<any>, expectedError?: string) {
  try {
    await fn()
    console.log(`❌ ${name}: Should have failed but succeeded`)
    failed++
    results.push({ test: name, status: 'FAIL', error: 'Expected failure but succeeded' })
  } catch (error: any) {
    if (expectedError && !error.message.includes(expectedError)) {
      console.log(`⚠️ ${name}: Failed but with unexpected error: ${error.message}`)
      failed++
      results.push({ test: name, status: 'FAIL', error: `Wrong error: ${error.message}` })
    } else {
      console.log(`✅ ${name}: Correctly rejected`)
      passed++
      results.push({ test: name, status: 'PASS' })
    }
  }
}

// === TEST FUNCTIONS ===

async function registerFighter(connection: Connection, wallet: Keypair, name: string): Promise<string> {
  const [fighterPDA] = findFighterPDA(wallet.publicKey)
  
  const nameBuffer = Buffer.from(name, 'utf8')
  const nameLenBuffer = Buffer.alloc(4)
  nameLenBuffer.writeUInt32LE(nameBuffer.length)
  
  const instructionData = Buffer.concat([REGISTER_FIGHTER_DISCRIMINATOR, nameLenBuffer, nameBuffer])
  
  const [arenaPDA] = findArenaPDA()
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: false },
      { pubkey: fighterPDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: ARENA_PROGRAM_ID,
    data: instructionData,
  })
  
  const transaction = new Transaction().add(instruction)
  return sendAndConfirmTransaction(connection, transaction, [wallet])
}

async function createBattle(
  connection: Connection,
  authority: Keypair,
  fighterAWallet: PublicKey,
  fighterBWallet: PublicKey,
  topic: string,
  roundDuration: number
): Promise<PublicKey> {
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
  
  const instructionData = Buffer.concat([CREATE_BATTLE_DISCRIMINATOR, topicLenBuffer, topicBuffer, roundDurationBuffer])
  
  const [arenaPDA] = findArenaPDA()
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: false },
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
  return battlePDA
}

async function placeBet(connection: Connection, bettor: Keypair, battlePDA: PublicKey, amount: number, side: 'A' | 'B'): Promise<string> {
  const [arenaPDA] = findArenaPDA()
  const [betPDA] = findBetPDA(battlePDA, bettor.publicKey)
  const [escrowPDA] = findEscrowPDA(battlePDA)
  
  const amountLamports = BigInt(Math.floor(amount * LAMPORTS_PER_SOL))
  const amountBuffer = Buffer.alloc(8)
  amountBuffer.writeBigUInt64LE(amountLamports)
  
  const sideByte = side === 'A' ? 0 : 1
  
  const instructionData = Buffer.concat([PLACE_BET_DISCRIMINATOR, amountBuffer, Buffer.from([sideByte])])
  
  const [arenaPDA] = findArenaPDA()
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: false },
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

async function startBattle(connection: Connection, authority: Keypair, battlePDA: PublicKey): Promise<string> {
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

async function endBattle(connection: Connection, authority: Keypair, battlePDA: PublicKey, fighterAWallet: PublicKey, fighterBWallet: PublicKey, winner: 'A' | 'B'): Promise<string> {
  const [fighterAPDA] = findFighterPDA(fighterAWallet)
  const [fighterBPDA] = findFighterPDA(fighterBWallet)
  
  const winnerByte = winner === 'A' ? 0 : 1
  const instructionData = Buffer.concat([END_BATTLE_DISCRIMINATOR, Buffer.from([winnerByte])])
  
  const [arenaPDA] = findArenaPDA()
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

async function claimWinnings(connection: Connection, bettor: Keypair, battlePDA: PublicKey): Promise<string> {
  const [arenaPDA] = findArenaPDA()
  const [betPDA] = findBetPDA(battlePDA, bettor.publicKey)
  const [escrowPDA] = findEscrowPDA(battlePDA)
  
  const [arenaPDA] = findArenaPDA()
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: false },
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
  console.log('\n🔨 QA STRESS TEST - BREAKING THE ARENA\n')
  console.log('='.repeat(50))
  
  const connection = new Connection(RPC_URL, 'confirmed')
  const mainWallet = loadMainWallet()
  const testWallet = loadTestWallet()
  
  // Generate a fresh wallet for edge case tests
  const freshWallet = Keypair.generate()
  
  // Airdrop to fresh wallet
  console.log('\n📦 Setup: Airdropping to fresh wallet...')
  try {
    const sig = await connection.requestAirdrop(freshWallet.publicKey, 0.5 * LAMPORTS_PER_SOL)
    await connection.confirmTransaction(sig)
    console.log('Airdrop complete')
  } catch (e) {
    console.log('Airdrop failed (rate limited?), some tests may fail')
  }
  
  const garraWallet = mainWallet.publicKey
  const testBotWallet = testWallet.publicKey
  
  // ========== FIGHTER REGISTRATION TESTS ==========
  console.log('\n📋 FIGHTER REGISTRATION TESTS')
  console.log('-'.repeat(50))
  
  // Test: Register with name too long (>32 chars)
  await expectFailure(
    'Register with name > 32 chars',
    () => registerFighter(connection, freshWallet, 'A'.repeat(33)),
    'NameTooLong'
  )
  
  // Test: Register existing fighter again (should fail - account exists)
  await expectFailure(
    'Register already registered fighter',
    () => registerFighter(connection, mainWallet, 'GarraAgain')
  )
  
  // Test: Register with empty name (might work, edge case)
  // Skip this as it might actually work and we don't want to waste the fresh wallet
  
  // ========== BATTLE CREATION TESTS ==========
  console.log('\n⚔️ BATTLE CREATION TESTS')
  console.log('-'.repeat(50))
  
  // Test: Create battle with topic too long
  await expectFailure(
    'Create battle with topic > 256 chars',
    () => createBattle(connection, mainWallet, garraWallet, testBotWallet, 'A'.repeat(257), 300),
    'TopicTooLong'
  )
  
  // Test: Create battle with invalid duration (too short)
  await expectFailure(
    'Create battle with duration < 60s',
    () => createBattle(connection, mainWallet, garraWallet, testBotWallet, 'Test', 30),
    'InvalidDuration'
  )
  
  // Test: Create battle with invalid duration (too long)
  await expectFailure(
    'Create battle with duration > 600s',
    () => createBattle(connection, mainWallet, garraWallet, testBotWallet, 'Test', 700),
    'InvalidDuration'
  )
  
  // Test: Create valid battle for further tests
  let battlePDA: PublicKey
  await expectSuccess('Create valid battle', async () => {
    battlePDA = await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'QA Test Battle', 300)
  })
  
  // ========== BETTING TESTS ==========
  console.log('\n💰 BETTING TESTS')
  console.log('-'.repeat(50))
  
  // Test: Bet below minimum (min is 0.01 SOL = 10_000_000 lamports)
  await expectFailure(
    'Bet below minimum (0.001 SOL)',
    () => placeBet(connection, mainWallet, battlePDA!, 0.001, 'A'),
    'BetTooSmall'
  )
  
  // Test: Valid bet
  await expectSuccess('Place valid bet (0.02 SOL)', async () => {
    await placeBet(connection, mainWallet, battlePDA!, 0.02, 'A')
  })
  
  // Test: Bet twice from same wallet (should fail - bet account exists)
  await expectFailure(
    'Bet twice from same wallet',
    () => placeBet(connection, mainWallet, battlePDA!, 0.02, 'A')
  )
  
  // Test: Second bettor
  await expectSuccess('Second bettor places bet', async () => {
    await placeBet(connection, testWallet, battlePDA!, 0.02, 'B')
  })
  
  // ========== BATTLE FLOW TESTS ==========
  console.log('\n🎮 BATTLE FLOW TESTS')
  console.log('-'.repeat(50))
  
  // Test: End battle before starting (should fail)
  await expectFailure(
    'End battle before starting',
    () => endBattle(connection, mainWallet, battlePDA!, garraWallet, testBotWallet, 'A'),
    'BattleNotLive'
  )
  
  // Test: Start battle
  await expectSuccess('Start battle', async () => {
    await startBattle(connection, mainWallet, battlePDA!)
  })
  
  // Test: Start already started battle
  await expectFailure(
    'Start already started battle',
    () => startBattle(connection, mainWallet, battlePDA!),
    'BattleNotPending'
  )
  
  // Test: Bet on live battle (should work per code)
  // Actually this creates a new bet account, skip as mainWallet already bet
  
  // Test: End battle
  await expectSuccess('End battle', async () => {
    await endBattle(connection, mainWallet, battlePDA!, garraWallet, testBotWallet, 'A')
  })
  
  // Test: End already ended battle
  await expectFailure(
    'End already ended battle',
    () => endBattle(connection, mainWallet, battlePDA!, garraWallet, testBotWallet, 'A'),
    'BattleNotLive'
  )
  
  // ========== CLAIMING TESTS ==========
  console.log('\n🏆 CLAIMING TESTS')
  console.log('-'.repeat(50))
  
  // Test: Loser tries to claim (testWallet bet on B, A won)
  await expectFailure(
    'Loser tries to claim winnings',
    () => claimWinnings(connection, testWallet, battlePDA!),
    'NotWinner'
  )
  
  // Test: Winner claims
  await expectSuccess('Winner claims winnings', async () => {
    await claimWinnings(connection, mainWallet, battlePDA!)
  })
  
  // Test: Winner tries to claim again
  await expectFailure(
    'Winner tries to claim twice',
    () => claimWinnings(connection, mainWallet, battlePDA!),
    'AlreadyClaimed'
  )
  
  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(50))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(50))
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`📈 Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`)
  
  if (failed > 0) {
    console.log('\n❌ Failed tests:')
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.test}: ${r.error}`)
    })
  }
  
  console.log('\n✅ QA Complete!')
}

main().catch(console.error)
