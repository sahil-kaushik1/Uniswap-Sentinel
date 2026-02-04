# 🛡️ Sentinel Liquidity Protocol

**Trust-Minimized Agentic Liquidity Management as a Service for Uniswap v4**

---

## 💡 The Problem

Traditional liquidity provision on Uniswap requires constant monitoring and rebalancing. LPs face:
- **Impermanent Loss:** Price movements outside their range mean zero fee income
- **Active Management:** Manual rebalancing is time-consuming and gas-intensive
- **Idle Capital:** Out-of-range liquidity earns nothing
- **Trust Issues:** Existing "LP management" solutions require trusting a centralized bot

## 🎯 The Solution

**Sentinel Liquidity Protocol** is a **Liquidity Management as a Service (LMaaS)** platform built on Uniswap v4 Hooks. LPs deposit tokens, receive shares, and Sentinel autonomously manages their positions across **any supported pool**.

### Key Innovation

| Problem | Sentinel Solution |
|---------|-------------------|
| **Trust** | Hybrid architecture: Immutable Hook (safety) + Gelato Automate (execution) |
| **Idle Capital** | Automatic routing to Aave v3 for lending yield |
| **Multi-Pool** | Single hook contract serves unlimited pools |
| **Gas Efficiency** | Shared infrastructure reduces per-LP costs |

---

## 🏗️ Architecture Overview

```mermaid
graph TD
    subgraph "LPs (Users)"
        LP1[LP 1]
        LP2[LP 2]
        LP3[LP N...]
    end
    
    subgraph "SentinelHook (One Contract)"
        Hook[Multi-Pool Hook]
        States[(Per-Pool State)]
        Shares[(LP Shares)]
    end
    
    subgraph "Uniswap v4 Pools"
        Pool1[ETH/USDC]
        Pool2[WBTC/ETH]
        Pool3[ARB/USDC]
    end
    
    subgraph "External Protocols"
        Aave[Aave v3 - Yield]
        Oracle[Chainlink - Safety]
        Gelato[Gelato Automate - Execution]
    end
    
    LP1 -->|Deposit| Hook
    LP2 -->|Deposit| Hook
    LP3 -->|Deposit| Hook
    
    Hook --> States
    Hook --> Shares
    
    Hook <-->|Liquidity| Pool1
    Hook <-->|Liquidity| Pool2
    Hook <-->|Liquidity| Pool3
    
    Hook <-->|Yield| Aave
    Hook <-->|Price Check| Oracle
    Gelato -->|maintain()| Hook
```

### Two-Path Design

#### 🔥 Hot Path (Every Swap)
- **Trigger:** `beforeSwap` hook on all pools using Sentinel
- **Gas Budget:** < 50,000 gas
- **Logic:** Oracle price deviation check (circuit breaker)
- **Output:** TickCrossed event if price moved outside range

#### ❄️ Cold Path (Gelato Rebalancing)
- **Trigger:** TickCrossed event or scheduled interval
- **Executor:** Gelato Automate (dedicated msg.sender recommended)
- **Logic:** Calculate optimal range and Active/Idle split off-chain, then execute `maintain()`
- **Output:** `maintain()` transaction to rebalance

---

## 🔄 Asset Flow

### LP Deposit Flow
```
1. LP approves tokens
2. LP calls depositLiquidity(poolId, amount0, amount1)
3. Hook calculates shares based on NAV
4. LP receives shares, tokens held by Hook
5. Next maintain() deploys tokens to pool + Aave
```

### Rebalancing Flow
```
1. Price moves outside active range
2. beforeSwap emits TickCrossed event
3. Gelato Automate detects event (or cron)
4. Strategy computes optimal new range
5. Gelato calls maintain(poolId, newRange, volatility)
7. Hook: Withdraw old range → Calculate split → Deploy new range + Aave
```

### LP Withdrawal Flow
```
1. LP calls withdrawLiquidity(poolId, shares)
2. Hook calculates proportional claim
3. Withdraw from Aave (if needed)
4. Withdraw from pool (proportional liquidity)
5. Transfer tokens to LP, burn shares
```

---

## 📂 Project Structure

```
sentinel-protocol/
├── src/                           # Smart Contracts
│   ├── SentinelHook.sol          # Multi-pool hook (main contract)
│   └── libraries/
│       ├── OracleLib.sol         # Price deviation checks
│       ├── YieldRouter.sol       # Active/Idle split calculations
│       └── AaveAdapter.sol       # Aave v3 integration
│
├── test/                          # Foundry Tests
│   └── SentinelIntegration.t.sol # Fork tests
│
├── script/                        # Deployment Scripts
│   └── DeploySentinel.s.sol
│
├── workflows/                     # Gelato Automate
│   └── gelato-automate.md        # Task/resolver notes
│
├── docs/                          # Documentation
│   ├── gelato_automate.md        # Gelato Automate reference
│   ├── whitepaper.md             # Protocol whitepaper
│   └── tech_stack.md             # Technology details
│
├── agents.md                      # AI Agent context (START HERE)
├── VISUAL_GUIDE.md               # Diagrams and flows
└── README.md                      # This file
```

