// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/src/libraries/TransientStateLibrary.sol";

/// @title SwapHelper
/// @notice Minimal swap router for demo/testing. Allows executing swaps through Uniswap v4 PoolManager.
/// @dev Implements IUnlockCallback to perform swaps inside the unlock() callback.
contract SwapHelper is IUnlockCallback {
    using CurrencyLibrary for Currency;
    using TransientStateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;

    struct SwapCallbackData {
        address sender;
        PoolKey key;
        IPoolManager.SwapParams params;
    }

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }

    /// @notice Execute a swap on a Uniswap v4 pool
    /// @param key The pool key identifying the pool
    /// @param params The swap parameters
    /// @return delta The balance delta from the swap
    function swap(
        PoolKey memory key,
        IPoolManager.SwapParams memory params
    ) external payable returns (BalanceDelta delta) {
        delta = abi.decode(
            poolManager.unlock(
                abi.encode(SwapCallbackData(msg.sender, key, params))
            ),
            (BalanceDelta)
        );

        // Return any leftover ETH
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            CurrencyLibrary.ADDRESS_ZERO.transfer(msg.sender, ethBalance);
        }
    }

    /// @notice Callback from PoolManager.unlock()
    function unlockCallback(
        bytes calldata rawData
    ) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");

        SwapCallbackData memory data = abi.decode(rawData, (SwapCallbackData));

        BalanceDelta delta = poolManager.swap(data.key, data.params, "");

        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();

        // Settle negative deltas (we owe the pool)
        if (delta0 < 0) {
            _settle(data.key.currency0, data.sender, uint256(uint128(-delta0)));
        }
        if (delta1 < 0) {
            _settle(data.key.currency1, data.sender, uint256(uint128(-delta1)));
        }

        // Take positive deltas (pool owes us)
        if (delta0 > 0) {
            poolManager.take(
                data.key.currency0,
                data.sender,
                uint256(uint128(delta0))
            );
        }
        if (delta1 > 0) {
            poolManager.take(
                data.key.currency1,
                data.sender,
                uint256(uint128(delta1))
            );
        }

        return abi.encode(delta);
    }

    /// @dev Settle a currency debt to the PoolManager
    function _settle(
        Currency currency,
        address payer,
        uint256 amount
    ) internal {
        if (currency.isAddressZero()) {
            poolManager.settle{value: amount}();
        } else {
            poolManager.sync(currency);
            IERC20(Currency.unwrap(currency)).transferFrom(
                payer,
                address(poolManager),
                amount
            );
            poolManager.settle();
        }
    }

    receive() external payable {}
}
