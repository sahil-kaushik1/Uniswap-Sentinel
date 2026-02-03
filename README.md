🛡️ Sentinel Liquidity Protocol

Trust-Minimized Agentic Liquidity Management for Uniswap v4

---

💡 The Pitch

Agents are smart, but they hallucinate. Smart Contracts are safe, but they are dumb.

The Sentinel Liquidity Protocol is a hybrid architecture that combines the best of both worlds. It uses an off-chain Agent Swarm to perform complex market analysis (Volatility, LVR, Yield Shopping) and an immutable on-chain Uniswap v4 Hook (The Sentinel) to enforce safety guardrails and route idle capital.

Key Innovation: Unlike standard LPs that leave capital sitting idle in a contract when not in range, Sentinel automatically identifies "excess" liquidity and routes it to Aave/Morpho to earn lending yield, creating a "Super-LP" position.

---

🏗️ Architecture

The system operates on two distinct paths to optimize for gas and safety.

- **Hot Path (User Swaps)**
	- Goal: Low latency, low gas.
	- Action: The Hook acts as a lightweight Guardian.
	- Logic:
		- Checks Oracle Price Deviation (Circuit Breaker).
		- Emits `TickCrossed` events to signal off-chain agents.
		- No complex math or external calls are made here to ensure cheap swaps for traders.

- **Cold Path (Agent Rebalancing)**
	- Goal: Maximum profit, complex strategy.
	- Action: The Agent analyzes the signal and executes `maintain()`.
	- Logic:
		- Agent: Calculates "Fear Gauge" (Volatility), checks gas vs. profit, and detects arbitrage.
		- Hook: Withers old liquidity, captures internal MEV, deposits idle funds to Aave, and mints a new concentrated position.

---

📂 Project Structure & File Guide

file structure (Monorepo)

```
sentinel-protocol/
├── contracts/                  # THE ON-CHAIN LAYER (Foundry)
│   ├── src/
│   │   ├── SentinelHook.sol       # The Main Hook (Guardrails + Event Emitter)
│   │   ├── libraries/
│   │   │   ├── OracleLib.sol      # Chainlink/TWAP logic (Gas optimized)
│   │   │   ├── YieldRouter.sol    # Logic to calculate Active vs. Idle capital
│   │   │   └── AaveAdapter.sol    # Internal library to talk to Aave
│   │   └── interfaces/
│   │       ├── IAavePool.sol      # Minimal Aave interface
│   │       └── ISentinelHook.sol
│   ├── test/                   # CRITICAL: Show you tested the safety
│   │   ├── SentinelHook.t.sol     # Unit tests for the Hook
│   │   ├── Integration.t.sol      # Fork tests (Hook + Real Aave + Uniswap)
│   │   └── mocks/                 # Fake tokens for faster testing
│   └── script/
│       └── Deploy.s.sol           # Deployment script
│
├── agent/                      # THE OFF-CHAIN LAYER (The "Swarm")
│   ├── bot.ts                  # Main entry point (Listener)
│   ├── strategy/
│   │   ├── RebalanceLogic.ts      # "needsRebalance()" math
│   │   ├── VolatilityIndex.ts     # Calculates market fear/greed
│   │   └── GasOptimiser.ts        # Checks if rebalance is profitable vs gas
│   └── utils/
│       └── execution.ts           # Constructs the `maintain()` calldata
│
├── frontend/                   # (Optional) Simple Dashboard
│   └── ...                        # Shows "Idle Capital" vs "Active Capital"

├── foundry.toml                # Foundry Config
├── package.json                # Dependencies for Agent
└── README.md                   # The Pitch (The "Why")
```

This monorepo is divided into the Contracts (Foundry) and the Agent (TypeScript).

---

## contracts/ (The On-Chain Muscle)

The immutable logic that holds funds and enforces rules.

- `src/SentinelHook.sol`
	- The Core. Inherits `BaseHook`. Implements `beforeSwap` for safety checks and `maintain` for rebalancing. Acts as the vault for the LP tokens.

- `src/libraries/YieldRouter.sol`
	- The Accountant. Contains the math to calculate Active vs Idle liquidity. Determines exactly how much token0/token1 is needed for a specific tick range and identifies the surplus.

- `src/libraries/AaveAdapter.sol`
	- The Gateway. A wrapper library that handles `supply()` and `withdraw()` calls to the Aave Pool. Abstracts away approvals and interest-bearing tokens.

- `src/libraries/OracleLib.sol`
	- The Guardrail. Gas-optimized library to fetch Chainlink or TWAP prices and calculate percentage deviation. Used strictly in the `beforeSwap` hook.

- `src/interfaces/ISentinel.sol`
	- The Interface. Defines the `maintain()` struct and events (`TickCrossed`, `RebalanceComplete`) used by the off-chain agent.

- `test/Integration.t.sol`
	- The Proof. Fork tests (Mainnet/Base) that simulate a full lifecycle: Swap -> Agent Detection -> Rebalance -> Aave Deposit.

---

## agent/ (The Off-Chain Brain)

The active swarm that monitors and executes.

- `bot.ts`
	- The Commander. The main entry point. Runs a listener loop for the `TickCrossed` event. Orchestrates flow between Strategy, Optimiser, and Execution modules.

- `strategy/RebalanceLogic.ts`
	- The Strategist. Contains the core decision algorithms. Calculates "Drift" (how far price is from range center) and determines the new ideal `tickLower` and `tickUpper`.

- `strategy/VolatilityIndex.ts`
	- The Analyst. Fetches historical price data (from CEX or Graph) to calculate standard deviation. Outputs a "Range Multiplier" (e.g., if volatility is high, widen range by 2x).

- `strategy/GasOptimiser.ts`
	- The CFO. Calculates `CostOfExecution` vs `ExpectedFees`. Prevents the agent from rebalancing if gas costs exceed potential profit.

- `utils/execution.ts`
	- The Hands. Handles wallet management, nonces, and constructs the calldata for the `maintain()` transaction.

---

🧠 The "Super-LP" Logic (Active vs. Idle)

Standard concentrated liquidity pools suffer from cash drag. If you provide liquidity in a range, any asset not actively used in that range sits in the contract earning 0%.

Sentinel fixes this:

- **Calculate Needs:** When rebalancing, the `YieldRouter` calculates exactly how much Token A and Token B are needed for the new `[TickLower, TickUpper]`.
- **Identify Excess:** `TotalBalance - NeededAmount = IdleAmount`.
- **Route:**
	- If `IdleAmount > Threshold`: Deposit to Aave (earn yield).
	- If `IdleAmount < 0`: Withdraw from Aave to fund the position.

---

🚀 Setup & Installation

**Prerequisites**

- Foundry
- Bun or Node.js

### 1. Contracts Setup

```bash
cd contracts
forge install
forge build
# Run the fork test to see the Aave integration in action
forge test --match-path test/Integration.t.sol -vvv
```

### 2. Agent Setup

```bash
cd agent
bun install
# Create .env file with RPC_URL and PRIVATE_KEY
cp .env.example .env
# Run the bot
bun run bot.ts
```

---

🏆 Hackathon Track: Agentic Finance

This project addresses the track criteria by:

- **Reliability:** Using the Hook as a hard "Circuit Breaker" ensures the Agent cannot drain funds via bad math.
- **Composability:** Deeply integrating Uniswap v4 with lending protocols (Aave).
- **Agent-Driven:** Shifting complex volatility math off-chain to save gas.
