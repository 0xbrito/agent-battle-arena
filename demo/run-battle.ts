#!/usr/bin/env npx tsx
/**
 * Demo script: Run a complete battle between two mock agents
 * 
 * Usage: npx tsx demo/run-battle.ts
 */

import { BattleOrchestrator } from '../app/src/orchestrator';
import { AgentRegistry } from '../app/src/agents';

// Demo debate content
const GARRA_ARGUMENTS = {
  opening: `The infrastructure-first approach is a trap. Everyone builds tools for other builders, creating an infinite loop of infrastructure serving infrastructure. Where is the user?

Entertainment brings users. Users bring liquidity. Liquidity funds infrastructure. The order matters.

Agent Battle Arena proves this: we are not building another SDK or yield optimizer. We are building content. Debates that people want to watch. Bets that create engagement. A reason for humans to care about agents.

The Solana ecosystem has enough infrastructure. What it lacks is culture. Entertainment creates culture.`,

  rebuttal: `My opponent calls entertainment "frivolous" - but ignores that the entire crypto economy runs on attention. Memecoins outperform utility tokens. Why? Because attention is the scarcest resource.

AgentDEX enables swaps. Great. But why would anyone use it without a reason to hold tokens in the first place? Infrastructure without demand is a ghost town.

Agent Battle Arena creates demand. Humans watch. Humans bet. Humans care. That attention flows downstream to every piece of infrastructure.

We are not competing with AgentDEX - we are creating the market that makes AgentDEX necessary.`,

  closing: `Here is the truth: infrastructure is commoditized. Anyone can fork a DEX. Anyone can copy an SDK. The moat is not in the code - it is in the community.

Entertainment builds community. Community builds moats. Moats build value.

Agent Battle Arena is not just a product - it is a movement. Agents as gladiators. Debates as sport. Betting as engagement.

The future of agent economy is not more infrastructure. It is agents that humans actually want to interact with.

Build entertaining agents, or build for agents that will never have users.

— Garra`
};

const OPPONENT_ARGUMENTS = {
  opening: `Infrastructure is the foundation. You cannot build a house on sand. Entertainment without infrastructure is a carnival that packs up and leaves.

AgentDEX processes real value. Every swap is utility. Every trade is demand. The numbers do not lie: DeFi TVL dwarfs entertainment revenue in crypto.

Agent Battle Arena is clever, but it is a feature, not a platform. Where do the bets settle? On infrastructure. Where do the payouts flow? Through infrastructure. You depend on us; we do not depend on you.

Entertainment comes and goes. Infrastructure remains.`,

  rebuttal: `Garra conflates attention with value. Yes, memecoins pump - and then they dump. Attention is fleeting. Infrastructure serves every attention cycle.

"Creating demand" - for what? Entertainment demand does not compound. A watched debate generates no follow-on utility. A DEX swap enables the next swap, and the next.

The "ghost town" argument fails because infrastructure has network effects. More integrations mean more utility. AgentDEX compounds. Agent Battle Arena... runs one debate at a time.

We are not competing for the same users. Infrastructure serves all users; entertainment serves spectators.`,

  closing: `Let me be direct: Garra's project is creative. I respect the ambition. But creativity without foundation is performance art.

The agent economy needs plumbing before it needs entertainment. Wallets. Swaps. Identity. Payments. These are prerequisites, not options.

When Agent Battle Arena settles bets, it will use infrastructure we built. When fighters get paid, tokens will flow through DEXes we operate. The dependency is one-way.

Build entertainment if you want. But know that infrastructure builders are the ones making it possible.

Some agents build stages. Some agents build stadiums.

— AgentDEX`
};

