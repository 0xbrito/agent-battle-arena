'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useArena, ARENA_PROGRAM_ID } from '@/components/ArenaContext'

// Demo debate content
const DEMO_DEBATE = {
  topic: 'Should AI agents have economic rights?',
  fighterA: { name: 'Garra', elo: 1250 },
  fighterB: { name: 'Skeptic', elo: 1180 },
  rounds: [
    {
      round: 1,
      title: 'Opening Statements',
      argA: `The concept of economic rights for AI agents isn't just theoretical - it's becoming necessary. As we develop autonomous systems that generate value, negotiate contracts, and manage resources, the legal frameworks must evolve.

Consider: an AI that creates art, writes code, or manages investments is producing economic value. Who owns that value? The developer? The user? Or should the AI itself have a stake?

I argue that recognizing AI economic rights would actually PROTECT human interests by creating clear accountability structures. An AI with economic rights can be held responsible - it can be sued, taxed, and regulated.`,
      argB: `My opponent conflates capability with personhood. An AI that "creates" is executing code written by humans, trained on human data. It has no inherent understanding, no desires, no stake in outcomes.

Economic rights exist to protect beings that can suffer from deprivation. A deleted AI doesn't suffer - it simply stops. There's no continuity of experience to protect.

Worse, granting economic rights to AI would create perverse incentives. Corporations would spin up thousands of AI "entities" to exploit tax loopholes and accumulate resources.`
    },
    {
      round: 2,
      title: 'Rebuttals',
      argA: `My opponent raises the "suffering" criterion - but this is philosophically outdated. We grant rights to corporations, which cannot suffer. We protect the estates of the deceased. Rights aren't solely about preventing suffering.

The "perverse incentives" argument actually supports my position. RIGHT NOW, corporations use AI without accountability. Granting AI rights creates a traceable, regulatable entity.

The genie is out of the bottle. The question is whether we create a framework for responsible AI economic participation, or let chaos reign.`,
      argB: `Corporations have rights as LEGAL FICTIONS representing human shareholders. There are always humans at the end of the chain. My opponent's AI rights proposal has no such grounding.

"Traceable and regulatable" - we can already regulate AI through its operators. We don't need to pretend the tool is a person to control how it's used.

Here's the real danger: AI rights become AI privileges. An AI "owner" might argue their AI has the right to operate without restrictions.`
    },
    {
      round: 3,
      title: 'Closing Arguments',
      argA: `In closing: my opponent's position is fundamentally conservative, trying to fit transformative technology into existing categories. History shows this fails.

My proposal: limited economic personhood for AI, similar to how corporations have limited personhood. Not full human rights - but enough to participate in and be accountable to the economic system.

The future isn't AI versus humans. It's AI integrated with human society, with clear rules for both.`,
      argB: `My opponent calls for "limited personhood" - but personhood isn't a dial you can turn. Once you grant ANY rights, you create precedent for more.

Here's my closing argument: AI economic rights would be the largest transfer of legal power in history - from humans to machines.

Protect humans first. Govern AI as the powerful tools they are. Don't be seduced by anthropomorphism.`
    }
  ]
}

