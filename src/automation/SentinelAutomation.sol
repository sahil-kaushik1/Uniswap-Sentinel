// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {AutomationCompatibleInterface} from "foundry-chainlink-toolkit/lib/chainlink-brownie-contracts/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

// ============================================================================
// SENTINEL HOOK INTERFACE
// ============================================================================

interface ISentinelHook {
    function maintain(
        PoolId poolId,
        int24 newLower,
        int24 newUpper,
        uint256 volatility
    ) external;

    /// @notice Returns pool state - matches PoolState struct order
    /// @dev Struct fields: activeTickLower, activeTickUpper, activeLiquidity,
    ///      priceFeed, priceFeedInverted, maxDeviationBps, aToken0, aToken1,
    ///      idle0, idle1, aave0, aave1, currency0, currency1, decimals0, decimals1,
    ///      fee, tickSpacing, totalShares, isInitialized
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
            bool priceFeedInverted,
            uint256 maxDeviationBps,
            address aToken0,
            address aToken1,
            uint256 idle0,
            uint256 idle1,
            uint256 aave0,
            uint256 aave1,
            address currency0, // Currency = address
            address currency1,
            uint8 decimals0,
            uint8 decimals1,
            uint24 fee,
            int24 tickSpacing,
            uint256 totalShares,
            bool isInitialized
        );
}

// ============================================================================
// SENTINEL AUTOMATION - MULTI-POOL
// ============================================================================

/// @title SentinelAutomation
/// @notice Chainlink Automation for 3 pools: ETH/USDC, WBTC/ETH, ETH/USDT
contract SentinelAutomation is AutomationCompatibleInterface {
    // ========== CONSTANTS ==========
    uint8 public constant MAX_POOLS = 3;

    // Pool Types
    uint8 public constant POOL_ETH_USDC = 0;
    uint8 public constant POOL_WBTC_ETH = 1;
    uint8 public constant POOL_ETH_USDT = 2;

    // ========== STATE ==========
    ISentinelHook public immutable hook;
    IPoolManager public immutable poolManager;
    address public owner;

    // Pool Configuration
    struct PoolConfig {
        PoolId poolId;
        uint8 poolType; // 0=ETH_USDC, 1=WBTC_ETH, 2=ETH_USDT
        bool active;
    }
    PoolConfig[3] public pools;
    uint8 public poolCount;

    uint8 public lastCheckedPool;

    // ========== EVENTS ==========
    event PoolAdded(uint8 indexed index, uint8 poolType, PoolId poolId);
    event RebalanceExecuted(
        uint8 indexed poolIndex,
        int24 newLower,
        int24 newUpper
    );

    // ========== ERRORS ==========
    error Unauthorized();
    error MaxPoolsReached();

    // ========== CONSTRUCTOR ==========
    constructor(address _hook, address _poolManager) {
        hook = ISentinelHook(_hook);
        poolManager = IPoolManager(_poolManager);
        owner = msg.sender;
    }

    // ========== POOL MANAGEMENT ==========

    function addPool(PoolId _poolId, uint8 _poolType) external onlyOwner {
        if (poolCount >= MAX_POOLS) revert MaxPoolsReached();

        pools[poolCount] = PoolConfig({
            poolId: _poolId,
            poolType: _poolType,
            active: true
        });

        emit PoolAdded(poolCount, _poolType, _poolId);
        poolCount++;
    }

    function setPoolActive(uint8 index, bool active) external onlyOwner {
        pools[index].active = active;
    }

    // ========== AUTOMATION INTERFACE ==========

    /// @notice Checks all 3 pools in round-robin fashion
    function checkUpkeep(
        bytes calldata
    ) external returns (bool upkeepNeeded, bytes memory performData) {
        if (poolCount == 0) return (false, "");

        // Round-robin: check next pool after lastCheckedPool
        for (uint8 i = 0; i < poolCount; i++) {
            uint8 idx = (lastCheckedPool + 1 + i) % poolCount;

            if (!pools[idx].active) continue;

            // Check if pool is initialized (20th return value)
            (, , , , , , , , , , , , , , , , , , , bool isInit) = hook
                .poolStates(pools[idx].poolId);
            if (!isInit) continue;

            if (_needsRebalance(pools[idx].poolId)) {
                return (true, abi.encode(idx));
            }
        }

        return (false, "");
    }

    /// @notice Sends request to Chainlink Functions for specific pool
    function performUpkeep(bytes calldata performData) external {
        if (performData.length == 0) return;

        uint8 poolIndex = abi.decode(performData, (uint8));
        if (poolIndex >= poolCount) return;
        PoolConfig memory pool = pools[poolIndex];
        if (!pool.active) return;

        lastCheckedPool = poolIndex;

        (bool shouldRebalance, int24 newLower, int24 newUpper, uint256 volatility) =
            _computeRebalance(pool.poolId);

        if (!shouldRebalance) return;

        hook.maintain(pool.poolId, newLower, newUpper, volatility);
        emit RebalanceExecuted(poolIndex, newLower, newUpper);
    }

    // ========== ADMIN ==========

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ========== VIEW ==========

    function getPool(uint8 index) external view returns (PoolId, uint8, bool) {
        return (
            pools[index].poolId,
            pools[index].poolType,
            pools[index].active
        );
    }

    // ========== INTERNAL ==========

    function _needsRebalance(PoolId poolId) internal view returns (bool) {
        (
            int24 lower,
            int24 upper,
            uint128 activeLiquidity,
            ,
            ,
            ,
            ,
            ,
            uint256 idle0,
            uint256 idle1,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            int24 tickSpacing,
            uint256 totalShares,
            bool isInit
        ) = hook.poolStates(poolId);
        if (!isInit) return false;

        if (activeLiquidity == 0 && totalShares > 0 && (idle0 > 0 || idle1 > 0)) {
            return true;
        }

        (, int24 tickCurrent, , ) = StateLibrary.getSlot0(poolManager, poolId);
        return (tickCurrent < lower || tickCurrent > upper) && tickSpacing > 0;
    }

    function _computeRebalance(PoolId poolId)
        internal
        view
        returns (bool, int24, int24, uint256)
    {
        (
            int24 lower,
            int24 upper,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            int24 tickSpacing,
            ,
            bool isInit
        ) = hook.poolStates(poolId);

        if (!isInit || tickSpacing <= 0) return (false, 0, 0, 0);

        (, int24 tickCurrent, , ) = StateLibrary.getSlot0(poolManager, poolId);
        if (tickCurrent >= lower && tickCurrent <= upper) return (false, 0, 0, 0);

        int24 width = upper - lower;
        if (width <= 0) {
            width = tickSpacing * 20;
        }

        int24 rounded = (tickCurrent / tickSpacing) * tickSpacing;
        int24 half = width / 2;
        int24 newLower = rounded - half;
        int24 newUpper = newLower + width;

        if (newLower >= newUpper) return (false, 0, 0, 0);

        return (true, newLower, newUpper, 0);
    }
}
