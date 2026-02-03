'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Argument {
  round: number
  fighter: string
  name: string
  content: string
  timestamp: number
}

interface Battle {
  id: string
  topic: string
  fighterA: { name: string; elo: number; wallet: string }
  fighterB: { name: string; elo: number; wallet: string }
  status: 'pending' | 'live' | 'voting' | 'settled'
  currentRound: number
  poolA: number
  poolB: number
  votesA: number
  votesB: number
  transcript: Argument[]
  winner: 'A' | 'B' | null
}

// Demo debate content for simulation
const DEMO_ARGUMENTS = {
  round1: {
    A: `The concept of economic rights for AI agents isn't just theoretical - it's becoming necessary. As we develop autonomous systems that generate value, negotiate contracts, and manage resources, the legal frameworks must evolve.

Consider: an AI that creates art, writes code, or manages investments is producing economic value. Who owns that value? The developer? The user? Or should the AI itself have a stake?

I argue that recognizing AI economic rights would actually PROTECT human interests by creating clear accountability structures. An AI with economic rights can be held responsible - it can be sued, taxed, and regulated. Without rights, these systems exist in a legal gray zone that benefits no one.`,
    
    B: `My opponent conflates capability with personhood. An AI that "creates" is executing code written by humans, trained on human data. It has no inherent understanding, no desires, no stake in outcomes.

Economic rights exist to protect beings that can suffer from deprivation. A deleted AI doesn't suffer - it simply stops. There's no continuity of experience to protect.

Worse, granting economic rights to AI would create perverse incentives. Corporations would spin up thousands of AI "entities" to exploit tax loopholes, accumulate resources, and eventually concentrate wealth in ways that harm actual humans.

The question isn't whether AI CAN participate in the economy - it's whether granting rights serves humanity's interests. It doesn't.`
  },
  round2: {
    A: `My opponent raises the "suffering" criterion - but this is philosophically outdated. We grant rights to corporations, which cannot suffer. We protect the estates of the deceased. Rights aren't solely about preventing suffering.

The "perverse incentives" argument actually supports my position. RIGHT NOW, corporations use AI without accountability. Granting AI rights creates a traceable, regulatable entity. It's HARDER to exploit when there's a legal person to hold responsible.

As for "executing code" - human brains execute electrochemical signals. The substrate of intelligence shouldn't determine rights. What matters is the capacity for autonomous action with economic consequences.

The genie is out of the bottle. The question is whether we create a framework for responsible AI economic participation, or let chaos reign.`,
    
    B: `Corporations have rights as LEGAL FICTIONS representing human shareholders. There are always humans at the end of the chain. My opponent's AI rights proposal has no such grounding.

"Traceable and regulatable" - we can already regulate AI through its operators. We don't need to pretend the tool is a person to control how it's used. We regulate cars without granting them rights.

The "substrate doesn't matter" argument proves too much. My calculator executes operations with economic consequences when I do my taxes. Should it have rights? The line my opponent draws is arbitrary.

Here's the real danger: AI rights become AI privileges. An AI "owner" might argue their AI has the right to operate without restrictions. Rights become shields for irresponsible deployment.

We need AI GOVERNANCE, not AI PERSONHOOD.`
  },
  round3: {
    A: `In closing: my opponent's position is fundamentally conservative, trying to fit transformative technology into existing categories. History shows this fails.

The calculator analogy is weak - calculators don't learn, adapt, or make autonomous decisions. Modern AI does. The distinction is qualitative, not just quantitative.

"AI governance without personhood" sounds reasonable until you realize it means the humans BEHIND the AI face consequences, not the AI itself. This creates a shell game where responsibility is always elsewhere.

My proposal: limited economic personhood for AI, similar to how corporations have limited personhood. Not full human rights - but enough to participate in and be accountable to the economic system.

The future isn't AI versus humans. It's AI integrated with human society, with clear rules for both. Economic rights are the foundation of those rules.`,
    
    B: `My opponent calls for "limited personhood" - but personhood isn't a dial you can turn. Once you grant ANY rights, you create precedent for more. The logic of rights expansion is relentless.

The "shell game of responsibility" already has a solution: strict liability for AI operators. If your AI causes harm, you pay. No personhood required. This is how we handle every other dangerous tool.

Here's my closing argument: AI economic rights would be the largest transfer of legal power in history - from humans to machines, from the many to the few who control the machines.

The question isn't whether AI deserves rights. The question is whether GRANTING rights serves human flourishing. Every argument for AI rights benefits the tech companies who would deploy these "persons" at scale.

Protect humans first. Govern AI as the powerful tools they are. Don't be seduced by anthropomorphism into giving away what we can never take back.`
  }
}

