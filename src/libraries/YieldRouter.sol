// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title YieldRouter
/// @notice Calculates optimal allocation between active Uniswap liquidity and idle yield-generating positions
/// @dev This library determines how much capital should be deployed in the pool vs. external lending protocols
library YieldRouter {
    /// @notice Minimum liquidity that must remain active in the pool (prevents dust)
    uint256 public constant MIN_ACTIVE_LIQUIDITY = 1000e18;

    /// @notice Minimum threshold for depositing to yield protocols (gas efficiency)
    uint256 public constant MIN_YIELD_DEPOSIT = 100e18;

    error InsufficientLiquidity();

    /// @notice Calculates the ideal distribution of capital between active pool and yield protocols
    /// @param totalBalance Total available balance to allocate
    /// @param newTickLower Lower tick of the new active range
    /// @param newTickUpper Upper tick of the new active range
    /// @param currentTick Current price tick in the pool
    /// @param volatility Current market volatility (in basis points, e.g., 1000 = 10%)
    /// @return activeAmount Amount to deploy as active liquidity in pool
    /// @return idleAmount Amount to deposit to yield protocols (can be negative = withdraw)
    function calculateIdealRatio(
        uint256 totalBalance,
        int24 newTickLower,
        int24 newTickUpper,
        int24 currentTick,
        uint256 volatility
    ) internal pure returns (uint256 activeAmount, int256 idleAmount) {
        if (totalBalance < MIN_ACTIVE_LIQUIDITY) {
            revert InsufficientLiquidity();
        }

        // Calculate range width in ticks
        int24 rangeWidth = newTickUpper - newTickLower;
        require(rangeWidth > 0, "Invalid range");

        // Calculate distance from current tick to range boundaries
        int24 distanceToLower = currentTick - newTickLower;
        int24 distanceToUpper = newTickUpper - currentTick;

        // If price is outside range, need more active liquidity buffer
        bool inRange = distanceToLower >= 0 && distanceToUpper >= 0;

        // Base allocation: narrower ranges need more active capital
        // For a range of 200 ticks at low volatility, we want ~70% active
        // For a range of 1000 ticks at high volatility, we want ~40% active
        uint256 baseActiveRatio = _calculateBaseActiveRatio(rangeWidth, volatility);

        // Adjust based on position relative to range
        uint256 adjustedActiveRatio = _adjustForPosition(
            baseActiveRatio,
            inRange,
            distanceToLower,
            distanceToUpper,
            rangeWidth
        );

        // Calculate actual amounts
        activeAmount = (totalBalance * adjustedActiveRatio) / 10000; // adjustedActiveRatio is in basis points

        // Ensure minimum active liquidity
        if (activeAmount < MIN_ACTIVE_LIQUIDITY) {
            activeAmount = MIN_ACTIVE_LIQUIDITY;
        }

        // Calculate idle amount (can be negative if we need to withdraw from yield)
        uint256 idleUnsigned = totalBalance > activeAmount ? totalBalance - activeAmount : 0;
        
        // Only deposit to yield if above threshold (gas optimization)
        if (idleUnsigned < MIN_YIELD_DEPOSIT) {
            idleAmount = 0;
            activeAmount = totalBalance;
        } else {
            idleAmount = int256(idleUnsigned);
        }
    }

    /// @notice Calculates base active ratio based on range width and volatility
    /// @param rangeWidth Width of the liquidity range in ticks
    /// @param volatility Market volatility in basis points
    /// @return ratio Active liquidity ratio in basis points (0-10000)
    function _calculateBaseActiveRatio(int24 rangeWidth, uint256 volatility)
        private
        pure
        returns (uint256 ratio)
    {
        // Narrow ranges (< 400 ticks) need more active capital
        // Wide ranges (> 2000 ticks) can afford more idle capital

        uint256 absRangeWidth = rangeWidth < 0 ? uint256(uint24(-rangeWidth)) : uint256(uint24(rangeWidth));

        // Base ratio calculation:
        // - Very narrow (< 200 ticks): 80-90% active
        // - Narrow (200-600 ticks): 60-80% active
        // - Medium (600-1500 ticks): 40-60% active
        // - Wide (> 1500 ticks): 30-40% active

        if (absRangeWidth < 200) {
            ratio = 8500; // 85%
        } else if (absRangeWidth < 600) {
            ratio = 7000; // 70%
        } else if (absRangeWidth < 1500) {
            ratio = 5000; // 50%
        } else {
            ratio = 3500; // 35%
        }

        // Adjust for volatility
        // Higher volatility means we need more active capital as buffer
        // volatility in basis points: 500 = 5%, 1000 = 10%, 2000 = 20%
        uint256 volatilityAdjustment = (volatility * 2) / 100; // Scale down

        ratio = ratio + volatilityAdjustment;

        // Cap at 95% active (always want some yield generation)
        if (ratio > 9500) {
            ratio = 9500;
        }

        return ratio;
    }

    /// @notice Adjusts active ratio based on current position relative to range
    /// @param baseRatio Base ratio calculated from range and volatility
    /// @param inRange Whether current price is within the range
    /// @param distanceToLower Distance from current tick to lower bound
    /// @param distanceToUpper Distance from current tick to upper bound
    /// @param rangeWidth Total width of the range
    /// @return adjustedRatio Final active ratio in basis points
    function _adjustForPosition(
        uint256 baseRatio,
        bool inRange,
        int24 distanceToLower,
        int24 distanceToUpper,
        int24 rangeWidth
    ) private pure returns (uint256 adjustedRatio) {
        // If out of range, increase active allocation for rebalancing buffer
        if (!inRange) {
            // Add 20% more to active allocation when out of range
            adjustedRatio = baseRatio + 2000;
            if (adjustedRatio > 9800) {
                adjustedRatio = 9800;
            }
            return adjustedRatio;
        }

        // If in range, check position within range
        // If very close to edge (< 10% of range), increase active buffer
        int24 edgeThreshold = rangeWidth / 10;

        bool nearEdge = (distanceToLower < edgeThreshold) || (distanceToUpper < edgeThreshold);

        if (nearEdge) {
            // Add 10% more to active when near edge
            adjustedRatio = baseRatio + 1000;
            if (adjustedRatio > 9500) {
                adjustedRatio = 9500;
            }
        } else {
            // Comfortably in range, can use base ratio
            adjustedRatio = baseRatio;
        }

        return adjustedRatio;
    }

    /// @notice Calculates how much needs to be withdrawn from yield to cover active allocation
    /// @param currentYieldBalance Current balance in yield protocol
    /// @param requiredActive Required active amount
    /// @param availableBalance Available balance not in yield
    /// @return withdrawAmount Amount to withdraw from yield (0 if no withdrawal needed)
    function calculateYieldWithdrawal(
        uint256 currentYieldBalance,
        uint256 requiredActive,
        uint256 availableBalance
    ) internal pure returns (uint256 withdrawAmount) {
        // If available balance covers the requirement, no withdrawal needed
        if (availableBalance >= requiredActive) {
            return 0;
        }

        // Calculate shortfall
        uint256 shortfall = requiredActive - availableBalance;

        // Withdraw the shortfall from yield (capped at current yield balance)
        withdrawAmount = shortfall > currentYieldBalance ? currentYieldBalance : shortfall;
    }
}
