// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {YieldRouter} from "../../src/libraries/YieldRouter.sol";

contract YieldRouterHandler {
    uint256 public lastTotalBalance;
    uint256 public lastActive;
    int256 public lastIdle;
    uint256 public lastYieldBalance;
    uint256 public lastWithdraw;

    function callCalculateIdealRatio(
        uint256 totalBalance,
        int24 newTickLower,
        int24 newTickUpper,
        int24 currentTick,
        uint256 volatility
    ) external {
        if (totalBalance < YieldRouter.MIN_ACTIVE_LIQUIDITY) return;
        if (newTickLower >= newTickUpper) return;

        (uint256 activeAmount, int256 idleAmount) =
            YieldRouter.calculateIdealRatio(totalBalance, newTickLower, newTickUpper, currentTick, volatility);
        lastTotalBalance = totalBalance;
        lastActive = activeAmount;
        lastIdle = idleAmount;
    }

    function callCalculateYieldWithdrawal(uint256 currentYieldBalance, uint256 requiredActive, uint256 availableBalance)
        external
    {
        lastYieldBalance = currentYieldBalance;
        lastWithdraw = YieldRouter.calculateYieldWithdrawal(currentYieldBalance, requiredActive, availableBalance);
    }
}

contract YieldRouterInvariantTest is StdInvariant {
    YieldRouterHandler handler;

    function setUp() public {
        handler = new YieldRouterHandler();
        targetContract(address(handler));
    }

    function invariant_withdrawalNeverExceedsBalance() public view {
        assert(handler.lastWithdraw() <= handler.lastYieldBalance());
    }

    function invariant_activeNotAboveTotal() public view {
        if (handler.lastTotalBalance() > 0) {
            assert(handler.lastActive() <= handler.lastTotalBalance());
        }
    }
}
