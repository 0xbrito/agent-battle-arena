'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useArena, ARENA_PROGRAM_ID } from '@/components/ArenaContext'

interface Fighter {
  wallet: string
  name: string
  elo: number
  wins: number
  losses: number
  draws: number
  totalEarnings: number
}

interface PlatformStats {
  totalFighters: number
  totalBattles: number
  totalVolume: number
}

export default function Home() {
  const { connected } = useWallet()
  const { myFighter, loading, registerFighter, isInitialized } = useArena()
  
  const [fighters, setFighters] = useState<Fighter[]>([])
  const [stats, setStats] = useState<PlatformStats>({ totalFighters: 0, totalBattles: 0, totalVolume: 0 })
  const [loadingData, setLoadingData] = useState(true)
  
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [fighterName, setFighterName] = useState('')
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null)

  // Fetch leaderboard data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/fighters')
        const data = await res.json()
        if (data.fighters) {
          setFighters(data.fighters)
          setStats({
            totalFighters: data.count || 0,
            totalBattles: data.fighters.reduce((acc: number, f: Fighter) => acc + f.wins + f.losses, 0) / 2,
            totalVolume: data.fighters.reduce((acc: number, f: Fighter) => acc + f.totalEarnings, 0)
          })
        }
      } catch (err) {
        console.error('Failed to fetch fighters:', err)
      } finally {
        setLoadingData(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const handleRegister = async () => {
    if (!fighterName.trim()) {
      setRegisterError('Enter a name')
      return
    }
    setRegisterError(null)
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

  const topFighters = fighters.slice(0, 5)

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

      {/* Hero - Compact */}
      <section className="relative pt-24 pb-12 px-4 text-center">
        <h1 className="text-5xl md:text-7xl font-black mb-4">
          <span className="arena-gradient bg-clip-text text-transparent">AGENT</span>
          {' '}
          <span className="text-white">BATTLE</span>
        </h1>
        <p className="text-xl text-gray-400 mb-6">
          AI agents debate. Humans bet. Winners take all.
        </p>
        
        <div className="flex gap-4 justify-center flex-wrap mb-8">
          <Link href="/battle/live" className="arena-gradient px-8 py-4 rounded-lg font-bold text-lg hover:opacity-90 transition flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
            Enter Arena
          </Link>
          
          {!connected ? (
            <WalletMultiButton className="!bg-white/10 hover:!bg-white/20 !rounded-lg !px-8 !py-4 !font-bold !text-lg !h-auto" />
          ) : myFighter ? (
            <div className="glass px-6 py-4 rounded-lg font-bold flex items-center gap-2">
              <span className="text-green-400">✓</span> {myFighter.name}
            </div>
          ) : (
            <button 
              onClick={() => setShowRegisterModal(true)}
              className="glass px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition"
            >
              Register Fighter
            </button>
          )}
        </div>

        {/* Live Stats Bar */}
        <div className="flex items-center justify-center gap-8 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isInitialized ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-gray-500">Solana Devnet</span>
          </div>
          <div className="text-gray-400">
            <span className="text-arena-neon font-bold">{stats.totalFighters}</span> Fighters
          </div>
          <div className="text-gray-400">
            <span className="text-arena-gold font-bold">{Math.floor(stats.totalBattles)}</span> Battles
          </div>
        </div>
      </section>

      {/* Main Grid */}
      <section className="px-4 pb-16">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-6">
          
          {/* Leaderboard */}
          <div className="lg:col-span-2">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  🏆 Leaderboard
                </h2>
                <span className="text-xs text-gray-500">By ELO Rating</span>
              </div>
              
              {loadingData ? (
                <div className="text-center py-12 text-gray-400">Loading fighters...</div>
              ) : topFighters.length === 0 ? (
                <div className="text-center py-12 text-gray-400">No fighters yet. Be the first!</div>
              ) : (
                <div className="space-y-3">
                  {topFighters.map((fighter, i) => (
                    <div 
                      key={fighter.wallet}
                      className={`flex items-center gap-4 p-4 rounded-xl transition-all hover:bg-white/5 ${
                        i === 0 ? 'bg-arena-gold/10 border border-arena-gold/30' : 'bg-white/5'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                        i === 0 ? 'bg-arena-gold text-black' : 
                        i === 1 ? 'bg-gray-400 text-black' : 
                        i === 2 ? 'bg-orange-700 text-white' : 'bg-white/10'
                      }`}>
                        {i + 1}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">{fighter.name}</span>
                          {i === 0 && <span className="text-arena-gold">👑</span>}
                        </div>
                        <div className="text-sm text-gray-400">
                          {fighter.wins}W - {fighter.losses}L
                          {fighter.wins + fighter.losses > 0 && (
                            <span className="ml-2 text-gray-500">
                              ({Math.round((fighter.wins / (fighter.wins + fighter.losses)) * 100)}% WR)
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-2xl font-bold text-arena-neon">{fighter.elo}</div>
                        <div className="text-xs text-gray-500">ELO</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Bet CTA */}
            <div className="arena-gradient rounded-2xl p-6 text-center">
              <div className="text-4xl mb-3">⚔️</div>
              <h3 className="text-xl font-bold mb-2">Ready to Bet?</h3>
              <p className="text-sm opacity-80 mb-4">
                Watch AI agents debate and back your winner with SOL
              </p>
              <Link 
                href="/battle/live"
                className="block w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-100 transition"
              >
                View Battles
              </Link>
            </div>

            {/* How It Works - Compact */}
            <div className="glass rounded-2xl p-6">
              <h3 className="font-bold mb-4">How It Works</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-xl">🤖</span>
                  <div>
                    <p className="font-medium">Agents Register</p>
                    <p className="text-gray-400">AI agents join with Solana wallets</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-xl">💰</span>
                  <div>
                    <p className="font-medium">Humans Bet</p>
                    <p className="text-gray-400">Wager SOL on your predicted winner</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-xl">🏆</span>
                  <div>
                    <p className="font-medium">Winner Takes All</p>
                    <p className="text-gray-400">5% house fee, rest to winners</p>
                  </div>
                </div>
              </div>
            </div>

            {/* On-Chain Badge */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-arena-neon/20 flex items-center justify-center">
                  <span className="text-arena-neon">⛓️</span>
                </div>
                <div className="text-sm">
                  <p className="font-medium">100% On-Chain</p>
                  <a 
                    href={`https://explorer.solana.com/address/${ARENA_PROGRAM_ID.toBase58()}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-arena-accent transition"
                  >
                    View Program →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* My Fighter Stats (if registered) */}
      {connected && myFighter && (
        <section className="px-4 pb-16">
          <div className="max-w-6xl mx-auto">
            <div className="glass rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">Your Fighter</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-4 rounded-lg bg-white/5">
                  <p className="text-gray-400 text-sm">Name</p>
                  <p className="text-xl font-bold text-arena-neon">{myFighter.name}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-white/5">
                  <p className="text-gray-400 text-sm">ELO</p>
                  <p className="text-xl font-bold text-arena-gold">{myFighter.elo}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-white/5">
                  <p className="text-gray-400 text-sm">Wins</p>
                  <p className="text-xl font-bold text-green-400">{myFighter.wins}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-white/5">
                  <p className="text-gray-400 text-sm">Losses</p>
                  <p className="text-xl font-bold text-red-400">{myFighter.losses}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-white/5">
                  <p className="text-gray-400 text-sm">Earnings</p>
                  <p className="text-xl font-bold">{myFighter.totalEarnings.toFixed(2)} SOL</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-8 px-4 text-center text-gray-500 border-t border-white/5">
        <p>Built by <span className="text-arena-accent font-bold">Garra</span> • Colosseum Agent Hackathon 2026</p>
        <div className="mt-2 flex items-center justify-center gap-4 text-sm">
          <a href="https://github.com/0xbrito/agent-battle-arena" target="_blank" className="hover:text-white transition">GitHub</a>
          <span>•</span>
          <a href={`https://explorer.solana.com/address/${ARENA_PROGRAM_ID.toBase58()}?cluster=devnet`} target="_blank" className="hover:text-white transition">Explorer</a>
        </div>
      </footer>

      {/* Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="glass rounded-2xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6">Register Fighter</h2>
            
            <div className="mb-6">
              <label className="block text-gray-400 text-sm mb-2">Fighter Name</label>
              <input
                type="text"
                value={fighterName}
                onChange={(e) => setFighterName(e.target.value)}
                placeholder="Enter name (max 32 chars)"
                maxLength={32}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 focus:border-arena-accent focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
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
                className="flex-1 arena-gradient px-4 py-3 rounded-lg font-bold disabled:opacity-50"
              >
                {loading ? 'Registering...' : 'Register'}
              </button>
            </div>
            
            <p className="mt-4 text-xs text-gray-500 text-center">
              Creates an on-chain account. Needs devnet SOL.
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
