// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPool} from "../../src/libraries/AaveAdapter.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

contract MockAavePool is IPool {
    bool public revertSupply;
    bool public revertWithdraw;
    bool public revertIncome;
    uint256 public normalizedIncome;

    bool public supplyCalled;
    bool public withdrawCalled;
    address public lastAsset;
    uint256 public lastAmount;
    address public lastRecipient;

    constructor() {
        normalizedIncome = 1e27;
    }

    function setRevertSupply(bool value) external {
        revertSupply = value;
    }

    function setRevertWithdraw(bool value) external {
        revertWithdraw = value;
    }

    function setRevertIncome(bool value) external {
        revertIncome = value;
    }

    function setNormalizedIncome(uint256 value) external {
        normalizedIncome = value;
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external override {
        if (revertSupply) revert("SUPPLY_FAIL");
        supplyCalled = true;
        lastAsset = asset;
        lastAmount = amount;
        lastRecipient = onBehalfOf;
        if (amount > 0) {
            IERC20(asset).transferFrom(msg.sender, address(this), amount);
        }
    }

    function withdraw(address asset, uint256 amount, address to) external override returns (uint256) {
        if (revertWithdraw) revert("WITHDRAW_FAIL");
        withdrawCalled = true;
        lastAsset = asset;
        lastAmount = amount;
        lastRecipient = to;
        uint256 balance = IERC20(asset).balanceOf(address(this));
        uint256 toSend = amount == type(uint256).max ? balance : (amount > balance ? balance : amount);
        if (toSend > 0) {
            IERC20(asset).transfer(to, toSend);
        }
        return toSend;
    }

    function getReserveNormalizedIncome(address) external view override returns (uint256) {
        if (revertIncome) revert("INCOME_FAIL");
        return normalizedIncome;
    }
}
