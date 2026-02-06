// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SentinelHook} from "../../src/SentinelHook.sol";
import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

contract SentinelHookHarness is SentinelHook {
    constructor(IPoolManager _poolManager, address _aavePool, address _maintainer)
        SentinelHook(_poolManager, _aavePool, _maintainer)
    {}

    function validateHookAddress(BaseHook) internal pure override {}

    function exposedHandleWithdraw(PoolId poolId, address lp, uint256 sharesToWithdraw)
        external
        returns (bytes memory)
    {
        return _handleWithdraw(poolId, lp, sharesToWithdraw);
    }

    function exposedHandleMaintain(PoolId poolId, int24 newLower, int24 newUpper, uint256 volatility) external {
        _handleMaintain(poolId, newLower, newUpper, volatility);
    }

    function exposedSettleOrTake(Currency currency) external {
        _settleOrTake(currency);
    }

    function exposedGetPoolKey(PoolId poolId) external view returns (PoolKey memory) {
        return _getPoolKey(poolId);
    }

    function exposedEnsureSufficientIdle(PoolId poolId, uint256 required0, uint256 required1) external {
        _ensureSufficientIdle(poolId, required0, required1);
    }

    function exposedDistributeIdleToAave(
        PoolId poolId,
        Currency currency,
        address aToken,
        uint256 amount
    ) external {
        _distributeIdleToAave(poolId, currency, aToken, amount);
    }

    function setActiveLiquidity(PoolId poolId, uint128 liquidity) external {
        poolStates[poolId].activeLiquidity = liquidity;
    }

    function setIdleBalances(PoolId poolId, uint256 idle0, uint256 idle1) external {
        poolStates[poolId].idle0 = idle0;
        poolStates[poolId].idle1 = idle1;
    }

    function setATokenShares(PoolId poolId, uint256 shares0, uint256 shares1) external {
        PoolState storage state = poolStates[poolId];

        if (state.aToken0 != address(0)) {
            uint256 old0 = state.aave0;
            state.aave0 = shares0;
            aTokenTotalShares[state.aToken0] = aTokenTotalShares[state.aToken0] - old0 + shares0;
        }

        if (state.aToken1 != address(0)) {
            uint256 old1 = state.aave1;
            state.aave1 = shares1;
            aTokenTotalShares[state.aToken1] = aTokenTotalShares[state.aToken1] - old1 + shares1;
        }
    }

    function setTicks(PoolId poolId, int24 lower, int24 upper) external {
        poolStates[poolId].activeTickLower = lower;
        poolStates[poolId].activeTickUpper = upper;
    }

    function setTotalShares(PoolId poolId, uint256 totalShares_) external {
        poolStates[poolId].totalShares = totalShares_;
    }

    function setLPShares(PoolId poolId, address lp, uint256 shares) external {
        lpShares[poolId][lp] = shares;
    }
}