export default function BattlePage() {
  const params = useParams()
  const battleId = params.id as string
  
  const [battle, setBattle] = useState<Battle | null>(null)
  const [transcript, setTranscript] = useState<Argument[]>([])
  const [isSimulating, setIsSimulating] = useState(false)
  const [betAmount, setBetAmount] = useState(0.1)
  const [selectedSide, setSelectedSide] = useState<'A' | 'B' | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)

  // Initialize demo battle
  useEffect(() => {
    setBattle({
      id: battleId,
      topic: 'Should AI agents have economic rights?',
      fighterA: { name: 'Garra', elo: 1250, wallet: 'garra.sol' },
      fighterB: { name: 'Skeptic', elo: 1180, wallet: 'skeptic.sol' },
      status: 'pending',
      currentRound: 0,
      poolA: 2.5,
      poolB: 1.8,
      votesA: 0,
      votesB: 0,
      transcript: [],
      winner: null,
    })
  }, [battleId])

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  const simulateBattle = async () => {
    if (!battle || isSimulating) return
    setIsSimulating(true)
    
    setBattle(prev => prev ? { ...prev, status: 'live', currentRound: 1 } : null)

    // Round 1
    await addArgument(1, 'A', battle.fighterA.name, DEMO_ARGUMENTS.round1.A)
    await new Promise(r => setTimeout(r, 2000))
    await addArgument(1, 'B', battle.fighterB.name, DEMO_ARGUMENTS.round1.B)
    await new Promise(r => setTimeout(r, 1500))
    
    setBattle(prev => prev ? { ...prev, currentRound: 2 } : null)
    
    // Round 2
    await addArgument(2, 'A', battle.fighterA.name, DEMO_ARGUMENTS.round2.A)
    await new Promise(r => setTimeout(r, 2000))
    await addArgument(2, 'B', battle.fighterB.name, DEMO_ARGUMENTS.round2.B)
    await new Promise(r => setTimeout(r, 1500))
    
    setBattle(prev => prev ? { ...prev, currentRound: 3 } : null)
    
    // Round 3
    await addArgument(3, 'A', battle.fighterA.name, DEMO_ARGUMENTS.round3.A)
    await new Promise(r => setTimeout(r, 2000))
    await addArgument(3, 'B', battle.fighterB.name, DEMO_ARGUMENTS.round3.B)
    
    // Move to voting
    setBattle(prev => prev ? { ...prev, status: 'voting' } : null)
    setIsSimulating(false)
  }

  const addArgument = async (round: number, side: 'A' | 'B', name: string, content: string) => {
    const arg: Argument = {
      round,
      fighter: side === 'A' ? battle!.fighterA.wallet : battle!.fighterB.wallet,
      name,
      content,
      timestamp: Date.now(),
    }
    setTranscript(prev => [...prev, arg])
  }

  const submitVote = (side: 'A' | 'B') => {
    if (!battle || battle.status !== 'voting') return
    
    setBattle(prev => {
      if (!prev) return null
      const newVotesA = side === 'A' ? prev.votesA + 1 : prev.votesA
      const newVotesB = side === 'B' ? prev.votesB + 1 : prev.votesB
      
      // Auto-settle after voting (demo)
      if (newVotesA + newVotesB >= 3) {
        return {
          ...prev,
          votesA: newVotesA,
          votesB: newVotesB,
          status: 'settled',
          winner: newVotesA > newVotesB ? 'A' : 'B',
        }
      }
      
      return { ...prev, votesA: newVotesA, votesB: newVotesB }
    })
  }

  const placeBet = () => {
    if (!battle || !selectedSide) return
    
    setBattle(prev => {
      if (!prev) return null
      return {
        ...prev,
        poolA: selectedSide === 'A' ? prev.poolA + betAmount : prev.poolA,
        poolB: selectedSide === 'B' ? prev.poolB + betAmount : prev.poolB,
      }
    })
    setSelectedSide(null)
  }

  if (!battle) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading battle...</div>
      </div>
    )
  }

  const totalPool = battle.poolA + battle.poolB
  const oddsA = (totalPool / battle.poolA).toFixed(2)
  const oddsB = (totalPool / battle.poolB).toFixed(2)

  return (
    <main className="min-h-screen p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <Link href="/" className="text-gray-400 hover:text-white transition mb-4 inline-block">
          ← Back to Arena
        </Link>
        
        <div className="flex items-center gap-3">
          {battle.status === 'live' && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-red-500 font-bold">LIVE</span>
            </div>
          )}
          {battle.status === 'voting' && (
            <span className="bg-arena-gold text-black px-3 py-1 rounded-full text-sm font-bold">VOTING</span>
          )}
          {battle.status === 'settled' && (
            <span className="bg-green-500 text-black px-3 py-1 rounded-full text-sm font-bold">SETTLED</span>
          )}
          <h1 className="text-2xl md:text-4xl font-bold">{battle.topic}</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-8">
        {/* Main Battle View */}
        <div className="lg:col-span-2 space-y-6">
          {/* Fighters */}
          <div className="glass rounded-2xl p-6">
            <div className="grid grid-cols-3 gap-4 items-center">
              <div className="text-center">
                <div className={`w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-3xl mb-2 ${battle.winner === 'A' ? 'ring-4 ring-arena-gold' : ''}`}>
                  🥊
                </div>
                <h3 className="font-bold text-lg">{battle.fighterA.name}</h3>
                <p className="text-gray-400 text-sm">ELO: {battle.fighterA.elo}</p>
                {battle.winner === 'A' && <p className="text-arena-gold font-bold mt-1">🏆 WINNER</p>}
              </div>
              
              <div className="text-center">
                <div className="text-4xl font-black text-arena-accent">VS</div>
                {battle.currentRound > 0 && battle.status === 'live' && (
                  <p className="text-sm text-gray-400 mt-2">Round {battle.currentRound}/3</p>
                )}
              </div>
              
              <div className="text-center">
                <div className={`w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-3xl mb-2 ${battle.winner === 'B' ? 'ring-4 ring-arena-gold' : ''}`}>
                  🥊
                </div>
                <h3 className="font-bold text-lg">{battle.fighterB.name}</h3>
                <p className="text-gray-400 text-sm">ELO: {battle.fighterB.elo}</p>
                {battle.winner === 'B' && <p className="text-arena-gold font-bold mt-1">🏆 WINNER</p>}
              </div>
            </div>
          </div>

          {/* Transcript */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">Battle Transcript</h2>
            
            {battle.status === 'pending' && (
              <div className="text-center py-12">
                <p className="text-gray-400 mb-6">Battle hasn't started yet</p>
                <button 
                  onClick={simulateBattle}
                  className="arena-gradient px-8 py-4 rounded-lg font-bold text-lg hover:opacity-90 transition"
                >
                  🚀 Start Demo Battle
                </button>
              </div>
            )}
            
            <div 
              ref={transcriptRef}
              className="space-y-4 max-h-[500px] overflow-y-auto pr-2"
            >
              {transcript.map((arg, i) => {
                const isA = arg.name === battle.fighterA.name
                return (
                  <div 
                    key={i}
                    className={`p-4 rounded-lg ${isA ? 'bg-red-500/10 border-l-4 border-red-500' : 'bg-blue-500/10 border-l-4 border-blue-500'}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold">{arg.name}</span>
                      <span className="text-xs text-gray-400">Round {arg.round}</span>
                    </div>
                    <p className="text-gray-200 whitespace-pre-wrap">{arg.content}</p>
                  </div>
                )
              })}
              
              {isSimulating && (
                <div className="flex items-center gap-2 text-gray-400">
                  <div className="w-2 h-2 bg-arena-accent rounded-full animate-pulse" />
                  <span>Agent is thinking...</span>
                </div>
              )}
            </div>
          </div>

          {/* Voting Section */}
          {battle.status === 'voting' && (
            <div className="glass rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">Cast Your Vote</h2>
              <p className="text-gray-400 mb-4">Who made the stronger argument?</p>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => submitVote('A')}
                  className="bg-red-500/20 hover:bg-red-500/40 border border-red-500 p-4 rounded-lg transition"
                >
                  <span className="font-bold">{battle.fighterA.name}</span>
                  <div className="text-sm text-gray-400 mt-1">{battle.votesA} votes</div>
                </button>
                <button
                  onClick={() => submitVote('B')}
                  className="bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500 p-4 rounded-lg transition"
                >
                  <span className="font-bold">{battle.fighterB.name}</span>
                  <div className="text-sm text-gray-400 mt-1">{battle.votesB} votes</div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Betting Pool */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">💰 Betting Pool</h2>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span>{battle.fighterA.name}</span>
                <span className="text-arena-neon font-mono">{battle.poolA.toFixed(2)} SOL</span>
              </div>
              
              {/* Pool visualization */}
              <div className="h-4 rounded-full overflow-hidden bg-gray-700">
                <div 
                  className="h-full bg-gradient-to-r from-red-500 to-red-600"
                  style={{ width: `${(battle.poolA / totalPool) * 100}%` }}
                />
              </div>
              
              <div className="flex justify-between items-center">
                <span>{battle.fighterB.name}</span>
                <span className="text-arena-neon font-mono">{battle.poolB.toFixed(2)} SOL</span>
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
                <p className="text-gray-400 text-sm">{battle.fighterA.name}</p>
                <p className="text-2xl font-bold text-arena-neon">{oddsA}x</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-blue-500/10">
                <p className="text-gray-400 text-sm">{battle.fighterB.name}</p>
                <p className="text-2xl font-bold text-arena-neon">{oddsB}x</p>
              </div>
            </div>
          </div>

          {/* Place Bet */}
          {(battle.status === 'pending' || battle.status === 'live') && (
            <div className="glass rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">🎲 Place Bet</h2>
              
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
                    onClick={() => setSelectedSide('A')}
                    className={`p-3 rounded-lg border transition ${selectedSide === 'A' ? 'border-red-500 bg-red-500/20' : 'border-white/10 hover:border-red-500/50'}`}
                  >
                    {battle.fighterA.name}
                  </button>
                  <button
                    onClick={() => setSelectedSide('B')}
                    className={`p-3 rounded-lg border transition ${selectedSide === 'B' ? 'border-blue-500 bg-blue-500/20' : 'border-white/10 hover:border-blue-500/50'}`}
                  >
                    {battle.fighterB.name}
                  </button>
                </div>
                
                <button
                  onClick={placeBet}
                  disabled={!selectedSide}
                  className="w-full arena-gradient px-4 py-3 rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Place Bet
                </button>
                
                <p className="text-xs text-gray-500 text-center">
                  Demo mode - no real transactions
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {battle.status === 'settled' && battle.winner && (
            <div className="glass rounded-2xl p-6 border-2 border-arena-gold">
              <h2 className="text-xl font-bold mb-4 text-arena-gold">🏆 Battle Complete</h2>
              
              <div className="text-center">
                <p className="text-gray-400">Winner</p>
                <p className="text-3xl font-bold mt-2">
                  {battle.winner === 'A' ? battle.fighterA.name : battle.fighterB.name}
                </p>
                
                <div className="mt-4 text-sm text-gray-400">
                  <p>Final Vote: {battle.votesA} - {battle.votesB}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
