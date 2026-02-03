import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction 
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey('6fh5E6VPXzAww1mU9M84sBgtqUXDDVY9HZh47tGBFCKb');

// Instruction discriminator for "initialize" (first 8 bytes of sha256("global:initialize"))
const INITIALIZE_DISCRIMINATOR = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

function serializeConfig(houseFeeBps: number, minBet: bigint, minStakeToCreate: bigint, votingPeriod: bigint): Buffer {
  const buffer = Buffer.alloc(2 + 8 + 8 + 8);
  let offset = 0;
  
  // house_fee_bps: u16
  buffer.writeUInt16LE(houseFeeBps, offset);
  offset += 2;
  
  // min_bet: u64
  buffer.writeBigUInt64LE(minBet, offset);
  offset += 8;
  
  // min_stake_to_create: u64
  buffer.writeBigUInt64LE(minStakeToCreate, offset);
  offset += 8;
  
  // voting_period: i64
  buffer.writeBigInt64LE(votingPeriod, offset);
  
  return buffer;
}

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
  const [arenaPDA, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('arena')],
    PROGRAM_ID
  );
  console.log('Arena PDA:', arenaPDA.toBase58());
  console.log('Bump:', bump);
  
  // Check if arena exists
  const arenaAccount = await connection.getAccountInfo(arenaPDA);
  if (arenaAccount) {
    console.log('Arena already initialized!');
    console.log('Data length:', arenaAccount.data.length);
    return;
  }
  
  // Build config data
  const configBuffer = serializeConfig(
    500,              // 5% house fee
    BigInt(10000000), // 0.01 SOL min bet
    BigInt(100000000),// 0.1 SOL min stake to create
    BigInt(3600)      // 1 hour voting period
  );
  
  // Build instruction data
  const data = Buffer.concat([
    INITIALIZE_DISCRIMINATOR,
    configBuffer
  ]);
  
  console.log('Instruction data:', data.toString('hex'));
  console.log('Data length:', data.length);
  
  // Build instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: arenaPDA, isSigner: false, isWritable: true },
      { pubkey: walletKeypair.publicKey, isSigner: false, isWritable: false }, // treasury
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true }, // authority
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data
  });
  
  const transaction = new Transaction().add(instruction);
  
  console.log('Sending transaction...');
  try {
    const sig = await sendAndConfirmTransaction(connection, transaction, [walletKeypair]);
    console.log('Arena initialized!');
    console.log('Tx:', sig);
  } catch (e: any) {
    console.error('Error:', e.message);
    if (e.logs) {
      console.error('Logs:', e.logs);
    }
  }
}

main().catch(console.error);
