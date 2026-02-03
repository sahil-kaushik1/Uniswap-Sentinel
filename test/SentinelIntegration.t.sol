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
    // Chain addresses
    // address constant POOL_MANAGER = ;
    // address constant ETH_USD_FEED = ;
    // address constant AAVE_POOL = ;
    // address constant AUSDC = ;
    // address constant USDC = ;
    
    SentinelHook hook;
    address maintainer = makeAddr("maintainer");
    address user = makeAddr("user");
    
    function setUp() public {
        // This test requires a Base fork
        // Run with: forge test --fork-url https://
        
        vm.createSelectFork("https://");
        
        // Deploy the hook
        hook = new SentinelHook(
            IPoolManager(POOL_MANAGER),
            ETH_USD_FEED,
            AAVE_POOL,
            AUSDC,
            Currency.wrap(USDC),
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
        
        (uint256 activeAmount, int256 idleAmount) = YieldRouter.calculateIdealRatio(
            totalBalance,
            tickLower,
            tickUpper,
            currentTick,
            volatility
        );
        
        console.log("Active amount:", activeAmount);
        console.log("Idle amount:", uint256(idleAmount));
        
        assertTrue(activeAmount > 0, "Active amount should be positive");
        assertTrue(activeAmount <= totalBalance, "Active amount should not exceed total");
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
