// Contract addresses deployed on Sepolia
// Deployed via: forge script script/DeployFullDemo.s.sol --account test1 --broadcast
// Deployment block: 10206680 (2026-02-07)

export const CHAIN_ID = 11155111
export const NETWORK_NAME = "Sepolia Testnet"

// ─── Core Protocol ──────────────────────────────────────────
export const POOL_MANAGER_ADDRESS = "0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A" as const
export const SENTINEL_HOOK_ADDRESS = "0x8ba4d5c59748D6AA896fa32a64D51C4fef3b6080" as const
export const SWAP_HELPER_ADDRESS = "0xFE9047BaA04072Caf988Ee11160585952828866f" as const
export const MOCK_AAVE_ADDRESS = "0x5D1359bC5442bA7dA9821E2FDee4d277730451D5" as const
export const BTC_ETH_ORACLE_ADDRESS = "0x0f8C8f8D3F1D74B959a83393eaE419558277dd8d" as const
export const SENTINEL_AUTOMATION_ADDRESS = "0xc3aD45d5feC747B5465783c301580BfC4A1Bcd85" as const

// ─── Mock Tokens ────────────────────────────────────────────
export const METH_ADDRESS = "0x728cAd9d02119FbD637279079B063A58F5DC39b8" as const
export const MUSDC_ADDRESS = "0xc5bFb66e99EcA697a5Cb914390e02579597d45f9" as const
export const MWBTC_ADDRESS = "0xE9c7d8b803e38a22b26c8eE618203A433ADD8AfA" as const
export const MUSDT_ADDRESS = "0x757532BDebcf3568fDa48aD7dea78B5644D70E41" as const

// ─── Pool IDs (bytes32, from deploy output) ─────────────────
export const POOL_ID_ETH_USDC = "0x90b5f49d49079bfe71c1fb9787a0381eeca7f4ccee7ba0d8de387e2fffd96d8b" as `0x${string}`
export const POOL_ID_WBTC_ETH = "0xe422877004fdcad519eb76f4a080371ac9a9d631ba2b5d27c771d479862e1d9c" as `0x${string}`
export const POOL_ID_ETH_USDT = "0x3d41b451e3c6abf6f5c8b1aa2aaa157dd28f55a4bb6f78c511ff6c529782bd69" as `0x${string}`

// ─── Token metadata ─────────────────────────────────────────
export const TOKENS: Record<string, { address: `0x${string}`; symbol: string; decimals: number; name: string }> = {
  mETH: { address: METH_ADDRESS, symbol: "mETH", decimals: 18, name: "Mock WETH" },
  mUSDC: { address: MUSDC_ADDRESS, symbol: "mUSDC", decimals: 6, name: "Mock USDC" },
  mWBTC: { address: MWBTC_ADDRESS, symbol: "mWBTC", decimals: 8, name: "Mock WBTC" },
  mUSDT: { address: MUSDT_ADDRESS, symbol: "mUSDT", decimals: 6, name: "Mock USDT" },
}

// ─── Faucet amounts (human-readable defaults) ───────────────
export const FAUCET_AMOUNTS: Record<string, string> = {
  mETH: "10",      // 10 ETH
  mUSDC: "10000",  // 10k USDC
  mWBTC: "1",      // 1 BTC
  mUSDT: "10000",  // 10k USDT
}

// ─── Pool configs (for UI display) ─────────────────────────
// token0/token1 sorted by address (Uniswap v4 convention)
export interface PoolConfig {
  id: `0x${string}`
  name: string
  token0Symbol: string
  token1Symbol: string
  fee: number
  tickSpacing: number
  oracle: string
}

export const POOLS: PoolConfig[] = [
  {
    id: POOL_ID_ETH_USDC,
    name: "mUSDC / mETH",
    token0Symbol: "mUSDC",  // 0xaA19... < 0xbb8D... (currency0 < currency1)
    token1Symbol: "mETH",
    fee: 3000,
    tickSpacing: 60,
    oracle: "ETH/USD (Chainlink)",
  },
  {
    id: POOL_ID_WBTC_ETH,
    name: "mWBTC / mETH",
    token0Symbol: "mWBTC",  // 0xb75f... < 0xbb8D... (currency0 < currency1)
    token1Symbol: "mETH",
    fee: 3000,
    tickSpacing: 60,
    oracle: "BTC/ETH (Ratio)",
  },
  {
    id: POOL_ID_ETH_USDT,
    name: "mUSDT / mETH",
    token0Symbol: "mUSDT",  // 0x1918... < 0xbb8D... (currency0 < currency1)
    token1Symbol: "mETH",
    fee: 3000,
    tickSpacing: 60,
    oracle: "ETH/USD (Chainlink)",
  },
]

// ─── Helper: check if addresses are populated ───────────────
export const isDeployed = SENTINEL_HOOK_ADDRESS !== "0x0000000000000000000000000000000000000000"

// Etherscan link helper
export function etherscanAddress(addr: string) {
  return `https://sepolia.etherscan.io/address/${addr}`
}
export function etherscanTx(hash: string) {
  return `https://sepolia.etherscan.io/tx/${hash}`
}
