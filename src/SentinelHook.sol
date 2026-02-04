// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {AggregatorV3Interface} from "foundry-chainlink-toolkit/src/interfaces/feeds/AggregatorV3Interface.sol";
import {ReentrancyGuard} from "solmate/src/utils/ReentrancyGuard.sol";

import {OracleLib} from "./libraries/OracleLib.sol";
import {YieldRouter} from "./libraries/YieldRouter.sol";
import {AaveAdapter, IPool} from "./libraries/AaveAdapter.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @title SentinelHook
/// @notice Multi-Pool Trust-Minimized Agentic Liquidity Management Hook for Uniswap v4
/// @dev One hook serves unlimited pools. Each pool has isolated state and LP accounting.
/// @custom:security-contact security@sentinel.fi
contract SentinelHook is BaseHook, ReentrancyGuard {
    using CurrencyLibrary for Currency;
    using OracleLib for AggregatorV3Interface;
    using PoolIdLibrary for PoolKey;

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
        uint256 maxDeviationBps; // Pool-specific deviation threshold

        // Yield Configuration
        Currency yieldCurrency; // Which token goes to Aave
        address aToken; // Corresponding aToken address

        // Pool Tokens (cached for efficiency)
        Currency currency0;
        Currency currency1;

        // LP Accounting
        uint256 totalShares;

        // Status
        bool isInitialized;
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a new pool is initialized with Sentinel
    event PoolInitialized(PoolId indexed poolId, address priceFeed, Currency yieldCurrency, address aToken);

    /// @notice Emitted when price crosses a tick boundary (per-pool)
    event TickCrossed(PoolId indexed poolId, int24 tickLower, int24 tickUpper, int24 currentTick);

    /// @notice Emitted when liquidity is rebalanced (per-pool)
    event LiquidityRebalanced(
        PoolId indexed poolId, int24 newTickLower, int24 newTickUpper, uint256 activeAmount, int256 idleAmount
    );

    /// @notice Emitted when idle capital is deposited to yield protocol
    event IdleCapitalDeposited(PoolId indexed poolId, address indexed yieldProtocol, uint256 amount);

    /// @notice Emitted when capital is withdrawn from yield protocol
    event IdleCapitalWithdrawn(PoolId indexed poolId, address indexed yieldProtocol, uint256 amount);

    /// @notice Emitted when an LP deposits liquidity
    event LPDeposited(
        PoolId indexed poolId, address indexed lp, uint256 amount0, uint256 amount1, uint256 sharesReceived
    );

    /// @notice Emitted when an LP withdraws liquidity
    event LPWithdrawn(
        PoolId indexed poolId, address indexed lp, uint256 amount0, uint256 amount1, uint256 sharesBurned
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

    /// @notice Address authorized to call maintain() (Gelato Automate executor / dedicated msg.sender)
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

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(IPoolManager _poolManager, address _aavePool, address _maintainer) BaseHook(_poolManager) {
        aavePool = IPool(_aavePool);
        maintainer = _maintainer;
        owner = msg.sender;
    }

    /*//////////////////////////////////////////////////////////////
                            HOOK PERMISSIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the hook permissions
    /// @dev Only beforeSwap for gas-efficient circuit breaker
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
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
    function _beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96)
        internal
        override
        returns (bytes4)
    {
        // Pool will be initialized in Uniswap, we just note it exists
        // Actual Sentinel config is done via initializePool()
        return this.beforeInitialize.selector;
    }

    /// @notice Initialize Sentinel management for a pool
    /// @param key The pool key
    /// @param priceFeed Chainlink oracle address for this pair
    /// @param yieldCurrency Which token to deposit to Aave
    /// @param aToken The corresponding aToken address
    /// @param maxDeviationBps Maximum price deviation allowed (circuit breaker)
    /// @param initialTickLower Initial lower tick for active range
    /// @param initialTickUpper Initial upper tick for active range
    function initializePool(
        PoolKey calldata key,
        address priceFeed,
        Currency yieldCurrency,
        address aToken,
        uint256 maxDeviationBps,
        int24 initialTickLower,
        int24 initialTickUpper
    ) external {
        if (msg.sender != owner) revert Unauthorized();

        PoolId poolId = key.toId();
        PoolState storage state = poolStates[poolId];

        if (state.isInitialized) revert PoolAlreadyInitialized();

        // Validate yield currency is one of the pool tokens
        if (
            Currency.unwrap(yieldCurrency) != Currency.unwrap(key.currency0)
                && Currency.unwrap(yieldCurrency) != Currency.unwrap(key.currency1)
        ) {
            revert InvalidYieldCurrency();
        }

        // Initialize pool state
        state.activeTickLower = initialTickLower;
        state.activeTickUpper = initialTickUpper;
        state.activeLiquidity = 0;
        state.priceFeed = priceFeed;
        state.maxDeviationBps = maxDeviationBps;
        state.yieldCurrency = yieldCurrency;
        state.aToken = aToken;
        state.currency0 = key.currency0;
        state.currency1 = key.currency1;
        state.totalShares = 0;
        state.isInitialized = true;

        // Track this pool
        allPools.push(poolId);

        emit PoolInitialized(poolId, priceFeed, yieldCurrency, aToken);
    }

    /*//////////////////////////////////////////////////////////////
                            UNLOCK CALLBACK
    //////////////////////////////////////////////////////////////*/

    /// @notice Handler for PoolManager.unlock callback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");

        uint8 action = abi.decode(data, (uint8));

        if (action == ACTION_WITHDRAW) {
            (, PoolId poolId, address lp, uint256 shares) = abi.decode(data, (uint8, PoolId, address, uint256));
            return _handleWithdraw(poolId, lp, shares);
        } else if (action == ACTION_MAINTAIN) {
            (, PoolId poolId, int24 newLower, int24 newUpper, uint256 volatility) =
                abi.decode(data, (uint8, PoolId, int24, int24, uint256));
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
    function depositLiquidity(PoolKey calldata key, uint256 amount0, uint256 amount1)
        external
        payable
        nonReentrant
        returns (uint256 sharesReceived)
    {
        PoolId poolId = key.toId();
        PoolState storage state = poolStates[poolId];

        if (!state.isInitialized) revert PoolNotInitialized();
        if (amount0 == 0 && amount1 == 0) revert InvalidDepositAmount();

        // Transfer tokens from user
        _collectDeposit(state.currency0, state.currency1, amount0, amount1);

        // Calculate liquidity value of the deposit
        (uint160 sqrtPriceX96,,,) = StateLibrary.getSlot0(poolManager, poolId);

        uint160 sqrtRatioAX96 = TickMath.getSqrtPriceAtTick(state.activeTickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtPriceAtTick(state.activeTickUpper);

        uint128 liquidity =
            LiquidityAmounts.getLiquidityForAmounts(sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, amount0, amount1);

        // Calculate shares to mint
        uint256 totalLiquidityUnits = _calculateTotalLiquidity(poolId, sqrtPriceX96);

        if (state.totalShares == 0 || totalLiquidityUnits == 0) {
            sharesReceived = uint256(liquidity);
        } else {
            sharesReceived = (uint256(liquidity) * state.totalShares) / totalLiquidityUnits;
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
    function _collectDeposit(Currency currency0, Currency currency1, uint256 amount0, uint256 amount1) internal {
        if (Currency.unwrap(currency0) == address(0)) {
            require(msg.value >= amount0, "Insufficient ETH");
        } else if (amount0 > 0) {
            IERC20(Currency.unwrap(currency0)).transferFrom(msg.sender, address(this), amount0);
        }

        if (Currency.unwrap(currency1) == address(0)) {
            require(msg.value >= amount1, "Insufficient ETH");
        } else if (amount1 > 0) {
            IERC20(Currency.unwrap(currency1)).transferFrom(msg.sender, address(this), amount1);
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
    function withdrawLiquidity(PoolKey calldata key, uint256 sharesToWithdraw)
        external
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        PoolId poolId = key.toId();

        if (!poolStates[poolId].isInitialized) revert PoolNotInitialized();

        bytes memory data = abi.encode(ACTION_WITHDRAW, poolId, msg.sender, sharesToWithdraw);
        bytes memory result = poolManager.unlock(data);
        (amount0, amount1) = abi.decode(result, (uint256, uint256));
    }

    /// @notice Internal withdrawal logic (called inside unlock)
    function _handleWithdraw(PoolId poolId, address lp, uint256 sharesToWithdraw) internal returns (bytes memory) {
        PoolState storage state = poolStates[poolId];

        if (lpShares[poolId][lp] < sharesToWithdraw) revert InsufficientShares();
        if (state.totalShares == 0) revert NoDepositsYet();

        uint256 shareFraction = (sharesToWithdraw * 1e18) / state.totalShares;

        // 1. Withdraw proportional Active Liquidity from Pool
        uint128 liquidityToWithdraw = uint128((uint256(state.activeLiquidity) * shareFraction) / 1e18);

        uint256 active0;
        uint256 active1;

        if (liquidityToWithdraw > 0) {
            (active0, active1) = _withdrawLiquidityFromPool(poolId, liquidityToWithdraw);
            state.activeLiquidity -= liquidityToWithdraw;
        }

        // 2. Calculate proportional Idle Capital
        uint256 totalIdle0 = state.currency0.balanceOf(address(this));
        uint256 totalIdle1 = state.currency1.balanceOf(address(this));

        // Add Aave balances
        uint256 aaveBal = AaveAdapter.getAaveBalance(state.aToken, address(this));
        if (Currency.unwrap(state.currency0) == Currency.unwrap(state.yieldCurrency)) {
            totalIdle0 += aaveBal;
        } else {
            totalIdle1 += aaveBal;
        }

        uint256 idle0 = (totalIdle0 * shareFraction) / 1e18;
        uint256 idle1 = (totalIdle1 * shareFraction) / 1e18;

        // Ensure sufficient idle tokens (withdraw from Aave if needed)
        _ensureSufficientIdle(poolId, idle0, idle1);

        // Update share balances
        lpShares[poolId][lp] -= sharesToWithdraw;
        state.totalShares -= sharesToWithdraw;

        // Transfer amounts
        uint256 amount0 = active0 + idle0;
        uint256 amount1 = active1 + idle1;

        if (amount0 > 0) _transferTo(state.currency0, lp, amount0);
        if (amount1 > 0) _transferTo(state.currency1, lp, amount1);

        emit LPWithdrawn(poolId, lp, amount0, amount1, sharesToWithdraw);

        return abi.encode(amount0, amount1);
    }

    /*//////////////////////////////////////////////////////////////
                        HOT PATH: BEFORE SWAP
    //////////////////////////////////////////////////////////////*/

    /// @notice beforeSwap hook - validates price safety on EVERY swap
    /// @dev This is the "hot path" - must be gas-efficient (<50k gas)
    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        PoolState storage state = poolStates[poolId];

        // Skip check if pool not initialized with Sentinel
        if (!state.isInitialized) {
            return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        // Get pool price from slot0
        uint256 poolPrice = _estimatePoolPrice(poolId, state.priceFeed);

        // Check oracle price deviation - reverts if too high
        OracleLib.checkPriceDeviation(AggregatorV3Interface(state.priceFeed), poolPrice, state.maxDeviationBps);

        // Check if tick crossed range boundary
        _checkTickCrossing(poolId, state);

        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /*//////////////////////////////////////////////////////////////
                    COLD PATH: STRATEGY EXECUTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Rebalances liquidity for a specific pool - ONLY callable by the configured automation executor
    /// @param poolId The pool to rebalance
    /// @param newTickLower New lower tick
    /// @param newTickUpper New upper tick
    /// @param volatility Current market volatility (basis points)
    function maintain(PoolId poolId, int24 newTickLower, int24 newTickUpper, uint256 volatility) external {
        if (msg.sender != maintainer) revert Unauthorized();
        if (!poolStates[poolId].isInitialized) revert PoolNotInitialized();

        bytes memory data = abi.encode(ACTION_MAINTAIN, poolId, newTickLower, newTickUpper, volatility);
        poolManager.unlock(data);
    }

    /// @notice Internal rebalancing logic (called inside unlock)
    function _handleMaintain(PoolId poolId, int24 newLower, int24 newUpper, uint256 volatility) internal {
        if (newLower >= newUpper) revert InvalidRange();

        PoolState storage state = poolStates[poolId];

        // 1. Withdraw all current active liquidity
        if (state.activeLiquidity > 0) {
            _withdrawLiquidityFromPool(poolId, state.activeLiquidity);
            state.activeLiquidity = 0;
        }

        // 2. Withdraw from Aave to consolidate funds
        uint256 aaveBal = AaveAdapter.getAaveBalance(state.aToken, address(this));
        if (aaveBal > 0) {
            AaveAdapter.withdrawFromAave(
                aavePool, Currency.unwrap(state.yieldCurrency), type(uint256).max, address(this)
            );
            emit IdleCapitalWithdrawn(poolId, address(aavePool), aaveBal);
        }

        // 3. Calculate and deploy to new range
        (uint160 currentSqrtPrice,,,) = StateLibrary.getSlot0(poolManager, poolId);

        uint256 bal0 = state.currency0.balanceOf(address(this));
        uint256 bal1 = state.currency1.balanceOf(address(this));

        uint128 newLiquidity = LiquidityAmounts.getLiquidityForAmounts(
            currentSqrtPrice, TickMath.getSqrtPriceAtTick(newLower), TickMath.getSqrtPriceAtTick(newUpper), bal0, bal1
        );

        uint128 deployed;
        if (newLiquidity > 0) {
            deployed = _deployLiquidity(poolId, newLower, newUpper, bal0, bal1);
            state.activeLiquidity = deployed;
            state.activeTickLower = newLower;
            state.activeTickUpper = newUpper;
        }

        // 4. Deposit remaining yield currency to Aave
        uint256 remainingYield = state.yieldCurrency.balanceOf(address(this));
        if (remainingYield > YieldRouter.MIN_YIELD_DEPOSIT) {
            _distributeIdleToAave(poolId, remainingYield);
        }

        emit LiquidityRebalanced(poolId, newLower, newUpper, uint256(deployed), int256(remainingYield));
    }

    /*//////////////////////////////////////////////////////////////
                        YIELD MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    function _distributeIdleToAave(PoolId poolId, uint256 amount) internal {
        if (amount == 0) return;

        PoolState storage state = poolStates[poolId];
        address asset = Currency.unwrap(state.yieldCurrency);

        if (!AaveAdapter.isPoolHealthy(aavePool, asset)) return;

        AaveAdapter.depositToAave(aavePool, asset, amount, address(this));

        emit IdleCapitalDeposited(poolId, address(aavePool), amount);
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Calculate total liquidity for a pool (active + idle)
    function _calculateTotalLiquidity(PoolId poolId, uint160 sqrtPriceX96)
        internal
        view
        returns (uint256 totalLiquidityUnits)
    {
        PoolState storage state = poolStates[poolId];

        totalLiquidityUnits = uint256(state.activeLiquidity);

        uint256 idle0 = state.currency0.balanceOf(address(this));
        uint256 idle1 = state.currency1.balanceOf(address(this));

        // Add Aave balances
        uint256 aaveBal = AaveAdapter.getAaveBalance(state.aToken, address(this));
        if (Currency.unwrap(state.currency0) == Currency.unwrap(state.yieldCurrency)) {
            idle0 += aaveBal;
        } else {
            idle1 += aaveBal;
        }

        uint160 sqrtRatioAX96 = TickMath.getSqrtPriceAtTick(state.activeTickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtPriceAtTick(state.activeTickUpper);

        uint128 idleLiquidity =
            LiquidityAmounts.getLiquidityForAmounts(sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, idle0, idle1);

        totalLiquidityUnits += uint256(idleLiquidity);
    }

    function _withdrawLiquidityFromPool(PoolId poolId, uint128 liquidity)
        internal
        returns (uint256 amount0, uint256 amount1)
    {
        if (liquidity == 0) return (0, 0);

        PoolState storage state = poolStates[poolId];

        // Reconstruct PoolKey (simplified - in production, store or derive)
        PoolKey memory key = _getPoolKey(poolId);

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: state.activeTickLower,
                tickUpper: state.activeTickUpper,
                liquidityDelta: -int256(int128(liquidity)),
                salt: bytes32(0)
            }),
            ""
        );

        int128 amt0 = delta.amount0();
        int128 amt1 = delta.amount1();
        amount0 = amt0 < 0 ? uint256(uint128(-amt0)) : 0;
        amount1 = amt1 < 0 ? uint256(uint128(-amt1)) : 0;
    }

    function _deployLiquidity(PoolId poolId, int24 tickLower, int24 tickUpper, uint256 amount0, uint256 amount1)
        internal
        returns (uint128 liquidityMinted)
    {
        (uint160 sqrtPriceX96,,,) = StateLibrary.getSlot0(poolManager, poolId);

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
                ModifyLiquidityParams({
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    liquidityDelta: int256(int128(liquidityMinted)),
                    salt: bytes32(0)
                }),
                ""
            );
        }
    }

    function _ensureSufficientIdle(PoolId poolId, uint256 required0, uint256 required1) internal {
        PoolState storage state = poolStates[poolId];

        if (Currency.unwrap(state.currency0) == Currency.unwrap(state.yieldCurrency)) {
            uint256 balance = state.currency0.balanceOf(address(this));
            if (balance < required0) {
                uint256 missing = required0 - balance;
                AaveAdapter.withdrawFromAave(aavePool, Currency.unwrap(state.currency0), missing, address(this));
            }
        } else if (Currency.unwrap(state.currency1) == Currency.unwrap(state.yieldCurrency)) {
            uint256 balance = state.currency1.balanceOf(address(this));
            if (balance < required1) {
                uint256 missing = required1 - balance;
                AaveAdapter.withdrawFromAave(aavePool, Currency.unwrap(state.currency1), missing, address(this));
            }
        }
    }

    function _transferTo(Currency currency, address to, uint256 amount) internal {
        if (Currency.unwrap(currency) == address(0)) {
            (bool success,) = to.call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            IERC20(Currency.unwrap(currency)).transfer(to, amount);
        }
    }

    function _estimatePoolPrice(PoolId poolId, address priceFeed) internal view returns (uint256) {
        return OracleLib.getOraclePrice(AggregatorV3Interface(priceFeed));
    }

    function _checkTickCrossing(PoolId poolId, PoolState storage state) internal {
        (, int24 currentTick,,) = StateLibrary.getSlot0(poolManager, poolId);

        if (currentTick < state.activeTickLower || currentTick > state.activeTickUpper) {
            emit TickCrossed(poolId, state.activeTickLower, state.activeTickUpper, currentTick);
        }
    }

    /// @notice Get PoolKey from PoolId (placeholder - needs proper implementation)
    function _getPoolKey(PoolId poolId) internal view returns (PoolKey memory) {
        PoolState storage state = poolStates[poolId];
        // This is a simplified version - in production, store the full PoolKey
        return PoolKey({
            currency0: state.currency0,
            currency1: state.currency1,
            fee: 3000, // Default fee tier
            tickSpacing: 60,
            hooks: this
        });
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get pool state
    function getPoolState(PoolId poolId) external view returns (PoolState memory) {
        return poolStates[poolId];
    }

    /// @notice Get share price for a pool
    function getSharePrice(PoolId poolId) external view returns (uint256 price) {
        PoolState storage state = poolStates[poolId];
        if (state.totalShares == 0) return 1e18;

        (uint160 sqrtPriceX96,,,) = StateLibrary.getSlot0(poolManager, poolId);
        uint256 nav = _calculateTotalLiquidity(poolId, sqrtPriceX96);

        price = (nav * 1e18) / state.totalShares;
    }

    /// @notice Get LP position in a pool
    function getLPPosition(PoolId poolId, address lp) external view returns (uint256 shares, uint256 value) {
        shares = lpShares[poolId][lp];
        if (shares == 0) return (0, 0);

        PoolState storage state = poolStates[poolId];
        (uint160 sqrtPriceX96,,,) = StateLibrary.getSlot0(poolManager, poolId);
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
        address asset = Currency.unwrap(state.yieldCurrency);

        uint256 withdrawn = AaveAdapter.emergencyWithdrawAll(aavePool, asset, address(this));

        emit IdleCapitalWithdrawn(poolId, address(aavePool), withdrawn);
    }
}
