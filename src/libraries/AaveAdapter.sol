// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";

/// @notice Aave v3 Pool interface (simplified for our needs)
/// @dev Based on https://docs.aave.com/developers/core-contracts/pool
interface IPool {
    /// @notice Supplies an asset to the lending pool
    /// @param asset The address of the underlying asset to supply
    /// @param amount The amount to be supplied
    /// @param onBehalfOf The address that will receive the aTokens
    /// @param referralCode Code used to register the integrator originating the operation (0 if none)
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    /// @notice Withdraws an asset from the lending pool
    /// @param asset The address of the underlying asset to withdraw
    /// @param amount The amount to be withdrawn (type(uint256).max for full balance)
    /// @param to Address that will receive the withdrawn asset
    /// @return The final amount withdrawn
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);

    /// @notice Returns the normalized income of the reserve
    /// @param asset The address of the underlying asset
    /// @return The reserve's normalized income (liquidity index)
    function getReserveNormalizedIncome(address asset) external view returns (uint256);
}

/// @notice Aave aToken interface (interest-bearing token)
interface IAToken is IERC20 {
    /// @notice Returns the scaled balance of the user
    /// @param user The address of the user
    /// @return The scaled balance (balance / liquidity index)
    function scaledBalanceOf(address user) external view returns (uint256);
}

/// @title AaveAdapter
/// @notice Adapter for interacting with Aave v3 lending protocol
/// @dev Handles deposits and withdrawals of idle capital to earn yield
library AaveAdapter {
    using SafeTransferLib for IERC20;

    error AaveDepositFailed();
    error AaveWithdrawFailed();
    error InsufficientAaveBalance();

    /// @notice Deposits tokens to Aave v3 to earn yield
    /// @param pool The Aave pool address
    /// @param asset The token to deposit
    /// @param amount The amount to deposit
    /// @param recipient The address that will receive the aTokens
    function depositToAave(IPool pool, address asset, uint256 amount, address recipient) internal {
        require(amount > 0, "Amount must be greater than 0");

        // Approve Aave pool to spend tokens
        IERC20(asset).approve(address(pool), amount);

        // Supply to Aave (referralCode = 0 as per Aave docs)
        try pool.supply(asset, amount, recipient, 0) {
        // Success
        }
        catch {
            revert AaveDepositFailed();
        }
    }

    /// @notice Withdraws tokens from Aave v3
    /// @param pool The Aave pool address
    /// @param asset The token to withdraw
    /// @param amount The amount to withdraw (use type(uint256).max for full balance)
    /// @param recipient The address that will receive the tokens
    /// @return withdrawn The actual amount withdrawn
    function withdrawFromAave(IPool pool, address asset, uint256 amount, address recipient)
        internal
        returns (uint256 withdrawn)
    {
        require(amount > 0, "Amount must be greater than 0");

        try pool.withdraw(asset, amount, recipient) returns (uint256 withdrawnAmount) {
            withdrawn = withdrawnAmount;
        } catch {
            revert AaveWithdrawFailed();
        }
    }

    /// @notice Gets the current balance in Aave (including accrued interest)
    /// @param aToken The aToken address
    /// @param user The user address
    /// @return balance The current balance including interest
    function getAaveBalance(address aToken, address user) internal view returns (uint256 balance) {
        balance = IERC20(aToken).balanceOf(user);
    }

    /// @notice Calculates accrued yield in Aave
    /// @param aToken The aToken address
    /// @param user The user address
    /// @param initialDeposit The original deposit amount
    /// @return yield The amount of yield earned
    function calculateAccruedYield(address aToken, address user, uint256 initialDeposit)
        internal
        view
        returns (uint256 yield)
    {
        uint256 currentBalance = getAaveBalance(aToken, user);

        if (currentBalance > initialDeposit) {
            yield = currentBalance - initialDeposit;
        } else {
            yield = 0;
        }
    }

    /// @notice Emergency withdraw all funds from Aave
    /// @param pool The Aave pool address
    /// @param asset The token to withdraw
    /// @param recipient The address that will receive the tokens
    /// @return withdrawn The actual amount withdrawn
    function emergencyWithdrawAll(IPool pool, address asset, address recipient) internal returns (uint256 withdrawn) {
        // Using type(uint256).max withdraws the entire balance
        try pool.withdraw(asset, type(uint256).max, recipient) returns (uint256 withdrawnAmount) {
            withdrawn = withdrawnAmount;
        } catch {
            // If emergency withdraw fails, we're in trouble but don't revert
            // to allow other operations to continue
            withdrawn = 0;
        }
    }

    /// @notice Checks if Aave pool is healthy for deposits
    /// @param pool The Aave pool address
    /// @param asset The asset to check
    /// @return isHealthy True if the pool is accepting deposits
    function isPoolHealthy(IPool pool, address asset) internal view returns (bool isHealthy) {
        try pool.getReserveNormalizedIncome(asset) returns (uint256 income) {
            // If we can get normalized income and it's greater than 0, pool is operational
            isHealthy = income > 0;
        } catch {
            isHealthy = false;
        }
    }
}
