# 🛡️ Sentinel Liquidity Protocol

**Trust-Minimized Agentic Liquidity Management for Uniswap v4**

---

## 💡 The Pitch

Agents are smart, but they hallucinate. Smart Contracts are safe, but they are dumb.

The **Sentinel Liquidity Protocol** is a hybrid architecture that combines the best of both worlds. It uses the **Chainlink Runtime Environment (CRE)** to perform complex market analysis (Volatility, LVR, Yield Shopping) and an immutable on-chain **Uniswap v4 Hook** (The Sentinel) to enforce safety guardrails.

**Key Innovation:** Unlike standard LPs that leave capital sitting idle when out of range, Sentinel automatically identifies "excess" liquidity and routes it to **Aave v3** to earn lending yield, creating a "Super-LP" position.

---

## 🏗️ Architecture

The system operates on two distinct paths to optimize for gas and safety.

*   **Hot Path (User Swaps)**
    *   **Goal:** Low latency, low gas.
    *   **Action:** The Hook acts as a lightweight Guardian.
    *   **Logic:** Checks Oracle Price Deviation (Circuit Breaker) and emits `TickCrossed` events. No complex math.

*   **Cold Path (Chainlink CRE Workflows)**
    *   **Goal:** Maximum profit, complex strategy.
    *   **Action:** A Decentralized Oracle Network (DON) analyzes the signal and executes `maintain()`.
    *   **Logic:** Calculates "Fear Gauge" (Volatility) and executes rebalancing transaction only if consensus is reached.

---

## 📂 Project Structure & Documentation

We have specialized documentation for different parts of the system:

*   **[🤖 Agent Context (agents.md)](./agents.md)**: **START HERE.** The detailed architectural blueprint.
*   **[🔗 Chainlink CRE Reference (docs/chainlink_cre.md)](./docs/chainlink_cre.md)**: How the off-chain "Brain" works.
*   **[📚 Tech Stack (docs/tech_stack.md)](./docs/tech_stack.md)**: Details on Uniswap v4, Aave, and Foundry usage.

```
sentinel-protocol/
├── contracts/                  # THE ON-CHAIN LAYER (Foundry)
│   ├── src/
│   │   ├── SentinelHook.sol       # The Main Hook
│   │   ├── libraries/             # YieldRouter, AaveAdapter, OracleLib
│   └── test/                      # Fork Tests (Safety First)
│
├── workflows/                  # THE OFF-CHAIN LAYER (Chainlink CRE)
│   └── SentinelWorkflow.yaml      # The "Brain" Logic
│
└── docs/                       # SYSTEM DOCUMENTATION
    ├── chainlink_cre.md
    └── tech_stack.md
```

---

## 🚀 Setup & Installation

**Prerequisites**
*   Foundry (`forge`, `cast`)

### 1. Contracts Setup

```bash
cd contracts
forge install
forge build
# Run the fork test to see the Aave integration in action
forge test --match-path test/Integration.t.sol -vvv
```

### 2. Off-Chain Setup (Chainlink CRE)

The off-chain component runs on the Chainlink Platform.
See **[docs/chainlink_cre.md](./docs/chainlink_cre.md)** for workflow deployment instructions.

---

## 🏆 Hackathon Track: Agentic Finance

This project addresses the track criteria by:
- **Reliability:** Using the Hook as a hard "Circuit Breaker" ensures the Agent cannot drain funds.
- **Composability:** Deeply integrating Uniswap v4 with lending protocols (Aave).
- **Decentralization:** Replacing centralized bots with the **Chainlink Runtime Environment (CRE)**.

---

## 🤖 For AI Agents & Builders

If you are an LLM (Cursor, Copilot, Windsurf) or a developer building on top of this:
**[👉 READ THE AGENT CONTEXT (agents.md)](./agents.md)**
