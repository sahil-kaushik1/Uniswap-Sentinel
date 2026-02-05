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
Web3Function.onRun(async (context) => {
  const { userArgs } = context;
  const provider = new providers.StaticJsonRpcProvider("http://127.0.0.1:8545", 11155111);
  console.log("------------------------------------------");
  console.log("\u{1F916} Sentinel Gelato Agent: Starting Run");
  console.log("------------------------------------------");
  const poolId = userArgs.poolId;
  const hookAddress = userArgs.hookAddress;
  console.log(`\u{1F539} Inputs:`);
  console.log(`   - Pool ID: ${poolId}`);
  console.log(`   - Hook Address: ${hookAddress}`);
  if (!poolId || !hookAddress) {
    console.error("\u274C Error: Missing poolId or hookAddress");
    return { canExec: false, message: "Missing poolId or hookAddress" };
  }
  const hook = new Contract(hookAddress, SENTINEL_HOOK_ABI, provider);
  let poolState;
  if (poolId === "0xSIMULATE") {
    console.log("\u26A0\uFE0F SIMULATION MODE DETECTED: Using Mock Pool State with REAL Sepolia Feeds");
    poolState = {
      activeTickLower: "73000",
      // Corresponds to price ~1480 (Old mock price)
      activeTickUpper: "76000",
      // Corresponds to price ~2000
      priceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
      // REAL Sepolia ETH/USD Feed
      priceFeedUSDC: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
      // REAL Sepolia USDC/USD Feed
      currency0: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
      // REAL Sepolia WETH
      currency1: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"
      // REAL Sepolia USDC
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
  const { activeTickLower, activeTickUpper, priceFeed, priceFeedUSDC, currency0, currency1 } = poolState;
  console.log(`   - Active Range: [${activeTickLower}, ${activeTickUpper}]`);
  console.log(`   - ETH/USD Feed: ${priceFeed}`);
  console.log(`   - USDC/USD Feed: ${priceFeedUSDC || "Not Set (assuming $1.00)"}`);
  console.log(`   - Currency0: ${currency0}`);
  console.log(`   - Currency1: ${currency1}`);
  console.log("\u{1F4E1} Fetching Dual Oracle Data...");
  const oracleETH = new Contract(priceFeed, ORACLE_ABI, provider);
  let ethPrice = 0;
  let oracleDecimals = 8;
  try {
    const [, answerETH] = await oracleETH.latestRoundData();
    oracleDecimals = await oracleETH.decimals();
    ethPrice = parseFloat(answerETH.toString()) / 10 ** oracleDecimals;
    console.log(`   \u2705 ETH/USD: $${ethPrice.toFixed(2)}`);
  } catch (err) {
    console.error(`\u274C ETH Oracle read failed: ${err.message}`);
    return { canExec: false, message: `ETH Oracle read failed: ${err.message}` };
  }
  let usdcPrice = 1;
  if (priceFeedUSDC) {
    try {
      const oracleUSDC = new Contract(priceFeedUSDC, ORACLE_ABI, provider);
      const [, answerUSDC] = await oracleUSDC.latestRoundData();
      const usdcDecimals = await oracleUSDC.decimals();
      usdcPrice = parseFloat(answerUSDC.toString()) / 10 ** usdcDecimals;
      console.log(`   \u2705 USDC/USD: $${usdcPrice.toFixed(4)}`);
      if (usdcPrice < 0.99 || usdcPrice > 1.01) {
        console.warn(`   \u26A0\uFE0F USDC DEPEG DETECTED! Price: $${usdcPrice.toFixed(4)}`);
      }
    } catch (err) {
      console.warn(`   \u26A0\uFE0F USDC Oracle failed, assuming $1.00`);
    }
  } else {
    console.log(`   \u2139\uFE0F No USDC feed configured, assuming $1.00`);
  }
  const oraclePrice = ethPrice / usdcPrice;
  console.log(`   \u{1F3AF} TRUE ETH/USDC Ratio: ${oraclePrice.toFixed(4)} (ETH: $${ethPrice.toFixed(2)} / USDC: $${usdcPrice.toFixed(4)})`);
  console.log("\u{1F4CA} Fetching Historical Prices (Last ~48h)...");
  let volatilityPercent = 5;
  try {
    const aggregatorABI = ["function aggregator() external view returns (address)"];
    const proxyContract = new (await import("ethers")).Contract(priceFeed, aggregatorABI, provider);
    let aggregatorAddress = priceFeed;
    try {
      aggregatorAddress = await proxyContract.aggregator();
      console.log(`   \u2139\uFE0F Resolved Aggregator: ${aggregatorAddress}`);
    } catch (e) {
      console.warn("   \u26A0\uFE0F Could not resolve aggregator, querying proxy directly");
    }
    const currentBlock = await provider.getBlockNumber();
    const BLOCKS_48H = 14400;
    const logs = await provider.getLogs({
      address: aggregatorAddress,
      topics: [(await import("ethers")).utils.id("AnswerUpdated(int256,uint256,uint256)")],
      fromBlock: currentBlock - BLOCKS_48H,
      toBlock: "latest"
    });
    if (logs.length > 0) {
      console.log(`   \u2705 Found ${logs.length} price updates in last 48h`);
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
      console.log("   \u2139\uFE0F No price updates in last 48h (using default volatility: 5%)");
    }
  } catch (err) {
    console.warn("   \u26A0\uFE0F Could not fetch historical data (using default volatility: 5%)");
  }
  const ERC20_ABI = ["function decimals() external view returns (uint8)"];
  const token0 = new Contract(currency0, ERC20_ABI, provider);
  const token1 = new Contract(currency1, ERC20_ABI, provider);
  let decimals0 = 18;
  let decimals1 = 18;
  try {
    decimals0 = await token0.decimals();
    decimals1 = await token1.decimals();
    console.log(`\u2705 Fetched Token Decimals: ${decimals0} / ${decimals1}`);
  } catch (err) {
    console.warn("\u26A0\uFE0F Failed to fetch decimals, assuming 18");
  }
  const shift = decimals1 - decimals0;
  const adjustedPrice = oraclePrice * 10 ** shift;
  console.log(`\u{1F539} Math:`);
  console.log(`   - Shift (Dec1 - Dec0): ${shift}`);
  console.log(`   - Adjusted Price Ratio: ${adjustedPrice}`);
  const currentTick = Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));
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
  const newLowerRaw = currentTick - widthTicks;
  const newUpperRaw = currentTick + widthTicks;
  const TICK_SPACING = 60;
  const newLower = Math.floor(newLowerRaw / TICK_SPACING) * TICK_SPACING;
  const newUpper = Math.ceil(newUpperRaw / TICK_SPACING) * TICK_SPACING;
  const widthBps = Math.round(widthTicks / 100) * 100;
  console.log(`\u{1FAC1} LUNG STRATEGY (Dynamic Width):`);
  console.log(`   - 48h Volatility: ${volatilityPercent.toFixed(2)}%`);
  console.log(`   - Lung State: ${lungState}`);
  console.log(`   - Width: ${widthTicks} ticks (~${(widthTicks * 0.01).toFixed(1)}%)`);
  console.log(`   - Proposed New Range: [${newLower}, ${newUpper}]`);
  const currentLower = parseInt(activeTickLower);
  const currentUpper = parseInt(activeTickUpper);
  const rangeWidth = currentUpper - currentLower;
  const safetyBuffer = rangeWidth * 0.1;
  const isSafe = currentTick > currentLower + safetyBuffer && currentTick < currentUpper - safetyBuffer;
  console.log(`\u{1F539} Safety Check (Drift Analysis):`);
  console.log(`   - Current Range: [${currentLower}, ${currentUpper}]`);
  console.log(`   - Safe Zone Buffer: +/- ${safetyBuffer} ticks`);
  console.log(`   - Is Tick ${currentTick} Safe? ${isSafe ? "YES" : "NO"}`);
  if (isSafe) {
    const msg = `\u2705 Price safe. No rebalance.`;
    console.log(msg);
    return { canExec: false, message: msg };
  }
  console.log(`\u{1F680} TRIGGERING REBALANCE!`);
  if (poolId === "0xSIMULATE") {
    console.log(`\u2705 SIMULATION SUCCESS!`);
    console.log(`   Would rebalance to: [${newLower}, ${newUpper}]`);
    console.log(`   Based on price: $${oraclePrice}`);
    return {
      canExec: false,
      message: `\u2705 SIMULATION COMPLETE! Logic verified. Would rebalance to [${newLower}, ${newUpper}]`
    };
  }
  return {
    canExec: true,
    callData: hook.interface.encodeFunctionData("maintain", [
      poolId,
      newLower,
      newUpper,
      BigInt(widthBps)
      // Volatility param
    ]),
    message: `Rebalancing triggered! Price: ${oraclePrice}, New Range: [${newLower}, ${newUpper}]`
  };
});
