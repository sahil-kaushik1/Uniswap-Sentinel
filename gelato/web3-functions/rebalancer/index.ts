import {
    Web3Function,
    Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, providers } from "ethers";
import { SENTINEL_HOOK_ABI, ORACLE_ABI } from "./abi";

// ============================================================================
// MULTI-POOL ORACLE CONFIGURATION
// ============================================================================
// Sepolia Chainlink Price Feeds
const CHAINLINK_FEEDS: Record<string, string> = {
    "ETH/USD": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    "BTC/USD": "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
    "USDC/USD": "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
    "USDT/USD": "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", // Same as USDC on Sepolia
};

// Pool type configurations
interface PoolConfig {
    name: string;
    token0Symbol: string;
    token1Symbol: string;
    oracleA: string;  // First oracle feed key
    oracleB: string | null;  // Second oracle feed key (null if token is USD-pegged)
    calculateRatio: (priceA: number, priceB: number | null) => number;
}

const POOL_CONFIGS: Record<string, PoolConfig> = {
    "ETH_USDC": {
        name: "ETH/USDC",
        token0Symbol: "ETH",
        token1Symbol: "USDC",
        oracleA: "ETH/USD",
        oracleB: "USDC/USD",
        calculateRatio: (ethPrice, usdcPrice) => ethPrice / (usdcPrice || 1),
    },
    "ETH_USDT": {
        name: "ETH/USDT",
        token0Symbol: "ETH",
        token1Symbol: "USDT",
        oracleA: "ETH/USD",
        oracleB: "USDT/USD",
        calculateRatio: (ethPrice, usdtPrice) => ethPrice / (usdtPrice || 1),
    },
    "BTC_ETH": {
        name: "BTC/ETH",
        token0Symbol: "BTC",
        token1Symbol: "ETH",
        oracleA: "BTC/USD",
        oracleB: "ETH/USD",
        calculateRatio: (btcPrice, ethPrice) => btcPrice / (ethPrice || 1),
    },
};

