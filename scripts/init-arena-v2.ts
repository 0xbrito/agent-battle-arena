import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';

const PROGRAM_ID = new PublicKey('6fh5E6VPXzAww1mU9M84sBgtqUXDDVY9HZh47tGBFCKb');

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load wallet
  const walletPath = path.join(process.env.HOME!, '.config/solana/id.json');
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  
  console.log('Wallet:', walletKeypair.publicKey.toBase58());
  console.log('Program:', PROGRAM_ID.toBase58());
  
  // Find Arena PDA
  const [arenaPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('arena')],
    PROGRAM_ID
  );
  console.log('Arena PDA:', arenaPDA.toBase58());
  
  // Check if arena exists
  const arenaAccount = await connection.getAccountInfo(arenaPDA);
  if (arenaAccount) {
    console.log('Arena already initialized!');
    console.log('Data length:', arenaAccount.data.length);
    return;
  }
  
  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/arena.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(idl, PROGRAM_ID, provider);
  
  // Initialize arena
  console.log('Initializing arena...');
  
  const tx = await program.methods
    .initialize({
      houseFeeBps: 500, // 5%
      minBet: new BN(10000000), // 0.01 SOL
      minStakeToCreate: new BN(100000000), // 0.1 SOL
      votingPeriod: new BN(3600), // 1 hour default
    })
    .accounts({
      arena: arenaPDA,
      treasury: walletKeypair.publicKey, // Treasury = deployer for now
      authority: walletKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  console.log('Arena initialized!');
  console.log('Tx:', tx);
  console.log('Arena PDA:', arenaPDA.toBase58());
}

main().catch(console.error);