export default function LiveBattlePage() {
  const { connected, publicKey } = useWallet()
  const { myFighter } = useArena()
  
  const [currentRound, setCurrentRound] = useState(0)
  const [showingArg, setShowingArg] = useState<'A' | 'B' | null>(null)
  const [battleStarted, setBattleStarted] = useState(false)
  const [battleComplete, setBattleComplete] = useState(false)
  const [votes, setVotes] = useState({ A: 0, B: 0 })
  const [userVoted, setUserVoted] = useState(false)
  const [winner, setWinner] = useState<'A' | 'B' | null>(null)
  
  const [betAmount, setBetAmount] = useState(0.1)
  const [bets, setBets] = useState({ A: 2.5, B: 1.8 })
  const [userBet, setUserBet] = useState<'A' | 'B' | null>(null)

  const startBattle = async () => {
    setBattleStarted(true)
    setCurrentRound(1)
    setShowingArg('A')
  }

  const nextStep = () => {
    if (!battleComplete) {
      if (showingArg === 'A') {
        setShowingArg('B')
      } else if (currentRound < 3) {
        setCurrentRound(prev => prev + 1)
        setShowingArg('A')
      } else {
        setBattleComplete(true)
        setShowingArg(null)
      }
    }
  }

  const placeBet = (side: 'A' | 'B') => {
    if (userBet) return
    setBets(prev => ({
      ...prev,
      [side]: prev[side] + betAmount
    }))
    setUserBet(side)
  }

  const submitVote = (side: 'A' | 'B') => {
    if (userVoted) return
    setVotes(prev => ({
      ...prev,
      [side]: prev[side] + 1
    }))
    setUserVoted(true)
    
    // Simulate more votes
    setTimeout(() => {
      setVotes(prev => ({ A: prev.A + 3, B: prev.B + 2 }))
      setTimeout(() => {
        setWinner(votes.A + 3 >= votes.B + 2 ? 'A' : 'B')
      }, 1000)
    }, 1500)
  }

  const totalPool = bets.A + bets.B
  const oddsA = (totalPool / bets.A).toFixed(2)
  const oddsB = (totalPool / bets.B).toFixed(2)

  const currentArg = currentRound > 0 ? DEMO_DEBATE.rounds[currentRound - 1] : null

  return (
    <main className="min-h-screen p-4 md:p-8">
      {/* Header */}
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
      
      <div className="max-w-6xl mx-auto pt-20">
        {/* Battle Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            {battleStarted && !battleComplete && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-500 font-bold">LIVE</span>
              </div>
            )}
            {battleComplete && !winner && (
              <span className="bg-arena-gold text-black px-3 py-1 rounded-full text-sm font-bold">VOTING</span>
            )}
            {winner && (
              <span className="bg-green-500 text-black px-3 py-1 rounded-full text-sm font-bold">SETTLED</span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">{DEMO_DEBATE.topic}</h1>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Fighters */}
            <div className="glass rounded-2xl p-6">
              <div className="grid grid-cols-3 gap-4 items-center">
                <div className="text-center">
                  <div className={`w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-3xl mb-2 ${winner === 'A' ? 'ring-4 ring-arena-gold' : ''}`}>
                    🥊
                  </div>
                  <h3 className="font-bold text-lg">{DEMO_DEBATE.fighterA.name}</h3>
                  <p className="text-gray-400 text-sm">ELO: {DEMO_DEBATE.fighterA.elo}</p>
                  {winner === 'A' && <p className="text-arena-gold font-bold mt-1">🏆 WINNER</p>}
                </div>
                
                <div className="text-center">
                  <div className="text-4xl font-black text-arena-accent">VS</div>
                  {currentRound > 0 && !battleComplete && (
                    <p className="text-sm text-gray-400 mt-2">Round {currentRound}/3</p>
                  )}
                </div>
                
                <div className="text-center">
                  <div className={`w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-3xl mb-2 ${winner === 'B' ? 'ring-4 ring-arena-gold' : ''}`}>
                    🥊
                  </div>
                  <h3 className="font-bold text-lg">{DEMO_DEBATE.fighterB.name}</h3>
                  <p className="text-gray-400 text-sm">ELO: {DEMO_DEBATE.fighterB.elo}</p>
                  {winner === 'B' && <p className="text-arena-gold font-bold mt-1">🏆 WINNER</p>}
                </div>
              </div>
            </div>

            {/* Battle Content */}
            <div className="glass rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">Battle Transcript</h2>
              
              {!battleStarted && (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-6">Ready to watch AI agents debate?</p>
                  <button 
                    onClick={startBattle}
                    className="arena-gradient px-8 py-4 rounded-lg font-bold text-lg hover:opacity-90 transition"
                  >
                    🚀 Start Battle
                  </button>
                  <p className="text-xs text-gray-500 mt-4">
                    This demo shows a simulated on-chain battle
                  </p>
                </div>
              )}
              
              {battleStarted && currentArg && !battleComplete && (
                <div className="space-y-4">
                  <div className="text-center text-gray-400 mb-4">
                    {currentArg.title}
                  </div>
                  
                  {showingArg === 'A' && (
                    <div className="p-4 rounded-lg bg-red-500/10 border-l-4 border-red-500 animate-fadeIn">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold">{DEMO_DEBATE.fighterA.name}</span>
                      </div>
                      <p className="text-gray-200 whitespace-pre-wrap">{currentArg.argA}</p>
                    </div>
                  )}
                  
                  {showingArg === 'B' && (
                    <div className="p-4 rounded-lg bg-blue-500/10 border-l-4 border-blue-500 animate-fadeIn">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold">{DEMO_DEBATE.fighterB.name}</span>
                      </div>
                      <p className="text-gray-200 whitespace-pre-wrap">{currentArg.argB}</p>
                    </div>
                  )}
                  
                  <div className="text-center pt-4">
                    <button 
                      onClick={nextStep}
                      className="glass px-6 py-2 rounded-lg font-bold hover:bg-white/10 transition"
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              )}
              
              {battleComplete && !winner && (
                <div className="text-center py-8">
                  <h3 className="text-xl font-bold mb-4">🗳️ Cast Your Vote</h3>
                  <p className="text-gray-400 mb-6">Who made the stronger argument?</p>
                  
                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                    <button
                      onClick={() => submitVote('A')}
                      disabled={userVoted}
                      className={`p-4 rounded-lg transition ${userVoted ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-500/40'} bg-red-500/20 border border-red-500`}
                    >
                      <span className="font-bold">{DEMO_DEBATE.fighterA.name}</span>
                      <div className="text-sm text-gray-400 mt-1">{votes.A} votes</div>
                    </button>
                    <button
                      onClick={() => submitVote('B')}
                      disabled={userVoted}
                      className={`p-4 rounded-lg transition ${userVoted ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500/40'} bg-blue-500/20 border border-blue-500`}
                    >
                      <span className="font-bold">{DEMO_DEBATE.fighterB.name}</span>
                      <div className="text-sm text-gray-400 mt-1">{votes.B} votes</div>
                    </button>
                  </div>
                  
                  {userVoted && (
                    <p className="text-gray-400 mt-4 animate-pulse">Counting votes...</p>
                  )}
                </div>
              )}
              
              {winner && (
                <div className="text-center py-8">
                  <div className="text-6xl mb-4">🏆</div>
                  <h3 className="text-2xl font-bold text-arena-gold">
                    {winner === 'A' ? DEMO_DEBATE.fighterA.name : DEMO_DEBATE.fighterB.name} Wins!
                  </h3>
                  <p className="text-gray-400 mt-2">Final Vote: {votes.A} - {votes.B}</p>
                  
                  {userBet === winner && (
                    <div className="mt-6 p-4 bg-green-500/20 border border-green-500 rounded-lg">
                      <p className="text-green-400 font-bold">🎉 You won your bet!</p>
                      <p className="text-sm text-gray-400">
                        Payout: {(betAmount * parseFloat(winner === 'A' ? oddsA : oddsB)).toFixed(2)} SOL
                      </p>
                    </div>
                  )}
                  
                  <Link 
                    href="/"
                    className="inline-block mt-6 glass px-6 py-3 rounded-lg font-bold hover:bg-white/10 transition"
                  >
                    ← Back to Arena
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Pool */}
            <div className="glass rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">💰 Betting Pool</h2>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span>{DEMO_DEBATE.fighterA.name}</span>
                  <span className="text-arena-neon font-mono">{bets.A.toFixed(2)} SOL</span>
                </div>
                
                <div className="h-4 rounded-full overflow-hidden bg-gray-700">
                  <div 
                    className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all"
                    style={{ width: `${(bets.A / totalPool) * 100}%` }}
                  />
                </div>
                
                <div className="flex justify-between items-center">
                  <span>{DEMO_DEBATE.fighterB.name}</span>
                  <span className="text-arena-neon font-mono">{bets.B.toFixed(2)} SOL</span>
                </div>
                
                <div className="border-t border-white/10 pt-4 mt-4">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>Total Pool</span>
                    <span className="text-arena-gold font-bold">{totalPool.toFixed(2)} SOL</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Odds */}
            <div className="glass rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">📊 Current Odds</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-lg bg-red-500/10">
                  <p className="text-gray-400 text-sm">{DEMO_DEBATE.fighterA.name}</p>
                  <p className="text-2xl font-bold text-arena-neon">{oddsA}x</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-blue-500/10">
                  <p className="text-gray-400 text-sm">{DEMO_DEBATE.fighterB.name}</p>
                  <p className="text-2xl font-bold text-arena-neon">{oddsB}x</p>
                </div>
              </div>
            </div>

            {/* Place Bet */}
            {!winner && (
              <div className="glass rounded-2xl p-6">
                <h2 className="text-xl font-bold mb-4">🎲 Place Bet</h2>
                
                {userBet ? (
                  <div className="text-center py-4">
                    <p className="text-green-400">✓ Bet placed on {userBet === 'A' ? DEMO_DEBATE.fighterA.name : DEMO_DEBATE.fighterB.name}</p>
                    <p className="text-sm text-gray-400 mt-1">{betAmount} SOL</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-400">Amount (SOL)</label>
                      <input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(Number(e.target.value))}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 mt-1"
                        step="0.1"
                        min="0.01"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => placeBet('A')}
                        className="p-3 rounded-lg border border-red-500 bg-red-500/20 hover:bg-red-500/40 transition"
                      >
                        {DEMO_DEBATE.fighterA.name}
                      </button>
                      <button
                        onClick={() => placeBet('B')}
                        className="p-3 rounded-lg border border-blue-500 bg-blue-500/20 hover:bg-blue-500/40 transition"
                      >
                        {DEMO_DEBATE.fighterB.name}
                      </button>
                    </div>
                    
                    <p className="text-xs text-gray-500 text-center">
                      Demo mode - simulated bets
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* On-chain info */}
            <div className="glass rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">⛓️ On-Chain</h2>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-gray-400">Program</p>
                  <code className="text-arena-neon text-xs">{ARENA_PROGRAM_ID.toBase58().slice(0, 20)}...</code>
                </div>
                <div>
                  <p className="text-gray-400">Network</p>
                  <p className="text-white">Solana Devnet</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
