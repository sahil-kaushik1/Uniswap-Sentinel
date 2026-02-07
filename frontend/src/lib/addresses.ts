// Contract addresses deployed on Sepolia
// Deployed via: forge script script/DeployAll.s.sol --account test1 --broadcast
// Deployment block: 10211126 (2026-02-07)

export const CHAIN_ID = 11155111
export const NETWORK_NAME = "Sepolia Testnet"

// ─── Core Protocol ──────────────────────────────────────────
export const POOL_MANAGER_ADDRESS = "0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A" as const
export const SENTINEL_HOOK_ADDRESS = "0x386bc633421dD0416E357ae1c34177568dA52080" as const
export const SWAP_HELPER_ADDRESS = "0x8B6e80F6b28b07b16E532A647d00c64bDb6c29d8" as const
export const MOCK_AAVE_ADDRESS = "0x5e541e338E73BCdAD9cD4F61cd6DD4e6434B214e" as const
export const BTC_ETH_ORACLE_ADDRESS = "0xc596b108197aEF64c6d349DcA8515dFFe4615502" as const
export const SENTINEL_AUTOMATION_ADDRESS = "0xC6B516Cd705eaf09A8Af406388a3B8F693ed4489" as const

// ─── Oracle Feeds (used by demo helpers) ───────────────────
export const ETH_USD_FEED_ADDRESS = "0x0000000000000000000000000000000000000000" as const
export const BTC_USD_FEED_ADDRESS = "0x0000000000000000000000000000000000000000" as const
export const USDC_USD_FEED_ADDRESS = "0x0000000000000000000000000000000000000000" as const
export const USE_MOCK_FEEDS = false
export const MOCK_FEED_DECIMALS = 8

// ─── Mock Tokens ────────────────────────────────────────────
export const METH_ADDRESS = "0xbb8Db005968AD75dc1521c61a2bAC6e7CB5C42d5" as const
export const MUSDC_ADDRESS = "0xaA19cF38Ec024e47542e0aFfb029784486317d3A" as const
export const MWBTC_ADDRESS = "0xb75fDB4A4b685429447B54972e089e1c9b239fCF" as const
export const MUSDT_ADDRESS = "0x19180e57e6640f9A51dEF8c8a7137c78e75704D2" as const

// ─── Pool IDs (bytes32, from deploy output) ─────────────────
export const POOL_ID_ETH_USDC = "0xebd975263c29db205914ec03bc0bb7b43c34ab833ae24c7f521a4c0edc3eb8f5" as `0x${string}`
export const POOL_ID_WBTC_ETH = "0xb86d98b048c5f61f5b9e8a7c7d769b0971aba0948777e349a21314e1429f9266" as `0x${string}`
export const POOL_ID_ETH_USDT = "0x42cc361675a03875472eb6f267b516a0f88a4cafe0d7265905b761f2fbded3d6" as `0x${string}`

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
