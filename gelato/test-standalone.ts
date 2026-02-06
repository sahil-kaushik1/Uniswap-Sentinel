import { providers, Contract, utils } from "ethers";

// ============================================================================
// MULTI-POOL ORACLE CONFIGURATION
// ============================================================================
const CHAINLINK_FEEDS: Record<string, string> = {
    "ETH/USD": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    "BTC/USD": "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
    "USDC/USD": "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
    "USDT/USD": "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
};

interface PoolConfig {
    name: string;
    token0Symbol: string;
    token1Symbol: string;
    oracleA: string;
    oracleB: string | null;
    decimals0: number;
    decimals1: number;
    calculateRatio: (priceA: number, priceB: number | null) => number;
}

const POOL_CONFIGS: Record<string, PoolConfig> = {
    "ETH_USDC": {
        name: "ETH/USDC",
        token0Symbol: "ETH",
        token1Symbol: "USDC",
        oracleA: "ETH/USD",
        oracleB: "USDC/USD",
        decimals0: 18,
        decimals1: 6,
        calculateRatio: (ethPrice, usdcPrice) => ethPrice / (usdcPrice || 1),
    },
    "ETH_USDT": {
        name: "ETH/USDT",
        token0Symbol: "ETH",
        token1Symbol: "USDT",
        oracleA: "ETH/USD",
        oracleB: "USDT/USD",
        decimals0: 18,
        decimals1: 6,
        calculateRatio: (ethPrice, usdtPrice) => ethPrice / (usdtPrice || 1),
    },
    "BTC_ETH": {
        name: "BTC/ETH",
        token0Symbol: "BTC",
        token1Symbol: "ETH",
        oracleA: "BTC/USD",
        oracleB: "ETH/USD",
        decimals0: 8,
        decimals1: 18,
        calculateRatio: (btcPrice, ethPrice) => btcPrice / (ethPrice || 1),
    },
};

const ORACLE_ABI = [
    "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
    "function decimals() external view returns (uint8)",
    "function aggregator() external view returns (address)"
];

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================
async function testPool(poolType: string) {
    console.log("\n==========================================");
    console.log(`🧪 TESTING: ${poolType}`);
    console.log("==========================================");

    const config = POOL_CONFIGS[poolType];
    if (!config) {
        console.error(`❌ Unknown pool type: ${poolType}`);
        return;
    }

    const provider = new providers.StaticJsonRpcProvider(
        "https://ethereum-sepolia-rpc.publicnode.com",
        11155111
    );

    console.log(`📊 Pool: ${config.name} (${config.token0Symbol}/${config.token1Symbol})`);

    // Fetch Price A
    const oracleAAddress = CHAINLINK_FEEDS[config.oracleA];
    const oracleA = new Contract(oracleAAddress, ORACLE_ABI, provider);

    let priceA: number = 0;
    let oracleDecimals: number = 8;

    try {
        const [, answerA] = await oracleA.latestRoundData();
        oracleDecimals = await oracleA.decimals();
        priceA = parseFloat(answerA.toString()) / (10 ** oracleDecimals);
        console.log(`   ✅ ${config.oracleA}: $${priceA.toFixed(2)}`);
    } catch (err: any) {
        console.error(`   ❌ ${config.oracleA} failed: ${err.message}`);
        return;
    }

    // Fetch Price B
    let priceB: number | null = null;
    if (config.oracleB) {
        const oracleBAddress = CHAINLINK_FEEDS[config.oracleB];
        const oracleB = new Contract(oracleBAddress, ORACLE_ABI, provider);

        try {
            const [, answerB] = await oracleB.latestRoundData();
            const decB = await oracleB.decimals();
            priceB = parseFloat(answerB.toString()) / (10 ** decB);
            console.log(`   ✅ ${config.oracleB}: $${priceB.toFixed(4)}`);
        } catch (err: any) {
            console.warn(`   ⚠️ ${config.oracleB} failed`);
            priceB = 1.0;
        }
    }

    // Calculate Ratio
    const ratio = config.calculateRatio(priceA, priceB);
    console.log(`   🎯 ${config.name} Ratio: ${ratio.toFixed(6)}`);

    // Fetch 48h Historical Volatility
    console.log(`\n📈 Fetching 48h Historical Data...`);
    let volatility = 5;

    try {
        let aggregatorAddress = oracleAAddress;
        try {
            aggregatorAddress = await oracleA.aggregator();
        } catch { }

        const currentBlock = await provider.getBlockNumber();
        const logs = await provider.getLogs({
            address: aggregatorAddress,
            topics: [utils.id("AnswerUpdated(int256,uint256,uint256)")],
            fromBlock: currentBlock - 14400,
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
            volatility = ((maxP - minP) / minP) * 100;

            console.log(`   📈 48h High: $${maxP.toFixed(2)}`);
            console.log(`   📉 48h Low: $${minP.toFixed(2)}`);
            console.log(`   ⚡ Volatility: ${volatility.toFixed(2)}%`);
        }
    } catch (err) {
        console.warn(`   ⚠️ Could not fetch historical data`);
    }

    // Calculate Tick
    const shift = config.decimals1 - config.decimals0;
    const adjustedPrice = ratio * (10 ** shift);
    const currentTick = Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));

    console.log(`\n🔹 Math:`);
    console.log(`   - Decimal Shift: ${shift}`);
    console.log(`   - Adjusted Ratio: ${adjustedPrice.toExponential(4)}`);
    console.log(`   - Ideal Tick: ${currentTick}`);

    // Lung Strategy
    let widthTicks: number;
    let lungState: string;

    if (volatility < 5) {
        widthTicks = 100;
        lungState = "CONTRACTED 🔵";
    } else if (volatility < 15) {
        widthTicks = 300;
        lungState = "NORMAL 🟢";
    } else if (volatility < 30) {
        widthTicks = 600;
        lungState = "EXPANDED 🟡";
    } else {
        widthTicks = 1000;
        lungState = "MAXIMUM 🔴";
    }

    const TICK_SPACING = 60;
    const newLower = Math.floor((currentTick - widthTicks) / TICK_SPACING) * TICK_SPACING;
    const newUpper = Math.ceil((currentTick + widthTicks) / TICK_SPACING) * TICK_SPACING;

    console.log(`\n🫁 LUNG STRATEGY:`);
    console.log(`   - State: ${lungState}`);
    console.log(`   - Width: ${widthTicks} ticks`);
    console.log(`   - Proposed Range: [${newLower}, ${newUpper}]`);

    // Convert ticks to prices for readability
    const tickToPrice = (tick: number) => {
        const r = Math.pow(1.0001, tick);
        return (r / (10 ** shift)).toFixed(4);
    };

    console.log(`\n📐 Range in ${config.name} prices:`);
    console.log(`   Lower: ${tickToPrice(newLower)}`);
    console.log(`   Center: ${ratio.toFixed(4)}`);
    console.log(`   Upper: ${tickToPrice(newUpper)}`);
}

// ============================================================================
// RUN ALL POOL TESTS
// ============================================================================
async function main() {
    console.log("==========================================");
    console.log("🧪 MULTI-POOL STANDALONE TESTER");
    console.log("==========================================");

    // Test all 3 pool types
    await testPool("ETH_USDC");
    await testPool("BTC_ETH");
    await testPool("ETH_USDT");

    console.log("\n==========================================");
    console.log("✅ ALL TESTS COMPLETE!");
    console.log("==========================================");
}

main().catch(console.error);
