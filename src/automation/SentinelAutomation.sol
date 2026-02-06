// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
// Note: AggregatorV3Interface not needed here - oracle checks are in SentinelHook

/// @notice Interface for Chainlink Automation compatibility
interface AutomationCompatibleInterface {
    function checkUpkeep(
        bytes calldata checkData
    ) external returns (bool upkeepNeeded, bytes memory performData);

    function performUpkeep(bytes calldata performData) external;
}

/// @notice Minimal interface for SentinelHook
interface ISentinelHook {
    function maintain(
        PoolId poolId,
        int24 newLower,
        int24 newUpper,
        uint256 volatility
    ) external;

    function poolStates(
        PoolId poolId
    )
        external
        view
        returns (
            int24 activeTickLower,
            int24 activeTickUpper,
            uint128 activeLiquidity,
            address priceFeed,
            uint256 maxDeviationBps,
            address aToken0,
            address aToken1,
            address currency0,
            address currency1,
            uint256 totalShares,
            bool isInitialized
        );
}

/// @title SentinelAutomation
/// @notice Chainlink Automation compatible contract for Sentinel rebalancing
/// @dev Implements the Chainlink Automation interface to automatically rebalance
///      Sentinel-managed Uniswap v4 pools when price moves out of range
contract SentinelAutomation is AutomationCompatibleInterface {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolId;

    // ============================================================================
    // STATE VARIABLES
    // ============================================================================

    /// @notice The SentinelHook contract
    ISentinelHook public immutable hook;

    /// @notice The Uniswap v4 PoolManager
    IPoolManager public immutable poolManager;

    /// @notice List of tracked pool IDs
    PoolId[] public trackedPools;

    /// @notice Mapping to check if a pool is tracked
    mapping(PoolId => bool) public isTracked;

    /// @notice Mapping to track pool index in array (for removal)
    mapping(PoolId => uint256) public poolIndex;

    /// @notice Minimum time between checks (rate limiting)
    uint256 public checkInterval = 60; // 60 seconds

    /// @notice Last check timestamp
    uint256 public lastCheckTime;

    /// @notice Default tick width for new ranges (~6% range)
    int24 public defaultTickWidth = 600;

    /// @notice Default tick spacing (matches pool tick spacing)
    int24 public tickSpacing = 60;

    /// @notice Edge threshold percentage (20% of range = proactive rebalance)
    uint256 public edgeThresholdBps = 2000; // 20%

    /// @notice Contract owner
    address public owner;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event PoolAdded(PoolId indexed poolId);
    event PoolRemoved(PoolId indexed poolId);
    event RebalanceTriggered(
        PoolId indexed poolId,
        int24 newLower,
        int24 newUpper,
        uint256 volatility
    );
    event ConfigUpdated(string param, uint256 value);
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // ============================================================================
    // ERRORS
    // ============================================================================

    error Unauthorized();
    error PoolNotTracked();
    error PoolAlreadyTracked();
    error InvalidPool();
    error ZeroAddress();

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(address _hook, address _poolManager) {
        if (_hook == address(0) || _poolManager == address(0))
            revert ZeroAddress();

        hook = ISentinelHook(_hook);
        poolManager = IPoolManager(_poolManager);
        owner = msg.sender;
        lastCheckTime = block.timestamp;
    }

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    /// @notice Add a pool to be tracked by automation
    /// @param poolId The pool ID to track
    function addPool(PoolId poolId) external onlyOwner {
        if (isTracked[poolId]) revert PoolAlreadyTracked();

        // Verify pool is initialized in hook
        (, , , , , , , , , , bool isInitialized) = hook.poolStates(poolId);
        if (!isInitialized) revert InvalidPool();

        poolIndex[poolId] = trackedPools.length;
        trackedPools.push(poolId);
        isTracked[poolId] = true;

        emit PoolAdded(poolId);
    }

    /// @notice Remove a pool from tracking
    /// @param poolId The pool ID to remove
    function removePool(PoolId poolId) external onlyOwner {
        if (!isTracked[poolId]) revert PoolNotTracked();

        // Swap with last element and pop (gas efficient removal)
        uint256 index = poolIndex[poolId];
        uint256 lastIndex = trackedPools.length - 1;

        if (index != lastIndex) {
            PoolId lastPool = trackedPools[lastIndex];
            trackedPools[index] = lastPool;
            poolIndex[lastPool] = index;
        }

        trackedPools.pop();
        delete poolIndex[poolId];
        isTracked[poolId] = false;

        emit PoolRemoved(poolId);
    }

    /// @notice Update check interval
    function setCheckInterval(uint256 _interval) external onlyOwner {
        checkInterval = _interval;
        emit ConfigUpdated("checkInterval", _interval);
    }

    /// @notice Update default tick width
    function setDefaultTickWidth(int24 _width) external onlyOwner {
        defaultTickWidth = _width;
        emit ConfigUpdated("defaultTickWidth", uint256(int256(_width)));
    }

    /// @notice Update tick spacing
    function setTickSpacing(int24 _spacing) external onlyOwner {
        tickSpacing = _spacing;
        emit ConfigUpdated("tickSpacing", uint256(int256(_spacing)));
    }

    /// @notice Update edge threshold
    function setEdgeThresholdBps(uint256 _bps) external onlyOwner {
        edgeThresholdBps = _bps;
        emit ConfigUpdated("edgeThresholdBps", _bps);
    }

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ============================================================================
    // CHAINLINK AUTOMATION INTERFACE
    // ============================================================================

    /// @notice Called by Chainlink Automation nodes to check if upkeep is needed
    /// @dev This function should NOT modify state
    /// @return upkeepNeeded True if a pool needs rebalancing
    /// @return performData Encoded data for performUpkeep
    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        // Rate limiting - don't check too frequently
        if (block.timestamp < lastCheckTime + checkInterval) {
            return (false, "");
        }

        // Check each tracked pool
        for (uint256 i = 0; i < trackedPools.length; i++) {
            PoolId poolId = trackedPools[i];

            (
                bool needsRebalance,
                int24 newLower,
                int24 newUpper,
                uint256 volatility
            ) = _checkPoolNeedsRebalance(poolId);

            if (needsRebalance) {
                performData = abi.encode(
                    poolId,
                    newLower,
                    newUpper,
                    volatility
                );
                return (true, performData);
            }
        }

        return (false, "");
    }

    /// @notice Called by Chainlink Automation to perform the upkeep
    /// @dev This function DOES modify state
    /// @param performData Encoded data from checkUpkeep
    function performUpkeep(bytes calldata performData) external override {
        (
            PoolId poolId,
            int24 newLower,
            int24 newUpper,
            uint256 volatility
        ) = abi.decode(performData, (PoolId, int24, int24, uint256));

        // Re-verify the pool still needs rebalancing (prevent frontrunning)
        (bool stillNeeded, , , ) = _checkPoolNeedsRebalance(poolId);
        if (!stillNeeded) return;

        // Execute rebalance via hook
        hook.maintain(poolId, newLower, newUpper, volatility);

        // Update last check time
        lastCheckTime = block.timestamp;

        emit RebalanceTriggered(poolId, newLower, newUpper, volatility);
    }

    // ============================================================================
    // INTERNAL LOGIC
    // ============================================================================

    /// @notice Check if a specific pool needs rebalancing
    /// @param poolId The pool to check
    /// @return needsRebalance True if rebalance is needed
    /// @return newLower New lower tick
    /// @return newUpper New upper tick
    /// @return volatility Estimated volatility (basis points)
    function _checkPoolNeedsRebalance(
        PoolId poolId
    )
        internal
        view
        returns (
            bool needsRebalance,
            int24 newLower,
            int24 newUpper,
            uint256 volatility
        )
    {
        // Get hook state
        (
            int24 activeTickLower,
            int24 activeTickUpper,
            , // activeLiquidity
            , // priceFeed
            , // maxDeviationBps
            , // aToken0
            , // aToken1
            , // currency0
            , // currency1
            , // totalShares
            bool isInitialized
        ) = hook.poolStates(poolId);

        if (!isInitialized) {
            return (false, 0, 0, 0);
        }

        // Get current tick from pool
        (, int24 currentTick, , ) = poolManager.getSlot0(poolId);

        // ===== SAFETY CHECK: Out of Range? =====
        bool outOfRange = currentTick < activeTickLower ||
            currentTick > activeTickUpper;

        if (outOfRange) {
            // URGENT: Price is outside active range
            // Calculate new centered range
            newLower = _alignTick(currentTick - defaultTickWidth);
            newUpper = _alignTick(currentTick + defaultTickWidth);
            volatility = 1500; // Assume high volatility when out of range (15%)
            return (true, newLower, newUpper, volatility);
        }

        // ===== OPTIMIZATION CHECK: Near Edge? =====
        int24 rangeWidth = activeTickUpper - activeTickLower;
        int24 edgeThreshold = int24(
            int256((uint256(int256(rangeWidth)) * edgeThresholdBps) / 10000)
        );

        int24 distanceToLower = currentTick - activeTickLower;
        int24 distanceToUpper = activeTickUpper - currentTick;

        bool nearLowerEdge = distanceToLower < edgeThreshold;
        bool nearUpperEdge = distanceToUpper < edgeThreshold;

        if (nearLowerEdge || nearUpperEdge) {
            // Proactive rebalance - price near edge
            newLower = _alignTick(currentTick - defaultTickWidth);
            newUpper = _alignTick(currentTick + defaultTickWidth);
            volatility = 1000; // Medium volatility (10%)
            return (true, newLower, newUpper, volatility);
        }

        // Price is comfortably in range - no action needed
        return (false, 0, 0, 0);
    }

    /// @notice Align a tick to the tick spacing
    /// @param tick The tick to align
    /// @return aligned The aligned tick
    function _alignTick(int24 tick) internal view returns (int24 aligned) {
        // Round towards zero
        aligned = (tick / tickSpacing) * tickSpacing;
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /// @notice Get the number of tracked pools
    function getTrackedPoolCount() external view returns (uint256) {
        return trackedPools.length;
    }

    /// @notice Get all tracked pools
    function getTrackedPools() external view returns (PoolId[] memory) {
        return trackedPools;
    }

    /// @notice Get the status of a specific pool
    /// @param poolId The pool to check
    function getPoolStatus(
        PoolId poolId
    )
        external
        view
        returns (
            bool tracked,
            bool needsRebalance,
            int24 currentTick,
            int24 activeLower,
            int24 activeUpper,
            int24 suggestedLower,
            int24 suggestedUpper
        )
    {
        tracked = isTracked[poolId];

        if (!tracked) {
            return (false, false, 0, 0, 0, 0, 0);
        }

        (activeLower, activeUpper, , , , , , , , , ) = hook.poolStates(poolId);
        (, currentTick, , ) = poolManager.getSlot0(poolId);

        (
            needsRebalance,
            suggestedLower,
            suggestedUpper,

        ) = _checkPoolNeedsRebalance(poolId);
    }

    /// @notice Simulate a rebalance check without state changes
    /// @param poolId The pool to simulate
    function simulateCheck(
        PoolId poolId
    )
        external
        view
        returns (
            bool wouldRebalance,
            int24 newLower,
            int24 newUpper,
            uint256 volatility,
            string memory reason
        )
    {
        (
            wouldRebalance,
            newLower,
            newUpper,
            volatility
        ) = _checkPoolNeedsRebalance(poolId);

        if (!wouldRebalance) {
            reason = "Price comfortably in range";
        } else if (volatility == 1500) {
            reason = "URGENT: Price out of range";
        } else {
            reason = "Proactive: Price near edge";
        }
    }
}
