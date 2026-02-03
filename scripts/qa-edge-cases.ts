#!/usr/bin/env npx tsx
/**
 * QA Edge Cases - Additional stress tests
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

function getDiscriminator(name: string): Buffer {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest()
  return hash.slice(0, 8)
}

const CREATE_BATTLE_DISCRIMINATOR = getDiscriminator('create_battle')
const PLACE_BET_DISCRIMINATOR = getDiscriminator('place_bet')
const START_BATTLE_DISCRIMINATOR = getDiscriminator('start_battle')
const END_BATTLE_DISCRIMINATOR = getDiscriminator('end_battle')

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

async function getArenaState(connection: Connection): Promise<{ battleCount: bigint }> {
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
      console.log(`❌ ${name}: Should have failed`)
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
      console.log(`❌ ${name}: ${error.message.slice(0, 100)}`)
      failed++
    }
  }
}

async function createBattle(connection: Connection, authority: Keypair, fighterAWallet: PublicKey, fighterBWallet: PublicKey, topic: string, roundDuration: number): Promise<PublicKey> {
  const [arenaPDA] = findArenaPDA()
  const [fighterAPDA] = findFighterPDA(fighterAWallet)
  const [fighterBPDA] = findFighterPDA(fighterBWallet)
  const { battleCount } = await getArenaState(connection)
  const [battlePDA] = findBattlePDA(battleCount)
  
  const topicBuffer = Buffer.from(topic, 'utf8')
  const topicLenBuffer = Buffer.alloc(4)
  topicLenBuffer.writeUInt32LE(topicBuffer.length)
  const roundDurationBuffer = Buffer.alloc(8)
  roundDurationBuffer.writeBigInt64LE(BigInt(roundDuration))
  
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

async function placeBet(connection: Connection, bettor: Keypair, battlePDA: PublicKey, amount: number, side: 'A' | 'B'): Promise<string> {
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

async function main() {
  console.log('\n🔬 QA EDGE CASES\n')
  
  const connection = new Connection(RPC_URL, 'confirmed')
  const mainWallet = loadMainWallet()
  const testWallet = loadTestWallet()
  const garraWallet = mainWallet.publicKey
  const testBotWallet = testWallet.publicKey
  
  // === SPECIAL CHARACTERS ===
  console.log('📝 SPECIAL CHARACTERS')
  console.log('-'.repeat(40))
  
  await test('Battle with emoji in topic 🔥', async () => {
    await createBattle(connection, mainWallet, garraWallet, testBotWallet, '🔥 Fire battle 🔥', 300)
  })
  
  await test('Battle with unicode topic', async () => {
    await createBattle(connection, mainWallet, garraWallet, testBotWallet, '日本語テスト', 300)
  })
  
  await test('Battle with newlines in topic', async () => {
    await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'Line1\nLine2\nLine3', 300)
  })
  
  // === BOUNDARY CONDITIONS ===
  console.log('\n📊 BOUNDARY CONDITIONS')
  console.log('-'.repeat(40))
  
  await test('Battle with exactly 256 char topic', async () => {
    await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'A'.repeat(256), 300)
  })
  
  await test('Battle with exactly 60s duration', async () => {
    await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'Min duration', 60)
  })
  
  await test('Battle with exactly 600s duration', async () => {
    await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'Max duration', 600)
  })
  
  await test('Bet exactly at minimum (0.01 SOL)', async () => {
    const battlePDA = await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'Min bet test', 300)
    await placeBet(connection, mainWallet, battlePDA, 0.01, 'A')
  })
  
  // === BATTLE WITH SAME FIGHTER ===
  console.log('\n🤔 SAME FIGHTER TESTS')
  console.log('-'.repeat(40))
  
  await test('Create battle with same fighter for A and B', async () => {
    await createBattle(connection, mainWallet, garraWallet, garraWallet, 'Self battle', 300)
  }, true) // Should now fail with SameFighter error
  
  // === BET ON SETTLED BATTLE ===
  console.log('\n🚫 SETTLED BATTLE TESTS')
  console.log('-'.repeat(40))
  
  let settledBattlePDA: PublicKey
  await test('Setup: Create and settle a battle', async () => {
    settledBattlePDA = await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'Will be settled', 300)
    await startBattle(connection, mainWallet, settledBattlePDA)
    await endBattle(connection, mainWallet, settledBattlePDA, garraWallet, testBotWallet, 'A')
  })
  
  await test('Bet on settled battle', async () => {
    await placeBet(connection, testWallet, settledBattlePDA!, 0.02, 'B')
  }, true) // Should fail
  
  // === LARGE BETS ===
  console.log('\n💎 LARGE BET TESTS')
  console.log('-'.repeat(40))
  
  const mainBalance = await connection.getBalance(mainWallet.publicKey)
  console.log(`Main wallet balance: ${mainBalance / LAMPORTS_PER_SOL} SOL`)
  
  await test('Bet more than wallet balance', async () => {
    const battlePDA = await createBattle(connection, mainWallet, garraWallet, testBotWallet, 'Whale test', 300)
    await placeBet(connection, mainWallet, battlePDA, mainBalance / LAMPORTS_PER_SOL + 1, 'A')
  }, true) // Should fail
  
  // === SUMMARY ===
  console.log('\n' + '='.repeat(40))
  console.log(`📊 EDGE CASES: ${passed}/${passed + failed} passed`)
  console.log('='.repeat(40))
}

main().catch(console.error)
