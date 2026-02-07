// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SentinelHook} from "../src/SentinelHook.sol";
import {SwapHelper} from "../src/SwapHelper.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {RatioOracle} from "../test/mocks/RatioOracle.sol";
import {MockAavePool, MockAToken} from "../test/mocks/MockAavePool.sol";

/// @title DeployFullDemo
/// @notice Deploys the COMPLETE Sentinel demo environment on Sepolia:
///   1. Mock Tokens (mETH, mUSDC, mWBTC, mUSDT) with permissionless mint
///   2. Mock Aave Pool + Reserves (aTokens for all 4 tokens)
///   3. RatioOracle for WBTC/ETH cross-pair
///   4. SentinelHook (with deployer as owner + maintainer)
///   5. SwapHelper (for executing test swaps)
///   6. 3 Pools initialized (mETH/mUSDC, mWBTC/mETH, mETH/mUSDT)
///   7. Mints tokens to deployer
///   8. Approves hook for deposits
/// @dev Run with: forge script script/DeployFullDemo.s.sol --account test1 --sender <ADDR> --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
contract DeployFullDemo is Script {
    using PoolIdLibrary for PoolKey;

    // Sepolia PoolManager
    address constant POOL_MANAGER = 0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;

    // Real Chainlink Price Feeds on Sepolia
    address constant ETH_USD_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    address constant BTC_USD_FEED = 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43;
    address constant USDC_USD_FEED = 0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E;

    // CREATE2 deployer
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        require(block.chainid == 11155111, "Must run on Sepolia");

        vm.startBroadcast();
        address deployer = msg.sender;

        console.log("========================================");
        console.log("  SENTINEL FULL DEMO DEPLOYMENT");
        console.log("========================================");
        console.log("Deployer:", deployer);

        // ─── 1. Deploy Mock Tokens ───────────────────────────────

        console.log("\n--- 1. Deploying Mock Tokens ---");
        MockERC20 mETH = new MockERC20("Mock WETH", "mETH", 18);
        MockERC20 mUSDC = new MockERC20("Mock USDC", "mUSDC", 6);
        MockERC20 mWBTC = new MockERC20("Mock WBTC", "mWBTC", 8);
        MockERC20 mUSDT = new MockERC20("Mock USDT", "mUSDT", 6);

        console.log("mETH:  ", address(mETH));
        console.log("mUSDC: ", address(mUSDC));
        console.log("mWBTC: ", address(mWBTC));
        console.log("mUSDT: ", address(mUSDT));

        // ─── 2. Mint Tokens to Deployer ──────────────────────────

        console.log("\n--- 2. Minting Tokens ---");
        mETH.mint(deployer, 1000 ether);          // 1000 mETH
        mUSDC.mint(deployer, 10_000_000e6);        // 10M mUSDC
        mWBTC.mint(deployer, 100e8);               // 100 mWBTC
        mUSDT.mint(deployer, 10_000_000e6);        // 10M mUSDT
        console.log("Minted: 1000 mETH, 10M mUSDC, 100 mWBTC, 10M mUSDT");

        // ─── 3. Deploy Mock Aave ─────────────────────────────────

        console.log("\n--- 3. Deploying Mock Aave ---");
        MockAavePool mockAave = new MockAavePool();

        address maETH = mockAave.initReserve(address(mETH), "Mock aETH", "maETH");
        address maUSDC = mockAave.initReserve(address(mUSDC), "Mock aUSDC", "maUSDC");
        address maWBTC = mockAave.initReserve(address(mWBTC), "Mock aWBTC", "maWBTC");
        address maUSDT = mockAave.initReserve(address(mUSDT), "Mock aUSDT", "maUSDT");

        console.log("MockAave:", address(mockAave));
        console.log("maETH:   ", maETH);
        console.log("maUSDC:  ", maUSDC);
        console.log("maWBTC:  ", maWBTC);
        console.log("maUSDT:  ", maUSDT);

        // ─── 4. Deploy RatioOracle for BTC/ETH ──────────────────

        console.log("\n--- 4. Deploying RatioOracle ---");
        RatioOracle btcEthOracle = new RatioOracle(
            BTC_USD_FEED,
            ETH_USD_FEED,
            "BTC/ETH Ratio"
        );
        console.log("BTC/ETH Oracle:", address(btcEthOracle));

        // ─── 5. Deploy SentinelHook ──────────────────────────────

        console.log("\n--- 5. Deploying SentinelHook ---");
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG
        );
        bytes memory constructorArgs = abi.encode(
            POOL_MANAGER,
            address(mockAave),
            deployer,  // deployer is maintainer
            deployer   // deployer is owner
        );

        (, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            flags,
            type(SentinelHook).creationCode,
            constructorArgs
        );

        SentinelHook hook = new SentinelHook{salt: salt}(
            IPoolManager(POOL_MANAGER),
            address(mockAave),
            deployer,
            deployer
        );
        console.log("SentinelHook:", address(hook));

        // Verify hook permissions
        require(
            Hooks.hasPermission(IHooks(address(hook)), Hooks.BEFORE_INITIALIZE_FLAG),
            "Missing BEFORE_INITIALIZE_FLAG"
        );
        require(
            Hooks.hasPermission(IHooks(address(hook)), Hooks.BEFORE_SWAP_FLAG),
            "Missing BEFORE_SWAP_FLAG"
        );
        console.log("Hook permissions verified OK");

        // ─── 6. Deploy SwapHelper ────────────────────────────────

        console.log("\n--- 6. Deploying SwapHelper ---");
        SwapHelper swapHelper = new SwapHelper(IPoolManager(POOL_MANAGER));
        console.log("SwapHelper:", address(swapHelper));

        // ─── 7. Initialize Pools ─────────────────────────────────

        console.log("\n--- 7. Initializing Pools ---");

        // Pool 1: mETH / mUSDC
        PoolKey memory key1;
        PoolId poolId1;
        {
            (Currency t0, Currency t1) = _sort(address(mETH), address(mUSDC));
            address a0 = Currency.unwrap(t0) == address(mETH) ? maETH : maUSDC;
            address a1 = Currency.unwrap(t1) == address(mETH) ? maETH : maUSDC;

            key1 = PoolKey({
                currency0: t0,
                currency1: t1,
                fee: 3000,
                tickSpacing: 60,
                hooks: IHooks(address(hook))
            });

            // Initialize pool in Uniswap v4 PoolManager first
            uint160 sqrtPriceX96_1 = TickMath.getSqrtPriceAtTick(0); // 1:1 starting price
            IPoolManager(POOL_MANAGER).initialize(key1, sqrtPriceX96_1);

            hook.initializePool(
                key1,
                ETH_USD_FEED,
                true,           // Inverted: feed is ETH/USD, pool is token0/token1
                a0, a1,
                500,            // 5% max deviation
                -887220,
                887220
            );
            poolId1 = key1.toId();
            console.log("Pool 1 (mETH/mUSDC):", vm.toString(PoolId.unwrap(poolId1)));
        }

        // Pool 2: mWBTC / mETH
        PoolKey memory key2;
        PoolId poolId2;
        {
            (Currency t0, Currency t1) = _sort(address(mWBTC), address(mETH));
            address a0 = Currency.unwrap(t0) == address(mWBTC) ? maWBTC : maETH;
            address a1 = Currency.unwrap(t1) == address(mWBTC) ? maWBTC : maETH;

            key2 = PoolKey({
                currency0: t0,
                currency1: t1,
                fee: 3000,
                tickSpacing: 60,
                hooks: IHooks(address(hook))
            });

            // Initialize pool in Uniswap v4 PoolManager first
            uint160 sqrtPriceX96_2 = TickMath.getSqrtPriceAtTick(0);
            IPoolManager(POOL_MANAGER).initialize(key2, sqrtPriceX96_2);

            hook.initializePool(
                key2,
                address(btcEthOracle),
                false,
                a0, a1,
                500,
                -887220,
                887220
            );
            poolId2 = key2.toId();
            console.log("Pool 2 (mWBTC/mETH):", vm.toString(PoolId.unwrap(poolId2)));
        }

        // Pool 3: mETH / mUSDT
        PoolKey memory key3;
        PoolId poolId3;
        {
            (Currency t0, Currency t1) = _sort(address(mETH), address(mUSDT));
            address a0 = Currency.unwrap(t0) == address(mETH) ? maETH : maUSDT;
            address a1 = Currency.unwrap(t1) == address(mETH) ? maETH : maUSDT;

            key3 = PoolKey({
                currency0: t0,
                currency1: t1,
                fee: 3000,
                tickSpacing: 60,
                hooks: IHooks(address(hook))
            });

            // Initialize pool in Uniswap v4 PoolManager first
            uint160 sqrtPriceX96_3 = TickMath.getSqrtPriceAtTick(0);
            IPoolManager(POOL_MANAGER).initialize(key3, sqrtPriceX96_3);

            hook.initializePool(
                key3,
                ETH_USD_FEED,
                true,
                a0, a1,
                500,
                -887220,
                887220
            );
            poolId3 = key3.toId();
            console.log("Pool 3 (mETH/mUSDT):", vm.toString(PoolId.unwrap(poolId3)));
        }

        // ─── 8. Approve Hook + SwapHelper for token spending ────

        console.log("\n--- 8. Setting Approvals ---");
        mETH.approve(address(hook), type(uint256).max);
        mUSDC.approve(address(hook), type(uint256).max);
        mWBTC.approve(address(hook), type(uint256).max);
        mUSDT.approve(address(hook), type(uint256).max);

        // Approve SwapHelper + PoolManager for swaps
        mETH.approve(address(swapHelper), type(uint256).max);
        mUSDC.approve(address(swapHelper), type(uint256).max);
        mWBTC.approve(address(swapHelper), type(uint256).max);
        mUSDT.approve(address(swapHelper), type(uint256).max);
        mETH.approve(POOL_MANAGER, type(uint256).max);
        mUSDC.approve(POOL_MANAGER, type(uint256).max);
        mWBTC.approve(POOL_MANAGER, type(uint256).max);
        mUSDT.approve(POOL_MANAGER, type(uint256).max);

        console.log("All approvals set");

        // ─── 9. Seed Pools with Initial Liquidity ─────────────

        console.log("\n--- 9. Seeding Pools with Initial Liquidity ---");

        // Pool 1: 10 mETH + 25,000 mUSDC (sort-aware)
        {
            (Currency c0, ) = _sort(address(mETH), address(mUSDC));
            uint256 a0 = Currency.unwrap(c0) == address(mETH) ? 10 ether : 25_000e6;
            uint256 a1 = Currency.unwrap(c0) == address(mETH) ? 25_000e6 : 10 ether;
            uint256 dep1Shares = hook.depositLiquidity(key1, a0, a1);
            console.log("Pool 1 seeded, shares:", dep1Shares);
        }

        // Pool 2: 10 mETH + 1 mWBTC (token order depends on sort)
        {
            (Currency t0, ) = _sort(address(mWBTC), address(mETH));
            uint256 amt0 = Currency.unwrap(t0) == address(mETH) ? 10 ether : 1e8;
            uint256 amt1 = Currency.unwrap(t0) == address(mETH) ? 1e8 : 10 ether;
            uint256 dep2Shares = hook.depositLiquidity(key2, amt0, amt1);
            console.log("Pool 2 seeded, shares:", dep2Shares);
        }

        // Pool 3: 10 mETH + 25,000 mUSDT (sort-aware)
        {
            (Currency c0, ) = _sort(address(mETH), address(mUSDT));
            uint256 a0 = Currency.unwrap(c0) == address(mETH) ? 10 ether : 25_000e6;
            uint256 a1 = Currency.unwrap(c0) == address(mETH) ? 25_000e6 : 10 ether;
            uint256 dep3Shares = hook.depositLiquidity(key3, a0, a1);
            console.log("Pool 3 seeded, shares:", dep3Shares);
        }

        vm.stopBroadcast();

        // ─── Print Summary ───────────────────────────────────────

        console.log("\n========================================");
        console.log("  DEPLOYMENT COMPLETE - ADDRESSES");
        console.log("========================================");
        console.log("POOL_MANAGER:    ", POOL_MANAGER);
        console.log("SENTINEL_HOOK:   ", address(hook));
        console.log("SWAP_HELPER:     ", address(swapHelper));
        console.log("MOCK_AAVE:       ", address(mockAave));
        console.log("BTC_ETH_ORACLE:  ", address(btcEthOracle));
        console.log("---");
        console.log("mETH:            ", address(mETH));
        console.log("mUSDC:           ", address(mUSDC));
        console.log("mWBTC:           ", address(mWBTC));
        console.log("mUSDT:           ", address(mUSDT));
        console.log("---");
        console.log("maETH:           ", maETH);
        console.log("maUSDC:          ", maUSDC);
        console.log("maWBTC:          ", maWBTC);
        console.log("maUSDT:          ", maUSDT);
        console.log("---");
        console.log("POOL1 (mETH/mUSDC):", vm.toString(PoolId.unwrap(poolId1)));
        console.log("POOL2 (mWBTC/mETH):", vm.toString(PoolId.unwrap(poolId2)));
        console.log("POOL3 (mETH/mUSDT):", vm.toString(PoolId.unwrap(poolId3)));
        console.log("========================================");
    }

    function _sort(address a, address b) internal pure returns (Currency, Currency) {
        if (a < b) return (Currency.wrap(a), Currency.wrap(b));
        return (Currency.wrap(b), Currency.wrap(a));
    }
}
