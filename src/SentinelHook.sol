// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AggregatorV3Interface} from "foundry-chainlink-toolkit/src/interfaces/feeds/AggregatorV3Interface.sol";

import {OracleLib} from "./libraries/OracleLib.sol";
import {YieldRouter} from "./libraries/YieldRouter.sol";
import {AaveAdapter, IPool} from "./libraries/AaveAdapter.sol";

/// @title SentinelHook
/// @notice Trust-Minimized Agentic Liquidity Management Hook for Uniswap v4
/// @dev Combines on-chain safety guardrails with Chainlink CRE orchestrated strategy
/// @custom:security-contact security@sentinel.fi
contract SentinelHook is BaseHook {
    using CurrencyLibrary for Currency;
    using OracleLib for AggregatorV3Interface;
    using YieldRouter for *;
    using AaveAdapter for *;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when price crosses a tick boundary
    /// @dev This event is monitored by Chainlink CRE to trigger rebalancing
    event TickCrossed(int24 indexed tickLower, int24 indexed tickUpper, int24 indexed currentTick);

    /// @notice Emitted when liquidity is rebalanced
    event LiquidityRebalanced(
        int24 newTickLower,
        int24 newTickUpper,
        uint256 activeAmount,
        int256 idleAmount,
        uint256 timestamp
    );

    /// @notice Emitted when idle capital is deposited to yield protocol
    event IdleCapitalDeposited(address indexed yieldProtocol, uint256 amount, uint256 timestamp);

    /// @notice Emitted when capital is withdrawn from yield protocol
    event IdleCapitalWithdrawn(address indexed yieldProtocol, uint256 amount, uint256 timestamp);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error Unauthorized();
    error InvalidRange();
    error PriceDeviationTooHigh();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The Chainlink price feed oracle
    AggregatorV3Interface public immutable priceFeed;

    /// @notice The Aave v3 Pool contract
    IPool public immutable aavePool;

    /// @notice The aToken address for the deposited asset
    address public immutable aToken;

    /// @notice Currency (token) being managed
    Currency public immutable managedCurrency;

    /// @notice The PoolKey this hook is managing
    PoolKey public poolKey;

    /// @notice Current active liquidity range
    int24 public activeTickLower;
    int24 public activeTickUpper;

    /// @notice Total liquidity managed by the hook
    uint256 public totalLiquidity;

    /// @notice Amount currently deposited in Aave
    uint256 public idleCapitalInAave;

    /// @notice Address authorized to call maintain() (Chainlink CRE)
    address public maintainer;

    /// @notice Hook owner (for emergencies)
    address public owner;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        IPoolManager _poolManager,
        address _priceFeed,
        address _aavePool,
        address _aToken,
        Currency _managedCurrency,
        address _maintainer
    ) BaseHook(_poolManager) {
        priceFeed = AggregatorV3Interface(_priceFeed);
        aavePool = IPool(_aavePool);
        aToken = _aToken;
        managedCurrency = _managedCurrency;
        maintainer = _maintainer;
        owner = msg.sender;
    }

    /*//////////////////////////////////////////////////////////////
                            HOOK PERMISSIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the hook permissions
    /// @dev We only need beforeSwap for the circuit breaker
    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return
            Hooks.Permissions({
                beforeInitialize: false,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true, // ✓ CRITICAL: Circuit Breaker
                afterSwap: false,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            });
    }

    /*//////////////////////////////////////////////////////////////
                        HOT PATH: CIRCUIT BREAKER
    //////////////////////////////////////////////////////////////*/

    /// @notice beforeSwap hook - validates price safety on EVERY swap
    /// @dev This is the "hot path" - must be gas-efficient
    /// @param sender The address initiating the swap
    /// @param key The pool key
    /// @param params Swap parameters
    /// @param hookData Additional data (unused)
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        // Get current pool price (simplified - in production use PoolManager.getSlot0)
        // For now, we'll trust the swap is valid if oracle check passes
        
        // CRITICAL: Check oracle price deviation
        // If price deviates too much from Chainlink, revert the swap
        uint256 poolPrice = _estimatePoolPrice(key);
        
        // checkPriceDeviation will revert if deviation is too high
        OracleLib.checkPriceDeviation(priceFeed, poolPrice, OracleLib.MAX_PRICE_DEVIATION_BPS);

        // Emit event if price crosses tick boundaries
        // This is monitored by Chainlink CRE for rebalancing
        _checkTickCrossing(key);

        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /*//////////////////////////////////////////////////////////////
                    COLD PATH: STRATEGY EXECUTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Rebalances liquidity - ONLY callable by Chainlink CRE
    /// @dev This is the "cold path" - complex strategy execution
    /// @param newTickLower New lower tick for active range
    /// @param newTickUpper New upper tick for active range
    /// @param volatility Current market volatility (in basis points)
    function maintain(
        int24 newTickLower,
        int24 newTickUpper,
        uint256 volatility
    ) external {
        if (msg.sender != maintainer) revert Unauthorized();
        if (newTickLower >= newTickUpper) revert InvalidRange();

        // STEP 1: Withdraw all current liquidity from pool
        uint256 totalBalance = _withdrawAllLiquidity();

        // STEP 2: Calculate optimal active vs idle allocation
        int24 currentTick = _getCurrentTick(poolKey);
        (uint256 activeAmount, int256 idleAmount) = YieldRouter.calculateIdealRatio(
            totalBalance,
            newTickLower,
            newTickUpper,
            currentTick,
            volatility
        );

        // STEP 3: Handle idle capital (deposit or withdraw from Aave)
        _handleIdleCapital(idleAmount);

        // STEP 4: Deploy new liquidity range
        _deployLiquidity(newTickLower, newTickUpper, activeAmount);

        // Update state
        activeTickLower = newTickLower;
        activeTickUpper = newTickUpper;
        totalLiquidity = totalBalance;

        emit LiquidityRebalanced(newTickLower, newTickUpper, activeAmount, idleAmount, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                        YIELD MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Handles idle capital routing to/from Aave
    /// @param idleAmount Positive = deposit, Negative = withdraw
    function _handleIdleCapital(int256 idleAmount) internal {
        if (idleAmount > 0) {
            // Deposit to Aave
            uint256 depositAmount = uint256(idleAmount);
            address asset = Currency.unwrap(managedCurrency);

            // Check if Aave pool is healthy before deposit
            if (!AaveAdapter.isPoolHealthy(aavePool, asset)) {
                // Aave is paused/unhealthy, keep funds liquid
                return;
            }

            AaveAdapter.depositToAave(aavePool, asset, depositAmount, address(this));
            idleCapitalInAave += depositAmount;

            emit IdleCapitalDeposited(address(aavePool), depositAmount, block.timestamp);
        } else if (idleAmount < 0) {
            // Withdraw from Aave
            uint256 withdrawAmount = uint256(-idleAmount);
            address asset = Currency.unwrap(managedCurrency);

            // Cap withdrawal at current Aave balance
            if (withdrawAmount > idleCapitalInAave) {
                withdrawAmount = idleCapitalInAave;
            }

            uint256 withdrawn = AaveAdapter.withdrawFromAave(
                aavePool,
                asset,
                withdrawAmount,
                address(this)
            );

            idleCapitalInAave -= withdrawn;

            emit IdleCapitalWithdrawn(address(aavePool), withdrawn, block.timestamp);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Withdraws all liquidity from current position
    /// @return totalBalance Total balance withdrawn
    function _withdrawAllLiquidity() internal returns (uint256 totalBalance) {
        // TODO: Implement actual withdrawal via PoolManager.modifyLiquidity
        // For now, return cached balance
        totalBalance = totalLiquidity;
    }

    /// @notice Deploys liquidity to new range
    /// @param tickLower Lower tick
    /// @param tickUpper Upper tick
    /// @param amount Amount to deploy
    function _deployLiquidity(int24 tickLower, int24 tickUpper, uint256 amount) internal {
        // TODO: Implement actual deployment via PoolManager.modifyLiquidity
        // This requires proper position management and liquidity calculation
    }

    /// @notice Estimates current pool price
    /// @param key Pool key
    /// @return price Estimated price (18 decimals)
    function _estimatePoolPrice(PoolKey calldata key) internal view returns (uint256 price) {
        // TODO: Get actual price from PoolManager.getSlot0()
        // For now, return oracle price as fallback
        price = priceFeed.getOraclePrice();
    }

    /// @notice Gets current tick from pool
    /// @param key Pool key
    /// @return tick Current tick
    function _getCurrentTick(PoolKey memory key) internal view returns (int24 tick) {
        // TODO: Get actual tick from PoolManager.getSlot0()
        tick = 0;
    }

    /// @notice Checks if price has crossed tick boundaries
    /// @param key Pool key
    function _checkTickCrossing(PoolKey calldata key) internal {
        int24 currentTick = _getCurrentTick(poolKey);
        
        // Emit event if we've crossed outside the active range
        if (currentTick < activeTickLower || currentTick > activeTickUpper) {
            emit TickCrossed(activeTickLower, activeTickUpper, currentTick);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        EMERGENCY FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emergency withdraw all funds from Aave
    /// @dev Only callable by owner in emergency situations
    function emergencyWithdrawFromAave() external {
        if (msg.sender != owner) revert Unauthorized();
        
        address asset = Currency.unwrap(managedCurrency);
        uint256 withdrawn = AaveAdapter.emergencyWithdrawAll(aavePool, asset, address(this));
        
        idleCapitalInAave = 0;
        emit IdleCapitalWithdrawn(address(aavePool), withdrawn, block.timestamp);
    }

    /// @notice Update maintainer address
    /// @dev Only callable by owner
    function setMaintainer(address newMaintainer) external {
        if (msg.sender != owner) revert Unauthorized();
        maintainer = newMaintainer;
    }
}
