// Local Test Runner for rebalancer.js
// Mocks Chainlink Functions APIs for local testing

const https = require('https');
const http = require('http');

// ============================================================================
// MOCK CHAINLINK FUNCTIONS API
// ============================================================================

const Functions = {
    makeHttpRequest: async ({ url, method, headers, data }) => {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const lib = urlObj.protocol === 'https:' ? https : http;

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname,
                method: method || 'GET',
                headers: headers || {}
            };

            const req = lib.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve({ data: JSON.parse(body), error: null });
                    } catch (e) {
                        resolve({ data: body, error: null });
                    }
                });
            });

            req.on('error', (e) => {
                resolve({ data: null, error: e.message });
            });

            if (data) {
                req.write(JSON.stringify(data));
            }
            req.end();
        });
    },

    encodeString: (str) => str
};

// Make Functions global so the rebalancer script can access it
global.Functions = Functions;

// ============================================================================
// REBALANCER LOGIC (copy from rebalancer.js with async wrapper)
// ============================================================================

async function runRebalancer(poolType) {
    console.log('='.repeat(60));
    console.log(`🤖 Testing Pool Type: ${poolType}`);
    console.log('='.repeat(60));

    // Simulate args array like Chainlink Functions
    const args = [String(poolType)];

    // Oracle addresses (Sepolia)
    const ORACLES = {
        ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
        BTC_USD: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
        USDC_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
        USDT_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E"
    };

    const POOL_CONFIGS = {
        0: { name: "ETH/USDC", oracleA: "ETH_USD", oracleB: "USDC_USD", decimals0: 18, decimals1: 6, calculateRatio: (a, b) => a / b },
        1: { name: "WBTC/ETH", oracleA: "BTC_USD", oracleB: "ETH_USD", decimals0: 8, decimals1: 18, calculateRatio: (a, b) => a / b },
        2: { name: "ETH/USDT", oracleA: "ETH_USD", oracleB: "USDT_USD", decimals0: 18, decimals1: 6, calculateRatio: (a, b) => a / b }
    };

    const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

    async function fetchPrice(oracleName) {
        const address = ORACLES[oracleName];
        const call = {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_call",
            params: [{ to: address, data: "0xfeaf968c" }, "latest"]
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

        console.log(`   📡 Fetching historical rounds...`);

        for (let offset = 10; offset <= 100; offset += 10) {
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
                        params: [{ to: address, data: "0x9a6fc8f5" + roundHex.slice(2) }, "latest"]
                    }
                });

                if (!histRes.error && histRes.data.result && histRes.data.result !== "0x") {
                    const r = histRes.data.result;
                    const price = parseInt(r.slice(66, 130), 16) / 1e8;
                    const time = parseInt(r.slice(194, 258), 16);
                    if (time >= cutoff) prices.push({ price, time });
                }
            } catch (e) { /* skip */ }
        }

        return prices;
    }

    function calculateVolatility(prices) {
        if (prices.length < 2) return 15;
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push(Math.log(prices[i].price / prices[i - 1].price));
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
        return Math.min(Math.sqrt(variance) * 100 * Math.sqrt(returns.length), 50);
    }

    function lungStrategy(volatility) {
        if (volatility < 5) return { width: 100, state: "CONTRACTED 🟢" };
        if (volatility < 15) return { width: 300, state: "NORMAL 🟡" };
        if (volatility < 30) return { width: 600, state: "EXPANDED 🟠" };
        return { width: 1000, state: "MAXIMUM 🔴" };
    }

    function priceToTick(price, decimals0, decimals1) {
        const shift = decimals1 - decimals0;
        return Math.floor(Math.log(price * (10 ** shift)) / Math.log(1.0001));
    }

    function alignTick(tick, spacing = 60) {
        return Math.floor(tick / spacing) * spacing;
    }

    // === EXECUTE ===
    const config = POOL_CONFIGS[parseInt(args[0]) || 0];
    console.log(`\n🏊 Pool: ${config.name}`);

    const priceA = await fetchPrice(config.oracleA);
    console.log(`   ✅ ${config.oracleA}: $${priceA.toFixed(2)}`);

    const priceB = config.oracleB ? await fetchPrice(config.oracleB) : 1;
    if (config.oracleB) console.log(`   ✅ ${config.oracleB}: $${priceB.toFixed(4)}`);

    const ratio = config.calculateRatio(priceA, priceB);
    console.log(`   🎯 Ratio: ${ratio.toFixed(6)}`);

    const history = await fetch48hHistory(config.oracleA);
    console.log(`   📊 Historical prices: ${history.length} samples`);

    const volatility = calculateVolatility(history);
    console.log(`   ⚡ Volatility: ${volatility.toFixed(2)}%`);

    const { width, state } = lungStrategy(volatility);
    console.log(`   🫁 Lung State: ${state}`);
    console.log(`   📏 Width: ${width} ticks`);

    const centerTick = priceToTick(ratio, config.decimals0, config.decimals1);
    const newLower = alignTick(centerTick - width);
    const newUpper = alignTick(centerTick + width) + 60;

    console.log(`\n📐 RESULT:`);
    console.log(`   Center Tick: ${centerTick}`);
    console.log(`   New Range: [${newLower}, ${newUpper}]`);
    console.log(`   Volatility BPS: ${Math.round(volatility * 100)}`);

    const result = {
        newLower,
        newUpper,
        volatilityBps: Math.round(volatility * 100)
    };

    console.log(`\n📤 JSON Output:`);
    console.log(JSON.stringify(result, null, 2));

    return result;
}

// ============================================================================
// RUN ALL 3 POOLS
// ============================================================================

async function main() {
    console.log('\n🧪 SENTINEL REBALANCER - LOCAL TEST\n');

    try {
        await runRebalancer(0); // ETH/USDC
        await runRebalancer(1); // WBTC/ETH
        await runRebalancer(2); // ETH/USDT

        console.log('\n' + '='.repeat(60));
        console.log('✅ All pool tests completed!');
        console.log('='.repeat(60) + '\n');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main();
