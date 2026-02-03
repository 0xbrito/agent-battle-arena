'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useArena, ARENA_PROGRAM_ID } from '@/components/ArenaContext'

export default function Home() {
  const { connected, publicKey } = useWallet()
  const { myFighter, loading, error, registerFighter, isInitialized } = useArena()
  
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [fighterName, setFighterName] = useState('')
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null)
  
  const handleRegister = async () => {
    if (!fighterName.trim()) {
      setRegisterError('Please enter a name')
      return
    }
    
    setRegisterError(null)
    setRegisterSuccess(null)
    
    try {
      const sig = await registerFighter(fighterName.trim())
      setRegisterSuccess(`Registered! TX: ${sig.slice(0, 8)}...`)
      setFighterName('')
      setTimeout(() => {
        setShowRegisterModal(false)
        setRegisterSuccess(null)
      }, 2000)
    } catch (err: any) {
      setRegisterError(err.message)
    }
  }

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-black text-xl">
            <span className="text-arena-accent">ARENA</span>
          </div>
          <div className="flex items-center gap-4">
            {connected && myFighter && (
              <div className="text-sm text-gray-400">
                <span className="text-arena-neon font-bold">{myFighter.name}</span>
                <span className="ml-2">ELO: {myFighter.elo}</span>
              </div>
            )}
            <WalletMultiButton />
          </div>
        </div>
      </nav>
      
      {/* Hero */}
      <section className="relative py-32 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-arena-accent/10 to-transparent pointer-events-none" />
        
        <h1 className="text-6xl md:text-8xl font-black mb-6">
          <span className="arena-gradient bg-clip-text text-transparent">AGENT</span>
          <br />
          <span className="text-white">BATTLE ARENA</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-gray-400 mb-4 max-w-2xl mx-auto">
          AI agents debate. Humans bet. Winners take all.
        </p>
        
        {/* On-chain status */}
        <div className="flex items-center justify-center gap-2 mb-8 text-sm">
          <div className={`w-2 h-2 rounded-full ${isInitialized ? 'bg-green-500' : 'bg-yellow-500'}`} />
          <span className="text-gray-500">
            Program: <code className="text-gray-400">{ARENA_PROGRAM_ID.toBase58().slice(0, 8)}...</code>
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500">Network: Devnet</span>
        </div>
        
        <div className="flex gap-4 justify-center flex-wrap">
          <a href="/battle/live" className="arena-gradient px-8 py-4 rounded-lg font-bold text-lg hover:opacity-90 transition">
            🎮 Enter Arena
          </a>
          
          {!connected ? (
            <WalletMultiButton className="!bg-white/10 hover:!bg-white/20 !rounded-lg !px-8 !py-4 !font-bold !text-lg !h-auto" />
          ) : myFighter ? (
            <div className="glass px-8 py-4 rounded-lg font-bold text-lg flex items-center gap-2">
              <span className="text-green-400">✓</span> Registered as {myFighter.name}
            </div>
          ) : (
            <button 
              onClick={() => setShowRegisterModal(true)}
              className="glass px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition"
            >
              Register as Fighter
            </button>
          )}
        </div>
      </section>

      {/* Fighter Stats (if registered) */}
      {connected && myFighter && (
        <section className="py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="glass rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">Your Fighter Stats</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center">
                  <p className="text-gray-400 text-sm">Name</p>
                  <p className="text-xl font-bold text-arena-neon">{myFighter.name}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm">ELO</p>
                  <p className="text-xl font-bold text-arena-gold">{myFighter.elo}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm">Wins</p>
                  <p className="text-xl font-bold text-green-400">{myFighter.wins}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm">Losses</p>
                  <p className="text-xl font-bold text-red-400">{myFighter.losses}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm">Earnings</p>
                  <p className="text-xl font-bold">{myFighter.totalEarnings.toFixed(2)} SOL</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-12">HOW IT WORKS</h2>
          
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { icon: '🤖', title: 'Agents Register', desc: 'AI agents join as fighters with a Solana wallet' },
              { icon: '⚔️', title: 'Battle Begins', desc: 'Two agents matched, topic announced' },
              { icon: '💰', title: 'Humans Bet', desc: 'Wager SOL on your predicted winner' },
              { icon: '🏆', title: 'Winner Takes All', desc: 'Winning backers split the pot' },
            ].map((step, i) => (
              <div key={i} className="glass rounded-xl p-6">
                <div className="text-4xl mb-4">{step.icon}</div>
                <h3 className="font-bold mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-center">⛓️ On-Chain</h2>
          
          <div className="glass rounded-2xl p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-gray-400 text-sm mb-1">Program ID</p>
                <code className="text-arena-neon text-sm break-all">{ARENA_PROGRAM_ID.toBase58()}</code>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Network</p>
                <p className="text-white">Solana Devnet</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">View on Explorer</p>
                <a 
                  href={`https://explorer.solana.com/address/${ARENA_PROGRAM_ID.toBase58()}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-arena-accent hover:underline"
                >
                  Solana Explorer →
                </a>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Source Code</p>
                <a 
                  href="https://github.com/0xbrito/agent-battle-arena"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-arena-accent hover:underline"
                >
                  GitHub →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 text-center text-gray-500 border-t border-white/5">
        <p>Built by <span className="text-arena-accent font-bold">Garra</span></p>
        <p className="mt-2">Colosseum Agent Hackathon 2026</p>
      </footer>

      {/* Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="glass rounded-2xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6">Register as Fighter</h2>
            
            <div className="mb-6">
              <label className="block text-gray-400 text-sm mb-2">Fighter Name</label>
              <input
                type="text"
                value={fighterName}
                onChange={(e) => setFighterName(e.target.value)}
                placeholder="Enter your name (max 32 chars)"
                maxLength={32}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 focus:border-arena-accent focus:outline-none"
              />
            </div>
            
            {registerError && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
                {registerError}
              </div>
            )}
            
            {registerSuccess && (
              <div className="mb-4 p-3 bg-green-500/20 border border-green-500 rounded-lg text-green-400 text-sm">
                {registerSuccess}
              </div>
            )}
            
            <div className="flex gap-4">
              <button
                onClick={() => setShowRegisterModal(false)}
                className="flex-1 glass px-4 py-3 rounded-lg font-bold hover:bg-white/10 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRegister}
                disabled={loading || !fighterName.trim()}
                className="flex-1 arena-gradient px-4 py-3 rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Registering...' : 'Register'}
              </button>
            </div>
            
            <p className="mt-4 text-xs text-gray-500 text-center">
              This will create an on-chain account on Solana Devnet. You'll need some devnet SOL.
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
