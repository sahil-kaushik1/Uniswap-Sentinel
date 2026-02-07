// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AggregatorV3Interface} from "foundry-chainlink-toolkit/src/interfaces/feeds/AggregatorV3Interface.sol";
import {ReentrancyGuard} from "solmate/src/utils/ReentrancyGuard.sol";

import {OracleLib} from "./libraries/OracleLib.sol";
import {YieldRouter} from "./libraries/YieldRouter.sol";
import {AaveAdapter, IPool} from "./libraries/AaveAdapter.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/src/libraries/TransientStateLibrary.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @title SentinelHook
/// @notice Multi-Pool Trust-Minimized Agentic Liquidity Management Hook for Uniswap v4
/// @dev One hook serves unlimited pools. Each pool has isolated state and LP accounting.
/// @custom:security-contact security@sentinel.fi
contract SentinelHook is BaseHook, ReentrancyGuard {
    using CurrencyLibrary for Currency;
    using OracleLib for AggregatorV3Interface;
    using PoolIdLibrary for PoolKey;
    using TransientStateLibrary for IPoolManager;

    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Per-pool state containing all pool-specific configuration and LP data
    struct PoolState {
        // Range Management
        int24 activeTickLower;
        int24 activeTickUpper;
        uint128 activeLiquidity;
        // Oracle & Safety
        address priceFeed; // Chainlink oracle for this pair
        bool priceFeedInverted; // If oracle returns token0 per token1
        uint256 maxDeviationBps; // Pool-specific deviation threshold
        // Yield Configuration
        // Map pool token -> aToken (address(0) if no yield market)
        address aToken0;
        address aToken1;
        // Idle balances (per-pool accounting)
        uint256 idle0;
        uint256 idle1;
        // Aave aToken shares (per-pool accounting)
        uint256 aave0;
        uint256 aave1;
        // Pool Tokens (cached for efficiency)
        Currency currency0;
        Currency currency1;
        uint8 decimals0;
        uint8 decimals1;
        // Pool configuration (cached for PoolKey reconstruction)
        uint24 fee;
        int24 tickSpacing;
        // LP Accounting
        uint256 totalShares;
        // Status
        bool isInitialized;
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a new pool is initialized with Sentinel
    event PoolInitialized(
        PoolId indexed poolId,
        address priceFeed,
        bool priceFeedInverted,
        address aToken0,
        address aToken1
    );

    /// @notice Emitted when price crosses a tick boundary (per-pool)
    event TickCrossed(
        PoolId indexed poolId,
        int24 tickLower,
        int24 tickUpper,
        int24 currentTick
    );

    /// @notice Emitted when liquidity is rebalanced (per-pool)
    event LiquidityRebalanced(
        PoolId indexed poolId,
        int24 newTickLower,
        int24 newTickUpper,
        uint256 activeAmount,
        int256 idleAmount
    );

    /// @notice Emitted when idle capital is deposited to yield protocol
    event IdleCapitalDeposited(
        PoolId indexed poolId,
        address indexed yieldProtocol,
        uint256 amount
    );

    /// @notice Emitted when capital is withdrawn from yield protocol
    event IdleCapitalWithdrawn(
        PoolId indexed poolId,
        address indexed yieldProtocol,
        uint256 amount
    );

    /// @notice Emitted when an LP deposits liquidity
    event LPDeposited(
        PoolId indexed poolId,
        address indexed lp,
        uint256 amount0,
        uint256 amount1,
        uint256 sharesReceived
    );

    /// @notice Emitted when an LP withdraws liquidity
    event LPWithdrawn(
        PoolId indexed poolId,
        address indexed lp,
        uint256 amount0,
        uint256 amount1,
        uint256 sharesBurned
    );

    /// @notice Emitted when a new LP is registered to a pool
    event LPRegistered(PoolId indexed poolId, address indexed lp);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error Unauthorized();
    error InvalidRange();
    error PriceDeviationTooHigh();
    error InsufficientShares();
    error InvalidDepositAmount();
    error NoDepositsYet();
    error PoolNotInitialized();
    error PoolAlreadyInitialized();
    error InvalidYieldCurrency();

    /*//////////////////////////////////////////////////////////////
                            ACTION CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint8 internal constant ACTION_WITHDRAW = 1;
    uint8 internal constant ACTION_MAINTAIN = 2;
    uint8 internal constant ACTION_DEPOSIT = 3;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The Aave v3 Pool contract (shared across all pools)
    IPool public immutable aavePool;

    /// @notice Address authorized to call maintain() (Chainlink Automation executor)
    address public maintainer;

    /// @notice Hook owner (for emergencies and pool initialization)
    address public owner;

    /// @notice Per-pool state storage
    mapping(PoolId => PoolState) public poolStates;

    /// @notice Per-pool LP share balances
    mapping(PoolId => mapping(address => uint256)) public lpShares;

    /// @notice Per-pool registered LPs array
    mapping(PoolId => address[]) public registeredLPs;

    /// @notice Per-pool LP registration status
    mapping(PoolId => mapping(address => bool)) public isLPRegistered;

    /// @notice List of all initialized pool IDs
    PoolId[] public allPools;

    /// @notice Global aToken share totals (per aToken)
    mapping(address => uint256) public aTokenTotalShares;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        IPoolManager _poolManager,
        address _aavePool,
        address _maintainer,
        address _owner
    ) BaseHook(_poolManager) {
        aavePool = IPool(_aavePool);
        maintainer = _maintainer;
        owner = _owner;
    }

    /*//////////////////////////////////////////////////////////////
                            HOOK PERMISSIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the hook permissions
    /// @dev Only beforeSwap for gas-efficient circuit breaker
    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return
            Hooks.Permissions({
                beforeInitialize: true, // To register pool
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true, // Circuit Breaker
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
                        POOL INITIALIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Hook called before pool initialization - registers pool with Sentinel
    function _beforeInitialize(
        address,
        /* sender */
        PoolKey calldata,
        /* key */
        uint160 /* sqrtPriceX96 */
    ) internal pure override returns (bytes4) {
        // Pool will be initialized in Uniswap, we just note it exists
        // Actual Sentinel config is done via initializePool()
        return this.beforeInitialize.selector;
    }

    /// @notice Initialize Sentinel management for a pool
    /// @param key The pool key
    /// @param priceFeed Chainlink oracle address for this pair
    /// @param aToken0 The corresponding aToken address
    /// @param aToken1 The corresponding aToken address
    /// @param maxDeviationBps Maximum price deviation allowed (circuit breaker)
    /// @param initialTickLower Initial lower tick for active range
    /// @param initialTickUpper Initial upper tick for active range
    function initializePool(
        PoolKey calldata key,
        address priceFeed,
        bool priceFeedInverted,
        address aToken0,
        address aToken1,
        uint256 maxDeviationBps,
        int24 initialTickLower,
        int24 initialTickUpper
    ) external {
        if (msg.sender != owner) revert Unauthorized();

        PoolId poolId = key.toId();
        PoolState storage state = poolStates[poolId];

        if (state.isInitialized) revert PoolAlreadyInitialized();

        // Initialize pool state
        state.activeTickLower = initialTickLower;
        state.activeTickUpper = initialTickUpper;
        state.activeLiquidity = 0;
        state.priceFeed = priceFeed;
        state.priceFeedInverted = priceFeedInverted;
        state.maxDeviationBps = maxDeviationBps;
        state.aToken0 = aToken0;
        state.aToken1 = aToken1;
        state.idle0 = 0;
        state.idle1 = 0;
        state.aave0 = 0;
        state.aave1 = 0;
        state.currency0 = key.currency0;
        state.currency1 = key.currency1;
        state.decimals0 = _getCurrencyDecimals(key.currency0);
        state.decimals1 = _getCurrencyDecimals(key.currency1);
        state.fee = key.fee;
        state.tickSpacing = key.tickSpacing;
        state.totalShares = 0;
        state.isInitialized = true;

        // Track this pool
        allPools.push(poolId);

        emit PoolInitialized(
            poolId,
            priceFeed,
            priceFeedInverted,
            aToken0,
            aToken1
        );
    }

    /*//////////////////////////////////////////////////////////////
                            UNLOCK CALLBACK
    //////////////////////////////////////////////////////////////*/

    /// @notice Handler for PoolManager.unlock callback
    function unlockCallback(
        bytes calldata data
    ) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");

        uint8 action = abi.decode(data, (uint8));

        if (action == ACTION_WITHDRAW) {
            (, PoolId poolId, address lp, uint256 shares) = abi.decode(
                data,
                (uint8, PoolId, address, uint256)
            );
            return _handleWithdraw(poolId, lp, shares);
        } else if (action == ACTION_MAINTAIN) {
            (
                ,
                PoolId poolId,
                int24 newLower,
                int24 newUpper,
                uint256 volatility
            ) = abi.decode(data, (uint8, PoolId, int24, int24, uint256));
            _handleMaintain(poolId, newLower, newUpper, volatility);
            return "";
        }

        return "";
    }

    /*//////////////////////////////////////////////////////////////
                        LP DEPOSIT FUNCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposits liquidity to a specific pool
    /// @param key The pool key
    /// @param amount0 Amount of token0 to deposit
    /// @param amount1 Amount of token1 to deposit
    /// @return sharesReceived The number of shares minted
    function depositLiquidity(
        PoolKey calldata key,
        uint256 amount0,
        uint256 amount1
    ) external payable nonReentrant returns (uint256 sharesReceived) {
        PoolId poolId = key.toId();
        PoolState storage state = poolStates[poolId];

        if (!state.isInitialized) revert PoolNotInitialized();
        if (amount0 == 0 && amount1 == 0) revert InvalidDepositAmount();

        // Transfer tokens from user
        _collectDeposit(state.currency0, state.currency1, amount0, amount1);

        // Calculate liquidity value of the deposit
        (uint160 sqrtPriceX96, , , ) = StateLibrary.getSlot0(
            poolManager,
            poolId
        );

        uint160 sqrtRatioAX96 = TickMath.getSqrtPriceAtTick(
            state.activeTickLower
        );
        uint160 sqrtRatioBX96 = TickMath.getSqrtPriceAtTick(
            state.activeTickUpper
        );

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            sqrtRatioAX96,
            sqrtRatioBX96,
            amount0,
            amount1
        );

        // Calculate shares to mint
        uint256 totalLiquidityUnits = _calculateTotalLiquidity(
            poolId,
            sqrtPriceX96
        );

        // Track idle balances for this pool after valuation
        if (amount0 > 0) state.idle0 += amount0;
        if (amount1 > 0) state.idle1 += amount1;

        if (state.totalShares == 0 || totalLiquidityUnits == 0) {
            sharesReceived = uint256(liquidity);
        } else {
            sharesReceived =
                (uint256(liquidity) * state.totalShares) /
                totalLiquidityUnits;
        }

        if (sharesReceived == 0) revert InvalidDepositAmount();

        // Register LP if first time
        if (!isLPRegistered[poolId][msg.sender]) {
            isLPRegistered[poolId][msg.sender] = true;
            registeredLPs[poolId].push(msg.sender);
            emit LPRegistered(poolId, msg.sender);
        }

        // Update balances
        lpShares[poolId][msg.sender] += sharesReceived;
        state.totalShares += sharesReceived;

        emit LPDeposited(poolId, msg.sender, amount0, amount1, sharesReceived);
        return sharesReceived;
    }

    /// @notice Internal function to collect deposit tokens
    function _collectDeposit(
        Currency currency0,
        Currency currency1,
        uint256 amount0,
        uint256 amount1
    ) internal {
        if (Currency.unwrap(currency0) == address(0)) {
            require(msg.value >= amount0, "Insufficient ETH");
        } else if (amount0 > 0) {
            bool success = IERC20(Currency.unwrap(currency0)).transferFrom(
                msg.sender,
                address(this),
                amount0
            );
            require(success, "Transfer0 failed");
        }

        if (Currency.unwrap(currency1) == address(0)) {
            require(msg.value >= amount1, "Insufficient ETH");
        } else if (amount1 > 0) {
            bool success = IERC20(Currency.unwrap(currency1)).transferFrom(
                msg.sender,
                address(this),
                amount1
            );
            require(success, "Transfer1 failed");
        }
    }

    receive() external payable {}

    /*//////////////////////////////////////////////////////////////
                        LP WITHDRAWAL FUNCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Withdraws liquidity from a specific pool by burning shares
    /// @param key The pool key
    /// @param sharesToWithdraw Number of shares to burn
    /// @return amount0 Token0 received
    /// @return amount1 Token1 received
    function withdrawLiquidity(
        PoolKey calldata key,
        uint256 sharesToWithdraw
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        PoolId poolId = key.toId();

        if (!poolStates[poolId].isInitialized) revert PoolNotInitialized();

        bytes memory data = abi.encode(
            ACTION_WITHDRAW,
            poolId,
            msg.sender,
            sharesToWithdraw
        );
        bytes memory result = poolManager.unlock(data);
        (amount0, amount1) = abi.decode(result, (uint256, uint256));
    }

    /// @notice Internal withdrawal logic (called inside unlock)
    function _handleWithdraw(
        PoolId poolId,
        address lp,
        uint256 sharesToWithdraw
    ) internal returns (bytes memory) {
        PoolState storage state = poolStates[poolId];

        if (lpShares[poolId][lp] < sharesToWithdraw)
            revert InsufficientShares();
        if (state.totalShares == 0) revert NoDepositsYet();

        uint256 shareFraction = (sharesToWithdraw * 1e18) / state.totalShares;

        // 1. Withdraw proportional Active Liquidity from Pool
        uint128 liquidityToWithdraw = uint128(
            (uint256(state.activeLiquidity) * shareFraction) / 1e18
        );

        uint256 active0;
        uint256 active1;

        if (liquidityToWithdraw > 0) {
            (active0, active1) = _withdrawLiquidityFromPool(
                poolId,
                liquidityToWithdraw
            );
            state.activeLiquidity -= liquidityToWithdraw;
        }

        // 2. Calculate proportional Idle Capital
        uint256 idle0ToWithdraw;
        uint256 idle1ToWithdraw;

        (uint256 totalIdle0, uint256 totalIdle1) = _getTotalIdleBalances(
            poolId
        );

        idle0ToWithdraw = (totalIdle0 * shareFraction) / 1e18;
        idle1ToWithdraw = (totalIdle1 * shareFraction) / 1e18;

        // Add withdrawn active amounts to idle balances before computing withdrawal
        if (active0 > 0) state.idle0 += active0;
        if (active1 > 0) state.idle1 += active1;

        // Ensure sufficient idle tokens (withdraw from Aave if needed)
        _ensureSufficientIdle(poolId, idle0ToWithdraw, idle1ToWithdraw);

        // Update share balances
        lpShares[poolId][lp] -= sharesToWithdraw;
        state.totalShares -= sharesToWithdraw;

        // Transfer amounts
        uint256 amount0 = active0 + idle0ToWithdraw;
        uint256 amount1 = active1 + idle1ToWithdraw;

        // Update idle balances after withdrawal
        if (amount0 > 0) {
            if (state.idle0 >= amount0) {
                state.idle0 -= amount0;
            } else {
                state.idle0 = 0;
            }
        }
        if (amount1 > 0) {
            if (state.idle1 >= amount1) {
                state.idle1 -= amount1;
            } else {
                state.idle1 = 0;
            }
        }

        if (amount0 > 0) _transferTo(state.currency0, lp, amount0);
        if (amount1 > 0) _transferTo(state.currency1, lp, amount1);

        emit LPWithdrawn(poolId, lp, amount0, amount1, sharesToWithdraw);

        return abi.encode(amount0, amount1);
    }

    function _getTotalIdleBalances(
        PoolId poolId
    ) internal view returns (uint256 totalIdle0, uint256 totalIdle1) {
        PoolState storage state = poolStates[poolId];
        totalIdle0 =
            state.idle0 +
            _getPoolATokenClaim(state.aToken0, state.aave0);
        totalIdle1 =
            state.idle1 +
            _getPoolATokenClaim(state.aToken1, state.aave1);
    }

    /*//////////////////////////////////////////////////////////////
                        HOT PATH: BEFORE SWAP
    //////////////////////////////////////////////////////////////*/

    /// @notice beforeSwap hook - validates price safety on EVERY swap
    /// @dev This is the "hot path" - must be gas-efficient (<50k gas)
    function _beforeSwap(
        address,
        /* sender */
        PoolKey calldata key,
        IPoolManager.SwapParams calldata,
        /* params */
        bytes calldata /* hookData */
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();
        PoolState storage state = poolStates[poolId];

        // Skip check if pool not initialized with Sentinel
        if (!state.isInitialized) {
            return (
                BaseHook.beforeSwap.selector,
                BeforeSwapDeltaLibrary.ZERO_DELTA,
                0
            );
        }

        // Get pool price from slot0
        uint256 poolPrice = _estimatePoolPrice(poolId, state.priceFeed);

        // Check oracle price deviation - reverts if too high
        uint256 oraclePrice = OracleLib.getOraclePrice(
            AggregatorV3Interface(state.priceFeed)
        );
        if (state.priceFeedInverted) {
            oraclePrice = FullMath.mulDiv(1e36, 1, oraclePrice);
        }

        _checkPriceDeviation(poolPrice, oraclePrice, state.maxDeviationBps);

        // Check if tick crossed range boundary
        _checkTickCrossing(poolId, state);

        return (
            BaseHook.beforeSwap.selector,
            BeforeSwapDeltaLibrary.ZERO_DELTA,
            0
        );
    }

    /*//////////////////////////////////////////////////////////////
                    COLD PATH: STRATEGY EXECUTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Rebalances liquidity for a specific pool - ONLY callable by the configured automation executor
    /// @param poolId The pool to rebalance
    /// @param newTickLower New lower tick
    /// @param newTickUpper New upper tick
    /// @param volatility Current market volatility (basis points)
    function maintain(
        PoolId poolId,
        int24 newTickLower,
        int24 newTickUpper,
        uint256 volatility
    ) external {
        if (msg.sender != maintainer) revert Unauthorized();
        if (!poolStates[poolId].isInitialized) revert PoolNotInitialized();

        bytes memory data = abi.encode(
            ACTION_MAINTAIN,
            poolId,
            newTickLower,
            newTickUpper,
            volatility
        );
        poolManager.unlock(data);
    }

    /// @notice Internal rebalancing logic (called inside unlock)
    function _handleMaintain(
        PoolId poolId,
        int24 newLower,
        int24 newUpper,
        uint256 volatility
    ) internal {
        if (newLower >= newUpper) revert InvalidRange();

        PoolState storage state = poolStates[poolId];

        // 1. Withdraw all current active liquidity
        if (state.activeLiquidity > 0) {
            (uint256 active0, uint256 active1) = _withdrawLiquidityFromPool(
                poolId,
                state.activeLiquidity
            );
            state.activeLiquidity = 0;
            if (active0 > 0) state.idle0 += active0;
            if (active1 > 0) state.idle1 += active1;
        }

        // 2. Withdraw from Aave to consolidate funds (per-pool balances)
        uint256 withdrawn0 = 0;
        uint256 withdrawn1 = 0;

        if (state.aToken0 != address(0) && state.aave0 > 0) {
            uint256 poolClaim0 = _getPoolATokenClaim(
                state.aToken0,
                state.aave0
            );
            if (poolClaim0 > 0) {
                uint256 balanceBefore0 = AaveAdapter.getAaveBalance(
                    state.aToken0,
                    address(this)
                );
                withdrawn0 = AaveAdapter.withdrawFromAave(
                    aavePool,
                    Currency.unwrap(state.currency0),
                    poolClaim0,
                    address(this)
                );
                uint256 burned0 = _burnATokenShares(
                    state.aToken0,
                    state.aave0,
                    withdrawn0,
                    balanceBefore0
                );
                if (burned0 > 0) {
                    state.aave0 -= burned0;
                    aTokenTotalShares[state.aToken0] -= burned0;
                }
                if (withdrawn0 > 0) state.idle0 += withdrawn0;
            }
        }

        if (state.aToken1 != address(0) && state.aave1 > 0) {
            uint256 poolClaim1 = _getPoolATokenClaim(
                state.aToken1,
                state.aave1
            );
            if (poolClaim1 > 0) {
                uint256 balanceBefore1 = AaveAdapter.getAaveBalance(
                    state.aToken1,
                    address(this)
                );
                withdrawn1 = AaveAdapter.withdrawFromAave(
                    aavePool,
                    Currency.unwrap(state.currency1),
                    poolClaim1,
                    address(this)
                );
                uint256 burned1 = _burnATokenShares(
                    state.aToken1,
                    state.aave1,
                    withdrawn1,
                    balanceBefore1
                );
                if (burned1 > 0) {
                    state.aave1 -= burned1;
                    aTokenTotalShares[state.aToken1] -= burned1;
                }
                if (withdrawn1 > 0) state.idle1 += withdrawn1;
            }
        }

        if (withdrawn0 > 0 || withdrawn1 > 0) {
            emit IdleCapitalWithdrawn(
                poolId,
                address(aavePool),
                withdrawn0 + withdrawn1
            );
        }

        // 3. Calculate and deploy to new range using YieldRouter
        (, int24 currentTick, , ) = StateLibrary.getSlot0(poolManager, poolId);

        uint256 poolPrice = _estimatePoolPrice(poolId, state.priceFeed);

        uint256 idle0Amount18 = _to18Decimals(state.idle0, state.decimals0);
        uint256 idle1Amount18 = _to18Decimals(state.idle1, state.decimals1);

        uint256 idle0Value18 = FullMath.mulDiv(idle0Amount18, poolPrice, 1e18);
        uint256 idle1Value18 = idle1Amount18;
        uint256 totalValue = idle0Value18 + idle1Value18;

        // If there's not enough total value to deploy, still record the new range
        // and skip deployment to avoid reverting.
        if (totalValue < YieldRouter.MIN_ACTIVE_LIQUIDITY) {
            state.activeLiquidity = 0;
            state.activeTickLower = newLower;
            state.activeTickUpper = newUpper;

            emit LiquidityRebalanced(
                poolId,
                newLower,
                newUpper,
                0,
                int256(state.idle0 + state.idle1)
            );
            return;
        }

        uint256 targetIdleValue = 0;
        if (totalValue > 0) {
            (, int256 idleAmount) = YieldRouter.calculateIdealRatio(
                totalValue,
                newLower,
                newUpper,
                currentTick,
                volatility
            );
            if (idleAmount > 0) {
                targetIdleValue = uint256(idleAmount);
                if (targetIdleValue > totalValue) {
                    targetIdleValue = totalValue;
                }
            }
        }

        uint256 targetIdle0 = 0;
        uint256 targetIdle1 = 0;
        if (totalValue > 0 && targetIdleValue > 0) {
            uint256 targetIdle0Value18 = (targetIdleValue * idle0Value18) /
                totalValue;
            uint256 targetIdle1Value18 = targetIdleValue - targetIdle0Value18;

            uint256 targetIdle0Amount18 = FullMath.mulDiv(
                targetIdle0Value18,
                1e18,
                poolPrice
            );

            targetIdle0 = _from18Decimals(targetIdle0Amount18, state.decimals0);
            targetIdle1 = _from18Decimals(targetIdle1Value18, state.decimals1);
        }

        uint256 deploy0 = state.idle0 > targetIdle0
            ? state.idle0 - targetIdle0
            : 0;
        uint256 deploy1 = state.idle1 > targetIdle1
            ? state.idle1 - targetIdle1
            : 0;

        uint128 deployed;
        uint256 spent0;
        uint256 spent1;
        if (deploy0 > 0 || deploy1 > 0) {
            (deployed, spent0, spent1) = _deployLiquidity(
                poolId,
                newLower,
                newUpper,
                deploy0,
                deploy1
            );
            state.activeLiquidity = deployed;
            state.activeTickLower = newLower;
            state.activeTickUpper = newUpper;
        } else {
            state.activeLiquidity = 0;
            state.activeTickLower = newLower;
            state.activeTickUpper = newUpper;

            if (spent0 > state.idle0) spent0 = state.idle0;
            if (spent1 > state.idle1) spent1 = state.idle1;
            state.idle0 -= spent0;
            state.idle1 -= spent1;
        }

        // 4. Deposit remaining idle balances to Aave (Both assets)
        if (
            state.aToken0 != address(0) &&
            state.idle0 > YieldRouter.MIN_YIELD_DEPOSIT
        ) {
            _distributeIdleToAave(
                poolId,
                state.currency0,
                state.aToken0,
                state.idle0
            );
        }

        if (
            state.aToken1 != address(0) &&
            state.idle1 > YieldRouter.MIN_YIELD_DEPOSIT
        ) {
            _distributeIdleToAave(
                poolId,
                state.currency1,
                state.aToken1,
                state.idle1
            );
        }

        emit LiquidityRebalanced(
            poolId,
            newLower,
            newUpper,
            uint256(deployed),
            int256(state.idle0 + state.idle1)
        );
    }

    /*//////////////////////////////////////////////////////////////
                        YIELD MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    function _distributeIdleToAave(
        PoolId poolId,
        Currency currency,
        address aToken,
        uint256 amount
    ) internal {
        if (amount == 0) return;
        address asset = Currency.unwrap(currency);

        if (!AaveAdapter.isPoolHealthy(aavePool, asset)) return;
        PoolState storage state = poolStates[poolId];

        if (currency == state.currency0) {
            if (amount > state.idle0) amount = state.idle0;
            if (amount == 0) return;
            uint256 beforeBal = AaveAdapter.getAaveBalance(
                aToken,
                address(this)
            );
            AaveAdapter.depositToAave(aavePool, asset, amount, address(this));
            uint256 afterBal = AaveAdapter.getAaveBalance(
                aToken,
                address(this)
            );
            uint256 minted = afterBal - beforeBal;
            state.idle0 -= amount;
            state.aave0 += minted;
            aTokenTotalShares[aToken] += minted;
        } else if (currency == state.currency1) {
            if (amount > state.idle1) amount = state.idle1;
            if (amount == 0) return;
            uint256 beforeBal = AaveAdapter.getAaveBalance(
                aToken,
                address(this)
            );
            AaveAdapter.depositToAave(aavePool, asset, amount, address(this));
            uint256 afterBal = AaveAdapter.getAaveBalance(
                aToken,
                address(this)
            );
            uint256 minted = afterBal - beforeBal;
            state.idle1 -= amount;
            state.aave1 += minted;
            aTokenTotalShares[aToken] += minted;
        } else {
            revert InvalidYieldCurrency();
        }

        emit IdleCapitalDeposited(poolId, address(aavePool), amount);
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Calculate total liquidity for a pool (active + idle)
    /// @dev TODO: This is a simplified valuation. A proper one would price both tokens against a common asset.
    function _calculateTotalLiquidity(
        PoolId poolId,
        uint160 sqrtPriceX96
    ) internal view returns (uint256 totalLiquidityUnits) {
        PoolState storage state = poolStates[poolId];

        totalLiquidityUnits = uint256(state.activeLiquidity);

        uint256 idle0 = state.idle0 +
            _getPoolATokenClaim(state.aToken0, state.aave0);
        uint256 idle1 = state.idle1 +
            _getPoolATokenClaim(state.aToken1, state.aave1);

        uint160 sqrtRatioAX96 = TickMath.getSqrtPriceAtTick(
            state.activeTickLower
        );
        uint160 sqrtRatioBX96 = TickMath.getSqrtPriceAtTick(
            state.activeTickUpper
        );

        uint128 idleLiquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            sqrtRatioAX96,
            sqrtRatioBX96,
            idle0,
            idle1
        );

        totalLiquidityUnits += uint256(idleLiquidity);
    }

    function _withdrawLiquidityFromPool(
        PoolId poolId,
        uint128 liquidity
    ) internal returns (uint256 amount0, uint256 amount1) {
        if (liquidity == 0) return (0, 0);

        PoolState storage state = poolStates[poolId];

        // Reconstruct PoolKey (simplified - in production, store or derive)
        PoolKey memory key = _getPoolKey(poolId);

        (BalanceDelta delta, ) = poolManager.modifyLiquidity(
            key,
            IPoolManager.ModifyLiquidityParams({
                tickLower: state.activeTickLower,
                tickUpper: state.activeTickUpper,
                liquidityDelta: -int256(int128(liquidity)),
                salt: bytes32(0)
            }),
            ""
        );

        int128 amt0 = delta.amount0();
        int128 amt1 = delta.amount1();
        // v4 returns POSITIVE callerDelta for removal (tokens flowing to caller)
        amount0 = amt0 > 0 ? uint256(uint128(amt0)) : 0;
        amount1 = amt1 > 0 ? uint256(uint128(amt1)) : 0;

        _settleDeltas(state.currency0, state.currency1);
    }

    function _deployLiquidity(
        PoolId poolId,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0,
        uint256 amount1
    )
        internal
        returns (uint128 liquidityMinted, uint256 spent0, uint256 spent1)
    {
        (uint160 sqrtPriceX96, , , ) = StateLibrary.getSlot0(
            poolManager,
            poolId
        );

        liquidityMinted = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0,
            amount1
        );

        if (liquidityMinted > 0) {
            PoolKey memory key = _getPoolKey(poolId);

            poolManager.modifyLiquidity(
                key,
                IPoolManager.ModifyLiquidityParams({
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    liquidityDelta: int256(int128(liquidityMinted)),
                    salt: bytes32(0)
                }),
                ""
            );

            PoolState storage state = poolStates[poolId];

            int256 delta0 = poolManager.currencyDelta(
                address(this),
                state.currency0
            );
            int256 delta1 = poolManager.currencyDelta(
                address(this),
                state.currency1
            );

            if (delta0 < 0) spent0 = uint256(-delta0);
            if (delta1 < 0) spent1 = uint256(-delta1);

            _settleDeltas(state.currency0, state.currency1);
        }
    }

    function _settleDeltas(Currency currency0, Currency currency1) internal {
        _settleOrTake(currency0);
        _settleOrTake(currency1);
    }

    function _settleOrTake(Currency currency) internal {
        int256 delta = poolManager.currencyDelta(address(this), currency);
        if (delta > 0) {
            poolManager.take(currency, address(this), uint256(delta));
        } else if (delta < 0) {
            uint256 amount = uint256(-delta);
            poolManager.sync(currency);
            if (Currency.unwrap(currency) == address(0)) {
                poolManager.settle{value: amount}();
            } else {
                currency.transfer(address(poolManager), amount);
                poolManager.settle();
            }
        }
    }

    function _ensureSufficientIdle(
        PoolId poolId,
        uint256 required0,
        uint256 required1
    ) internal {
        PoolState storage state = poolStates[poolId];

        // Check Token0
        if (state.idle0 < required0 && state.aToken0 != address(0)) {
            uint256 missing0 = required0 - state.idle0;
            uint256 poolClaim0 = _getPoolATokenClaim(
                state.aToken0,
                state.aave0
            );
            uint256 withdraw0 = missing0 > poolClaim0 ? poolClaim0 : missing0;
            if (withdraw0 > 0) {
                uint256 balanceBefore0 = AaveAdapter.getAaveBalance(
                    state.aToken0,
                    address(this)
                );
                uint256 withdrawn0 = AaveAdapter.withdrawFromAave(
                    aavePool,
                    Currency.unwrap(state.currency0),
                    withdraw0,
                    address(this)
                );
                uint256 burned0 = _burnATokenShares(
                    state.aToken0,
                    state.aave0,
                    withdrawn0,
                    balanceBefore0
                );
                if (burned0 > 0) {
                    state.aave0 -= burned0;
                    aTokenTotalShares[state.aToken0] -= burned0;
                }
                if (withdrawn0 > 0) state.idle0 += withdrawn0;
            }
        }

        // Check Token1
        if (state.idle1 < required1 && state.aToken1 != address(0)) {
            uint256 missing1 = required1 - state.idle1;
            uint256 poolClaim1 = _getPoolATokenClaim(
                state.aToken1,
                state.aave1
            );
            uint256 withdraw1 = missing1 > poolClaim1 ? poolClaim1 : missing1;
            if (withdraw1 > 0) {
                uint256 balanceBefore1 = AaveAdapter.getAaveBalance(
                    state.aToken1,
                    address(this)
                );
                uint256 withdrawn1 = AaveAdapter.withdrawFromAave(
                    aavePool,
                    Currency.unwrap(state.currency1),
                    withdraw1,
                    address(this)
                );
                uint256 burned1 = _burnATokenShares(
                    state.aToken1,
                    state.aave1,
                    withdrawn1,
                    balanceBefore1
                );
                if (burned1 > 0) {
                    state.aave1 -= burned1;
                    aTokenTotalShares[state.aToken1] -= burned1;
                }
                if (withdrawn1 > 0) state.idle1 += withdrawn1;
            }
        }
    }

    function _transferTo(
        Currency currency,
        address to,
        uint256 amount
    ) internal {
        if (Currency.unwrap(currency) == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            bool success = IERC20(Currency.unwrap(currency)).transfer(
                to,
                amount
            );
            require(success, "Transfer failed");
        }
    }

    function _getCurrencyDecimals(
        Currency currency
    ) internal view returns (uint8) {
        address token = Currency.unwrap(currency);
        if (token == address(0)) return 18;

        if (token.code.length == 0) return 18;

        try IERC20Decimals(token).decimals() returns (uint8 dec) {
            return dec;
        } catch {
            return 18;
        }
    }

    function _pow10(uint8 exp) internal pure returns (uint256 result) {
        result = 1;
        for (uint8 i = 0; i < exp; i++) {
            result *= 10;
        }
    }

    function _to18Decimals(
        uint256 amount,
        uint8 decimals
    ) internal pure returns (uint256) {
        if (decimals == 18) return amount;
        if (decimals < 18) {
            return amount * _pow10(18 - decimals);
        }
        return amount / _pow10(decimals - 18);
    }

    function _from18Decimals(
        uint256 amount,
        uint8 decimals
    ) internal pure returns (uint256) {
        if (decimals == 18) return amount;
        if (decimals < 18) {
            return amount / _pow10(18 - decimals);
        }
        return amount * _pow10(decimals - 18);
    }

    function _getPoolATokenClaim(
        address aToken,
        uint256 poolShares
    ) internal view returns (uint256 claim) {
        if (aToken == address(0) || poolShares == 0) return 0;
        uint256 totalShares = aTokenTotalShares[aToken];
        if (totalShares == 0) return 0;
        uint256 currentBalance = AaveAdapter.getAaveBalance(
            aToken,
            address(this)
        );
        if (currentBalance == 0) return 0;

        claim = FullMath.mulDiv(currentBalance, poolShares, totalShares);
    }

    function _burnATokenShares(
        address aToken,
        uint256 poolShares,
        uint256 withdrawn,
        uint256 balanceBefore
    ) internal view returns (uint256 sharesBurned) {
        if (aToken == address(0) || withdrawn == 0 || poolShares == 0) return 0;
        uint256 totalShares = aTokenTotalShares[aToken];
        if (totalShares == 0 || balanceBefore == 0) return 0;

        sharesBurned = FullMath.mulDiv(withdrawn, totalShares, balanceBefore);
        if (sharesBurned > poolShares) sharesBurned = poolShares;
    }

    function _estimatePoolPrice(
        PoolId poolId,
        address /* priceFeed */
    ) internal view returns (uint256) {
        (uint160 sqrtPriceX96, , , ) = StateLibrary.getSlot0(
            poolManager,
            poolId
        );

        uint256 priceX18 = FullMath.mulDiv(
            uint256(sqrtPriceX96),
            uint256(sqrtPriceX96) * 1e18,
            uint256(1) << 192
        );

        PoolState storage state = poolStates[poolId];

        uint256 scaleUp = _pow10(state.decimals0);
        uint256 scaleDown = _pow10(state.decimals1);

        return FullMath.mulDiv(priceX18, scaleUp, scaleDown);
    }

    function _checkTickCrossing(
        PoolId poolId,
        PoolState storage state
    ) internal {
        (, int24 currentTick, , ) = StateLibrary.getSlot0(poolManager, poolId);

        if (
            currentTick < state.activeTickLower ||
            currentTick >= state.activeTickUpper
        ) {
            emit TickCrossed(
                poolId,
                state.activeTickLower,
                state.activeTickUpper,
                currentTick
            );
        }
    }

    function _checkPriceDeviation(
        uint256 poolPrice,
        uint256 oraclePrice,
        uint256 maxDeviationBps
    ) internal pure {
        if (poolPrice == 0 || oraclePrice == 0) {
            revert PriceDeviationTooHigh();
        }

        uint256 diff = poolPrice > oraclePrice
            ? poolPrice - oraclePrice
            : oraclePrice - poolPrice;
        uint256 avg = (poolPrice + oraclePrice) / 2;
        uint256 deviationBps = (diff * 10000) / avg;

        if (deviationBps > maxDeviationBps) revert PriceDeviationTooHigh();
    }

    /// @notice Get PoolKey from PoolId (placeholder - needs proper implementation)
    /// @dev TODO: This is a simplified version - in production, store the full PoolKey or derive it properly.
    function _getPoolKey(PoolId poolId) internal view returns (PoolKey memory) {
        PoolState storage state = poolStates[poolId];
        return
            PoolKey({
                currency0: state.currency0,
                currency1: state.currency1,
                fee: state.fee,
                tickSpacing: state.tickSpacing,
                hooks: this
            });
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get pool state
    function getPoolState(
        PoolId poolId
    ) external view returns (PoolState memory) {
        return poolStates[poolId];
    }

    /// @notice Get share price for a pool
    function getSharePrice(
        PoolId poolId
    ) external view returns (uint256 price) {
        PoolState storage state = poolStates[poolId];
        if (state.totalShares == 0) return 1e18;

        (uint160 sqrtPriceX96, , , ) = StateLibrary.getSlot0(
            poolManager,
            poolId
        );
        uint256 nav = _calculateTotalLiquidity(poolId, sqrtPriceX96);

        price = (nav * 1e18) / state.totalShares;
    }

    /// @notice Get LP position in a pool
    function getLPPosition(
        PoolId poolId,
        address lp
    ) external view returns (uint256 shares, uint256 value) {
        shares = lpShares[poolId][lp];
        if (shares == 0) return (0, 0);

        PoolState storage state = poolStates[poolId];
        (uint160 sqrtPriceX96, , , ) = StateLibrary.getSlot0(
            poolManager,
            poolId
        );
        uint256 nav = _calculateTotalLiquidity(poolId, sqrtPriceX96);

        value = (shares * nav) / state.totalShares;
    }

    /// @notice Get number of LPs in a pool
    function getLPCount(PoolId poolId) external view returns (uint256) {
        return registeredLPs[poolId].length;
    }

    /// @notice Get total number of pools managed
    function getTotalPools() external view returns (uint256) {
        return allPools.length;
    }

    /// @notice Get pool ID by index
    function getPoolByIndex(uint256 index) external view returns (PoolId) {
        return allPools[index];
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Update maintainer address
    function setMaintainer(address newMaintainer) external {
        if (msg.sender != owner) revert Unauthorized();
        maintainer = newMaintainer;
    }

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert Unauthorized();
        owner = newOwner;
    }

    /// @notice Emergency withdraw from Aave for a pool
    function emergencyWithdrawFromAave(PoolId poolId) external {
        if (msg.sender != owner) revert Unauthorized();

        PoolState storage state = poolStates[poolId];
        uint256 totalWithdrawn = 0;

        if (state.aToken0 != address(0) && state.aave0 > 0) {
            uint256 poolClaim0 = _getPoolATokenClaim(
                state.aToken0,
                state.aave0
            );
            if (poolClaim0 > 0) {
                uint256 balanceBefore0 = AaveAdapter.getAaveBalance(
                    state.aToken0,
                    address(this)
                );
                uint256 withdrawn0 = AaveAdapter.emergencyWithdraw(
                    aavePool,
                    Currency.unwrap(state.currency0),
                    poolClaim0,
                    address(this)
                );
                uint256 burned0 = _burnATokenShares(
                    state.aToken0,
                    state.aave0,
                    withdrawn0,
                    balanceBefore0
                );
                if (burned0 > 0) {
                    state.aave0 -= burned0;
                    aTokenTotalShares[state.aToken0] -= burned0;
                }
                if (withdrawn0 > 0) {
                    state.idle0 += withdrawn0;
                    totalWithdrawn += withdrawn0;
                }
            }
        }

        if (state.aToken1 != address(0) && state.aave1 > 0) {
            uint256 poolClaim1 = _getPoolATokenClaim(
                state.aToken1,
                state.aave1
            );
            if (poolClaim1 > 0) {
                uint256 balanceBefore1 = AaveAdapter.getAaveBalance(
                    state.aToken1,
                    address(this)
                );
                uint256 withdrawn1 = AaveAdapter.emergencyWithdraw(
                    aavePool,
                    Currency.unwrap(state.currency1),
                    poolClaim1,
                    address(this)
                );
                uint256 burned1 = _burnATokenShares(
                    state.aToken1,
                    state.aave1,
                    withdrawn1,
                    balanceBefore1
                );
                if (burned1 > 0) {
                    state.aave1 -= burned1;
                    aTokenTotalShares[state.aToken1] -= burned1;
                }
                if (withdrawn1 > 0) {
                    state.idle1 += withdrawn1;
                    totalWithdrawn += withdrawn1;
                }
            }
        }

        emit IdleCapitalWithdrawn(poolId, address(aavePool), totalWithdrawn);
    }

    /// @notice Credit idle balances for a pool (owner-only reconciliation)
    function creditIdle(
        PoolId poolId,
        uint256 amount0,
        uint256 amount1
    ) external {
        if (msg.sender != owner) revert Unauthorized();
        PoolState storage state = poolStates[poolId];
        if (!state.isInitialized) revert PoolNotInitialized();

        if (amount0 > 0) {
            require(
                state.currency0.balanceOf(address(this)) >= amount0,
                "Insufficient balance0"
            );
            state.idle0 += amount0;
        }
        if (amount1 > 0) {
            require(
                state.currency1.balanceOf(address(this)) >= amount1,
                "Insufficient balance1"
            );
            state.idle1 += amount1;
        }
    }
}