---

## 🚀 Getting Started

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`)
- Node.js 18+ (for frontend, optional)
- Base RPC URL (Alchemy/Infura)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/sentinel-protocol.git
cd sentinel-protocol

# Install dependencies
forge install

# Build contracts
forge build
```

### Running Tests

```bash
# Unit + fuzz tests
forge test --match-path "test/unit/*.t.sol"
forge test --match-path "test/fuzz/*.t.sol"

# Integration tests (fork)
forge test --match-path "test/integration/*.t.sol" --fork-url $BASE_RPC_URL -vvv

# Gas report
forge test --gas-report
```

### Deployment

```bash
# Deploy to Base testnet
forge script script/DeploySentinel.s.sol --rpc-url $BASE_TESTNET_RPC --broadcast

# Verify on Basescan
forge verify-contract <ADDRESS> SentinelHook --chain base
```

---

## 🔌 Supported Pools

Sentinel can manage ANY Uniswap v4 pool that:
1. ✅ Has the SentinelHook attached at initialization
2. ✅ Has at least one token supported by Aave v3
3. ✅ Has a corresponding Chainlink price feed

### Example Configurations

| Pool | Yield Currency | Oracle | Risk Profile |
|------|----------------|--------|--------------|
| ETH/USDC | USDC | ETH/USD | Blue chip |
| WBTC/ETH | ETH | BTC/ETH | High volatility |
| ARB/USDC | USDC | ARB/USD | L2 native |
| stETH/ETH | ETH | stETH/ETH | LST arbitrage |

---

## 🛡️ Security Model

### Trust Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│ Level 1: Smart Contract (Immutable)                        │
│ ├── Oracle deviation checks (circuit breaker)              │
│ ├── LP share accounting (proportional claims only)         │
│ └── Range validation (min/max bounds)                      │
├─────────────────────────────────────────────────────────────┤
│ Level 2: Gelato Automate (Execution)                       │
│ ├── Whitelisted executor (dedicated msg.sender recommended)│
│ ├── Event/cron driven execution                             │
│ └── No custody of LP funds                                  │
├─────────────────────────────────────────────────────────────┤
│ Level 3: Strategy Parameters (Configurable)                │
│ ├── Volatility thresholds                                  │
│ ├── Range width bounds                                     │
│ └── Yield protocol selection                               │
└─────────────────────────────────────────────────────────────┘
```

### What automation CAN'T Do
- ❌ Withdraw LP funds (only LPs can withdraw their shares)
- ❌ Bypass oracle checks (enforced in immutable Hook code)
- ❌ Set invalid ranges (Hook validates all parameters)
- ❌ Bypass the `maintainer` gate (only the configured executor can call `maintain()`)

---

## 🏆 Hackathon Track: Agentic Finance

This project addresses the track criteria by:

| Criterion | Implementation |
|-----------|----------------|
| **Reliability** | Hook acts as hard "circuit breaker" - agents can't drain funds |
| **Composability** | Deep Uniswap v4 + Aave v3 + Chainlink integration |
| **Decentralization** | Automation execution via Gelato network; safety enforced on-chain |
| **Innovation** | First multi-pool LP management service on v4 |

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[agents.md](./agents.md)** | 🤖 AI Agent context - START HERE |
| **[VISUAL_GUIDE.md](./VISUAL_GUIDE.md)** | 📊 Diagrams and flow charts |
| **[docs/gelato_automate.md](./docs/gelato_automate.md)** | ⚙️ Gelato Automate reference |
| **[docs/tech_stack.md](./docs/tech_stack.md)** | 📚 Technology deep dive |

---

## 🤝 Contributing

1. Read [agents.md](./agents.md) for architectural context
2. Follow the Golden Rules for code changes
3. All PRs must include fork tests
4. Run `forge fmt` before committing

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

## 🔗 Links

- **Uniswap v4 Docs:** [docs.uniswap.org/contracts/v4](https://docs.uniswap.org/contracts/v4/overview)
- **Aave v3 Docs:** [aave.com/docs/aave-v3](https://aave.com/docs/aave-v3/overview)
- **Gelato Automate:** [docs.gelato.cloud](https://docs.gelato.cloud/)
- **Foundry Book:** [book.getfoundry.sh](https://book.getfoundry.sh/)

---

*Sentinel Liquidity Protocol - Autonomous Liquidity Management at Scale* 🛡️
