#!/usr/bin/env npx tsx
/**
 * Initialize the Arena on-chain
 * 
 * This script initializes the Arena account with configuration.
 * Only needs to be run once per deployment.
 * 
 * Usage: npx tsx scripts/init-arena.ts
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Program ID (deployed)
const ARENA_PROGRAM_ID = new PublicKey('EVqQ3yQgvG9YwZtYBfwAVjYKCTmpXsCTZnPkF1srwqDx');

// RPC endpoint
const RPC_URL = 'https://api.devnet.solana.com';

// Load wallet from default Solana CLI path
function loadWallet(): Keypair {
  const walletPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

// Find PDA for arena account
function findArenaPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('arena')],
    ARENA_PROGRAM_ID
  );
}

async function main() {
  console.log('🏟️  Agent Battle Arena - Initialization Script\n');
  console.log('Program ID:', ARENA_PROGRAM_ID.toBase58());
  
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = loadWallet();
  
  console.log('Wallet:', wallet.publicKey.toBase58());
  
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL\n');
  
  const [arenaPDA, bump] = findArenaPDA();
  console.log('Arena PDA:', arenaPDA.toBase58());
  console.log('Bump:', bump);
  
  // Check if arena already exists
  const arenaAccount = await connection.getAccountInfo(arenaPDA);
  
  if (arenaAccount) {
    console.log('\n✅ Arena already initialized!');
    console.log('Account size:', arenaAccount.data.length, 'bytes');
    return;
  }
  
  console.log('\n⚠️  Arena not initialized yet.');
  console.log('To initialize, you would need to call the initialize instruction.');
  console.log('This requires proper Anchor client setup with the IDL.\n');
  
  console.log('For now, verify the program is deployed:');
  const programInfo = await connection.getAccountInfo(ARENA_PROGRAM_ID);
  if (programInfo) {
    console.log('✅ Program exists!');
    console.log('   Executable:', programInfo.executable);
    console.log('   Data size:', programInfo.data.length, 'bytes');
  } else {
    console.log('❌ Program not found!');
  }
}

main().catch(console.error);
