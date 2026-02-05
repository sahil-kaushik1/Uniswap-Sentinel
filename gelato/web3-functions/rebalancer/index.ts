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
    const provider = new providers.StaticJsonRpcProvider("https://rpc.ankr.com/eth_sepolia", 11155111);

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

    const { activeTickLower, activeTickUpper, priceFeed, currency0, currency1 } = poolState;
    console.log(`   - Active Range: [${activeTickLower}, ${activeTickUpper}]`);
    console.log(`   - Price Feed: ${priceFeed}`);
    console.log(`   - Currency0: ${currency0}`);
    console.log(`   - Currency1: ${currency1}`);

    // 4. Fetch Oracle Price ("The Truth")
    const oracle = new Contract(priceFeed, ORACLE_ABI, provider);
    let oraclePrice: number;
    let oracleDecimals: number;
    try {
        const [, answer] = await oracle.latestRoundData();
        oracleDecimals = await oracle.decimals();
        oraclePrice = parseFloat(answer.toString()) / (10 ** oracleDecimals);
        console.log(`✅ Fetched Oracle Data`);
        console.log(`   - Raw Price: ${answer.toString()}`);
        console.log(`   - Decimals: ${oracleDecimals}`);
        console.log(`   - Normalized Price: ${oraclePrice}`);
    } catch (err) {
        console.error(`❌ Oracle read failed: ${err.message}`);
        return { canExec: false, message: `Oracle read failed: ${err.message}` };
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

    // 8. Apply "Lung" Strategy (Reactive)
    const widthBps = 200; // 2% 
    const widthTicks = 200; // Approx 200 ticks = 2%

    const newLowerRaw = currentTick - widthTicks;
    const newUpperRaw = currentTick + widthTicks;

    // Align to Tick Spacing (60)
    const TICK_SPACING = 60;
    const newLower = Math.floor(newLowerRaw / TICK_SPACING) * TICK_SPACING;
    const newUpper = Math.ceil(newUpperRaw / TICK_SPACING) * TICK_SPACING;

    console.log(`🔹 Strategy Calculation (Lung Width: ${widthBps} bps):`);
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
