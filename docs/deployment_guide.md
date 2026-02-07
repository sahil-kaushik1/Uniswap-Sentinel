# Sentinel Deployment Guide

This guide covers deploying contracts, Chainlink automation, and frontend wiring.

---

## 1) Prerequisites

- Foundry (forge, cast, anvil)
- Node.js 18+
- Sepolia RPC URL (Alchemy/Infura/etc.)
- Funded deployer wallet (Sepolia ETH)

---

## 2) Environment Setup (Foundry)

Create a root `.env` with:

```
SEPOLIA_RPC_URL=https://sepolia.example.io/v3/YOUR_KEY
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

Optional:
- `CHAINLINK_MAINTAINER` (initial `maintainer`; defaults to deployer)

---

## 3) Deploy Contracts (Sepolia)

### Option A — MAIN: Full Demo Deploy (Mock Everything)

```
forge script script/DeployAll.s.sol --account test1 --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
```

This deploys mock tokens, mock Aave, the hook, pools, seeds liquidity, and writes `deployment.json`.

### Optional: Controlled Mock Price Feeds

If you want deterministic oracle prices for demo/agent testing, set:

- `USE_MOCK_FEEDS=true`

This deploys [src/mocks/MockPriceFeed.sol](../src/mocks/MockPriceFeed.sol) and wires pools to the mock feeds. You can then update prices on-chain by calling `setPrice()` or `setRoundData()`.

### Option B — Production-style Deploy (no mocks)

```
forge script script/DeploySentinel.s.sol --account test1 --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
```

---

## 4) Automation Options

### Option A — Chainlink Automation

Deploy the automation contract and register pools (reads `deployment.json`):

```
forge script script/DeployAutomationFull.s.sol --account test1 --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
```

Post-deploy (UI):
- Register **Automation Upkeep** (custom logic) and fund it with LINK.

Reference: [docs/chainlink_automate.md](./chainlink_automate.md)

**Env:**
- `DEPLOYMENT_JSON` (optional; defaults to `deployment.json`)

### Option B — Manual Automation Deploy

Use [script/DeploySentinelAutomation.s.sol](../script/DeploySentinelAutomation.s.sol) if you want to deploy without reading `deployment.json`, then add pools manually.

---

## 5) Frontend Setup

1) Update addresses in [frontend/src/lib/addresses.ts](../frontend/src/lib/addresses.ts).
	- Or run `node update_addresses.js` after DeployAll to auto-fill from `deployment.json`.
2) (Optional) Create `frontend/.env`:

```
VITE_SEPOLIA_RPC_URL=https://sepolia.example.io/v3/YOUR_KEY
```

3) Run:

```
cd frontend
npm install
npm run dev
```

---

## 6) Sanity Checklist

Use this after changes or before demo:

- `forge build`
- `forge test --match-path "test/unit/*.t.sol"`
- `forge test --match-path "test/fuzz/*.t.sol"`
- `forge test --match-path "test/integration/*.t.sol" --fork-url $SEPOLIA_RPC_URL -vvv`
- `npm -C frontend run dev`

---

## 7) Troubleshooting

- **Revert: BALANCE on seed** → the deployer wallet may not hold the required mock tokens or decimals mismatched; re-run DeployAll or reduce seed amounts.
- **Frontend ENOENT** → ensure you run npm commands from `frontend/`.
- **Automation not triggering** → verify upkeep registration and LINK funding on automation.chain.link.

---

## 8) References

- [DEPLOYMENT.md](../DEPLOYMENT.md)
- [docs/tech_stack.md](./tech_stack.md)
- [docs/reactive_strategy.md](./reactive_strategy.md)

