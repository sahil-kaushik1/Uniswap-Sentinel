# Sentinel Azure Agent

Off-chain maintainer that calls `SentinelHook.maintain()` on a schedule. Deploy this on Azure instead of Chainlink Automation.

## Quick Start (Local)

1. Copy env file:
   - `.env.example` → `.env`
2. Install deps and run:
   - `npm install`
   - `npm start`

## Environment

Required:
- `RPC_URL`
- `WS_RPC_URL` (recommended for event listening)
- `PRIVATE_KEY`
- `HOOK_ADDRESS`
- `POOL_MANAGER_ADDRESS`
- `POOLS` (JSON array of pool configs)

Optional:
- `CHECK_INTERVAL_SEC` (default: 60)
- `DEFAULT_TICK_WIDTH` (default: 600)
- `DEFAULT_EDGE_BPS` (default: 2000)
- `MAX_SLIPPAGE_BPS` (default: 300)
- `REBALANCE_COOLDOWN_SEC` (default: 120)
- `MAX_REBALANCES_PER_HOUR` (default: 6)
- `TICK_HISTORY_SIZE` (default: 48)
- `ENABLE_EVENT_LISTENER` (default: true)
- `MIN_ACTIVE_LIQUIDITY` (default: 0)
- `MIN_TOTAL_SHARES` (default: 0)
- `MAX_DEVIATION_BPS_OVERRIDE` (default: unset, uses pool config)
- `DRY_RUN` (default: false)

## Azure Deployment (Container)

### Option A: Azure Container Apps
1. Build/push a container image using the Dockerfile in this folder.
2. Create a Container App with the image.
3. Set environment variables from the `.env` file in the Azure portal.

### Option B: Azure Web App for Containers
1. Build/push the container image.
2. Create a Web App for Containers using the image.
3. Add app settings for the environment variables.

## Notes
- Use a funded wallet for `PRIVATE_KEY`.
- Ensure `POOLS` uses bytes32 pool IDs from deployment output.
- Set `DRY_RUN=true` to validate without sending transactions.
