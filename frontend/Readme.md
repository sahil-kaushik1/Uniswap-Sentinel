# Sentinel Frontend

macOS-inspired dashboard for the Sentinel Liquidity Protocol.

## Setup

1. Install dependencies.
2. Copy the env template and set values.
3. Run the dev server.

## Environment

Create a `.env` file in this folder with:

```
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
VITE_SENTINEL_HOOK_ADDRESS=0x...
```

## Notes

- PoolId is derived as $keccak256(abi.encode(poolKey))$.
- Amount inputs are raw units (wei). Ensure approvals for ERC-20 tokens.
- Native ETH deposits use $msg.value$ automatically.
