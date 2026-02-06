export const SENTINEL_HOOK_ABI = [
    "function getPoolState(bytes32 poolId) external view returns (tuple(int24 activeTickLower, int24 activeTickUpper, uint128 activeLiquidity, address priceFeed, bool priceFeedInverted, uint256 maxDeviationBps, address aToken0, address aToken1, uint256 idle0, uint256 idle1, uint256 aave0, uint256 aave1, address currency0, address currency1, uint8 decimals0, uint8 decimals1, uint24 fee, int24 tickSpacing, uint256 totalShares, bool isInitialized))",
    "function maintain(bytes32 poolId, int24 newLower, int24 newUpper, uint256 volatility) external"
];

export const ORACLE_ABI = [
    "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function decimals() external view returns (uint8)"
];
