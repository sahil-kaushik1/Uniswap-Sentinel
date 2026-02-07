// Contract addresses deployed on Sepolia
// Deployed via: forge script script/DeployAll.s.sol --account test1 --broadcast
// Deployment block: 10211126 (2026-02-07)

export const CHAIN_ID = 11155111
export const NETWORK_NAME = "Sepolia Testnet"

// ─── Core Protocol ──────────────────────────────────────────
export const POOL_MANAGER_ADDRESS = "0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A" as const
export const SENTINEL_HOOK_ADDRESS = "0xA7F23aFF760f6e34E823Bbf529fE3Fa54C93A080" as const
export const SWAP_HELPER_ADDRESS = "0x0ce1552c2146D730e220aB7e9137249e0E651177" as const
export const MOCK_AAVE_ADDRESS = "0xF8d4681bbFd7946B2f65FE2B7c4Fe043495D40b2" as const
export const BTC_ETH_ORACLE_ADDRESS = "0x799e8aA97c9CA9975a48BfA1C8F600888aa0C7F1" as const
export const SENTINEL_AUTOMATION_ADDRESS = "0xC6B516Cd705eaf09A8Af406388a3B8F693ed4489" as const

// ─── Oracle Feeds (used by demo helpers) ───────────────────
export const ETH_USD_FEED_ADDRESS = "0x43b14eF2Afd5094dB3bCf99F961AAEa178C66C3b" as const
export const BTC_USD_FEED_ADDRESS = "0x8f5c3a644198622DB03C248DB23f4FAc8C4a5055" as const
export const USDC_USD_FEED_ADDRESS = "0xbf5A04CEB3FB1E8F6A2db4245F0F8A4440a1cBf5" as const
export const USE_MOCK_FEEDS = true
export const MOCK_FEED_DECIMALS = 8

// ─── Mock Tokens ────────────────────────────────────────────
export const METH_ADDRESS = "0x0e36C47a2cCf406ee12fac225D3Dd3Da465B859c" as const
export const MUSDC_ADDRESS = "0x69810Addf24E88fbfc39Cd207f9EE794E3f7Ba33" as const
export const MWBTC_ADDRESS = "0x4cF23E8f91b86ee28A483d4ed28A6d8e2f3f7FaC" as const
export const MUSDT_ADDRESS = "0x001Aa5ae632aF10e4bf068D17be11ee984a3B400" as const

// ─── Pool IDs (bytes32, from deploy output) ─────────────────
export const POOL_ID_ETH_USDC = "0xd81e2f7075ef839ab7897b6609296cb71b4b951bab1215cff428e8e58d6d9c86" as `0x${string}`
export const POOL_ID_WBTC_ETH = "0xedaee9b731b3f6b66651873d25251d4164f053f6338e20cad90121735c7c25a1" as `0x${string}`
export const POOL_ID_ETH_USDT = "0x6c92e8eeb40fe91f771ca88bd635f4df6124ddf26602b17b58dc78c35d821890" as `0x${string}`

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
export const isDeployed =
  SENTINEL_HOOK_ADDRESS.toLowerCase() !== "0x0000000000000000000000000000000000000000"

// Etherscan link helper
export function etherscanAddress(addr: string) {
  return `https://sepolia.etherscan.io/address/${addr}`
}
export function etherscanTx(hash: string) {
  return `https://sepolia.etherscan.io/tx/${hash}`
}
