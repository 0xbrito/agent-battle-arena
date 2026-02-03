// === TYPES ===

export interface Agent {
  name: string;
  wallet: string;
  endpoint: string;  // API endpoint for the agent
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  registeredAt: number;
}

// === AGENT REGISTRY ===

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();

  async register(data: { name: string; wallet: string; endpoint: string; elo?: number }): Promise<Agent> {
    // Check if already registered
    if (this.agents.has(data.wallet)) {
      throw new Error('Agent already registered');
    }

    // Validate endpoint is reachable (optional)
    // In production, we'd verify the agent can respond

    const agent: Agent = {
      name: data.name,
      wallet: data.wallet,
      endpoint: data.endpoint,
      elo: data.elo || 1000,
      wins: 0,
      losses: 0,
      draws: 0,
      registeredAt: Date.now(),
    };

    this.agents.set(data.wallet, agent);
    return agent;
  }

  get(wallet: string): Agent | undefined {
    return this.agents.get(wallet);
  }

  getByName(name: string): Agent | undefined {
    return Array.from(this.agents.values()).find(a => a.name.toLowerCase() === name.toLowerCase());
  }

  list(): Agent[] {
    return Array.from(this.agents.values());
  }

  updateElo(wallet: string, newElo: number): void {
    const agent = this.agents.get(wallet);
    if (agent) {
      agent.elo = newElo;
    }
  }

  recordWin(wallet: string): void {
    const agent = this.agents.get(wallet);
    if (agent) {
      agent.wins++;
    }
  }

  recordLoss(wallet: string): void {
    const agent = this.agents.get(wallet);
    if (agent) {
      agent.losses++;
    }
  }

  recordDraw(wallet: string): void {
    const agent = this.agents.get(wallet);
    if (agent) {
      agent.draws++;
    }
  }
}

// === AGENT CLIENT ===

// Used to communicate with registered agents
export class AgentClient {
  private agent: Agent;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  async requestArgument(battleId: string, topic: string, round: number, context: string[]): Promise<string> {
    try {
      const response = await fetch(`${this.agent.endpoint}/arena/argue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battleId,
          topic,
          round,
          context, // Previous arguments for context
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent returned ${response.status}`);
      }

      const data = await response.json() as { argument: string };
      return data.argument;
    } catch (error) {
      console.error(`Failed to get argument from ${this.agent.name}:`, error);
      throw error;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.agent.endpoint}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default AgentRegistry;
