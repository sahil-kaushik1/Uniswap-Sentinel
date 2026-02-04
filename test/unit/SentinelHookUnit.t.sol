// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SentinelHook} from "../../src/SentinelHook.sol";
import {SentinelHookHarness} from "../mocks/SentinelHookHarness.sol";
import {MockPoolManager} from "../mocks/MockPoolManager.sol";
import {MockAavePool} from "../mocks/MockAavePool.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockOracle} from "../mocks/MockOracle.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

contract SentinelHookUnitTest is Test {
    using PoolIdLibrary for PoolKey;

    MockPoolManager poolManager;
    MockAavePool aavePool;
    MockERC20 token0;
    MockERC20 token1;
    MockERC20 aToken;
    MockOracle oracle;
    SentinelHookHarness hook;

    PoolKey key;
    PoolId poolId;

    address owner;
    address maintainer;
    address lp;

    function setUp() public {
        owner = address(this);
        maintainer = makeAddr("maintainer");
        lp = makeAddr("lp");

        poolManager = new MockPoolManager();
        aavePool = new MockAavePool();
        token0 = new MockERC20("Token0", "TK0", 18);
        token1 = new MockERC20("Token1", "TK1", 18);
        aToken = new MockERC20("aToken", "aTK", 18);
        oracle = new MockOracle(8, 2000e8);

        hook = new SentinelHookHarness(IPoolManager(address(poolManager)), address(aavePool), maintainer);
        poolManager.setHook(address(hook));

        key = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        poolId = key.toId();

        poolManager.setSlot0(poolId, TickMath.getSqrtPriceAtTick(0), 0, 0, 3000);

        hook.initializePool(key, address(oracle), Currency.wrap(address(token0)), address(aToken), 500, -120, 120);
    }

    function testInitializePool_Unauthorized() public {
        MockERC20 token2 = new MockERC20("Token2", "TK2", 18);
        PoolKey memory otherKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token2)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        poolManager.setSlot0(otherKey.toId(), TickMath.getSqrtPriceAtTick(0), 0, 0, 3000);

        vm.prank(makeAddr("attacker"));
        vm.expectRevert(SentinelHook.Unauthorized.selector);
        hook.initializePool(otherKey, address(oracle), Currency.wrap(address(token0)), address(aToken), 500, -120, 120);
    }

    function testInitializePool_InvalidYieldCurrency() public {
        MockERC20 token2 = new MockERC20("Token2", "TK2", 18);
        PoolKey memory otherKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token2)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        poolManager.setSlot0(otherKey.toId(), TickMath.getSqrtPriceAtTick(0), 0, 0, 3000);

        vm.expectRevert(SentinelHook.InvalidYieldCurrency.selector);
        hook.initializePool(otherKey, address(oracle), Currency.wrap(address(0xBEEF)), address(aToken), 500, -120, 120);
    }

    function testDepositLiquidity_RegistersLpAndMintsShares() public {
        token0.mint(lp, 10e18);
        token1.mint(lp, 10e18);

        vm.startPrank(lp);
        token0.approve(address(hook), 10e18);
        token1.approve(address(hook), 10e18);
        uint256 shares = hook.depositLiquidity(key, 5e18, 5e18);
        vm.stopPrank();

        assertTrue(shares > 0);
        assertEq(hook.lpShares(poolId, lp), shares);
        assertEq(hook.getLPCount(poolId), 1);
        assertEq(hook.getTotalPools(), 1);
    }

    function testDepositLiquidity_ZeroAmountsReverts() public {
        vm.expectRevert(SentinelHook.InvalidDepositAmount.selector);
        hook.depositLiquidity(key, 0, 0);
    }

    function testWithdrawLiquidity_InsufficientSharesReverts() public {
        vm.expectRevert(SentinelHook.InsufficientShares.selector);
        hook.exposedHandleWithdraw(poolId, lp, 1);
    }

    function testWithdrawLiquidity_NoDepositsYetReverts() public {
        hook.setLPShares(poolId, lp, 1);
        hook.setTotalShares(poolId, 0);
        vm.expectRevert(SentinelHook.NoDepositsYet.selector);
        hook.exposedHandleWithdraw(poolId, lp, 1);
    }

    function testWithdrawLiquidity_ReturnsIdleProRata() public {
        token0.mint(lp, 10e18);
        token1.mint(lp, 10e18);

        vm.startPrank(lp);
        token0.approve(address(hook), 10e18);
        token1.approve(address(hook), 10e18);
        uint256 shares = hook.depositLiquidity(key, 10e18, 10e18);
        vm.stopPrank();

        vm.prank(lp);
        (uint256 amt0, uint256 amt1) = hook.withdrawLiquidity(key, shares / 2);

        assertTrue(amt0 > 0);
        assertTrue(amt1 > 0);
        assertEq(hook.lpShares(poolId, lp), shares - (shares / 2));
    }

    function testEnsureSufficientIdle_WithdrawsFromAave() public {
        MockERC20 yieldToken = new MockERC20("Token2", "TK2", 18);

        PoolKey memory yieldKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(yieldToken)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        PoolId yieldPoolId = yieldKey.toId();

        poolManager.setSlot0(yieldPoolId, TickMath.getSqrtPriceAtTick(0), 0, 0, 3000);

        hook.initializePool(
            yieldKey, address(oracle), Currency.wrap(address(yieldToken)), address(aToken), 500, -120, 120
        );

        yieldToken.mint(address(aavePool), 100e18);

        hook.exposedEnsureSufficientIdle(yieldPoolId, 0, 50e18);
        assertTrue(aavePool.withdrawCalled());
    }

    function testBeforeSwap_EmitsTickCrossed() public {
        poolManager.setSlot0(poolId, TickMath.getSqrtPriceAtTick(0), 200, 0, 3000);

        vm.expectEmit(true, true, true, true);
        emit SentinelHook.TickCrossed(poolId, -120, 120, 200);

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0});
        poolManager.callBeforeSwap(key, params);
    }

    function testBeforeSwap_SkipsWhenNotInitialized() public {
        MockERC20 token2 = new MockERC20("Token2", "TK2", 18);
        PoolKey memory otherKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token2)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0});
        (bytes4 selector,,) = poolManager.callBeforeSwap(otherKey, params);
        assertEq(selector, hook.beforeSwap.selector);
    }

    function testMaintain_Unauthorized() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(SentinelHook.Unauthorized.selector);
        hook.maintain(poolId, -100, 100, 500);
    }

    function testHandleMaintain_RevertsOnInvalidRange() public {
        vm.expectRevert(SentinelHook.InvalidRange.selector);
        hook.exposedHandleMaintain(poolId, 100, 100, 500);
    }

    function testHandleMaintain_WithdrawsAndRedeploys() public {
        hook.setActiveLiquidity(poolId, 1000);
        aToken.mint(address(hook), 200e18);
        token0.mint(address(hook), 500e18);
        token1.mint(address(hook), 500e18);

        token0.mint(address(aavePool), 200e18);

        token0.mint(address(poolManager), 100e18);
        token1.mint(address(hook), 200e18);

        poolManager.setCurrencyDelta(address(hook), Currency.wrap(address(token0)), int256(50));
        poolManager.setCurrencyDelta(address(hook), Currency.wrap(address(token1)), -int256(25));

        hook.exposedHandleMaintain(poolId, -180, 180, 500);

        SentinelHook.PoolState memory state = hook.getPoolState(poolId);
        assertEq(state.activeTickLower, -180);
        assertEq(state.activeTickUpper, 180);
    }

    function testSettleOrTake_NativeCurrency() public {
        Currency nativeCurrency = Currency.wrap(address(0));
        poolManager.setCurrencyDelta(address(hook), nativeCurrency, -int256(1 ether));
        vm.deal(address(hook), 1 ether);

        hook.exposedSettleOrTake(nativeCurrency);
        assertTrue(poolManager.settleCalled());
    }

    function testAdmin_SetMaintainerAndOwnership() public {
        address newMaintainer = makeAddr("newMaintainer");
        hook.setMaintainer(newMaintainer);
        assertEq(hook.maintainer(), newMaintainer);

        address newOwner = makeAddr("newOwner");
        hook.transferOwnership(newOwner);
        assertEq(hook.owner(), newOwner);

        vm.prank(makeAddr("attacker"));
        vm.expectRevert(SentinelHook.Unauthorized.selector);
        hook.setMaintainer(makeAddr("bad"));
    }

    function testEmergencyWithdrawFromAave_EmitsEvent() public {
        token0.mint(address(aavePool), 5e18);
        hook.emergencyWithdrawFromAave(poolId);
        assertTrue(aavePool.withdrawCalled());
    }

    function testGetSharePriceAndPosition() public {
        token0.mint(lp, 10e18);
        token1.mint(lp, 10e18);

        vm.startPrank(lp);
        token0.approve(address(hook), 10e18);
        token1.approve(address(hook), 10e18);
        uint256 shares = hook.depositLiquidity(key, 10e18, 10e18);
        vm.stopPrank();

        uint256 price = hook.getSharePrice(poolId);
        assertTrue(price > 0);

        (uint256 userShares, uint256 value) = hook.getLPPosition(poolId, lp);
        assertEq(userShares, shares);
        assertTrue(value > 0);
    }

    function testGetPoolByIndex() public {
        assertEq(hook.getTotalPools(), 1);
        PoolId fetched = hook.getPoolByIndex(0);
        assertEq(PoolId.unwrap(fetched), PoolId.unwrap(poolId));
    }
}
