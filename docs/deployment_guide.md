# Sentinel Deployment Guide

This guide covers deploying contracts, automation, and the optional Azure agent, plus frontend wiring.

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

### Option A — MAIN: Full Demo + Automation

```
forge script script/DeployAll.s.sol --account test1 --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
```

This deploys the hook, pools, and automation in one pass.

### Option B — Full Demo (mock tokens + mock Aave + pools)

```
forge script script/DeployFullDemo.s.sol --account test1 --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
```

This emits addresses and pool IDs. Save them in [DEPLOYMENT.md](../DEPLOYMENT.md) and update:
- [frontend/src/lib/addresses.ts](../frontend/src/lib/addresses.ts)
- [azure-agent/.env.example](../azure-agent/.env.example) (if using the agent)

### Option C — Production-style Deploy (no mocks)

```
forge script script/DeploySentinel.s.sol --account test1 --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
```

---

## 4) Automation Options

### Option A — Chainlink Automation + Functions

Deploy the automation contract and register pools:

```
forge script script/DeployAutomationFull.s.sol --account test1 --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
```

Post-deploy (UI):
- Add **SentinelAutomation** as a Functions consumer.
- Register **Automation Upkeep** (custom logic) and fund it with LINK.

Reference: [docs/chainlink_automate.md](./chainlink_automate.md)

### Option B — Azure Agent (off-chain maintainer)

Use the off-chain agent to call `SentinelHook.maintain()`.

1) Configure env:

- Copy [azure-agent/.env.example](../azure-agent/.env.example) → `.env`
- Set `RPC_URL`, `WS_RPC_URL`, `PRIVATE_KEY`, `HOOK_ADDRESS`, `POOL_MANAGER_ADDRESS`, and `POOLS`

2) Run locally:

```
cd azure-agent
npm install
npm start
```

3) Deploy to Azure:

See [azure-agent/README.md](../azure-agent/README.md) for Container Apps / Web App steps.

---

## 5) Frontend Setup

1) Update addresses in [frontend/src/lib/addresses.ts](../frontend/src/lib/addresses.ts).
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
- `npm -C azure-agent start`

---

## 7) Troubleshooting

- **Revert: BALANCE on seed** → the deployer wallet may not hold the required mock tokens or decimals mismatched; re-run DeployFullDemo or reduce seed amounts.
- **Frontend ENOENT** → ensure you run npm commands from `frontend/`.
- **Agent not triggering** → ensure `WS_RPC_URL` is set and `ENABLE_EVENT_LISTENER=true`.

---

## 8) References

- [DEPLOYMENT.md](../DEPLOYMENT.md)
- [docs/tech_stack.md](./tech_stack.md)
- [docs/reactive_strategy.md](./reactive_strategy.md)
- [azure-agent/README.md](../azure-agent/README.md)
