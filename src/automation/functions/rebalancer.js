// Chainlink Functions Source Code - Multi-Pool Rebalancer
// Supports: ETH/USDC (0), WBTC/ETH (1), ETH/USDT (2)

// Pool type passed as argument: args[0] = 0, 1, or 2
const poolType = parseInt(args[0]) || 0;

// ============================================================================
// ORACLE CONFIGURATION (Sepolia Testnet)
// ============================================================================

const ORACLES = {
    ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    BTC_USD: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
    USDC_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
    USDT_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E" // Same as USDC on Sepolia
};

const POOL_CONFIGS = {
    0: { // ETH/USDC
        name: "ETH/USDC",
        oracleA: "ETH_USD",
        oracleB: "USDC_USD",
        decimals0: 18,
        decimals1: 6,
        calculateRatio: (a, b) => a / b
    },
    1: { // WBTC/ETH
        name: "WBTC/ETH",
        oracleA: "BTC_USD",
        oracleB: "ETH_USD",
        decimals0: 8,
        decimals1: 18,
        calculateRatio: (a, b) => a / b
    },
    2: { // ETH/USDT
        name: "ETH/USDT",
        oracleA: "ETH_USD",
        oracleB: "USDT_USD",
        decimals0: 18,
        decimals1: 6,
        calculateRatio: (a, b) => a / b
    }
};

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// ============================================================================
// ORACLE FUNCTIONS
// ============================================================================

async function fetchPrice(oracleName) {
    const address = ORACLES[oracleName];

    const call = {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{
            to: address,
            data: "0xfeaf968c" // latestRoundData()
        }, "latest"]
    };

    const response = await Functions.makeHttpRequest({
        url: SEPOLIA_RPC,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: call
    });

    if (response.error) throw new Error(`Oracle ${oracleName} failed`);

    const result = response.data.result;
    const answer = parseInt(result.slice(66, 130), 16);
    return answer / 1e8;
}

async function fetch48hHistory(oracleName) {
    const address = ORACLES[oracleName];
    const prices = [];
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - (48 * 60 * 60);

    // Get latest round
    const latestCall = {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: address, data: "0xfeaf968c" }, "latest"]
    };

    const latestRes = await Functions.makeHttpRequest({
        url: SEPOLIA_RPC,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: latestCall
    });

    const latestResult = latestRes.data.result;
    const latestRoundId = BigInt("0x" + latestResult.slice(2, 66));
    const latestPrice = parseInt(latestResult.slice(66, 130), 16) / 1e8;
    const latestTime = parseInt(latestResult.slice(194, 258), 16);

    prices.push({ price: latestPrice, time: latestTime });

    // Fetch historical (sample every 10 rounds for efficiency)
    for (let offset = 10; offset <= 200; offset += 10) {
        try {
            const roundId = latestRoundId - BigInt(offset);
            const roundHex = "0x" + roundId.toString(16).padStart(64, "0");

            const histRes = await Functions.makeHttpRequest({
                url: SEPOLIA_RPC,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                data: {
                    jsonrpc: "2.0",
                    id: offset,
                    method: "eth_call",
                    params: [{
                        to: address,
                        data: "0x9a6fc8f5" + roundHex.slice(2)
                    }, "latest"]
                }
            });

            if (!histRes.error && histRes.data.result !== "0x") {
                const r = histRes.data.result;
                const price = parseInt(r.slice(66, 130), 16) / 1e8;
                const time = parseInt(r.slice(194, 258), 16);
                if (time >= cutoff) prices.push({ price, time });
            }
        } catch (e) { /* skip */ }
    }

    return prices;
}

// ============================================================================
// VOLATILITY & LUNG STRATEGY
// ============================================================================

function calculateVolatility(prices) {
    if (prices.length < 2) return 15;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        returns.push(Math.log(prices[i].price / prices[i - 1].price));
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
    const volatility = Math.sqrt(variance) * 100 * Math.sqrt(returns.length);

    return Math.min(volatility, 50);
}

function lungStrategy(volatility) {
    if (volatility < 5) return { width: 100, state: "CONTRACTED" };
    if (volatility < 15) return { width: 300, state: "NORMAL" };
    if (volatility < 30) return { width: 600, state: "EXPANDED" };
    return { width: 1000, state: "MAXIMUM" };
}

function priceToTick(price, decimals0, decimals1) {
    const shift = decimals1 - decimals0;
    const adjusted = price * (10 ** shift);
    return Math.floor(Math.log(adjusted) / Math.log(1.0001));
}

function alignTick(tick, spacing = 60) {
    return Math.floor(tick / spacing) * spacing;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

const config = POOL_CONFIGS[poolType];
console.log(`Pool: ${config.name}`);

// Fetch prices
const priceA = await fetchPrice(config.oracleA);
const priceB = config.oracleB ? await fetchPrice(config.oracleB) : 1;
const ratio = config.calculateRatio(priceA, priceB);

console.log(`${config.oracleA}: $${priceA.toFixed(2)}`);
if (config.oracleB) console.log(`${config.oracleB}: $${priceB.toFixed(4)}`);
console.log(`Ratio: ${ratio.toFixed(6)}`);

// Fetch 48h history (use primary oracle)
const history = await fetch48hHistory(config.oracleA);
const volatility = calculateVolatility(history);
console.log(`Volatility: ${volatility.toFixed(2)}%`);

// Lung strategy
const { width, state } = lungStrategy(volatility);
console.log(`Lung State: ${state}, Width: ${width}`);

// Calculate ticks
const centerTick = priceToTick(ratio, config.decimals0, config.decimals1);
const newLower = alignTick(centerTick - width);
const newUpper = alignTick(centerTick + width) + 60;

console.log(`Range: [${newLower}, ${newUpper}]`);

// Return result
const volatilityBps = Math.round(volatility * 100);

return Functions.encodeString(
    JSON.stringify({
        newLower: newLower,
        newUpper: newUpper,
        volatilityBps: volatilityBps
    })
);
