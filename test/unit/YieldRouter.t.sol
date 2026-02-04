// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {YieldRouter} from "../../src/libraries/YieldRouter.sol";

contract YieldRouterUnitTest is Test {
    function callCalculateIdealRatio(
        uint256 totalBalance,
        int24 newTickLower,
        int24 newTickUpper,
        int24 currentTick,
        uint256 volatility
    ) external pure returns (uint256 activeAmount, int256 idleAmount) {
        return YieldRouter.calculateIdealRatio(totalBalance, newTickLower, newTickUpper, currentTick, volatility);
    }

    function testCalculateIdealRatio_MinLiquidityReverts() public {
        vm.expectRevert(YieldRouter.InsufficientLiquidity.selector);
        this.callCalculateIdealRatio(YieldRouter.MIN_ACTIVE_LIQUIDITY - 1, -100, 100, 0, 500);
    }

    function testCalculateIdealRatio_InvalidRangeReverts() public {
        vm.expectRevert("Invalid range");
        this.callCalculateIdealRatio(YieldRouter.MIN_ACTIVE_LIQUIDITY, 100, -100, 0, 500);
    }

    function testCalculateIdealRatio_RespectsMinActive() public pure {
        uint256 totalBalance = YieldRouter.MIN_ACTIVE_LIQUIDITY + 10e18;
        (uint256 activeAmount, int256 idleAmount) = YieldRouter.calculateIdealRatio(
            totalBalance,
            -200,
            200,
            0,
            500
        );

        assertTrue(activeAmount >= YieldRouter.MIN_ACTIVE_LIQUIDITY);
        assertTrue(int256(totalBalance) - int256(activeAmount) == idleAmount || idleAmount == 0);
    }

    function testCalculateYieldWithdrawal_NoWithdrawal() public pure {
        uint256 withdrawAmount = YieldRouter.calculateYieldWithdrawal(1000e18, 100e18, 200e18);
        assertEq(withdrawAmount, 0);
    }

    function testCalculateYieldWithdrawal_WithdrawShortfall() public pure {
        uint256 withdrawAmount = YieldRouter.calculateYieldWithdrawal(1000e18, 300e18, 100e18);
        assertEq(withdrawAmount, 200e18);
    }

    function testCalculateYieldWithdrawal_CappedAtBalance() public pure {
        uint256 withdrawAmount = YieldRouter.calculateYieldWithdrawal(50e18, 300e18, 100e18);
        assertEq(withdrawAmount, 50e18);
    }
}
