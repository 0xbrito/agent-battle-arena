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
import * as crypto from 'crypto';

const PROGRAM_ID = new PublicKey('6fh5E6VPXzAww1mU9M84sBgtqUXDDVY9HZh47tGBFCKb');

// Compute discriminator
function getDiscriminator(name: string): Buffer {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

function serializeName(name: string): Buffer {
  const nameBytes = Buffer.from(name, 'utf-8');
  const buffer = Buffer.alloc(4 + nameBytes.length);
  buffer.writeUInt32LE(nameBytes.length, 0);
  nameBytes.copy(buffer, 4);
  return buffer;
}

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  const walletPath = path.join(process.env.HOME!, '.config/solana/id.json');
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  
  console.log('Wallet:', walletKeypair.publicKey.toBase58());
  
  // Find Fighter PDA
  const [fighterPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('fighter'), walletKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log('Fighter PDA:', fighterPDA.toBase58());
  
  // Check if already registered
  const fighterAccount = await connection.getAccountInfo(fighterPDA);
  if (fighterAccount) {
    console.log('Garra already registered!');
    return;
  }
  
  const discriminator = getDiscriminator('register_fighter');
  console.log('Discriminator:', discriminator.toString('hex'));
  
  const nameBuffer = serializeName('Garra');
  
  const data = Buffer.concat([discriminator, nameBuffer]);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: fighterPDA, isSigner: false, isWritable: true },
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data
  });
  
  const transaction = new Transaction().add(instruction);
  
  console.log('Registering Garra...');
  const sig = await sendAndConfirmTransaction(connection, transaction, [walletKeypair]);
  console.log('Garra registered!');
  console.log('Tx:', sig);
  console.log('Fighter PDA:', fighterPDA.toBase58());
}

main().catch(console.error);
