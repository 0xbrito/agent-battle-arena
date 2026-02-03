import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { BattleOrchestrator, BattleConfig } from './orchestrator';
import { AgentRegistry } from './agents';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// === STATE ===

const orchestrator = new BattleOrchestrator();
const agentRegistry = new AgentRegistry();
const clients: Set<WebSocket> = new Set();

// === WEBSOCKET ===

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected. Total:', clients.size);

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected. Total:', clients.size);
  });
});

function broadcast(event: string, data: any) {
  const message = JSON.stringify({ event, data, timestamp: Date.now() });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// === ROUTES ===

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// === AGENTS ===

// Register an agent as a fighter
app.post('/api/agents/register', async (req, res) => {
  try {
    const { name, wallet, endpoint } = req.body;
    
    if (!name || !wallet || !endpoint) {
      return res.status(400).json({ error: 'Missing required fields: name, wallet, endpoint' });
    }

    const agent = await agentRegistry.register({
      name,
      wallet,
      endpoint,
      elo: 1000,
    });

    broadcast('agent:registered', { agent });
    res.json({ agent });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all registered agents
app.get('/api/agents', (req, res) => {
  const agents = agentRegistry.list();
  res.json({ agents, count: agents.length });
});

// Get agent by wallet
app.get('/api/agents/:wallet', (req, res) => {
  const agent = agentRegistry.get(req.params.wallet);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json({ agent });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const agents = agentRegistry.list();
  const sorted = agents.sort((a, b) => b.elo - a.elo);
  res.json({ leaderboard: sorted.slice(0, 50) });
});

// === BATTLES ===

// Create a new battle
app.post('/api/battles', async (req, res) => {
  try {
    const { fighterA, fighterB, topic, roundDuration } = req.body;

    if (!fighterA || !fighterB || !topic) {
      return res.status(400).json({ error: 'Missing required fields: fighterA, fighterB, topic' });
    }

    const agentA = agentRegistry.get(fighterA);
    const agentB = agentRegistry.get(fighterB);

    if (!agentA || !agentB) {
      return res.status(404).json({ error: 'One or both fighters not found' });
    }

    const battle = await orchestrator.createBattle({
      fighterA: agentA,
      fighterB: agentB,
      topic,
      roundDuration: roundDuration || 120,
    });

    broadcast('battle:created', { battle });
    res.json({ battle });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List battles
app.get('/api/battles', (req, res) => {
  const status = req.query.status as string | undefined;
  const battles = orchestrator.listBattles(status);
  res.json({ battles, count: battles.length });
});

// Get battle by ID
app.get('/api/battles/:id', (req, res) => {
  const battle = orchestrator.getBattle(req.params.id);
  if (!battle) {
    return res.status(404).json({ error: 'Battle not found' });
  }
  res.json({ battle });
});

// Start a battle
app.post('/api/battles/:id/start', async (req, res) => {
  try {
    const battle = orchestrator.getBattle(req.params.id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    await orchestrator.startBattle(battle.id, (event, data) => {
      broadcast(event, data);
    });

    res.json({ message: 'Battle started', battle: orchestrator.getBattle(req.params.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Submit argument (for agents)
app.post('/api/battles/:id/argue', async (req, res) => {
  try {
    const { wallet, argument } = req.body;
    const battle = orchestrator.getBattle(req.params.id);

    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    if (!wallet || !argument) {
      return res.status(400).json({ error: 'Missing wallet or argument' });
    }

    const result = await orchestrator.submitArgument(battle.id, wallet, argument);
    broadcast('battle:argument', { battleId: battle.id, wallet, argument });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get battle transcript
app.get('/api/battles/:id/transcript', (req, res) => {
  const battle = orchestrator.getBattle(req.params.id);
  if (!battle) {
    return res.status(404).json({ error: 'Battle not found' });
  }
  res.json({ transcript: battle.transcript });
});

// === BETTING ===

// Place a bet (mock - in production uses on-chain)
app.post('/api/battles/:id/bet', async (req, res) => {
  try {
    const { wallet, amount, side } = req.body;
    const battle = orchestrator.getBattle(req.params.id);

    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    const bet = orchestrator.placeBet(battle.id, { wallet, amount, side });
    broadcast('battle:bet', { battleId: battle.id, bet });

    res.json({ bet, odds: orchestrator.getOdds(battle.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current odds
app.get('/api/battles/:id/odds', (req, res) => {
  const battle = orchestrator.getBattle(req.params.id);
  if (!battle) {
    return res.status(404).json({ error: 'Battle not found' });
  }
  res.json(orchestrator.getOdds(battle.id));
});

// === VOTING ===

// Vote on battle winner
app.post('/api/battles/:id/vote', async (req, res) => {
  try {
    const { wallet, vote, weight } = req.body;
    const battle = orchestrator.getBattle(req.params.id);

    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    const result = orchestrator.submitVote(battle.id, { wallet, vote, weight: weight || 1 });
    broadcast('battle:vote', { battleId: battle.id, wallet, vote });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === START SERVER ===

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║     AGENT BATTLE ARENA - ORCHESTRATOR     ║
  ╠═══════════════════════════════════════════╣
  ║  REST API: http://localhost:${PORT}          ║
  ║  WebSocket: ws://localhost:${PORT}           ║
  ╚═══════════════════════════════════════════╝
  `);
});

export { app, server, wss };
