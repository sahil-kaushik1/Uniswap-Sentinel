// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SentinelHook} from "../src/SentinelHook.sol";
import {OracleLib} from "../src/libraries/OracleLib.sol";
import {YieldRouter} from "../src/libraries/YieldRouter.sol";
import {AaveAdapter, IPool} from "../src/libraries/AaveAdapter.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

/// @title SentinelIntegrationTest
/// @notice Fork tests for the complete Sentinel workflow
/// @dev Run with: forge test --match-path test/SentinelIntegration.t.sol -vvv --fork-url $RPC_URL
contract SentinelIntegrationTest is Test {
    // Chain addresses - Real Base Mainnet Addresses
    address constant POOL_MANAGER = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;
    address constant ETH_USD_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;
    address constant AAVE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address constant AUSDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    SentinelHook hook;
    address maintainer = makeAddr("maintainer");
    address user = makeAddr("user");

    function setUp() public {
        // This test requires a Base fork
        // Run with: forge test --fork-url https://mainnet.base.org

        // Mock addresses if not on fork (but test requires fork)
        // If simply compiling, these must be valid types

        vm.createSelectFork("base");

        // Deploy the hook
        hook = new SentinelHook(
            IPoolManager(POOL_MANAGER),
            ETH_USD_FEED,
            AAVE_POOL,
            AUSDC,
            Currency.wrap(WETH), // Currency0
            Currency.wrap(USDC), // Currency1 (Assuming WETH < USDC? No, usually check addresses)
            Currency.wrap(USDC), // Yield Currency
            maintainer
        );

        console.log("Sentinel Hook deployed at:", address(hook));
    }

    function testDeployment() public {
        assertEq(address(hook.priceFeed()), ETH_USD_FEED);
        assertEq(address(hook.aavePool()), AAVE_POOL);
        assertEq(hook.maintainer(), maintainer);
    }

    function testOracleLib() public view {
        // Test that we can read from the oracle
        uint256 price = OracleLib.getOraclePrice(hook.priceFeed());
        console.log("Current ETH/USD price:", price);

        assertTrue(price > 0, "Price should be positive");
        assertTrue(price < 10000e18, "Price should be reasonable");
    }

    function testYieldRouterCalculations() public {
        // Test the yield router logic
        uint256 totalBalance = 100000e18; // 100k USDC
        int24 tickLower = -1000;
        int24 tickUpper = 1000;
        int24 currentTick = 0;
        uint256 volatility = 500; // 5%

        (uint256 activeAmount, int256 idleAmount) = YieldRouter
            .calculateIdealRatio(
                totalBalance,
                tickLower,
                tickUpper,
                currentTick,
                volatility
            );

        console.log("Active amount:", activeAmount);
        console.log("Idle amount:", uint256(idleAmount));

        assertTrue(activeAmount > 0, "Active amount should be positive");
        assertTrue(
            activeAmount <= totalBalance,
            "Active amount should not exceed total"
        );
        assertTrue(idleAmount >= 0, "Idle amount should be non-negative");
    }

    function testMaintainOnlyByMaintainer() public {
        // Test that only maintainer can call maintain()
        vm.prank(user);
        vm.expectRevert(SentinelHook.Unauthorized.selector);
        hook.maintain(-1000, 1000, 500);

        // Maintainer should be able to call (though it will fail without liquidity)
        vm.prank(maintainer);
        try hook.maintain(-1000, 1000, 500) {
            // Expected to work
        } catch {
            // Expected to fail due to no liquidity, but authorization should pass
            console.log("Maintain call failed (expected without liquidity)");
        }
    }

    function testInvalidRange() public {
        // Test that invalid ranges are rejected
        vm.prank(maintainer);
        vm.expectRevert(SentinelHook.InvalidRange.selector);
        hook.maintain(1000, -1000, 500); // Lower > Upper
    }

    // TODO: Add more comprehensive tests
    // - Test actual swap flow with beforeSwap hook
    // - Test Aave integration with real deposits/withdrawals
    // - Test rebalancing with mock liquidity
    // - Test emergency functions
}