// ============================================================================
// MAIN WEB3 FUNCTION
// ============================================================================
export const handler = async (context: Web3FunctionContext) => {
    const { userArgs } = context;

    // Provider setup - use Gelato-provided provider
    const provider = context.provider as providers.Provider;

    console.log("------------------------------------------");
    console.log("🤖 Sentinel Multi-Pool Rebalancer");
    console.log("------------------------------------------");

    // 1. Parse Arguments
    const poolId = userArgs.poolId as string;
    const hookAddress = userArgs.hookAddress as string;
    const poolType = (userArgs.poolType as string) || "ETH_USDC"; // Default to ETH/USDC

    console.log(`🔹 Inputs:`);
    console.log(`   - Pool ID: ${poolId}`);
    console.log(`   - Pool Type: ${poolType}`);
    console.log(`   - Hook Address: ${hookAddress}`);

    // Get pool configuration
    const config = POOL_CONFIGS[poolType];
    if (!config) {
        console.error(`❌ Unknown pool type: ${poolType}`);
        return { canExec: false, message: `Unknown pool type: ${poolType}` };
    }
    console.log(`   - Pool Name: ${config.name} (${config.token0Symbol}/${config.token1Symbol})`);

    if (!poolId || !hookAddress) {
        console.error("❌ Error: Missing poolId or hookAddress");
        return { canExec: false, message: "Missing poolId or hookAddress" };
    }

    // 2. Instantiate Hook Contract
    const hook = new Contract(hookAddress, SENTINEL_HOOK_ABI, provider);

    // 3. Fetch Pool State
    let poolState: any;
    if (poolId === "0xSIMULATE") {
        console.log("⚠️ SIMULATION MODE DETECTED");
        poolState = {
            activeTickLower: "-204000",   // Realistic for ETH/USDC
            activeTickUpper: "-202000",
        };
        console.log("✅ Mocked Hook State Loaded");
    } else {
        try {
            poolState = await hook.getPoolState(poolId);
            console.log(`✅ Fetched Pool State from Hook`);
        } catch (err: any) {
            console.error(`❌ Failed to get pool state: ${err.message}`);
            return { canExec: false, message: `Failed to get pool state: ${err.message}` };
        }
    }

    const {
        activeTickLower,
        activeTickUpper,
        priceFeed,
        priceFeedInverted,
        decimals0,
        decimals1,
        tickSpacing
    } = poolState;
    console.log(`   - Active Range: [${activeTickLower}, ${activeTickUpper}]`);

    // 4. Fetch Oracle Prices (Multi-Pool Aware)
    console.log("📡 Fetching Oracle Data...");

    // Fetch Price A (always required)
    const oracleAAddress = priceFeed && priceFeed !== "0x0000000000000000000000000000000000000000"
        ? priceFeed
        : CHAINLINK_FEEDS[config.oracleA];
    const oracleA = new Contract(oracleAAddress, ORACLE_ABI, provider);
    let priceA: number = 0;
    let oracleDecimals: number = 8;

    try {
        const [, answerA] = await oracleA.latestRoundData();
        oracleDecimals = await oracleA.decimals();
        priceA = parseFloat(answerA.toString()) / (10 ** oracleDecimals);
        console.log(`   ✅ ${config.oracleA}: $${priceA.toFixed(2)}`);
    } catch (err: any) {
        console.error(`❌ ${config.oracleA} Oracle failed: ${err.message}`);
        return { canExec: false, message: `${config.oracleA} Oracle failed` };
    }

    // Fetch Price B (if needed)
    let priceB: number | null = null;
    if (!priceFeed || priceFeed === "0x0000000000000000000000000000000000000000") {
        if (config.oracleB) {
        const oracleBAddress = CHAINLINK_FEEDS[config.oracleB];
        const oracleB = new Contract(oracleBAddress, ORACLE_ABI, provider);

        try {
            const [, answerB] = await oracleB.latestRoundData();
            const decB = await oracleB.decimals();
            priceB = parseFloat(answerB.toString()) / (10 ** decB);
            console.log(`   ✅ ${config.oracleB}: $${priceB.toFixed(4)}`);

            // Depeg warning for stablecoins
            if (config.oracleB.includes("USDC") || config.oracleB.includes("USDT")) {
                if (priceB < 0.99 || priceB > 1.01) {
                    console.warn(`   ⚠️ STABLECOIN DEPEG DETECTED! Price: $${priceB.toFixed(4)}`);
                }
            }
        } catch (err: any) {
            console.warn(`   ⚠️ ${config.oracleB} Oracle failed, using fallback`);
            priceB = config.oracleB.includes("USD") ? 1.0 : priceA; // Fallback logic
        }
    }
    }

    // Calculate the TRUE pool ratio
    let poolRatio = priceFeed && priceFeed !== "0x0000000000000000000000000000000000000000"
        ? priceA
        : config.calculateRatio(priceA, priceB);

    if (priceFeedInverted) {
        poolRatio = 1 / poolRatio;
    }
    console.log(`   🎯 TRUE ${config.name} Ratio: ${poolRatio.toFixed(6)}`);

    // 5. Fetch Historical Prices for Volatility (48h)
    console.log("📊 Fetching 48h Historical Data...");
    let volatilityPercent = 5; // Default

    try {
        const aggregatorABI = ["function aggregator() external view returns (address)"];
        const proxyContract = new Contract(oracleAAddress, aggregatorABI, provider);

        let aggregatorAddress = oracleAAddress;
        try { aggregatorAddress = await proxyContract.aggregator(); } catch { }

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
            console.log(`   ✅ Found ${logs.length} price updates`);
            const prices = logs.map(log => {
                const priceBig = parseInt(log.topics[1], 16);
                return priceBig / (10 ** oracleDecimals);
            });
            const maxP = Math.max(...prices);
            const minP = Math.min(...prices);
            volatilityPercent = ((maxP - minP) / minP) * 100;

            console.log(`   📈 48h High: $${maxP.toFixed(2)}`);
            console.log(`   📉 48h Low: $${minP.toFixed(2)}`);
            console.log(`   ⚡ Volatility: ${volatilityPercent.toFixed(2)}%`);
        } else {
            console.log("   ℹ️ No price updates found (using default volatility)");
        }
    } catch (err: any) {
        console.warn("   ⚠️ Could not fetch historical data");
    }

    // 6. Fetch Token Decimals
    const ERC20_ABI = ["function decimals() external view returns (uint8)"];
    const tokenDecimals0 = Number(decimals0 ?? 18);
    const tokenDecimals1 = Number(decimals1 ?? 18);
    console.log(`   ✅ Token Decimals: ${tokenDecimals0} / ${tokenDecimals1}`);

    // 7. Calculate Tick from Ratio
    const shift = tokenDecimals1 - tokenDecimals0;
    const adjustedPrice = poolRatio * (10 ** shift);
    const currentTick = Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));

    console.log(`🔹 Math:`);
    console.log(`   - Decimal Shift: ${shift}`);
    console.log(`   - Adjusted Ratio: ${adjustedPrice.toExponential(4)}`);
    console.log(`   - Ideal Center Tick: ${currentTick}`);

    // 8. Apply Dynamic "Lung" Strategy
    let widthTicks: number;
    let lungState: string;

    if (volatilityPercent < 5) {
        widthTicks = 100;
        lungState = "CONTRACTED 🔵 (Low Vol < 5%)";
    } else if (volatilityPercent < 15) {
        widthTicks = 300;
        lungState = "NORMAL 🟢 (Medium Vol 5-15%)";
    } else if (volatilityPercent < 30) {
        widthTicks = 600;
        lungState = "EXPANDED 🟡 (High Vol 15-30%)";
    } else {
        widthTicks = 1000;
        lungState = "MAXIMUM 🔴 (Extreme Vol > 30%)";
    }

    const spacing = Number(tickSpacing ?? 60);
    const newLower = Math.floor((currentTick - widthTicks) / spacing) * spacing;
    const newUpper = Math.ceil((currentTick + widthTicks) / spacing) * spacing;

    console.log(`🫁 LUNG STRATEGY:`);
    console.log(`   - Volatility: ${volatilityPercent.toFixed(2)}%`);
    console.log(`   - State: ${lungState}`);
    console.log(`   - Width: ${widthTicks} ticks`);
    console.log(`   - New Range: [${newLower}, ${newUpper}]`);

    // 9. Safety Check
    const currentLower = parseInt(activeTickLower);
    const currentUpper = parseInt(activeTickUpper);
    const rangeWidth = currentUpper - currentLower;
    const safetyBuffer = rangeWidth * 0.1;
    const isSafe = (currentTick > currentLower + safetyBuffer) && (currentTick < currentUpper - safetyBuffer);

    console.log(`🔹 Safety Check:`);
    console.log(`   - Current Range: [${currentLower}, ${currentUpper}]`);
    console.log(`   - Is Tick ${currentTick} Safe? ${isSafe ? "YES ✅" : "NO ❌"}`);

    if (isSafe) {
        console.log(`✅ Price safe. No rebalance needed.`);
        return { canExec: false, message: "Price within safe range" };
    }

    // 10. Trigger Rebalance
    console.log(`🚀 TRIGGERING REBALANCE!`);

    if (poolId === "0xSIMULATE") {
        console.log(`✅ SIMULATION SUCCESS!`);
        console.log(`   Pool: ${config.name}`);
        console.log(`   Ratio: ${poolRatio.toFixed(4)}`);
        console.log(`   New Range: [${newLower}, ${newUpper}]`);
        return {
            canExec: false,
            message: `✅ SIMULATION COMPLETE! ${config.name} would rebalance to [${newLower}, ${newUpper}]`
        };
    }

    return {
        canExec: true,
        callData: [{
            to: hookAddress,
            data: hook.interface.encodeFunctionData("maintain", [
                poolId, newLower, newUpper, BigInt(Math.round(volatilityPercent * 100))
            ])
        }],
        message: `Rebalancing ${config.name}! New Range: [${newLower}, ${newUpper}]`
    };
};

Web3Function.onRun(handler);
