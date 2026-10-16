// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {YieldRouter} from "../../src/libraries/YieldRouter.sol";

contract YieldRouterFuzzTest is Test {
    function testFuzz_CalculateIdealRatio(uint256 totalBalance, int24 lower, int24 upper, int24 current, uint256 vol)
        public
        pure
    {
        totalBalance = bound(totalBalance, YieldRouter.MIN_ACTIVE_LIQUIDITY, 1_000_000e18);
        vol = bound(vol, 0, 20_000);

        int256 l = bound(int256(lower), -500_000, 500_000);
        int256 u = bound(int256(upper), -500_000, 500_000);
        if (u <= l) return;

        int24 lowerB = int24(l);
        int24 upperB = int24(u);
        int24 currentB = int24(bound(int256(current), l, u));

        (uint256 activeAmount, int256 idleAmount) =
            YieldRouter.calculateIdealRatio(totalBalance, lowerB, upperB, currentB, vol);

        assertTrue(activeAmount <= totalBalance);
        if (idleAmount == 0) {
            assertEq(activeAmount, totalBalance);
        } else {
            assertEq(uint256(idleAmount), totalBalance - activeAmount);
        }
    }

    function testFuzz_CalculateYieldWithdrawal(uint256 yieldBal, uint256 required, uint256 available) public pure {
        yieldBal = bound(yieldBal, 0, 1_000_000e18);
        required = bound(required, 0, 1_000_000e18);
        available = bound(available, 0, 1_000_000e18);

        uint256 withdrawAmount = YieldRouter.calculateYieldWithdrawal(yieldBal, required, available);

        if (available >= required) {
            assertEq(withdrawAmount, 0);
        } else {
            uint256 shortfall = required - available;
            if (shortfall > yieldBal) {
                assertEq(withdrawAmount, yieldBal);
            } else {
                assertEq(withdrawAmount, shortfall);
            }
        }
    }
}
