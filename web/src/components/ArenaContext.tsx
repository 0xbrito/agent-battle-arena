'use client'

import { createContext, useContext, useState, useEffect, ReactNode, FC } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js'
import * as borsh from 'borsh'

// Program ID
export const ARENA_PROGRAM_ID = new PublicKey('6fh5E6VPXzAww1mU9M84sBgtqUXDDVY9HZh47tGBFCKb')

// Types
export interface Fighter {
  wallet: string
  name: string
  elo: number
  wins: number
  losses: number
  draws: number
  totalEarnings: number
  registeredAt: number
}

export interface ArenaState {
  authority: string
  treasury: string
  houseFeeBps: number
  minBet: number
  battleCount: number
  totalVolume: number
}

interface ArenaContextType {
  isInitialized: boolean
  arenaState: ArenaState | null
  myFighter: Fighter | null
  fighters: Fighter[]
  loading: boolean
  error: string | null
  registerFighter: (name: string) => Promise<string>
  refreshData: () => Promise<void>
}

const ArenaContext = createContext<ArenaContextType | null>(null)

export const useArena = () => {
  const ctx = useContext(ArenaContext)
  if (!ctx) throw new Error('useArena must be used within ArenaProvider')
  return ctx
}

// PDA helpers
export function findArenaPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('arena')],
    ARENA_PROGRAM_ID
  )
}

export function findFighterPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('fighter'), wallet.toBuffer()],
    ARENA_PROGRAM_ID
  )
}

// Instruction discriminators (sha256("global:register_fighter")[0:8])
const REGISTER_FIGHTER_DISCRIMINATOR = Buffer.from([89, 189, 101, 179, 184, 140, 40, 177])

interface Props {
  children: ReactNode
}

export const ArenaProvider: FC<Props> = ({ children }) => {
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()
  
  const [isInitialized, setIsInitialized] = useState(false)
  const [arenaState, setArenaState] = useState<ArenaState | null>(null)
  const [myFighter, setMyFighter] = useState<Fighter | null>(null)
  const [fighters, setFighters] = useState<Fighter[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if arena is initialized
  const checkArena = async () => {
    try {
      const [arenaPDA] = findArenaPDA()
      const arenaAccount = await connection.getAccountInfo(arenaPDA)
      
      if (arenaAccount) {
        setIsInitialized(true)
        // Parse arena state (simplified - would need proper borsh deserialization)
        // For now, just mark as initialized
      }
    } catch (err) {
      console.error('Error checking arena:', err)
    }
  }

  // Check if current wallet has a fighter
  const checkMyFighter = async () => {
    if (!publicKey) {
      setMyFighter(null)
      return
    }
    
    try {
      const [fighterPDA] = findFighterPDA(publicKey)
      const fighterAccount = await connection.getAccountInfo(fighterPDA)
      
      if (fighterAccount && fighterAccount.data.length > 0) {
        // Parse fighter data
        const data = fighterAccount.data
        // Skip 8-byte discriminator
        let offset = 8
        
        // Read wallet (32 bytes)
        const wallet = new PublicKey(data.slice(offset, offset + 32))
        offset += 32
        
        // Read name (4 bytes length + string)
        const nameLen = data.readUInt32LE(offset)
        offset += 4
        const name = data.slice(offset, offset + nameLen).toString('utf8')
        offset += nameLen
        
        // Read elo (4 bytes u32)
        const elo = data.readUInt32LE(offset)
        offset += 4
        
        // Read wins (4 bytes u32)
        const wins = data.readUInt32LE(offset)
        offset += 4
        
        // Read losses (4 bytes u32)  
        const losses = data.readUInt32LE(offset)
        offset += 4
        
        // Read draws (4 bytes u32)
        const draws = data.readUInt32LE(offset)
        offset += 4
        
        // Read totalEarnings (8 bytes u64)
        const totalEarnings = Number(data.readBigUInt64LE(offset))
        offset += 8
        
        // Read registeredAt (8 bytes i64)
        const registeredAt = Number(data.readBigInt64LE(offset))
        
        setMyFighter({
          wallet: wallet.toBase58(),
          name,
          elo,
          wins,
          losses,
          draws,
          totalEarnings: totalEarnings / LAMPORTS_PER_SOL,
          registeredAt,
        })
      } else {
        setMyFighter(null)
      }
    } catch (err) {
      console.error('Error checking fighter:', err)
      setMyFighter(null)
    }
  }

  // Register as fighter
  const registerFighter = async (name: string): Promise<string> => {
    if (!publicKey || !connected) {
      throw new Error('Wallet not connected')
    }
    
    if (name.length > 32) {
      throw new Error('Name must be 32 characters or less')
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const [fighterPDA, bump] = findFighterPDA(publicKey)
      
      // Build instruction data: discriminator + name
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
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: ARENA_PROGRAM_ID,
        data: instructionData,
      })
      
      const transaction = new Transaction().add(instruction)
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey
      
      const signature = await sendTransaction(transaction, connection)
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      })
      
      // Refresh fighter data
      await checkMyFighter()
      
      return signature
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to register fighter'
      setError(errorMsg)
      throw new Error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // Refresh all data
  const refreshData = async () => {
    await Promise.all([
      checkArena(),
      checkMyFighter(),
    ])
  }

  // Initial load
  useEffect(() => {
    checkArena()
  }, [connection])

  // Check fighter when wallet changes
  useEffect(() => {
    if (connected && publicKey) {
      checkMyFighter()
    } else {
      setMyFighter(null)
    }
  }, [connected, publicKey])

  return (
    <ArenaContext.Provider value={{
      isInitialized,
      arenaState,
      myFighter,
      fighters,
      loading,
      error,
      registerFighter,
      refreshData,
    }}>
      {children}
    </ArenaContext.Provider>
  )
}
