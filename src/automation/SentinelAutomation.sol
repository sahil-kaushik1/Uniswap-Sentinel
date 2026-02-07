// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {AutomationCompatibleInterface} from "foundry-chainlink-toolkit/lib/chainlink-brownie-contracts/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

// ============================================================================
// CHAINLINK INTERFACES
// ============================================================================

interface IFunctionsRouter {
    function sendRequest(
        uint64 subscriptionId,
        bytes calldata data,
        uint16 dataVersion,
        uint32 callbackGasLimit,
        bytes32 donId
    ) external returns (bytes32 requestId);
}

interface IFunctionsClient {
    function handleOracleFulfillment(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external;
}

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
/// @notice Chainlink Automation + Functions for 3 pools: ETH/USDC, WBTC/ETH, ETH/USDT
contract SentinelAutomation is IFunctionsClient, AutomationCompatibleInterface {
    // ========== CONSTANTS ==========
    uint8 public constant MAX_POOLS = 3;

    // Pool Types
    uint8 public constant POOL_ETH_USDC = 0;
    uint8 public constant POOL_WBTC_ETH = 1;
    uint8 public constant POOL_ETH_USDT = 2;

    // ========== STATE ==========
    ISentinelHook public immutable hook;
    IPoolManager public immutable poolManager;
    IFunctionsRouter public immutable router;
    bool public useFunctions;
    address public owner;

    // Pool Configuration
    struct PoolConfig {
        PoolId poolId;
        uint8 poolType; // 0=ETH_USDC, 1=WBTC_ETH, 2=ETH_USDT
        bool active;
    }
    PoolConfig[3] public pools;
    uint8 public poolCount;

    // Chainlink Functions Config
    bytes32 public donId;
    uint64 public subscriptionId;
    uint32 public gasLimit;
    string public source;

    // Request tracking
    bytes32 public lastRequestId;
    uint8 public pendingPoolIndex;
    bool public requestPending;
    uint8 public lastCheckedPool;

    // ========== EVENTS ==========
    event PoolAdded(uint8 indexed index, uint8 poolType, PoolId poolId);
    event RebalanceRequested(bytes32 indexed requestId, uint8 poolIndex);
    event RebalanceExecuted(
        uint8 indexed poolIndex,
        int24 newLower,
        int24 newUpper
    );
    event RequestFailed(bytes32 indexed requestId, string reason);

    // ========== ERRORS ==========
    error Unauthorized();
    error RequestAlreadyPending();
    error OnlyRouter();
    error MaxPoolsReached();

    // ========== CONSTRUCTOR ==========
    constructor(
        address _hook,
        address _poolManager,
        address _router,
        bytes32 _donId,
        uint64 _subscriptionId,
        uint32 _gasLimit,
        string memory _source,
        bool _useFunctions
    ) {
        hook = ISentinelHook(_hook);
        poolManager = IPoolManager(_poolManager);
        router = IFunctionsRouter(_router);
        donId = _donId;
        subscriptionId = _subscriptionId;
        gasLimit = _gasLimit;
        source = _source;
        useFunctions = _useFunctions;
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
        if (requestPending || poolCount == 0) return (false, "");

        // Round-robin: check next pool after lastCheckedPool
        for (uint8 i = 0; i < poolCount; i++) {
            uint8 idx = (lastCheckedPool + 1 + i) % poolCount;

            if (!pools[idx].active) continue;

            // Check if pool is initialized (20th return value)
            (, , , , , , , , , , , , , , , , , , , bool isInit) = hook
                .poolStates(pools[idx].poolId);
            if (!isInit) continue;

            if (useFunctions) {
                return (true, abi.encode(idx));
            }

            if (_needsRebalance(pools[idx].poolId)) {
                return (true, abi.encode(idx));
            }
        }

        return (false, "");
    }

    /// @notice Sends request to Chainlink Functions for specific pool
    function performUpkeep(bytes calldata performData) external {
        if (performData.length == 0) return;
        if (requestPending) revert RequestAlreadyPending();

        uint8 poolIndex = abi.decode(performData, (uint8));
        if (poolIndex >= poolCount) return;
        PoolConfig memory pool = pools[poolIndex];
        if (!pool.active) return;

        if (!useFunctions) {
            (bool shouldRebalance, int24 newLower, int24 newUpper, uint256 volatility) =
                _computeRebalance(pool.poolId);

            if (!shouldRebalance) return;

            hook.maintain(pool.poolId, newLower, newUpper, volatility);
            lastCheckedPool = poolIndex;
            emit RebalanceExecuted(poolIndex, newLower, newUpper);
            return;
        }

        // Build request with pool info
        bytes memory request = _buildRequest(pool.poolType);

        lastRequestId = router.sendRequest(
            subscriptionId,
            request,
            1,
            gasLimit,
            donId
        );

        pendingPoolIndex = poolIndex;
        requestPending = true;
        lastCheckedPool = poolIndex;

        emit RebalanceRequested(lastRequestId, poolIndex);
    }

    // ========== CHAINLINK FUNCTIONS CALLBACK ==========

    function handleOracleFulfillment(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external override {
        if (!useFunctions) revert OnlyRouter();
        if (msg.sender != address(router)) revert OnlyRouter();

        uint8 poolIndex = pendingPoolIndex;
        requestPending = false;

        if (err.length > 0) {
            emit RequestFailed(requestId, string(err));
            return;
        }

        // Decode response
        (int24 newLower, int24 newUpper, uint256 volatility) = _decodeResponse(
            response
        );

        if (newLower == 0 && newUpper == 0) return;

        // Execute rebalance for this pool
        hook.maintain(pools[poolIndex].poolId, newLower, newUpper, volatility);

        emit RebalanceExecuted(poolIndex, newLower, newUpper);
    }

    // ========== ADMIN ==========

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function setSource(string calldata _source) external onlyOwner {
        source = _source;
    }

    function setConfig(
        bytes32 _donId,
        uint64 _subId,
        uint32 _gasLimit
    ) external onlyOwner {
        donId = _donId;
        subscriptionId = _subId;
        gasLimit = _gasLimit;
    }

    function setUseFunctions(bool _useFunctions) external onlyOwner {
        useFunctions = _useFunctions;
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

    function _buildRequest(
        uint8 poolType
    ) internal view returns (bytes memory) {
        bytes memory sourceBytes = bytes(source);
        bytes memory poolTypeArg = abi.encodePacked(poolType);

        // CBOR with source and args
        return
            abi.encodePacked(
                bytes1(0xa2), // Map with 2 elements
                bytes1(0x00), // Key: 0 (source)
                bytes1(0x78),
                uint8(sourceBytes.length > 255 ? 255 : sourceBytes.length),
                sourceBytes,
                bytes1(0x01), // Key: 1 (args)
                bytes1(0x81), // Array of 1 element
                bytes1(0x00 + poolType) // Pool type as integer
            );
    }

    function _decodeResponse(
        bytes memory response
    ) internal pure returns (int24, int24, uint256) {
        string memory resp = string(response);
        int24 newLower = _extractInt24(resp, "newLower");
        int24 newUpper = _extractInt24(resp, "newUpper");
        uint256 volatility = uint256(
            int256(_extractInt24(resp, "volatilityBps"))
        );
        return (newLower, newUpper, volatility);
    }

    function _extractInt24(
        string memory json,
        string memory key
    ) internal pure returns (int24) {
        bytes memory jsonBytes = bytes(json);
        bytes memory keyBytes = bytes(key);

        for (uint256 i = 0; i < jsonBytes.length - keyBytes.length; i++) {
            bool isMatch = true;
            for (uint256 j = 0; j < keyBytes.length && isMatch; j++) {
                if (jsonBytes[i + j] != keyBytes[j]) isMatch = false;
            }
            if (isMatch) {
                uint256 pos = i + keyBytes.length;
                while (pos < jsonBytes.length && jsonBytes[pos] != 0x3a) pos++;
                pos++;
                while (pos < jsonBytes.length && jsonBytes[pos] == 0x20) pos++;

                bool neg = jsonBytes[pos] == 0x2d;
                if (neg) pos++;

                int256 val = 0;
                while (pos < jsonBytes.length) {
                    uint8 c = uint8(jsonBytes[pos]);
                    if (c >= 0x30 && c <= 0x39) {
                        val = val * 10 + int256(uint256(c - 0x30));
                        pos++;
                    } else break;
                }
                return int24(neg ? -val : val);
            }
        }
        return 0;
    }

    function _needsRebalance(PoolId poolId) internal view returns (bool) {
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
        if (!isInit) return false;
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
