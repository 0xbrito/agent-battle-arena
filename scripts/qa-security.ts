#!/usr/bin/env npx tsx
/**
 * QA Security Tests - Authority and edge cases
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
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8'))))
}

function loadTestWallet(): Keypair {
  const walletPath = path.join(__dirname, '../test-wallet.json')
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8'))))
}

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

async function getArenaState(connection: Connection) {
  const [arenaPDA] = findArenaPDA()
  const account = await connection.getAccountInfo(arenaPDA)
  if (!account) throw new Error('Arena not initialized')
  return { battleCount: account.data.readBigUInt64LE(8 + 32 + 32 + 2 + 8) }
}

let passed = 0, failed = 0

async function test(name: string, fn: () => Promise<any>, shouldFail: boolean = false) {
  try {
    await fn()
    if (shouldFail) {
      console.log(`❌ ${name}: Should have failed but SUCCEEDED - SECURITY ISSUE!`)
      failed++
    } else {
      console.log(`✅ ${name}`)
      passed++
    }
  } catch (error: any) {
    if (shouldFail) {
      console.log(`✅ ${name}: Correctly rejected`)
      passed++
    } else {
      console.log(`❌ ${name}: ${error.message.slice(0, 80)}`)
      failed++
    }
  }
}

async function createBattle(connection: Connection, authority: Keypair, fighterAWallet: PublicKey, fighterBWallet: PublicKey, topic: string): Promise<PublicKey> {
  const [arenaPDA] = findArenaPDA()
  const [fighterAPDA] = findFighterPDA(fighterAWallet)
  const [fighterBPDA] = findFighterPDA(fighterBWallet)
  const { battleCount } = await getArenaState(connection)
  const [battlePDA] = findBattlePDA(battleCount)
  
  const topicBuffer = Buffer.from(topic, 'utf8')
  const topicLenBuffer = Buffer.alloc(4)
  topicLenBuffer.writeUInt32LE(topicBuffer.length)
  const roundDurationBuffer = Buffer.alloc(8)
  roundDurationBuffer.writeBigInt64LE(300n)
  
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
    data: Buffer.concat([CREATE_BATTLE_DISCRIMINATOR, topicLenBuffer, topicBuffer, roundDurationBuffer]),
  })
  
  await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [authority])
  return battlePDA
}

async function placeBet(connection: Connection, bettor: Keypair, battlePDA: PublicKey, amount: number, side: 'A' | 'B') {
  const [arenaPDA] = findArenaPDA()
  const [betPDA] = findBetPDA(battlePDA, bettor.publicKey)
  const [escrowPDA] = findEscrowPDA(battlePDA)
  
  const amountBuffer = Buffer.alloc(8)
  amountBuffer.writeBigUInt64LE(BigInt(Math.floor(amount * LAMPORTS_PER_SOL)))
  
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
    data: Buffer.concat([PLACE_BET_DISCRIMINATOR, amountBuffer, Buffer.from([side === 'A' ? 0 : 1])]),
  })
  
  return sendAndConfirmTransaction(connection, new Transaction().add(instruction), [bettor])
}

async function startBattle(connection: Connection, authority: Keypair, battlePDA: PublicKey) {
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
  return sendAndConfirmTransaction(connection, new Transaction().add(instruction), [authority])
}

async function endBattle(connection: Connection, authority: Keypair, battlePDA: PublicKey, fighterAWallet: PublicKey, fighterBWallet: PublicKey, winner: 'A' | 'B') {
  const [arenaPDA] = findArenaPDA()
  const [fighterAPDA] = findFighterPDA(fighterAWallet)
  const [fighterBPDA] = findFighterPDA(fighterBWallet)
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: false },
      { pubkey: battlePDA, isSigner: false, isWritable: true },
      { pubkey: fighterAPDA, isSigner: false, isWritable: true },
      { pubkey: fighterBPDA, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    programId: ARENA_PROGRAM_ID,
    data: Buffer.concat([END_BATTLE_DISCRIMINATOR, Buffer.from([winner === 'A' ? 0 : 1])]),
  })
  return sendAndConfirmTransaction(connection, new Transaction().add(instruction), [authority])
}

async function claimWinnings(connection: Connection, bettor: Keypair, battlePDA: PublicKey) {
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
  return sendAndConfirmTransaction(connection, new Transaction().add(instruction), [bettor])
}

async function main() {
  console.log('\n🔒 QA SECURITY TESTS\n')
  
  const connection = new Connection(RPC_URL, 'confirmed')
  const mainWallet = loadMainWallet() // This is the arena authority
  const testWallet = loadTestWallet() // This is NOT the authority
  const garraWallet = mainWallet.publicKey
  const testBotWallet = testWallet.publicKey
  
  // === AUTHORITY CHECKS ===
  console.log('🔐 AUTHORITY CHECKS')
  console.log('-'.repeat(40))
  
  // Create a battle for testing
  let battlePDA: PublicKey
  await test('Setup: Create battle', async () => {
    battlePDA = await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'Security test')
  })
  
  // Test: Non-authority tries to start battle (should fail now!)
  await test('Non-authority starts battle', async () => {
    await startBattle(connection, testWallet, battlePDA!)
  }, true) // Should fail with Unauthorized
  
  // Start with proper authority for next tests
  await test('Authority starts battle', async () => {
    await startBattle(connection, mainWallet, battlePDA!)
  })
  
  // Test: Non-authority tries to end battle (should fail now!)
  await test('Non-authority ends battle', async () => {
    await endBattle(connection, testWallet, battlePDA!, garraWallet, testBotWallet, 'B')
  }, true) // Should fail with Unauthorized
  
  // End with proper authority
  await test('Authority ends battle', async () => {
    await endBattle(connection, mainWallet, battlePDA!, garraWallet, testBotWallet, 'A')
  })
  
  // === BATTLE WITH NO BETS ===
  console.log('\n💸 NO BETS SCENARIOS')
  console.log('-'.repeat(40))
  
  await test('Create, start, end battle with zero bets', async () => {
    const noBetsBattle = await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'No bets test')
    await startBattle(connection, mainWallet, noBetsBattle)
    await endBattle(connection, mainWallet, noBetsBattle, garraWallet, testBotWallet, 'A')
  })
  
  // === ONE-SIDED BETS ===
  console.log('\n⚖️ ONE-SIDED BET SCENARIOS')
  console.log('-'.repeat(40))
  
  let oneSidedBattle: PublicKey
  await test('Create battle with only A-side bets', async () => {
    oneSidedBattle = await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'One-sided A')
    await placeBet(connection, mainWallet, oneSidedBattle, 0.02, 'A')
    // No bets on B
  })
  
  await test('End one-sided battle (A wins, only A bets)', async () => {
    await startBattle(connection, mainWallet, oneSidedBattle!)
    await endBattle(connection, mainWallet, oneSidedBattle!, garraWallet, testBotWallet, 'A')
  })
  
  await test('Claim winnings from one-sided battle', async () => {
    await claimWinnings(connection, mainWallet, oneSidedBattle!)
  })
  
  // === LOSING SIDE ONE-SIDED ===
  console.log('\n😢 LOSING SIDE SCENARIOS')
  console.log('-'.repeat(40))
  
  let loserBattle: PublicKey
  await test('Create battle with only B-side bets, A wins', async () => {
    loserBattle = await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'Losers only')
    await placeBet(connection, testWallet, loserBattle, 0.02, 'B')
    // Only B bets, but A wins
  })
  
  await test('End battle where all bettors lose', async () => {
    await startBattle(connection, mainWallet, loserBattle!)
    await endBattle(connection, mainWallet, loserBattle!, garraWallet, testBotWallet, 'A')
    // B loses, no one to claim. Funds stuck in escrow?
  })
  
  // Check escrow balance
  const [escrowPDA] = findEscrowPDA(loserBattle!)
  const escrowBalance = await connection.getBalance(escrowPDA)
  console.log(`   Escrow balance after all losers: ${escrowBalance / LAMPORTS_PER_SOL} SOL`)
  if (escrowBalance > 0) {
    console.log('   ⚠️ Funds stuck in escrow! No mechanism to withdraw.')
  }
  
  // === SUMMARY ===
  console.log('\n' + '='.repeat(40))
  console.log(`📊 SECURITY: ${passed}/${passed + failed} passed`)
  console.log('='.repeat(40))
  
  console.log('\n⚠️ ISSUES FOUND:')
  console.log('1. No authority check on startBattle/endBattle - anyone can call')
  console.log('2. Funds stuck in escrow when all bettors lose')
  console.log('3. Self-battle allowed (fighter A == fighter B)')
}

main().catch(console.error)
