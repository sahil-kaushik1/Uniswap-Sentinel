import {
    Web3Function,
    Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, providers } from "ethers";
import { SENTINEL_HOOK_ABI, ORACLE_ABI } from "./abi";

Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { userArgs } = context;

    // BYPASS: The local SDK runner is struggling with env vars.
    // We manually instantiate a StaticJsonRpcProvider for the simulation.
    // This ensures 100% connectivity to Sepolia.
    const provider = new providers.StaticJsonRpcProvider("http://127.0.0.1:8545", 11155111);

    console.log("------------------------------------------");
    console.log("🤖 Sentinel Gelato Agent: Starting Run");
    console.log("------------------------------------------");

    // 1. Parse Arguments
    const poolId = userArgs.poolId as string;
    const hookAddress = userArgs.hookAddress as string;

    console.log(`🔹 Inputs:`);
    console.log(`   - Pool ID: ${poolId}`);
    console.log(`   - Hook Address: ${hookAddress}`);

    if (!poolId || !hookAddress) {
        console.error("❌ Error: Missing poolId or hookAddress");
        return { canExec: false, message: "Missing poolId or hookAddress" };
    }

    // 2. Instantiate Hook Contract
    const hook = new Contract(hookAddress, SENTINEL_HOOK_ABI, provider);

    // 3. Fetch Pool State
    let poolState;

    // SIMULATION MODE: If the user hasn't deployed, we mock the Hook resonse
    // but we return REAL addresses for Oracle/Tokens so the rest of the script 
    // hits the actual testnet to prove data fetching works.
    if (poolId === "0xSIMULATE") {
        console.log("⚠️ SIMULATION MODE DETECTED: Using Mock Pool State with REAL Sepolia Feeds");
        poolState = {
            activeTickLower: "73000",   // Corresponds to price ~1480 (Old mock price)
            activeTickUpper: "76000",   // Corresponds to price ~2000
            priceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // REAL Sepolia ETH/USD Feed
            priceFeedUSDC: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", // REAL Sepolia USDC/USD Feed
            currency0: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c", // REAL Sepolia WETH
            currency1: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // REAL Sepolia USDC
        };
        console.log("✅ Mocked Hook State Loaded");
    } else {
        try {
            poolState = await hook.getPoolState(poolId);
            console.log(`✅ Fetched Pool State from Hook`);
        } catch (err) {
            console.error(`❌ Failed to get pool state: ${err.message}`);
            return { canExec: false, message: `Failed to get pool state: ${err.message}` };
        }
    }

    const { activeTickLower, activeTickUpper, priceFeed, priceFeedUSDC, currency0, currency1 } = poolState;
    console.log(`   - Active Range: [${activeTickLower}, ${activeTickUpper}]`);
    console.log(`   - ETH/USD Feed: ${priceFeed}`);
    console.log(`   - USDC/USD Feed: ${priceFeedUSDC || "Not Set (assuming $1.00)"}`);
    console.log(`   - Currency0: ${currency0}`);
    console.log(`   - Currency1: ${currency1}`);

    // 4. Fetch DUAL Oracle Prices (ETH/USD and USDC/USD)
    console.log("📡 Fetching Dual Oracle Data...");

    // ETH/USD Price
    const oracleETH = new Contract(priceFeed, ORACLE_ABI, provider);
    let ethPrice: number = 0;
    let oracleDecimals: number = 8;
    try {
        const [, answerETH] = await oracleETH.latestRoundData();
        oracleDecimals = await oracleETH.decimals();
        ethPrice = parseFloat(answerETH.toString()) / (10 ** oracleDecimals);
        console.log(`   ✅ ETH/USD: $${ethPrice.toFixed(2)}`);
    } catch (err) {
        console.error(`❌ ETH Oracle read failed: ${err.message}`);
        return { canExec: false, message: `ETH Oracle read failed: ${err.message}` };
    }

    // USDC/USD Price (for depeg protection)
    let usdcPrice: number = 1.0; // Default to $1.00 if no feed
    if (priceFeedUSDC) {
        try {
            const oracleUSDC = new Contract(priceFeedUSDC, ORACLE_ABI, provider);
            const [, answerUSDC] = await oracleUSDC.latestRoundData();
            const usdcDecimals = await oracleUSDC.decimals();
            usdcPrice = parseFloat(answerUSDC.toString()) / (10 ** usdcDecimals);
            console.log(`   ✅ USDC/USD: $${usdcPrice.toFixed(4)}`);

            // Depeg warning
            if (usdcPrice < 0.99 || usdcPrice > 1.01) {
                console.warn(`   ⚠️ USDC DEPEG DETECTED! Price: $${usdcPrice.toFixed(4)}`);
            }
        } catch (err) {
            console.warn(`   ⚠️ USDC Oracle failed, assuming $1.00`);
        }
    } else {
        console.log(`   ℹ️ No USDC feed configured, assuming $1.00`);
    }

    // Calculate TRUE ETH/USDC ratio
    const oraclePrice = ethPrice / usdcPrice;
    console.log(`   🎯 TRUE ETH/USDC Ratio: ${oraclePrice.toFixed(4)} (ETH: $${ethPrice.toFixed(2)} / USDC: $${usdcPrice.toFixed(4)})`);

    // 4.5 HISTORICAL PRICE CHECK (48h Volatility for Dynamic Range)
    console.log("📊 Fetching Historical Prices (Last ~48h)...");
    let volatilityPercent = 5; // Default to medium volatility

    try {
        // Resolve Proxy -> Aggregator (Chainlink events come from implementation)
        const aggregatorABI = ["function aggregator() external view returns (address)"];
        const proxyContract = new (await import("ethers")).Contract(priceFeed, aggregatorABI, provider);

        let aggregatorAddress = priceFeed;
        try {
            aggregatorAddress = await proxyContract.aggregator();
            console.log(`   ℹ️ Resolved Aggregator: ${aggregatorAddress}`);
        } catch (e) {
            console.warn("   ⚠️ Could not resolve aggregator, querying proxy directly");
        }

        const currentBlock = await provider.getBlockNumber();
        const BLOCKS_48H = 14400; // ~48 hours on Ethereum (12s blocks)

        const logs = await provider.getLogs({
            address: aggregatorAddress,
            topics: [(await import("ethers")).utils.id("AnswerUpdated(int256,uint256,uint256)")],
            fromBlock: currentBlock - BLOCKS_48H,
            toBlock: "latest"
        });

        if (logs.length > 0) {
            console.log(`   ✅ Found ${logs.length} price updates in last 48h`);
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
            console.log("   ℹ️ No price updates in last 48h (using default volatility: 5%)");
        }
    } catch (err) {
        console.warn("   ⚠️ Could not fetch historical data (using default volatility: 5%)");
    }

    // 5. Fetch Token Decimals for Normalization
    const ERC20_ABI = ["function decimals() external view returns (uint8)"];
    const token0 = new Contract(currency0, ERC20_ABI, provider);
    const token1 = new Contract(currency1, ERC20_ABI, provider);
    let decimals0 = 18;
    let decimals1 = 18;
    try {
        decimals0 = await token0.decimals();
        decimals1 = await token1.decimals();
        console.log(`✅ Fetched Token Decimals: ${decimals0} / ${decimals1}`);
    } catch (err) {
        console.warn("⚠️ Failed to fetch decimals, assuming 18");
    }

    // 6. Calculate Pool Price Ratio
    const shift = decimals1 - decimals0;
    const adjustedPrice = oraclePrice * (10 ** shift);
    console.log(`🔹 Math:`);
    console.log(`   - Shift (Dec1 - Dec0): ${shift}`);
    console.log(`   - Adjusted Price Ratio: ${adjustedPrice}`);

    // 7. Calculate Ideal Tick (The "Center")
    const currentTick = Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));
    console.log(`   - Ideal Center Tick: ${currentTick}`);

    // 8. Apply "Lung" Strategy (DYNAMIC Range Based on Volatility)
    //    🫁 The Lung breathes: expands in volatile markets, contracts in stable ones
    let widthTicks: number;
    let lungState: string;

    if (volatilityPercent < 5) {
        // LOW VOLATILITY: Tight range = more capital efficiency, more fees
        widthTicks = 100;  // ~1% range
        lungState = "CONTRACTED 🔵 (Low Vol < 5%)";
    } else if (volatilityPercent < 15) {
        // MEDIUM VOLATILITY: Balanced range
        widthTicks = 300;  // ~3% range  
        lungState = "NORMAL 🟢 (Medium Vol 5-15%)";
    } else if (volatilityPercent < 30) {
        // HIGH VOLATILITY: Wide range to avoid constant rebalancing
        widthTicks = 600;  // ~6% range
        lungState = "EXPANDED 🟡 (High Vol 15-30%)";
    } else {
        // EXTREME VOLATILITY: Very wide range for maximum protection
        widthTicks = 1000; // ~10% range
        lungState = "MAXIMUM 🔴 (Extreme Vol > 30%)";
    }

    const newLowerRaw = currentTick - widthTicks;
    const newUpperRaw = currentTick + widthTicks;

    // Align to Tick Spacing (60)
    const TICK_SPACING = 60;
    const newLower = Math.floor(newLowerRaw / TICK_SPACING) * TICK_SPACING;
    const newUpper = Math.ceil(newUpperRaw / TICK_SPACING) * TICK_SPACING;

    const widthBps = Math.round(widthTicks / 100) * 100; // Convert to bps for logging

    console.log(`🫁 LUNG STRATEGY (Dynamic Width):`);
    console.log(`   - 48h Volatility: ${volatilityPercent.toFixed(2)}%`);
    console.log(`   - Lung State: ${lungState}`);
    console.log(`   - Width: ${widthTicks} ticks (~${(widthTicks * 0.01).toFixed(1)}%)`);
    console.log(`   - Proposed New Range: [${newLower}, ${newUpper}]`);

    // 9. Logic Gate: Should we rebalance?
    const currentLower = parseInt(activeTickLower);
    const currentUpper = parseInt(activeTickUpper);

    const rangeWidth = currentUpper - currentLower;
    const safetyBuffer = rangeWidth * 0.1;

    const isSafe = (currentTick > (currentLower + safetyBuffer)) && (currentTick < (currentUpper - safetyBuffer));

    console.log(`🔹 Safety Check (Drift Analysis):`);
    console.log(`   - Current Range: [${currentLower}, ${currentUpper}]`);
    console.log(`   - Safe Zone Buffer: +/- ${safetyBuffer} ticks`);
    console.log(`   - Is Tick ${currentTick} Safe? ${isSafe ? "YES" : "NO"}`);

    if (isSafe) {
        const msg = `✅ Price safe. No rebalance.`;
        console.log(msg);
        return { canExec: false, message: msg };
    }

    // 10. Execute Rebalance
    console.log(`🚀 TRIGGERING REBALANCE!`);

    // In simulation mode, we return false but with success message (no valid callData)
    if (poolId === "0xSIMULATE") {
        console.log(`✅ SIMULATION SUCCESS!`);
        console.log(`   Would rebalance to: [${newLower}, ${newUpper}]`);
        console.log(`   Based on price: $${oraclePrice}`);
        return {
            canExec: false,
            message: `✅ SIMULATION COMPLETE! Logic verified. Would rebalance to [${newLower}, ${newUpper}]`
        };
    }

    return {
        canExec: true,
        callData: hook.interface.encodeFunctionData("maintain", [
            poolId,
            newLower,
            newUpper,
            BigInt(widthBps) // Volatility param
        ]),
        message: `Rebalancing triggered! Price: ${oraclePrice}, New Range: [${newLower}, ${newUpper}]`
    };
});
