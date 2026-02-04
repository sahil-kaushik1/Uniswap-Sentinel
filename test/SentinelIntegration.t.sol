// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SentinelHook} from "../src/SentinelHook.sol";
import {OracleLib} from "../src/libraries/OracleLib.sol";
import {YieldRouter} from "../src/libraries/YieldRouter.sol";
import {AaveAdapter, IPool} from "../src/libraries/AaveAdapter.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {AggregatorV3Interface} from "foundry-chainlink-toolkit/src/interfaces/feeds/AggregatorV3Interface.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

/// @title SentinelIntegrationTest
/// @notice Fork tests for the multi-pool Sentinel workflow
/// @dev Run with: forge test --match-path test/SentinelIntegration.t.sol -vvv --fork-url $SEPOLIA_RPC_URL
contract SentinelIntegrationTest is Test {
    using PoolIdLibrary for PoolKey;

    /*//////////////////////////////////////////////////////////////
                        SEPOLIA ADDRESSES
    //////////////////////////////////////////////////////////////*/

    // Uniswap v4 on Sepolia
    address constant POOL_MANAGER = 0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;

    // Chainlink Price Feeds on Sepolia
    address constant ETH_USD_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    address constant LINK_USD_FEED = 0xc59E3633BAAC79493d908e63626716e204A45EdF;

    // Aave v3 on Sepolia
    address constant AAVE_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;

    // Test Tokens on Sepolia (Aave Faucet Tokens)
    address constant WETH = 0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c;
    address constant USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
    address constant LINK = 0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5;

    // Aave aTokens on Sepolia
    address constant AUSDC = 0x16dA4541aD1807f4443d92D26044C1147406EB80;

    /*//////////////////////////////////////////////////////////////
                            TEST STATE
    //////////////////////////////////////////////////////////////*/

    SentinelHook hook;
    address owner;
    address maintainer = makeAddr("maintainer");
    address lp1 = makeAddr("lp1");
    address lp2 = makeAddr("lp2");
    address user = makeAddr("user");

    // Pool Keys
    PoolKey ethUsdcKey;
    PoolKey linkUsdcKey;
    PoolId ethUsdcPoolId;
    PoolId linkUsdcPoolId;

    function setUp() public {
        // Fork Sepolia (required for these integration tests)
        try vm.createSelectFork("sepolia") {
            console.log("Running on Sepolia fork");
        } catch {
            vm.skip(true, "Sepolia fork not configured. Set SEPOLIA_RPC_URL to run fork tests.");
            return;
        }

        owner = address(this);

        // Deploy the hook at a valid Uniswap v4 hook address (address encodes hook permission flags)
        uint160 flags = uint160(Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG);
        bytes memory constructorArgs = abi.encode(IPoolManager(POOL_MANAGER), AAVE_POOL, maintainer);
        (address expectedAddress, bytes32 salt) =
            HookMiner.find(address(this), flags, type(SentinelHook).creationCode, constructorArgs);

        hook = new SentinelHook{salt: salt}(IPoolManager(POOL_MANAGER), AAVE_POOL, maintainer);
        assertEq(address(hook), expectedAddress);

        console.log("Sentinel Hook deployed at:", address(hook));

        // Set up pool keys
        ethUsdcKey = PoolKey({
            currency0: Currency.wrap(WETH),
            currency1: Currency.wrap(USDC),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        linkUsdcKey = PoolKey({
            currency0: Currency.wrap(LINK),
            currency1: Currency.wrap(USDC),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        ethUsdcPoolId = ethUsdcKey.toId();
        linkUsdcPoolId = linkUsdcKey.toId();
    }

    /*//////////////////////////////////////////////////////////////
                        DEPLOYMENT TESTS
    //////////////////////////////////////////////////////////////*/

    function testDeployment() public view {
        assertEq(address(hook.aavePool()), AAVE_POOL);
        assertEq(hook.maintainer(), maintainer);
        assertEq(hook.owner(), owner);
        assertEq(hook.getTotalPools(), 0);
    }

    function testMultiPoolInitialization() public {
        // Initialize ETH/USDC pool
        hook.initializePool(
            ethUsdcKey,
            ETH_USD_FEED,
            Currency.wrap(USDC),
            AUSDC,
            500, // 5% max deviation
            -887220,
            887220
        );

        // Initialize LINK/USDC pool
        hook.initializePool(
            linkUsdcKey,
            LINK_USD_FEED,
            Currency.wrap(USDC),
            AUSDC,
            800, // 8% max deviation (more volatile)
            -276324,
            276324
        );

        // Verify both pools are tracked
        assertEq(hook.getTotalPools(), 2);

        // Verify pool states are isolated
        SentinelHook.PoolState memory ethState = hook.getPoolState(ethUsdcPoolId);
        SentinelHook.PoolState memory linkState = hook.getPoolState(linkUsdcPoolId);

        assertTrue(ethState.isInitialized);
        assertTrue(linkState.isInitialized);
        assertEq(ethState.priceFeed, ETH_USD_FEED);
        assertEq(linkState.priceFeed, LINK_USD_FEED);
        assertEq(ethState.maxDeviationBps, 500);
        assertEq(linkState.maxDeviationBps, 800);
    }

    function testCannotInitializePoolTwice() public {
        // Initialize first time
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, Currency.wrap(USDC), AUSDC, 500, -887220, 887220);

        // Try to initialize again - should revert
        vm.expectRevert(SentinelHook.PoolAlreadyInitialized.selector);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, Currency.wrap(USDC), AUSDC, 500, -887220, 887220);
    }

    function testOnlyOwnerCanInitializePool() public {
        vm.prank(user);
        vm.expectRevert(SentinelHook.Unauthorized.selector);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, Currency.wrap(USDC), AUSDC, 500, -887220, 887220);
    }

    function testInvalidYieldCurrency() public {
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(WETH),
            currency1: Currency.wrap(USDC),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        // Try to set LINK as yield currency for WETH/USDC pool
        vm.expectRevert(SentinelHook.InvalidYieldCurrency.selector);
        hook.initializePool(
            key,
            ETH_USD_FEED,
            Currency.wrap(LINK), // Invalid - not in pool
            AUSDC,
            500,
            -887220,
            887220
        );
    }

    /*//////////////////////////////////////////////////////////////
                        ORACLE TESTS
    //////////////////////////////////////////////////////////////*/

    function testOracleLib() public view {
        // Test that we can read from the oracle
        uint256 price = OracleLib.getOraclePrice(AggregatorV3Interface(ETH_USD_FEED));
        console.log("Current ETH/USD price:", price);

        assertTrue(price > 0, "Price should be positive");
        assertTrue(price < 100000e18, "Price should be reasonable");
    }

    /*//////////////////////////////////////////////////////////////
                    YIELD ROUTER TESTS
    //////////////////////////////////////////////////////////////*/

    function testYieldRouterCalculations() public pure {
        uint256 totalBalance = 100000e18; // 100k
        int24 tickLower = -1000;
        int24 tickUpper = 1000;
        int24 currentTick = 0;
        uint256 volatility = 500; // 5%

        (uint256 activeAmount, int256 idleAmount) =
            YieldRouter.calculateIdealRatio(totalBalance, tickLower, tickUpper, currentTick, volatility);

        console.log("Active amount:", activeAmount);
        console.log("Idle amount:", uint256(idleAmount));

        assertTrue(activeAmount > 0, "Active amount should be positive");
        assertTrue(activeAmount <= totalBalance, "Active amount should not exceed total");
        assertTrue(idleAmount >= 0, "Idle amount should be non-negative");
    }

    /*//////////////////////////////////////////////////////////////
                    MAINTAIN ACCESS CONTROL TESTS
    //////////////////////////////////////////////////////////////*/

    function testMaintainOnlyByMaintainer() public {
        // Initialize pool first
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, Currency.wrap(USDC), AUSDC, 500, -887220, 887220);

        // Test that only maintainer can call maintain()
        vm.prank(user);
        vm.expectRevert(SentinelHook.Unauthorized.selector);
        hook.maintain(ethUsdcPoolId, -1000, 1000, 500);
    }

    function testMaintainRequiresInitializedPool() public {
        // Try to maintain uninitialized pool
        vm.prank(maintainer);
        vm.expectRevert(SentinelHook.PoolNotInitialized.selector);
        hook.maintain(ethUsdcPoolId, -1000, 1000, 500);
    }

    function testMaintainInvalidRange() public {
        // Initialize pool first
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, Currency.wrap(USDC), AUSDC, 500, -887220, 887220);

        // Test that invalid ranges are rejected
        vm.prank(maintainer);
        vm.expectRevert(SentinelHook.InvalidRange.selector);
        hook.maintain(ethUsdcPoolId, 1000, -1000, 500); // Lower > Upper
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN TESTS
    //////////////////////////////////////////////////////////////*/

    function testSetMaintainer() public {
        address newMaintainer = makeAddr("newMaintainer");

        hook.setMaintainer(newMaintainer);
        assertEq(hook.maintainer(), newMaintainer);
    }

    function testOnlyOwnerCanSetMaintainer() public {
        address newMaintainer = makeAddr("newMaintainer");

        vm.prank(user);
        vm.expectRevert(SentinelHook.Unauthorized.selector);
        hook.setMaintainer(newMaintainer);
    }

    function testTransferOwnership() public {
        address newOwner = makeAddr("newOwner");

        hook.transferOwnership(newOwner);
        assertEq(hook.owner(), newOwner);
    }

    /*//////////////////////////////////////////////////////////////
                    VIEW FUNCTION TESTS
    //////////////////////////////////////////////////////////////*/

    function testGetPoolByIndex() public {
        // Initialize two pools
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, Currency.wrap(USDC), AUSDC, 500, -887220, 887220);

        hook.initializePool(linkUsdcKey, LINK_USD_FEED, Currency.wrap(USDC), AUSDC, 800, -276324, 276324);

        // Verify pool retrieval by index
        PoolId pool0 = hook.getPoolByIndex(0);
        PoolId pool1 = hook.getPoolByIndex(1);

        assertTrue(PoolId.unwrap(pool0) == PoolId.unwrap(ethUsdcPoolId));
        assertTrue(PoolId.unwrap(pool1) == PoolId.unwrap(linkUsdcPoolId));
    }

    function testSharePriceInitialValue() public {
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, Currency.wrap(USDC), AUSDC, 500, -887220, 887220);

        // With no deposits, share price should be 1e18
        uint256 sharePrice = hook.getSharePrice(ethUsdcPoolId);
        assertEq(sharePrice, 1e18);
    }

    function testLPCountInitialValue() public {
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, Currency.wrap(USDC), AUSDC, 500, -887220, 887220);

        // Initially no LPs
        uint256 lpCount = hook.getLPCount(ethUsdcPoolId);
        assertEq(lpCount, 0);
    }

    /*//////////////////////////////////////////////////////////////
                    MULTI-POOL ISOLATION TESTS
    //////////////////////////////////////////////////////////////*/

    function testPoolStateIsolation() public {
        // Initialize two pools with different configurations
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, Currency.wrap(USDC), AUSDC, 500, -887220, 887220);

        hook.initializePool(linkUsdcKey, LINK_USD_FEED, Currency.wrap(USDC), AUSDC, 800, -276324, 276324);

        // Get states
        SentinelHook.PoolState memory ethState = hook.getPoolState(ethUsdcPoolId);
        SentinelHook.PoolState memory linkState = hook.getPoolState(linkUsdcPoolId);

        // Verify isolation
        assertTrue(ethState.activeTickLower != linkState.activeTickLower);
        assertTrue(ethState.maxDeviationBps != linkState.maxDeviationBps);
        assertTrue(ethState.priceFeed != linkState.priceFeed);

        // Both use USDC for yield
        assertTrue(Currency.unwrap(ethState.yieldCurrency) == Currency.unwrap(linkState.yieldCurrency));
    }
}

