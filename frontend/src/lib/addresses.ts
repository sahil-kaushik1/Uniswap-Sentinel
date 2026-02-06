// Contract addresses deployed on Sepolia
// Deployed via: forge script script/DeployFullDemo.s.sol --account test1 --broadcast

export const CHAIN_ID = 11155111
export const NETWORK_NAME = "Sepolia Testnet"

// ─── Core Protocol ──────────────────────────────────────────
export const POOL_MANAGER_ADDRESS = "0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A" as const
export const SENTINEL_HOOK_ADDRESS = "0x71523F89015834aD8d944c5Fff931B95153d2080" as const
export const SWAP_HELPER_ADDRESS = "0xA5472F88cCe1223a9Ba4fa4Cd2148e5197691De5" as const
export const MOCK_AAVE_ADDRESS = "0x9004CF69C23171a398ba32251c6a7de217bEdE94" as const
export const BTC_ETH_ORACLE_ADDRESS = "0x8F0deDCd80393CA544ee6C6c8A43eeB6C1657864" as const

// ─── Mock Tokens ────────────────────────────────────────────
export const METH_ADDRESS = "0x0a4a15e7bA513d672a9cAe6a7110b745b8483bC0" as const
export const MUSDC_ADDRESS = "0x736478314ae3D3E0CbdDBA048D27ce87Ef65C7B9" as const
export const MWBTC_ADDRESS = "0xC7490BF0f590ac0FB6A52EC80092238F724Ef865" as const
export const MUSDT_ADDRESS = "0xa7988c8Ba1c15DF0c93Ee873f3d8fe862a381E4F" as const

// ─── Pool IDs (bytes32, from deploy output) ─────────────────
export const POOL_ID_ETH_USDC = "0x0486b1703e1da1ca674058e3f673e81a4410886606e749c7d68ec812ccd1a28d" as `0x${string}`
export const POOL_ID_WBTC_ETH = "0x67e3cb1064e19f448600451b1bd022f20fd6a0517e49411cb9bc5793e3b5cb4c" as `0x${string}`
export const POOL_ID_ETH_USDT = "0xab4b7b5658281ce85ab0c012bf3f08df9dea59ce6c9d2381fde62a4ee69b833d" as `0x${string}`

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
    name: "mETH / mUSDC",
    token0Symbol: "mETH",   // 0x0a4a... < 0x7364...
    token1Symbol: "mUSDC",
    fee: 3000,
    tickSpacing: 60,
    oracle: "ETH/USD (Chainlink)",
  },
  {
    id: POOL_ID_WBTC_ETH,
    name: "mETH / mWBTC",
    token0Symbol: "mETH",   // 0x0a4a... < 0xC749...
    token1Symbol: "mWBTC",
    fee: 3000,
    tickSpacing: 60,
    oracle: "BTC/ETH (Ratio)",
  },
  {
    id: POOL_ID_ETH_USDT,
    name: "mETH / mUSDT",
    token0Symbol: "mETH",   // 0x0a4a... < 0xa798...
    token1Symbol: "mUSDT",
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