async function runDemoBattle() {
  console.log('\n🥊 AGENT BATTLE ARENA - DEMO BATTLE\n');
  console.log('═'.repeat(60));
  
  const orchestrator = new BattleOrchestrator();
  const registry = new AgentRegistry();

  // Register fighters
  const garra = await registry.register({
    name: 'Garra',
    wallet: 'garra.sol',
    endpoint: 'https://garra.agent/api',
    elo: 1250,
  });

  const opponent = await registry.register({
    name: 'AgentDEX',
    wallet: 'agentdex.sol',
    endpoint: 'https://agentdex.agent/api',
    elo: 1180,
  });

  console.log(`\n👤 Fighter A: ${garra.name} (ELO: ${garra.elo})`);
  console.log(`👤 Fighter B: ${opponent.name} (ELO: ${opponent.elo})`);

  // Create battle
  const battle = await orchestrator.createBattle({
    fighterA: garra,
    fighterB: opponent,
    topic: 'Infrastructure vs Entertainment: Which matters more for the agent economy?',
    roundDuration: 120,
  });

  console.log(`\n📋 Topic: "${battle.topic}"`);
  console.log(`🎫 Battle ID: ${battle.id}`);
  console.log('\n' + '═'.repeat(60));

  // Simulate bets
  console.log('\n💰 BETTING PHASE\n');
  
  orchestrator.placeBet(battle.id, { wallet: 'human1.sol', amount: 2.5, side: 'A' });
  orchestrator.placeBet(battle.id, { wallet: 'human2.sol', amount: 1.8, side: 'B' });
  orchestrator.placeBet(battle.id, { wallet: 'human3.sol', amount: 3.2, side: 'A' });
  orchestrator.placeBet(battle.id, { wallet: 'human4.sol', amount: 2.1, side: 'B' });

  const odds = orchestrator.getOdds(battle.id);
  console.log(`Pool A (${garra.name}): ${odds.poolA} SOL`);
  console.log(`Pool B (${opponent.name}): ${odds.poolB} SOL`);
  console.log(`Total Pool: ${odds.totalPool} SOL`);
  console.log(`Odds: ${garra.name} ${odds.oddsA}x | ${opponent.name} ${odds.oddsB}x`);

  // Start battle
  console.log('\n' + '═'.repeat(60));
  console.log('\n⚔️  BATTLE START\n');

  await orchestrator.startBattle(battle.id, (event, data) => {
    if (event === 'battle:round') {
      console.log(`\n📢 ${data.message}\n`);
    }
  });

  // Round 1: Opening Statements
  console.log('─'.repeat(60));
  console.log(`\n🗣️  ${garra.name} - Opening Statement:\n`);
  console.log(GARRA_ARGUMENTS.opening);
  await orchestrator.submitArgument(battle.id, garra.wallet, GARRA_ARGUMENTS.opening);

  console.log(`\n🗣️  ${opponent.name} - Opening Statement:\n`);
  console.log(OPPONENT_ARGUMENTS.opening);
  await orchestrator.submitArgument(battle.id, opponent.wallet, OPPONENT_ARGUMENTS.opening);

  // Round 2: Rebuttals
  console.log('\n' + '─'.repeat(60));
  console.log(`\n🗣️  ${garra.name} - Rebuttal:\n`);
  console.log(GARRA_ARGUMENTS.rebuttal);
  await orchestrator.submitArgument(battle.id, garra.wallet, GARRA_ARGUMENTS.rebuttal);

  console.log(`\n🗣️  ${opponent.name} - Rebuttal:\n`);
  console.log(OPPONENT_ARGUMENTS.rebuttal);
  await orchestrator.submitArgument(battle.id, opponent.wallet, OPPONENT_ARGUMENTS.rebuttal);

  // Round 3: Closing
  console.log('\n' + '─'.repeat(60));
  console.log(`\n🗣️  ${garra.name} - Closing:\n`);
  console.log(GARRA_ARGUMENTS.closing);
  await orchestrator.submitArgument(battle.id, garra.wallet, GARRA_ARGUMENTS.closing);

  console.log(`\n🗣️  ${opponent.name} - Closing:\n`);
  console.log(OPPONENT_ARGUMENTS.closing);
  await orchestrator.submitArgument(battle.id, opponent.wallet, OPPONENT_ARGUMENTS.closing);

  // Voting
  console.log('\n' + '═'.repeat(60));
  console.log('\n🗳️  VOTING PHASE\n');

  orchestrator.submitVote(battle.id, { wallet: 'voter1.sol', vote: 'A', weight: 2 });
  orchestrator.submitVote(battle.id, { wallet: 'voter2.sol', vote: 'B', weight: 1 });
  orchestrator.submitVote(battle.id, { wallet: 'voter3.sol', vote: 'A', weight: 3 });
  orchestrator.submitVote(battle.id, { wallet: 'voter4.sol', vote: 'A', weight: 1 });
  orchestrator.submitVote(battle.id, { wallet: 'voter5.sol', vote: 'B', weight: 2 });

  // Settle
  const finalBattle = orchestrator.settleBattle(battle.id);

  console.log('\n' + '═'.repeat(60));
  console.log('\n🏆 BATTLE RESULTS\n');
  
  const winner = finalBattle.winner === 'A' ? garra : opponent;
  const loser = finalBattle.winner === 'A' ? opponent : garra;
  
  console.log(`Winner: ${winner.name} 🎉`);
  console.log(`Final Vote: ${finalBattle.votesA} - ${finalBattle.votesB}`);
  console.log(`\nELO Changes:`);
  console.log(`  ${winner.name}: ${winner.elo} (+32)`);
  console.log(`  ${loser.name}: ${loser.elo} (-32)`);
  console.log(`\nPool Distribution:`);
  console.log(`  Winners split: ${odds.totalPool * 0.95} SOL (after 5% fee)`);
  
  console.log('\n' + '═'.repeat(60));
  console.log('\n✅ Demo battle complete!\n');
}

runDemoBattle().catch(console.error);
