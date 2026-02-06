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
import {OracleLib} from "../../src/libraries/OracleLib.sol";
import {YieldRouter} from "../../src/libraries/YieldRouter.sol";
import {AaveAdapter} from "../../src/libraries/AaveAdapter.sol";

contract SentinelHookUnitTest is Test {
    using PoolIdLibrary for PoolKey;

    MockPoolManager poolManager;
    MockAavePool aavePool;
    MockERC20 token0;
    MockERC20 token1;
    address aToken0;
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
        aToken0 = aavePool.initReserve(address(token0), "aToken0", "aTK0");
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

        hook.initializePool(key, address(oracle), aToken0, address(0), 500, -120, 120);
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
        hook.initializePool(otherKey, address(oracle), aToken0, address(0), 500, -120, 120);
    }

    function testInitializePool_StoresATokens() public {
        SentinelHook.PoolState memory state = hook.getPoolState(poolId);
        assertEq(state.aToken0, aToken0);
        assertEq(state.aToken1, address(0));
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
        address aYieldToken = aavePool.initReserve(address(yieldToken), "aYield", "aYLD");

        PoolKey memory yieldKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(yieldToken)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        PoolId yieldPoolId = yieldKey.toId();

        poolManager.setSlot0(yieldPoolId, TickMath.getSqrtPriceAtTick(0), 0, 0, 3000);

        hook.initializePool(yieldKey, address(oracle), address(0), aYieldToken, 500, -120, 120);

        yieldToken.mint(address(hook), 100e18);
        hook.setIdleBalances(yieldPoolId, 0, 100e18);
        hook.exposedDistributeIdleToAave(yieldPoolId, Currency.wrap(address(yieldToken)), aYieldToken, 100e18);

        hook.exposedEnsureSufficientIdle(yieldPoolId, 0, 50e18);
        assertTrue(aavePool.withdrawCalled());
    }

    function testBeforeSwap_EmitsTickCrossed() public {
        poolManager.setSlot0(poolId, TickMath.getSqrtPriceAtTick(0), 200, 0, 3000);
        oracle.setRoundData(1, 1e8, block.timestamp, block.timestamp, 1);

        vm.expectEmit(true, true, true, true);
        emit SentinelHook.TickCrossed(poolId, -120, 120, 200);

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0});
        poolManager.callBeforeSwap(key, params);
    }

    function testBeforeSwap_RevertsOnPriceDeviation() public {
        // pool price at tick 0 => 1.0, oracle set to 100 => big deviation
        oracle.setRoundData(1, 100e8, block.timestamp, block.timestamp, 1);

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0});
        vm.expectRevert(OracleLib.PriceDeviationTooHigh.selector);
        poolManager.callBeforeSwap(key, params);
    }

    function testBeforeSwap_RevertsOnStaleOracle() public {
        uint256 stale = block.timestamp - (OracleLib.MAX_ORACLE_STALENESS + 1);
        oracle.setRoundData(1, 1e8, stale, stale, 1);

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0});
        vm.expectRevert(OracleLib.StaleOracleData.selector);
        poolManager.callBeforeSwap(key, params);
    }

    function testBeforeSwap_RevertsOnInvalidOraclePrice() public {
        oracle.setRoundData(1, 0, block.timestamp, block.timestamp, 1);

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0});
        vm.expectRevert(OracleLib.InvalidOraclePrice.selector);
        poolManager.callBeforeSwap(key, params);
    }

    function testBeforeSwap_SucceedsWhenPriceMatchesOracle() public {
        oracle.setRoundData(1, 1e8, block.timestamp, block.timestamp, 1);

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0});
        poolManager.callBeforeSwap(key, params);
    }

    function testBeforeSwap_RespectsDecimalsScaling() public {
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        PoolKey memory decKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(usdc)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        PoolId decPoolId = decKey.toId();

        poolManager.setSlot0(decPoolId, TickMath.getSqrtPriceAtTick(0), 0, 0, 3000);
        hook.initializePool(decKey, address(oracle), address(0), address(0), 500, -120, 120);

        // Oracle price = 1.0 (1e8) should match pool price after decimals scaling
        oracle.setRoundData(1, 1e8, block.timestamp, block.timestamp, 1);

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0});
        poolManager.callBeforeSwap(decKey, params);
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

    function testBeforeSwap_UpperBoundTickEmits() public {
        poolManager.setSlot0(poolId, TickMath.getSqrtPriceAtTick(0), 120, 0, 3000);
        oracle.setRoundData(1, 1e8, block.timestamp, block.timestamp, 1);

        vm.expectEmit(true, true, true, true);
        emit SentinelHook.TickCrossed(poolId, -120, 120, 120);

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0});
        poolManager.callBeforeSwap(key, params);
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
        token0.mint(address(hook), 500e18);
        token1.mint(address(hook), 500e18);
        hook.setIdleBalances(poolId, 500e18, 500e18);

        hook.exposedDistributeIdleToAave(poolId, Currency.wrap(address(token0)), aToken0, 200e18);

        token0.mint(address(poolManager), 100e18);
        token1.mint(address(hook), 200e18);

        poolManager.setCurrencyDelta(address(hook), Currency.wrap(address(token0)), int256(50));
        poolManager.setCurrencyDelta(address(hook), Currency.wrap(address(token1)), -int256(25));

        hook.exposedHandleMaintain(poolId, -180, 180, 500);

        SentinelHook.PoolState memory state = hook.getPoolState(poolId);
        assertEq(state.activeTickLower, -180);
        assertEq(state.activeTickUpper, 180);
    }

    function testHandleMaintain_RevertsWhenInsufficientTotalBalance() public {
        hook.setIdleBalances(poolId, 1e18, 0);

        vm.expectRevert(YieldRouter.InsufficientLiquidity.selector);
        hook.exposedHandleMaintain(poolId, -120, 120, 500);
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
        token0.mint(address(hook), 5e18);
        hook.setIdleBalances(poolId, 5e18, 0);
        hook.exposedDistributeIdleToAave(poolId, Currency.wrap(address(token0)), aToken0, 5e18);
        hook.emergencyWithdrawFromAave(poolId);
        assertTrue(aavePool.withdrawCalled());
    }

    function testEmergencyWithdrawFromAave_UpdatesAccounting() public {
        token0.mint(address(hook), 5e18);
        hook.setIdleBalances(poolId, 5e18, 0);
        hook.exposedDistributeIdleToAave(poolId, Currency.wrap(address(token0)), aToken0, 5e18);

        SentinelHook.PoolState memory beforeState = hook.getPoolState(poolId);
        hook.emergencyWithdrawFromAave(poolId);
        SentinelHook.PoolState memory afterState = hook.getPoolState(poolId);

        assertEq(beforeState.aave0, 5e18);
        assertEq(afterState.aave0, 0);
        assertTrue(afterState.idle0 >= beforeState.idle0);
    }

    function testDistributeIdleToAave_RevertsOnSupplyFailure() public {
        token0.mint(address(hook), 5e18);
        hook.setIdleBalances(poolId, 5e18, 0);

        aavePool.setRevertSupply(true);

        vm.expectRevert(AaveAdapter.AaveDepositFailed.selector);
        hook.exposedDistributeIdleToAave(poolId, Currency.wrap(address(token0)), aToken0, 5e18);
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

    function testDepositTracksIdleBalances() public {
        token0.mint(lp, 3e18);
        token1.mint(lp, 4e18);

        vm.startPrank(lp);
        token0.approve(address(hook), 3e18);
        token1.approve(address(hook), 4e18);
        hook.depositLiquidity(key, 3e18, 4e18);
        vm.stopPrank();

        SentinelHook.PoolState memory state = hook.getPoolState(poolId);
        assertEq(state.idle0, 3e18);
        assertEq(state.idle1, 4e18);
        assertEq(state.activeLiquidity, 0);
    }

    function testDeposit_NativeCurrency() public {
        PoolKey memory nativeKey = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(token1)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        PoolId nativePoolId = nativeKey.toId();

        poolManager.setSlot0(nativePoolId, TickMath.getSqrtPriceAtTick(0), 0, 0, 3000);
        hook.initializePool(nativeKey, address(oracle), address(0), address(0), 500, -120, 120);

        token1.mint(lp, 2e18);

        vm.startPrank(lp);
        token1.approve(address(hook), 2e18);
        hook.depositLiquidity{value: 1e18}(nativeKey, 1e18, 2e18);
        vm.stopPrank();

        SentinelHook.PoolState memory state = hook.getPoolState(nativePoolId);
        assertEq(state.idle0, 1e18);
        assertEq(state.idle1, 2e18);
    }

    function testPerPoolIdleIsolation_SharePriceUnaffectedAcrossPools() public {
        MockERC20 token2 = new MockERC20("Token2", "TK2", 18);
        PoolKey memory otherKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token2)),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(hook))
        });
        PoolId otherPoolId = otherKey.toId();

        poolManager.setSlot0(otherPoolId, TickMath.getSqrtPriceAtTick(0), 0, 0, 500);
        hook.initializePool(otherKey, address(oracle), address(0), address(0), 500, -120, 120);

        token0.mint(lp, 10e18);
        token2.mint(lp, 10e18);
        vm.startPrank(lp);
        token0.approve(address(hook), 10e18);
        token2.approve(address(hook), 10e18);
        hook.depositLiquidity(otherKey, 10e18, 10e18);
        vm.stopPrank();

        uint256 priceBefore = hook.getSharePrice(otherPoolId);

        token0.mint(address(this), 5e18);
        token1.mint(address(this), 5e18);
        token0.approve(address(hook), 5e18);
        token1.approve(address(hook), 5e18);
        hook.depositLiquidity(key, 5e18, 5e18);

        uint256 priceAfter = hook.getSharePrice(otherPoolId);
        assertEq(priceAfter, priceBefore);
    }

    function testWithdraw_DoesNotUseOtherPoolIdle() public {
        MockERC20 token2 = new MockERC20("Token2", "TK2", 18);
        PoolKey memory otherKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token2)),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(hook))
        });
        PoolId otherPoolId = otherKey.toId();

        poolManager.setSlot0(otherPoolId, TickMath.getSqrtPriceAtTick(0), 0, 0, 500);
        hook.initializePool(otherKey, address(oracle), address(0), address(0), 500, -120, 120);

        token0.mint(lp, 10e18);
        token1.mint(lp, 10e18);
        token2.mint(lp, 2e18);

        vm.startPrank(lp);
        token0.approve(address(hook), 10e18);
        token1.approve(address(hook), 10e18);
        token2.approve(address(hook), 2e18);
        hook.depositLiquidity(key, 10e18, 10e18);
        uint256 otherShares = hook.depositLiquidity(otherKey, 2e18, 2e18);
        vm.stopPrank();

        vm.prank(lp);
        (uint256 amt0, uint256 amt1) = hook.withdrawLiquidity(otherKey, otherShares);

        assertEq(amt0, 2e18);
        assertEq(amt1, 2e18);
        assertEq(hook.lpShares(otherPoolId, lp), 0);
    }

    function testWithdraw_UsesPoolKeyFromState() public {
        MockERC20 token2 = new MockERC20("Token2", "TK2", 18);
        PoolKey memory otherKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token2)),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(hook))
        });
        PoolId otherPoolId = otherKey.toId();

        poolManager.setSlot0(otherPoolId, TickMath.getSqrtPriceAtTick(0), 0, 0, 500);
        hook.initializePool(otherKey, address(oracle), address(0), address(0), 500, -120, 120);

        hook.setActiveLiquidity(otherPoolId, 1000);
        hook.setTotalShares(otherPoolId, 100);
        hook.setLPShares(otherPoolId, lp, 100);

        vm.prank(lp);
        hook.withdrawLiquidity(otherKey, 100);

        assertEq(poolManager.lastFee(), 500);
        assertEq(poolManager.lastTickSpacing(), 10);
        assertTrue(poolManager.lastLiquidityDelta() < 0);
    }

    function testMaintain_DoesNotAffectOtherPoolIdle() public {
        MockERC20 token2 = new MockERC20("Token2", "TK2", 18);
        PoolKey memory otherKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token2)),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(hook))
        });
        PoolId otherPoolId = otherKey.toId();

        poolManager.setSlot0(otherPoolId, TickMath.getSqrtPriceAtTick(0), 0, 0, 500);
        hook.initializePool(otherKey, address(oracle), address(0), address(0), 500, -120, 120);

        hook.setIdleBalances(otherPoolId, 7e18, 0);
        hook.setIdleBalances(poolId, 10e18, 10e18);

        hook.exposedHandleMaintain(poolId, -120, 120, 500);

        SentinelHook.PoolState memory state = hook.getPoolState(otherPoolId);
        assertEq(state.idle0, 7e18);
        assertEq(state.idle1, 0);
    }

    function testGetPoolKey_UsesStoredFeeAndTickSpacing() public {
        MockERC20 token2 = new MockERC20("Token2", "TK2", 18);
        PoolKey memory otherKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token2)),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(hook))
        });
        PoolId otherPoolId = otherKey.toId();

        poolManager.setSlot0(otherPoolId, TickMath.getSqrtPriceAtTick(0), 0, 0, 500);
        hook.initializePool(otherKey, address(oracle), address(0), address(0), 500, -120, 120);

        hook.setActiveLiquidity(otherPoolId, 1000);
        hook.setTicks(otherPoolId, -120, 120);

        hook.exposedHandleMaintain(otherPoolId, -100, 100, 500);

        assertEq(poolManager.lastFee(), 500);
        assertEq(poolManager.lastTickSpacing(), 10);
    }
}
