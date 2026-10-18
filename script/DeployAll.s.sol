// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

import {SentinelHook} from "../src/SentinelHook.sol";
import {SwapHelper} from "../src/SwapHelper.sol";

import {MockERC20} from "../test/mocks/MockERC20.sol";
import {RatioOracle} from "../src/mocks/RatioOracle.sol";
import {MockPriceFeed} from "../src/mocks/MockPriceFeed.sol";
import {MockAavePool} from "../test/mocks/MockAavePool.sol";

interface ISentinelHookAdmin {
    function setMaintainer(address newMaintainer) external;

    function maintainer() external view returns (address);

    function owner() external view returns (address);
}

/// @title DeployAll
/// @notice Single script to deploy the complete demo on Sepolia
/// @dev Run with: forge script script/DeployAll.s.sol --account test1 --sender <ADDR> --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
contract DeployAll is Script {
    using PoolIdLibrary for PoolKey;

    // Sepolia PoolManager
    address constant POOL_MANAGER = 0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;

    // Real Chainlink Price Feeds on Sepolia
    address constant ETH_USD_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    address constant BTC_USD_FEED = 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43;
    address constant USDC_USD_FEED = 0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E;

    // CREATE2 deployer
    address constant CREATE2_DEPLOYER =
        0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        require(block.chainid == 11155111, "Must run on Sepolia");

        vm.startBroadcast();
        address deployer = tx.origin;
        address maintainer = vm.envOr("CHAINLINK_MAINTAINER", deployer);

        bool useMockFeeds = vm.envOr("USE_MOCK_FEEDS", true);
        address ethUsdFeed = ETH_USD_FEED;
        address btcUsdFeed = BTC_USD_FEED;
        address usdcUsdFeed = USDC_USD_FEED;

        console.log("========================================");
        console.log("  SENTINEL FULL DEMO DEPLOY");
        console.log("========================================");
        console.log("Deployer:", deployer);

        if (useMockFeeds) {
            console.log("\n--- Using Mock Price Feeds ---");
            MockPriceFeed ethUsd = new MockPriceFeed(8, 2000e8, "ETH / USD");
            MockPriceFeed btcUsd = new MockPriceFeed(8, 60000e8, "BTC / USD");
            MockPriceFeed usdcUsd = new MockPriceFeed(8, 1e8, "USDC / USD");

            ethUsdFeed = address(ethUsd);
            btcUsdFeed = address(btcUsd);
            usdcUsdFeed = address(usdcUsd);

            console.log("Mock ETH/USD:", ethUsdFeed);
            console.log("Mock BTC/USD:", btcUsdFeed);
            console.log("Mock USDC/USD:", usdcUsdFeed);
        }

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
        mETH.mint(deployer, 1000 ether);
        mUSDC.mint(deployer, 10_000_000e6);
        mWBTC.mint(deployer, 100e8);
        mUSDT.mint(deployer, 10_000_000e6);
        console.log("Minted: 1000 mETH, 10M mUSDC, 100 mWBTC, 10M mUSDT");

        // ─── 3. Deploy Mock Aave ─────────────────────────────────
        console.log("\n--- 3. Deploying Mock Aave ---");
        MockAavePool mockAave = new MockAavePool();

        address maETH = mockAave.initReserve(
            address(mETH),
            "Mock aETH",
            "maETH"
        );
        address maUSDC = mockAave.initReserve(
            address(mUSDC),
            "Mock aUSDC",
            "maUSDC"
        );
        address maWBTC = mockAave.initReserve(
            address(mWBTC),
            "Mock aWBTC",
            "maWBTC"
        );
        address maUSDT = mockAave.initReserve(
            address(mUSDT),
            "Mock aUSDT",
            "maUSDT"
        );

        console.log("MockAave:", address(mockAave));
        console.log("maETH:   ", maETH);
        console.log("maUSDC:  ", maUSDC);
        console.log("maWBTC:  ", maWBTC);
        console.log("maUSDT:  ", maUSDT);

        // ─── 4. Deploy RatioOracle for BTC/ETH ──────────────────
        console.log("\n--- 4. Deploying RatioOracle ---");
        RatioOracle btcEthOracle = new RatioOracle(
            btcUsdFeed,
            ethUsdFeed,
            "BTC/ETH Ratio"
        );
        console.log("BTC/ETH Oracle:", address(btcEthOracle));

        // ─── 5. Deploy SentinelHook ──────────────────────────────
        console.log("\n--- 5. Deploying SentinelHook ---");
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG
        );
        
        // IMPORTANT: Using tx.origin (deployer) for both maintainer and owner
        // This ensures the deployment address calling initializePool matches the owner
        bytes memory constructorArgs = abi.encode(
            POOL_MANAGER,
            address(mockAave),
            tx.origin, // maintainer
            tx.origin // owner - MUST be tx.origin, not deployer variable
        );

        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            flags,
            type(SentinelHook).creationCode,
            constructorArgs
        );

        console.log("Expected hook address:", hookAddress);
        console.log("Checking if hook already deployed...");
        
        // Check if already deployed
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(hookAddress)
        }
        
        SentinelHook hook;
        if (codeSize > 0) {
            console.log("Hook already exists at address, checking owner...");
            hook = SentinelHook(payable(hookAddress));
            address existingOwner = ISentinelHookAdmin(address(hook)).owner();
            console.log("Existing hook owner:", existingOwner);
            
            if (existingOwner != deployer) {
                console.log("WARNING: Existing hook has different owner!");
                console.log("Expected:", deployer);
                console.log("Actual:", existingOwner);
                console.log("Cannot use existing deployment. Please:");
                console.log("1. Transfer ownership from the old owner, OR");
                console.log("2. Use a different deployment address by modifying constructor params");
                revert("Hook exists with wrong owner");
            }
            console.log("Using existing deployment with correct owner");
        } else {
            console.log("Deploying new hook...");
            hook = new SentinelHook{salt: salt}(
                IPoolManager(POOL_MANAGER),
                address(mockAave),
                tx.origin, // Use tx.origin consistently
                tx.origin // Use tx.origin consistently
            );
            console.log("Hook deployed successfully");
        }
        
        console.log("SentinelHook:", address(hook));
        console.log("Hook owner:", ISentinelHookAdmin(address(hook)).owner());
        console.log("tx.origin:", tx.origin);
        console.log("deployer variable:", deployer);

        require(
            Hooks.hasPermission(
                IHooks(address(hook)),
                Hooks.BEFORE_INITIALIZE_FLAG
            ),
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

            uint160 sqrtPriceX96_1 = TickMath.getSqrtPriceAtTick(0);
            IPoolManager(POOL_MANAGER).initialize(key1, sqrtPriceX96_1);

            console.log("About to initialize pool 1...");
            console.log("Caller (tx.origin):", tx.origin);
            console.log("Hook owner:", ISentinelHookAdmin(address(hook)).owner());
            console.log("Are they equal?", tx.origin == ISentinelHookAdmin(address(hook)).owner());
            
            hook.initializePool(
                key1,
                ethUsdFeed,
                true,
                a0,
                a1,
                500,
                -887220,
                887220
            );
            poolId1 = key1.toId();
            console.log(
                "Pool 1 (mETH/mUSDC):",
                vm.toString(PoolId.unwrap(poolId1))
            );
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

            uint160 sqrtPriceX96_2 = TickMath.getSqrtPriceAtTick(0);
            IPoolManager(POOL_MANAGER).initialize(key2, sqrtPriceX96_2);

            hook.initializePool(
                key2,
                address(btcEthOracle),
                false,
                a0,
                a1,
                500,
                -887220,
                887220
            );
            poolId2 = key2.toId();
            console.log(
                "Pool 2 (mWBTC/mETH):",
                vm.toString(PoolId.unwrap(poolId2))
            );
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

            uint160 sqrtPriceX96_3 = TickMath.getSqrtPriceAtTick(0);
            IPoolManager(POOL_MANAGER).initialize(key3, sqrtPriceX96_3);

            hook.initializePool(
                key3,
                ethUsdFeed,
                true,
                a0,
                a1,
                500,
                -887220,
                887220
            );
            poolId3 = key3.toId();
            console.log(
                "Pool 3 (mETH/mUSDT):",
                vm.toString(PoolId.unwrap(poolId3))
            );
        }

        // ─── 8. Approvals ───────────────────────────────────────
        console.log("\n--- 8. Setting Approvals ---");
        // Temporarily stop broadcast to use deployer's address for approvals
        vm.stopBroadcast();
        vm.startBroadcast(deployer);
        
        mETH.approve(address(hook), type(uint256).max);
        mUSDC.approve(address(hook), type(uint256).max);
        mWBTC.approve(address(hook), type(uint256).max);
        mUSDT.approve(address(hook), type(uint256).max);

        mETH.approve(address(swapHelper), type(uint256).max);
        mUSDC.approve(address(swapHelper), type(uint256).max);
        mWBTC.approve(address(swapHelper), type(uint256).max);
        mUSDT.approve(address(swapHelper), type(uint256).max);
        mETH.approve(POOL_MANAGER, type(uint256).max);
        mUSDC.approve(POOL_MANAGER, type(uint256).max);
        mWBTC.approve(POOL_MANAGER, type(uint256).max);
        mUSDT.approve(POOL_MANAGER, type(uint256).max);
        console.log("All approvals set");

        // ─── 9. Seed Pools ──────────────────────────────────────
        console.log("\n--- 9. Seeding Pools with Initial Liquidity ---");
        {
            uint256 a0 = Currency.unwrap(key1.currency0) == address(mETH)
                ? 10 ether
                : 25_000e6;
            uint256 a1 = Currency.unwrap(key1.currency1) == address(mETH)
                ? 10 ether
                : 25_000e6;
            uint256 dep1Shares = hook.depositLiquidity(key1, a0, a1);
            console.log("Pool 1 seeded, shares:", dep1Shares);
        }
        {
            uint256 amt0 = Currency.unwrap(key2.currency0) == address(mETH)
                ? 10 ether
                : 1e8;
            uint256 amt1 = Currency.unwrap(key2.currency1) == address(mETH)
                ? 10 ether
                : 1e8;
            uint256 dep2Shares = hook.depositLiquidity(key2, amt0, amt1);
            console.log("Pool 2 seeded, shares:", dep2Shares);
        }
        {
            uint256 a0 = Currency.unwrap(key3.currency0) == address(mETH)
                ? 10 ether
                : 25_000e6;
            uint256 a1 = Currency.unwrap(key3.currency1) == address(mETH)
                ? 10 ether
                : 25_000e6;
            uint256 dep3Shares = hook.depositLiquidity(key3, a0, a1);
            console.log("Pool 3 seeded, shares:", dep3Shares);
        }

        console.log("\n--- 10. Setting Maintainer ---");
        ISentinelHookAdmin hookAdmin = ISentinelHookAdmin(address(hook));
        console.log("Current maintainer:", hookAdmin.maintainer());
        hookAdmin.setMaintainer(maintainer);
        console.log("New maintainer:", maintainer);

        vm.stopBroadcast();

        // ─── Summary ────────────────────────────────────────────
        console.log("\n========================================");
        console.log("  DEPLOYMENT COMPLETE - ADDRESSES");
        console.log("========================================");
        console.log("POOL_MANAGER:       ", POOL_MANAGER);
        console.log("SENTINEL_HOOK:      ", address(hook));
        console.log("SWAP_HELPER:        ", address(swapHelper));
        console.log("MOCK_AAVE:          ", address(mockAave));
        console.log("BTC_ETH_ORACLE:     ", address(btcEthOracle));
        console.log("---");
        console.log("mETH:              ", address(mETH));
        console.log("mUSDC:             ", address(mUSDC));
        console.log("mWBTC:             ", address(mWBTC));
        console.log("mUSDT:             ", address(mUSDT));
        console.log("---");
        console.log("maETH:             ", maETH);
        console.log("maUSDC:            ", maUSDC);
        console.log("maWBTC:            ", maWBTC);
        console.log("maUSDT:            ", maUSDT);
        console.log("---");
        console.log(
            "POOL1 (mETH/mUSDC): ",
            vm.toString(PoolId.unwrap(poolId1))
        );
        console.log(
            "POOL2 (mWBTC/mETH): ",
            vm.toString(PoolId.unwrap(poolId2))
        );
        console.log(
            "POOL3 (mETH/mUSDT): ",
            vm.toString(PoolId.unwrap(poolId3))
        );
        console.log("========================================");

        // ─── Output JSON ────────────────────────────────────────
        string memory json = "deployment_artifacts";
        vm.serializeAddress(json, "POOL_MANAGER", POOL_MANAGER);
        vm.serializeAddress(json, "SENTINEL_HOOK", address(hook));
        vm.serializeAddress(json, "SWAP_HELPER", address(swapHelper));
        vm.serializeAddress(json, "MOCK_AAVE", address(mockAave));
        vm.serializeAddress(json, "BTC_ETH_ORACLE", address(btcEthOracle));
        vm.serializeAddress(json, "ETH_USD_FEED", ethUsdFeed);
        vm.serializeAddress(json, "BTC_USD_FEED", btcUsdFeed);
        vm.serializeAddress(json, "USDC_USD_FEED", usdcUsdFeed);
        vm.serializeBool(json, "USE_MOCK_FEEDS", useMockFeeds);
        
        vm.serializeAddress(json, "mETH", address(mETH));
        vm.serializeAddress(json, "mUSDC", address(mUSDC));
        vm.serializeAddress(json, "mWBTC", address(mWBTC));
        vm.serializeAddress(json, "mUSDT", address(mUSDT));

        vm.serializeAddress(json, "maETH", maETH);
        vm.serializeAddress(json, "maUSDC", maUSDC);
        vm.serializeAddress(json, "maWBTC", maWBTC);
        vm.serializeAddress(json, "maUSDT", maUSDT);

        vm.serializeBytes32(json, "POOL_ID_ETH_USDC", PoolId.unwrap(poolId1));
        vm.serializeBytes32(json, "POOL_ID_WBTC_ETH", PoolId.unwrap(poolId2));
        string memory finalJson = vm.serializeBytes32(json, "POOL_ID_ETH_USDT", PoolId.unwrap(poolId3));

        string memory path = string.concat(vm.projectRoot(), "/deployment.json");
        vm.writeJson(finalJson, path);
        console.log("Deployment artifacts written to:", path);

    }

    function _sort(
        address a,
        address b
    ) internal pure returns (Currency, Currency) {
        if (a < b) return (Currency.wrap(a), Currency.wrap(b));
        return (Currency.wrap(b), Currency.wrap(a));
    }
}
