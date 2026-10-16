// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AaveAdapter} from "../../src/libraries/AaveAdapter.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract AaveAdapterFuzzTest is Test {
    function testFuzz_CalculateAccruedYield(uint256 initialDeposit, uint256 currentBalance) public {
        vm.assume(initialDeposit <= 1e30);
        vm.assume(currentBalance <= 1e30);

        MockERC20 aToken = new MockERC20("aToken", "aTK", 18);
        if (currentBalance > 0) {
            aToken.mint(address(this), currentBalance);
        }

        uint256 expected = currentBalance > initialDeposit ? currentBalance - initialDeposit : 0;
        uint256 accrued = AaveAdapter.calculateAccruedYield(address(aToken), address(this), initialDeposit);
        assertEq(accrued, expected);
    }
}
