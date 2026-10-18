// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Pool} from "@uniswap/v4-core/src/libraries/Pool.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

interface ISentinelHookUnlock {
    function unlockCallback(
        bytes calldata data
    ) external returns (bytes memory);
}

contract MockPoolManager {
    using PoolIdLibrary for PoolKey;

    bytes32 internal constant POOLS_SLOT = bytes32(uint256(6));

    address public hook;

    mapping(bytes32 => bytes32) private extsloadData;
    mapping(bytes32 => bytes32) private exttloadData;

    bool public syncCalled;
    bool public settleCalled;
    bool public takeCalled;
    Currency public lastSyncCurrency;
    Currency public lastTakeCurrency;
    uint256 public lastTakeAmount;

    int128 public deltaAmount0 = int128(10);
    int128 public deltaAmount1 = int128(20);

    address public lastCurrency0;
    address public lastCurrency1;
    uint24 public lastFee;
    int24 public lastTickSpacing;
    address public lastHooks;
    int24 public lastTickLower;
    int24 public lastTickUpper;
    int256 public lastLiquidityDelta;

    function setHook(address hook_) external {
        hook = hook_;
    }

    function setSlot0(
        PoolId poolId,
        uint160 sqrtPriceX96,
        int24 tick,
        uint24 protocolFee,
        uint24 lpFee
    ) external {
        bytes32 slot = keccak256(
            abi.encodePacked(PoolId.unwrap(poolId), POOLS_SLOT)
        );
        uint256 data = uint256(sqrtPriceX96);
        data |= uint256(uint24(uint24(tick))) << 160;
        data |= uint256(protocolFee) << 184;
        data |= uint256(lpFee) << 208;
        extsloadData[slot] = bytes32(data);
    }

    function setCurrencyDelta(
        address target,
        Currency currency,
        int256 delta
    ) external {
        bytes32 key;
        assembly ("memory-safe") {
            mstore(0, and(target, 0xffffffffffffffffffffffffffffffffffffffff))
            mstore(
                32,
                and(currency, 0xffffffffffffffffffffffffffffffffffffffff)
            )
            key := keccak256(0, 64)
        }
        exttloadData[key] = bytes32(uint256(delta));
    }

    function setModifyLiquidityDelta(int128 amount0, int128 amount1) external {
        deltaAmount0 = amount0;
        deltaAmount1 = amount1;
    }

    function extsload(bytes32 slot) external view returns (bytes32) {
        return extsloadData[slot];
    }

    function exttload(bytes32 slot) external view returns (bytes32) {
        return exttloadData[slot];
    }

    function unlock(bytes calldata data) external returns (bytes memory) {
        return ISentinelHookUnlock(hook).unlockCallback(data);
    }

    function modifyLiquidity(
        PoolKey memory key,
        IPoolManager.ModifyLiquidityParams memory params,
        bytes calldata
    ) external returns (BalanceDelta callerDelta, BalanceDelta feesAccrued) {
        lastCurrency0 = Currency.unwrap(key.currency0);
        lastCurrency1 = Currency.unwrap(key.currency1);
        lastFee = key.fee;
        lastTickSpacing = key.tickSpacing;
        lastHooks = address(key.hooks);
        lastTickLower = params.tickLower;
        lastTickUpper = params.tickUpper;
        lastLiquidityDelta = params.liquidityDelta;

        if (params.liquidityDelta < 0) {
            callerDelta = toBalanceDelta(deltaAmount0, deltaAmount1);
        } else {
            callerDelta = BalanceDeltaLibrary.ZERO_DELTA;
        }
        feesAccrued = BalanceDeltaLibrary.ZERO_DELTA;
    }

    function callBeforeSwap(
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params
    ) external returns (bytes4, BeforeSwapDelta, uint24) {
        return IHooks(hook).beforeSwap(address(this), key, params, "");
    }

    function sync(Currency currency) external {
        syncCalled = true;
        lastSyncCurrency = currency;
    }

    function take(Currency currency, address to, uint256 amount) external {
        takeCalled = true;
        lastTakeCurrency = currency;
        lastTakeAmount = amount;
        if (Currency.unwrap(currency) != address(0)) {
            IERC20(Currency.unwrap(currency)).transfer(to, amount);
        }
    }

    function settle() external payable returns (uint256 paid) {
        settleCalled = true;
        return msg.value;
    }
}
