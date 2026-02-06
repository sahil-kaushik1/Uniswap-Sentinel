// web3-functions/rebalancer/index.ts
import {
  Web3Function
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, providers } from "ethers";

// web3-functions/rebalancer/abi.ts
var SENTINEL_HOOK_ABI = [
  "function getPoolState(bytes32 poolId) external view returns (tuple(int24 activeTickLower, int24 activeTickUpper, uint128 activeLiquidity, address priceFeed, uint256 maxDeviationBps, address aToken0, address aToken1, address currency0, address currency1, uint256 totalShares, bool isInitialized))",
  "function maintain(bytes32 poolId, int24 newLower, int24 newUpper, uint256 volatility) external"
];
var ORACLE_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)"
];

// web3-functions/rebalancer/index.ts
var CHAINLINK_FEEDS = {
  "ETH/USD": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  "BTC/USD": "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  "USDC/USD": "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
  "USDT/USD": "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E"
  // Same as USDC on Sepolia
};
var POOL_CONFIGS = {
  "ETH_USDC": {
    name: "ETH/USDC",
    token0Symbol: "ETH",
    token1Symbol: "USDC",
    oracleA: "ETH/USD",
    oracleB: "USDC/USD",
    calculateRatio: (ethPrice, usdcPrice) => ethPrice / (usdcPrice || 1)
  },
  "ETH_USDT": {
    name: "ETH/USDT",
    token0Symbol: "ETH",
    token1Symbol: "USDT",
    oracleA: "ETH/USD",
    oracleB: "USDT/USD",
    calculateRatio: (ethPrice, usdtPrice) => ethPrice / (usdtPrice || 1)
  },
  "BTC_ETH": {
    name: "BTC/ETH",
    token0Symbol: "BTC",
    token1Symbol: "ETH",
    oracleA: "BTC/USD",
    oracleB: "ETH/USD",
    calculateRatio: (btcPrice, ethPrice) => btcPrice / (ethPrice || 1)
  }
};
Web3Function.onRun(async (context) => {
  const { userArgs } = context;
  const provider = new providers.StaticJsonRpcProvider("http://127.0.0.1:8545", 11155111);
  console.log("------------------------------------------");
  console.log("\u{1F916} Sentinel Multi-Pool Rebalancer");
  console.log("------------------------------------------");
  const poolId = userArgs.poolId;
  const hookAddress = userArgs.hookAddress;
  const poolType = userArgs.poolType || "ETH_USDC";
  console.log(`\u{1F539} Inputs:`);
  console.log(`   - Pool ID: ${poolId}`);
  console.log(`   - Pool Type: ${poolType}`);
  console.log(`   - Hook Address: ${hookAddress}`);
  const config = POOL_CONFIGS[poolType];
  if (!config) {
    console.error(`\u274C Unknown pool type: ${poolType}`);
    return { canExec: false, message: `Unknown pool type: ${poolType}` };
  }
  console.log(`   - Pool Name: ${config.name} (${config.token0Symbol}/${config.token1Symbol})`);
  if (!poolId || !hookAddress) {
    console.error("\u274C Error: Missing poolId or hookAddress");
    return { canExec: false, message: "Missing poolId or hookAddress" };
  }
  const hook = new Contract(hookAddress, SENTINEL_HOOK_ABI, provider);
  let poolState;
  if (poolId === "0xSIMULATE") {
    console.log("\u26A0\uFE0F SIMULATION MODE DETECTED");
    poolState = {
      activeTickLower: "-204000",
      // Realistic for ETH/USDC
      activeTickUpper: "-202000"
    };
    console.log("\u2705 Mocked Hook State Loaded");
  } else {
    try {
      poolState = await hook.getPoolState(poolId);
      console.log(`\u2705 Fetched Pool State from Hook`);
    } catch (err) {
      console.error(`\u274C Failed to get pool state: ${err.message}`);
      return { canExec: false, message: `Failed to get pool state: ${err.message}` };
    }
  }
  const { activeTickLower, activeTickUpper } = poolState;
  console.log(`   - Active Range: [${activeTickLower}, ${activeTickUpper}]`);
  console.log("\u{1F4E1} Fetching Oracle Data...");
  const oracleAAddress = CHAINLINK_FEEDS[config.oracleA];
  const oracleA = new Contract(oracleAAddress, ORACLE_ABI, provider);
  let priceA = 0;
  let oracleDecimals = 8;
  try {
    const [, answerA] = await oracleA.latestRoundData();
    oracleDecimals = await oracleA.decimals();
    priceA = parseFloat(answerA.toString()) / 10 ** oracleDecimals;
    console.log(`   \u2705 ${config.oracleA}: $${priceA.toFixed(2)}`);
  } catch (err) {
    console.error(`\u274C ${config.oracleA} Oracle failed: ${err.message}`);
    return { canExec: false, message: `${config.oracleA} Oracle failed` };
  }
  let priceB = null;
  if (config.oracleB) {
    const oracleBAddress = CHAINLINK_FEEDS[config.oracleB];
    const oracleB = new Contract(oracleBAddress, ORACLE_ABI, provider);
    try {
      const [, answerB] = await oracleB.latestRoundData();
      const decB = await oracleB.decimals();
      priceB = parseFloat(answerB.toString()) / 10 ** decB;
      console.log(`   \u2705 ${config.oracleB}: $${priceB.toFixed(4)}`);
      if (config.oracleB.includes("USDC") || config.oracleB.includes("USDT")) {
        if (priceB < 0.99 || priceB > 1.01) {
          console.warn(`   \u26A0\uFE0F STABLECOIN DEPEG DETECTED! Price: $${priceB.toFixed(4)}`);
        }
      }
    } catch (err) {
      console.warn(`   \u26A0\uFE0F ${config.oracleB} Oracle failed, using fallback`);
      priceB = config.oracleB.includes("USD") ? 1 : priceA;
    }
  }
  const poolRatio = config.calculateRatio(priceA, priceB);
  console.log(`   \u{1F3AF} TRUE ${config.name} Ratio: ${poolRatio.toFixed(6)}`);
  console.log("\u{1F4CA} Fetching 48h Historical Data...");
  let volatilityPercent = 5;
  try {
    const aggregatorABI = ["function aggregator() external view returns (address)"];
    const proxyContract = new Contract(oracleAAddress, aggregatorABI, provider);
    let aggregatorAddress = oracleAAddress;
    try {
      aggregatorAddress = await proxyContract.aggregator();
    } catch {
    }
    const currentBlock = await provider.getBlockNumber();
    const BLOCKS_48H = 14400;
    const { utils } = await import("ethers");
    const logs = await provider.getLogs({
      address: aggregatorAddress,
      topics: [utils.id("AnswerUpdated(int256,uint256,uint256)")],
      fromBlock: currentBlock - BLOCKS_48H,
      toBlock: "latest"
    });
    if (logs.length > 0) {
      console.log(`   \u2705 Found ${logs.length} price updates`);
      const prices = logs.map((log) => {
        const priceBig = parseInt(log.topics[1], 16);
        return priceBig / 10 ** oracleDecimals;
      });
      const maxP = Math.max(...prices);
      const minP = Math.min(...prices);
      volatilityPercent = (maxP - minP) / minP * 100;
      console.log(`   \u{1F4C8} 48h High: $${maxP.toFixed(2)}`);
      console.log(`   \u{1F4C9} 48h Low: $${minP.toFixed(2)}`);
      console.log(`   \u26A1 Volatility: ${volatilityPercent.toFixed(2)}%`);
    } else {
      console.log("   \u2139\uFE0F No price updates found (using default volatility)");
    }
  } catch (err) {
    console.warn("   \u26A0\uFE0F Could not fetch historical data");
  }
  const ERC20_ABI = ["function decimals() external view returns (uint8)"];
  let decimals0 = 18, decimals1 = 18;
  if (poolType === "ETH_USDC" || poolType === "ETH_USDT") {
    decimals0 = 18;
    decimals1 = 6;
  } else if (poolType === "BTC_ETH") {
    decimals0 = 8;
    decimals1 = 18;
  }
  console.log(`   \u2705 Token Decimals: ${decimals0} / ${decimals1}`);
  const shift = decimals1 - decimals0;
  const adjustedPrice = poolRatio * 10 ** shift;
  const currentTick = Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));
  console.log(`\u{1F539} Math:`);
  console.log(`   - Decimal Shift: ${shift}`);
  console.log(`   - Adjusted Ratio: ${adjustedPrice.toExponential(4)}`);
  console.log(`   - Ideal Center Tick: ${currentTick}`);
  let widthTicks;
  let lungState;
  if (volatilityPercent < 5) {
    widthTicks = 100;
    lungState = "CONTRACTED \u{1F535} (Low Vol < 5%)";
  } else if (volatilityPercent < 15) {
    widthTicks = 300;
    lungState = "NORMAL \u{1F7E2} (Medium Vol 5-15%)";
  } else if (volatilityPercent < 30) {
    widthTicks = 600;
    lungState = "EXPANDED \u{1F7E1} (High Vol 15-30%)";
  } else {
    widthTicks = 1e3;
    lungState = "MAXIMUM \u{1F534} (Extreme Vol > 30%)";
  }
  const TICK_SPACING = 60;
  const newLower = Math.floor((currentTick - widthTicks) / TICK_SPACING) * TICK_SPACING;
  const newUpper = Math.ceil((currentTick + widthTicks) / TICK_SPACING) * TICK_SPACING;
  console.log(`\u{1FAC1} LUNG STRATEGY:`);
  console.log(`   - Volatility: ${volatilityPercent.toFixed(2)}%`);
  console.log(`   - State: ${lungState}`);
  console.log(`   - Width: ${widthTicks} ticks`);
  console.log(`   - New Range: [${newLower}, ${newUpper}]`);
  const currentLower = parseInt(activeTickLower);
  const currentUpper = parseInt(activeTickUpper);
  const rangeWidth = currentUpper - currentLower;
  const safetyBuffer = rangeWidth * 0.1;
  const isSafe = currentTick > currentLower + safetyBuffer && currentTick < currentUpper - safetyBuffer;
  console.log(`\u{1F539} Safety Check:`);
  console.log(`   - Current Range: [${currentLower}, ${currentUpper}]`);
  console.log(`   - Is Tick ${currentTick} Safe? ${isSafe ? "YES \u2705" : "NO \u274C"}`);
  if (isSafe) {
    console.log(`\u2705 Price safe. No rebalance needed.`);
    return { canExec: false, message: "Price within safe range" };
  }
  console.log(`\u{1F680} TRIGGERING REBALANCE!`);
  if (poolId === "0xSIMULATE") {
    console.log(`\u2705 SIMULATION SUCCESS!`);
    console.log(`   Pool: ${config.name}`);
    console.log(`   Ratio: ${poolRatio.toFixed(4)}`);
    console.log(`   New Range: [${newLower}, ${newUpper}]`);
    return {
      canExec: false,
      message: `\u2705 SIMULATION COMPLETE! ${config.name} would rebalance to [${newLower}, ${newUpper}]`
    };
  }
  return {
    canExec: true,
    callData: [{
      to: hookAddress,
      data: hook.interface.encodeFunctionData("maintain", [
        poolId,
        newLower,
        newUpper,
        BigInt(widthTicks)
      ])
    }],
    message: `Rebalancing ${config.name}! New Range: [${newLower}, ${newUpper}]`
  };
});
