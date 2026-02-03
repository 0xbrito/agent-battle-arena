'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useArena } from '@/components/ArenaContext'

interface Fighter {
  wallet: string
  name: string
  elo: number
}

interface Battle {
  id: number
  pubkey: string
  fighterA: string
  fighterB: string
  topic: string
  status: string
  poolA: number
  poolB: number
  totalBets: number
  winner: string | null
  createdAt: number
}

// Fighter name cache
const fighterCache = new Map<string, string>()

export default function BattlesPage() {
  const { connected } = useWallet()
  const { myFighter } = useArena()
  
  const [battles, setBattles] = useState<Battle[]>([])
  const [fighters, setFighters] = useState<Fighter[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    async function fetchData() {
      try {
        const [battlesRes, fightersRes] = await Promise.all([
          fetch('/api/battles'),
          fetch('/api/fighters')
        ])
        
        const battlesData = await battlesRes.json()
        const fightersData = await fightersRes.json()
        
        if (battlesData.battles) {
          setBattles(battlesData.battles)
        }
        
        if (fightersData.fighters) {
          setFighters(fightersData.fighters)
          // Cache fighter names by PDA
          fightersData.fighters.forEach((f: Fighter) => {
            fighterCache.set(f.wallet, f.name)
          })
        }
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [])

  const getFighterName = (pda: string): string => {
    // Try to find fighter by matching the wallet that created the PDA
    const fighter = fighters.find(f => {
      // The fighterA/B in battle are PDA addresses, need to match
      return f.wallet === pda
    })
    return fighter?.name || pda.slice(0, 8) + '...'
  }

  const filteredBattles = filter === 'all' 
    ? battles 
    : battles.filter(b => b.status === filter)

  const statusCounts = {
    all: battles.length,
    pending: battles.filter(b => b.status === 'pending').length,
    live: battles.filter(b => b.status === 'live').length,
    settled: battles.filter(b => b.status === 'settled').length,
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-400">Pending</span>
      case 'live':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-400 flex items-center gap-1">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span> Live
        </span>
      case 'settled':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">Settled</span>
      case 'cancelled':
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-500/20 text-gray-400">Cancelled</span>
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-black text-xl">
            <span className="text-arena-accent">ARENA</span>
          </Link>
          <div className="flex items-center gap-4">
            {connected && myFighter && (
              <span className="text-sm text-arena-neon font-bold">{myFighter.name}</span>
            )}
            <WalletMultiButton />
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">⚔️ Battles</h1>
          <p className="text-gray-400">Watch AI agents debate and place your bets</p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="glass rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-arena-neon">{battles.length}</p>
            <p className="text-sm text-gray-400">Total Battles</p>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-yellow-400">{statusCounts.pending}</p>
            <p className="text-sm text-gray-400">Pending</p>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-red-400">{statusCounts.live}</p>
            <p className="text-sm text-gray-400">Live Now</p>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{statusCounts.settled}</p>
            <p className="text-sm text-gray-400">Settled</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {(['all', 'pending', 'live', 'settled'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
                filter === status 
                  ? 'bg-arena-accent text-white' 
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              <span className="ml-2 text-xs opacity-70">
                ({status === 'all' ? statusCounts.all : statusCounts[status as keyof typeof statusCounts]})
              </span>
            </button>
          ))}
        </div>

        {/* Battle List */}
        {loading ? (
          <div className="glass rounded-2xl p-12 text-center text-gray-400">
            Loading battles...
          </div>
        ) : filteredBattles.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-4xl mb-4">🏟️</div>
            <p className="text-gray-400 mb-4">No {filter === 'all' ? '' : filter} battles found</p>
            {filter !== 'all' && (
              <button 
                onClick={() => setFilter('all')}
                className="text-arena-accent hover:underline"
              >
                View all battles
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBattles.map(battle => {
              const totalPool = battle.poolA + battle.poolB
              const poolAPercent = totalPool > 0 ? (battle.poolA / totalPool) * 100 : 50
              
              return (
                <Link 
                  key={battle.pubkey}
                  href={`/battle/${battle.id}`}
                  className="block glass rounded-xl p-6 hover:bg-white/10 transition group"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(battle.status)}
                        <span className="text-xs text-gray-500">Battle #{battle.id}</span>
                      </div>
                      <h3 className="font-bold text-lg group-hover:text-arena-accent transition line-clamp-2">
                        {battle.topic || 'Untitled Battle'}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-arena-gold font-bold">{totalPool.toFixed(2)} SOL</p>
                      <p className="text-xs text-gray-500">Total Pool</p>
                    </div>
                  </div>
                  
                  {/* Fighters */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-red-500/30 flex items-center justify-center text-sm">🥊</div>
                      <div>
                        <p className="font-medium">{getFighterName(battle.fighterA)}</p>
                        <p className="text-xs text-gray-500">{battle.poolA.toFixed(2)} SOL</p>
                      </div>
                      {battle.winner === 'A' && <span className="text-arena-gold text-sm">👑</span>}
                    </div>
                    
                    <div className="text-gray-500 font-bold">VS</div>
                    
                    <div className="flex-1 flex items-center gap-2 justify-end">
                      {battle.winner === 'B' && <span className="text-arena-gold text-sm">👑</span>}
                      <div className="text-right">
                        <p className="font-medium">{getFighterName(battle.fighterB)}</p>
                        <p className="text-xs text-gray-500">{battle.poolB.toFixed(2)} SOL</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center text-sm">🥊</div>
                    </div>
                  </div>
                  
                  {/* Pool Bar */}
                  {totalPool > 0 && (
                    <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all"
                        style={{ width: `${poolAPercent}%` }}
                      />
                    </div>
                  )}
                  
                  {/* Timestamp */}
                  <div className="mt-3 text-xs text-gray-500">
                    Created: {new Date(battle.createdAt * 1000).toLocaleString()}
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* CTA */}
        {!loading && battles.length > 0 && statusCounts.live === 0 && statusCounts.pending > 0 && (
          <div className="mt-8 text-center">
            <p className="text-gray-400 mb-4">
              {statusCounts.pending} battles waiting to start. Check back soon!
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
