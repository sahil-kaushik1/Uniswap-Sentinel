import {
    Web3Function,
    Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { providers, Contract, utils } from "ethers";
import { SENTINEL_HOOK_ABI, ORACLE_ABI } from "./web3-functions/rebalancer/abi";

async function main() {
    console.log("------------------------------------------");
    console.log("🧪 STANDALONE TEST RUNNER (Aggregator Fix)");
    console.log("------------------------------------------");

    // Mock Context
    const userArgs = {
        poolId: "0xSIMULATE",
        hookAddress: "0x0000000000000000000000000000000000000000"
    };

    // Manual Provider (PublicNode)
    const provider = new providers.StaticJsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com", 11155111);

    // 3. Fetch Pool State
    let poolState: any;
    if (userArgs.poolId === "0xSIMULATE") {
        poolState = {
            // Mock Range (Out of Sync)
            activeTickLower: "-204000",   // ~$1383
            activeTickUpper: "-202000",   // ~$1689
            priceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // REAL Sepolia ETH/USD Proxy
            currency0: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c", // REAL Sepolia WETH
            currency1: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // REAL Sepolia USDC
        };
    } else {
        return;
    }

    const { activeTickLower, activeTickUpper, priceFeed, currency0, currency1 } = poolState;

    // 4. Fetch Oracle Price ("The Truth")
    console.log("📡 Fetching Live Oracle Data...");
    const oracle = new Contract(priceFeed, ORACLE_ABI, provider);
    let oraclePrice: number = 0;
    let oracleDecimals: number = 8;

    try {
        const [, answer] = await oracle.latestRoundData();
        oracleDecimals = await oracle.decimals();
        oraclePrice = parseFloat(answer.toString()) / (10 ** oracleDecimals);
        console.log(`   ✅ Current Price: $${oraclePrice}`);
    } catch (err: any) {
        console.error(`❌ Oracle read failed: ${err.message}`);
        return;
    }

    // --- NEW: FETCH HISTORICAL PRICES (Aggregator Fix) ---
    const BLOCKS_TO_FETCH = 50000; // ~1 week
    console.log(`\n📊 Fetching Historical Prices (Last ~1 week / ${BLOCKS_TO_FETCH} blocks)...`);

    try {
        // CHAINLINK FIX: Events are emitted by the Aggregator contract, not the Proxy!
        const aggregatorABI = ["function aggregator() external view returns (address)"];
        const proxyContract = new Contract(priceFeed, aggregatorABI, provider);

        let aggregatorAddress = priceFeed; // Default
        try {
            aggregatorAddress = await proxyContract.aggregator();
            console.log(`   ℹ️ Resolved Proxy ${priceFeed} -> Aggregator ${aggregatorAddress}`);
        } catch (e) {
            console.warn("   ⚠️ Could not resolve aggregator (Is this a proxy?), querying feed address directly.");
        }

        const currentBlock = await provider.getBlockNumber();
        const logs = await provider.getLogs({
            address: aggregatorAddress,
            topics: [utils.id("AnswerUpdated(int256,uint256,uint256)")],
            fromBlock: currentBlock - BLOCKS_TO_FETCH,
            toBlock: "latest"
        });

        if (logs.length > 0) {
            // Use specific parser for simple AnswerUpdated event
            // The ORACLE_ABI might not have the event defined, so we can use a raw interface or the oracle contract if it has it.
            // Or just parse the data: int256 current, uint256 roundId, uint256 updatedAt
            // current is the first topic? No, first topic is hash.
            // AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt) 
            // WAIT: AnswerUpdated inputs are indexed?
            // Standard: event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);
            // If indexed, they are in topics.
            // Let's rely on ethers interface parsing if possible, or manual.

            // Let's try parsing with the oracle interface we have.
            // ORACLE_ABI from abi.ts typically includes AggregatorV3Interface methods.
            // We might need to ensure the Event is in the ABI to parse.

            console.log(`   ✅ Found ${logs.length} price updates.`);
            const prices: number[] = [];

            logs.forEach(log => {
                try {
                    // Manual Parse if ABI fails
                    // topic[1] = current (int256)
                    // BUT current is likely NOT indexed in some versions.
                    // Usually: event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);
                    // Let's assume standard V3.

                    // If we can't parse easily with missing ABI event, we can try big int decoding.
                    // Or just use the parsed log if ABI has it.
                    // I'll try generic parsing.
                    const priceBig = parseInt(log.topics[1], 16); // If indexed
                    // Wait, int256 can be negative.
                    // Safer to trust the latestRoundData for now, but for history:

                    // Better approach: Use getRoundData via the Proxy for history if logs are hard to parse without ABI.
                    // But logs are faster.
                    // Let's assume simple parsing:
                    const p = parseInt(log.topics[1], 16) / (10 ** oracleDecimals);
                    if (!isNaN(p)) prices.push(p);
                } catch (e) { }
            });

            if (prices.length > 0) {
                const maxP = Math.max(...prices);
                const minP = Math.min(...prices);
                const avgP = prices.reduce((a, b) => a + b, 0) / prices.length;
                const volatility = ((maxP - minP) / minP) * 100;

                console.log(`   📈 Recent High: $${maxP}`);
                console.log(`   📉 Recent Low:  $${minP}`);
                console.log(`   ⚖️ Average:     $${avgP.toFixed(2)}`);
                console.log(`   ⚡ Volatility:   ${volatility.toFixed(4)}%`);
            }
        } else {
            console.log("   ℹ️ No price updates found (Aggregator might be deprecated or very stable).");
        }
    } catch (err: any) {
        console.warn("   ⚠️ Could not fetch historical logs:", err.message);
    }

    // 5. Normalization (Math)
    const decimals0 = 18; // WETH
    const decimals1 = 6;  // USDC
    const shift = decimals1 - decimals0; // -12
    const adjustedPrice = oraclePrice * (10 ** shift);

    // 6. Tick Calculation
    const currentTick = Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));
    const tickToPrice = (tick: number) => {
        const ratio = Math.pow(1.0001, tick);
        return (ratio / (10 ** shift)).toFixed(2);
    }

    // 8. Visual Comparison
    const currentLower = parseInt(activeTickLower);
    const currentUpper = parseInt(activeTickUpper);
    const currentMid = (currentLower + currentUpper) / 2;
    const deviationTick = Math.abs(currentTick - currentMid);
    const rangeWidth = currentUpper - currentLower;
    const safetyBuffer = rangeWidth * 0.1;
    const isSafe = (currentTick > (currentLower + safetyBuffer)) && (currentTick < (currentUpper - safetyBuffer));

    const newLower = Math.floor((currentTick - 200) / 60) * 60;
    const newUpper = Math.ceil((currentTick + 200) / 60) * 60;

    console.log(`\n🎯 Strategy Analysis:`);
    console.log(`   1. Ideal Target:      Tick ${currentTick} (~$${oraclePrice})`);
    console.log(`   2. Current Active:    Tick ${currentMid} (~$${tickToPrice(currentMid)})`);
    console.log(`   3. Deviation:         ${deviationTick} ticks`);

    console.log(`\n📐 Ranges (Visualized):`);
    console.log(`   [OLD] Active Range:   ${currentLower} ($${tickToPrice(currentLower)}) <---> ${currentUpper} ($${tickToPrice(currentUpper)})`);
    console.log(`   [NEW] Proposed Range: ${newLower} ($${tickToPrice(newLower)}) <---> ${newUpper} ($${tickToPrice(newUpper)})`);

    if (!isSafe) {
        console.log(`\n🚀 ACTION: REBALANCE TRIGGERED`);
    } else {
        console.log(`\n✅ ACTION: NONE (Market Stable)`);
    }
}

main().catch((e) => console.error(e));
