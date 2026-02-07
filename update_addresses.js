const fs = require('fs');
const path = require('path');

const DEPLOYMENT_PATH = path.join(__dirname, 'deployment.json');
const FRONTEND_ADDRESSES_PATH = path.join(__dirname, 'frontend/src/lib/addresses.ts');

if (!fs.existsSync(DEPLOYMENT_PATH)) {
    console.error(`Error: ${DEPLOYMENT_PATH} not found.`);
    process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, 'utf8'));

let content = fs.readFileSync(FRONTEND_ADDRESSES_PATH, 'utf8');

// Helper to replace constant value
function replaceConst(name, value, isString = true) {
    const regex = isString
        ? new RegExp(`export const ${name} = ".*?"`, 'g')
        : new RegExp(`export const ${name} = (true|false)`, 'g');
    const replacement = isString
        ? `export const ${name} = "${value}"`
        : `export const ${name} = ${value}`;
    if (content.match(regex)) {
        content = content.replace(regex, replacement);
        console.log(`Updated ${name} to ${value}`);
    } else {
        console.warn(`Warning: Could not find constant ${name} in file.`);
    }
}

console.log("Updating frontend addresses...");

replaceConst('POOL_MANAGER_ADDRESS', deployment.POOL_MANAGER);
replaceConst('SENTINEL_HOOK_ADDRESS', deployment.SENTINEL_HOOK);
replaceConst('SWAP_HELPER_ADDRESS', deployment.SWAP_HELPER);
replaceConst('MOCK_AAVE_ADDRESS', deployment.MOCK_AAVE);
replaceConst('BTC_ETH_ORACLE_ADDRESS', deployment.BTC_ETH_ORACLE);

replaceConst('METH_ADDRESS', deployment.mETH);
replaceConst('MUSDC_ADDRESS', deployment.mUSDC);
replaceConst('MWBTC_ADDRESS', deployment.mWBTC);
replaceConst('MUSDT_ADDRESS', deployment.mUSDT);

replaceConst('POOL_ID_ETH_USDC', deployment.POOL_ID_ETH_USDC);
replaceConst('POOL_ID_WBTC_ETH', deployment.POOL_ID_WBTC_ETH);
replaceConst('POOL_ID_ETH_USDT', deployment.POOL_ID_ETH_USDT);

if (deployment.ETH_USD_FEED) replaceConst('ETH_USD_FEED_ADDRESS', deployment.ETH_USD_FEED);
if (deployment.BTC_USD_FEED) replaceConst('BTC_USD_FEED_ADDRESS', deployment.BTC_USD_FEED);
if (deployment.USDC_USD_FEED) replaceConst('USDC_USD_FEED_ADDRESS', deployment.USDC_USD_FEED);
if (typeof deployment.USE_MOCK_FEEDS === 'boolean') replaceConst('USE_MOCK_FEEDS', deployment.USE_MOCK_FEEDS, false);

fs.writeFileSync(FRONTEND_ADDRESSES_PATH, content);
console.log(`Successfully updated ${FRONTEND_ADDRESSES_PATH}`);
