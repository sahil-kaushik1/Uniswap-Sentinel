// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AaveAdapter, IPool} from "../../src/libraries/AaveAdapter.sol";
import {MockAavePool} from "../mocks/MockAavePool.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract AaveAdapterHarness {
    function depositToAave(IPool pool, address asset, uint256 amount, address recipient) external {
        AaveAdapter.depositToAave(pool, asset, amount, recipient);
    }

    function withdrawFromAave(IPool pool, address asset, uint256 amount, address recipient)
        external
        returns (uint256 withdrawn)
    {
        return AaveAdapter.withdrawFromAave(pool, asset, amount, recipient);
    }

    function getAaveBalance(address aToken, address user) external view returns (uint256) {
        return AaveAdapter.getAaveBalance(aToken, user);
    }

    function calculateAccruedYield(address aToken, address user, uint256 initialDeposit)
        external
        view
        returns (uint256)
    {
        return AaveAdapter.calculateAccruedYield(aToken, user, initialDeposit);
    }

    function emergencyWithdrawAll(IPool pool, address asset, address recipient) external returns (uint256) {
        return AaveAdapter.emergencyWithdrawAll(pool, asset, recipient);
    }

    function isPoolHealthy(IPool pool, address asset) external view returns (bool) {
        return AaveAdapter.isPoolHealthy(pool, asset);
    }
}

contract AaveAdapterUnitTest is Test {
    MockAavePool pool;
    MockERC20 asset;
    MockERC20 aToken;
    AaveAdapterHarness harness;

    function setUp() public {
        pool = new MockAavePool();
        asset = new MockERC20("Asset", "AST", 18);
        aToken = new MockERC20("aToken", "aAST", 18);
        harness = new AaveAdapterHarness();
    }

    function testDepositToAave_Succeeds() public {
        asset.mint(address(harness), 1000e18);

        harness.depositToAave(IPool(address(pool)), address(asset), 1000e18, address(this));
        assertTrue(pool.supplyCalled());
        assertEq(asset.balanceOf(address(pool)), 1000e18);
    }

    function testDepositToAave_RevertsOnZero() public {
        vm.expectRevert("Amount must be greater than 0");
        harness.depositToAave(IPool(address(pool)), address(asset), 0, address(this));
    }

    function testDepositToAave_RevertsOnFailure() public {
        pool.setRevertSupply(true);
        asset.mint(address(this), 10e18);
        asset.approve(address(pool), 10e18);

        vm.expectRevert(AaveAdapter.AaveDepositFailed.selector);
        harness.depositToAave(IPool(address(pool)), address(asset), 10e18, address(this));
    }

    function testWithdrawFromAave_Succeeds() public {
        asset.mint(address(pool), 500e18);

        uint256 withdrawn = harness.withdrawFromAave(IPool(address(pool)), address(asset), 300e18, address(this));
        assertEq(withdrawn, 300e18);
        assertTrue(pool.withdrawCalled());
        assertEq(asset.balanceOf(address(this)), 300e18);
    }

    function testWithdrawFromAave_RevertsOnZero() public {
        vm.expectRevert("Amount must be greater than 0");
        harness.withdrawFromAave(IPool(address(pool)), address(asset), 0, address(this));
    }

    function testWithdrawFromAave_RevertsOnFailure() public {
        pool.setRevertWithdraw(true);

        vm.expectRevert(AaveAdapter.AaveWithdrawFailed.selector);
        harness.withdrawFromAave(IPool(address(pool)), address(asset), 1, address(this));
    }

    function testGetAaveBalance_ReturnsBalance() public {
        aToken.mint(address(this), 42e18);
        uint256 bal = harness.getAaveBalance(address(aToken), address(this));
        assertEq(bal, 42e18);
    }

    function testCalculateAccruedYield_Positive() public {
        aToken.mint(address(this), 150e18);
        uint256 accrued = harness.calculateAccruedYield(address(aToken), address(this), 100e18);
        assertEq(accrued, 50e18);
    }

    function testCalculateAccruedYield_Zero() public {
        aToken.mint(address(this), 90e18);
        uint256 accrued = harness.calculateAccruedYield(address(aToken), address(this), 100e18);
        assertEq(accrued, 0);
    }

    function testEmergencyWithdrawAll_Succeeds() public {
        asset.mint(address(pool), 25e18);
        uint256 withdrawn = harness.emergencyWithdrawAll(IPool(address(pool)), address(asset), address(this));
        assertEq(withdrawn, 25e18);
        assertEq(asset.balanceOf(address(this)), 25e18);
    }

    function testEmergencyWithdrawAll_ReturnsZeroOnFailure() public {
        pool.setRevertWithdraw(true);
        uint256 withdrawn = harness.emergencyWithdrawAll(IPool(address(pool)), address(asset), address(this));
        assertEq(withdrawn, 0);
    }

    function testIsPoolHealthy_TrueWhenIncomePositive() public {
        pool.setNormalizedIncome(1e27);
        bool ok = harness.isPoolHealthy(IPool(address(pool)), address(asset));
        assertTrue(ok);
    }

    function testIsPoolHealthy_FalseOnZeroIncome() public {
        pool.setNormalizedIncome(0);
        bool ok = harness.isPoolHealthy(IPool(address(pool)), address(asset));
        assertTrue(!ok);
    }

    function testIsPoolHealthy_FalseOnRevert() public {
        pool.setRevertIncome(true);
        bool ok = harness.isPoolHealthy(IPool(address(pool)), address(asset));
        assertTrue(!ok);
    }
}
