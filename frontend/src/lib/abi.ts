// ABI fragments for SentinelHook — only the functions the frontend needs
// Generated from src/SentinelHook.sol public interface

export const sentinelHookAbi = [
  // ─── View Functions ──────────────────────────────────────
  {
    name: "getPoolState",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "activeTickLower", type: "int24" },
          { name: "activeTickUpper", type: "int24" },
          { name: "activeLiquidity", type: "uint128" },
          { name: "priceFeed", type: "address" },
          { name: "priceFeedInverted", type: "bool" },
          { name: "maxDeviationBps", type: "uint256" },
          { name: "aToken0", type: "address" },
          { name: "aToken1", type: "address" },
          { name: "idle0", type: "uint256" },
          { name: "idle1", type: "uint256" },
          { name: "aave0", type: "uint256" },
          { name: "aave1", type: "uint256" },
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "decimals0", type: "uint8" },
          { name: "decimals1", type: "uint8" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "totalShares", type: "uint256" },
          { name: "isInitialized", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getSharePrice",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "price", type: "uint256" }],
  },
  {
    name: "getLPPosition",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "poolId", type: "bytes32" },
      { name: "lp", type: "address" },
    ],
    outputs: [
      { name: "shares", type: "uint256" },
      { name: "value", type: "uint256" },
    ],
  },
  {
    name: "getTotalPools",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getPoolByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "getLPCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "lpShares",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "poolId", type: "bytes32" },
      { name: "lp", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "maintainer",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },

  // ─── Write Functions ─────────────────────────────────────
  {
    name: "depositLiquidity",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
    outputs: [{ name: "sharesReceived", type: "uint256" }],
  },
  {
    name: "withdrawLiquidity",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "sharesToWithdraw", type: "uint256" },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    name: "maintain",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "bytes32" },
      { name: "newTickLower", type: "int24" },
      { name: "newTickUpper", type: "int24" },
      { name: "volatility", type: "uint256" },
    ],
    outputs: [],
  },

  // ─── Events ──────────────────────────────────────────────
  {
    name: "LPDeposited",
    type: "event",
    inputs: [
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "lp", type: "address", indexed: true },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
      { name: "sharesReceived", type: "uint256", indexed: false },
    ],
  },
  {
    name: "LPWithdrawn",
    type: "event",
    inputs: [
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "lp", type: "address", indexed: true },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
      { name: "sharesBurned", type: "uint256", indexed: false },
    ],
  },
  {
    name: "LiquidityRebalanced",
    type: "event",
    inputs: [
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "newTickLower", type: "int24", indexed: false },
      { name: "newTickUpper", type: "int24", indexed: false },
      { name: "activeAmount", type: "uint256", indexed: false },
      { name: "idleAmount", type: "int256", indexed: false },
    ],
  },
  {
    name: "TickCrossed",
    type: "event",
    inputs: [
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "tickLower", type: "int24", indexed: false },
      { name: "tickUpper", type: "int24", indexed: false },
      { name: "currentTick", type: "int24", indexed: false },
    ],
  },
] as const

// Pool Manager ABI (for reading pool state)
export const poolManagerAbi = [
  {
    name: "getSlot0",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "swapFee", type: "uint24" },
    ],
  },
] as const

// MockPriceFeed ABI (demo helpers)
export const mockPriceFeedAbi = [
  {
    name: "setPrice",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "answer", type: "int256" }],
    outputs: [],
  },
] as const

// AggregatorV3 ABI (read price)
export const aggregatorV3Abi = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const

// ERC20 ABI fragment (approve + balanceOf + allowance)
export const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const
