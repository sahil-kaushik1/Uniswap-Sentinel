// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SentinelHook} from "../../src/SentinelHook.sol";
import {OracleLib} from "../../src/libraries/OracleLib.sol";
import {YieldRouter} from "../../src/libraries/YieldRouter.sol";
import {AaveAdapter, IPool} from "../../src/libraries/AaveAdapter.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {AggregatorV3Interface} from "foundry-chainlink-toolkit/src/interfaces/feeds/AggregatorV3Interface.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

/// @title SentinelIntegrationTest
/// @notice Fork tests for the multi-pool Sentinel workflow
/// @dev Run with: forge test --match-path test/integration/SentinelIntegration.t.sol -vvv --fork-url $SEPOLIA_RPC_URL
contract SentinelIntegrationTest is Test {
    using PoolIdLibrary for PoolKey;

    /*//////////////////////////////////////////////////////////////
                        SEPOLIA ADDRESSES
    //////////////////////////////////////////////////////////////*/

    // Uniswap v4 on Sepolia
    address constant POOL_MANAGER = 0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;

    // Chainlink Price Feeds on Sepolia
    address constant ETH_USD_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    address constant LINK_USD_FEED = 0xc59E3633BAAC79493d908e63626716e204A45EdF;

    // Aave v3 on Sepolia
    address constant AAVE_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;

    // Test Tokens on Sepolia (Aave Faucet Tokens)
    address constant WETH = 0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c;
    address constant USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
    address constant LINK = 0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5;

    // Aave aTokens on Sepolia
    address constant AUSDC = 0x16dA4541aD1807f4443d92D26044C1147406EB80;

    /*//////////////////////////////////////////////////////////////
                            TEST STATE
    //////////////////////////////////////////////////////////////*/

    SentinelHook hook;
    address owner;
    address maintainer = makeAddr("maintainer");
    address lp1 = makeAddr("lp1");
    address lp2 = makeAddr("lp2");
    address user = makeAddr("user");

    // Pool Keys
    PoolKey ethUsdcKey;
    PoolKey linkUsdcKey;
    PoolId ethUsdcPoolId;
    PoolId linkUsdcPoolId;

    bool internal forking;

    function setUp() public {
        // Fork Sepolia (required for these integration tests)
        try vm.createSelectFork("sepolia") {
            console.log("Running on Sepolia fork");
            forking = true;
        } catch {
            try vm.createSelectFork("anvil") {
                console.log("Running on Anvil fork");
                forking = true;
            } catch {
                vm.skip(true, "No fork configured. Set SEPOLIA_RPC_URL or run anvil --fork-url.");
                return;
            }
        }

        owner = address(this);

        // Deploy the hook at a valid Uniswap v4 hook address (address encodes hook permission flags)
        uint160 flags = uint160(Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG);
        bytes memory constructorArgs = abi.encode(IPoolManager(POOL_MANAGER), AAVE_POOL, maintainer);
        (address expectedAddress, bytes32 salt) =
            HookMiner.find(address(this), flags, type(SentinelHook).creationCode, constructorArgs);

        hook = new SentinelHook{salt: salt}(IPoolManager(POOL_MANAGER), AAVE_POOL, maintainer);
        assertEq(address(hook), expectedAddress);

        console.log("Sentinel Hook deployed at:", address(hook));

        // Set up pool keys (currencies must be sorted numerically)
        Currency weth = Currency.wrap(WETH);
        Currency usdc = Currency.wrap(USDC);
        Currency link = Currency.wrap(LINK);

        (Currency eth0, Currency eth1) = weth < usdc ? (weth, usdc) : (usdc, weth);
        (Currency link0, Currency link1) = link < usdc ? (link, usdc) : (usdc, link);

        ethUsdcKey =
            PoolKey({currency0: eth0, currency1: eth1, fee: 3000, tickSpacing: 60, hooks: IHooks(address(hook))});

        linkUsdcKey =
            PoolKey({currency0: link0, currency1: link1, fee: 3000, tickSpacing: 60, hooks: IHooks(address(hook))});

        ethUsdcPoolId = ethUsdcKey.toId();
        linkUsdcPoolId = linkUsdcKey.toId();
    }

    function _ensurePoolInitialized(PoolKey memory key) internal returns (bool ok) {
        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(0);
        try IPoolManager(POOL_MANAGER).initialize(key, sqrtPriceX96) {
            ok = true;
        } catch {
            ok = false;
        }
    }

    function _amountsForKey(PoolKey memory key, uint256 wethAmount, uint256 usdcAmount)
        internal
        pure
        returns (uint256 amount0, uint256 amount1)
    {
        if (Currency.unwrap(key.currency0) == WETH) {
            amount0 = wethAmount;
            amount1 = usdcAmount;
        } else {
            amount0 = usdcAmount;
            amount1 = wethAmount;
        }
    }

    function _amountsForKeyAssets(
        PoolKey memory key,
        address tokenA,
        uint256 amountA,
        address tokenB,
        uint256 amountB
    ) internal pure returns (uint256 amount0, uint256 amount1) {
        if (Currency.unwrap(key.currency0) == tokenA) {
            amount0 = amountA;
            amount1 = amountB;
        } else if (Currency.unwrap(key.currency0) == tokenB) {
            amount0 = amountB;
            amount1 = amountA;
        } else {
            revert("Token mismatch");
        }
    }

    function _aTokensForKey(PoolKey memory key) internal pure returns (address aToken0, address aToken1) {
        if (Currency.unwrap(key.currency0) == USDC) {
            aToken0 = AUSDC;
        }
        if (Currency.unwrap(key.currency1) == USDC) {
            aToken1 = AUSDC;
        }
    }

    function _usdcATokenFromState(PoolKey memory key, SentinelHook.PoolState memory state)
        internal
        pure
        returns (address)
    {
        if (Currency.unwrap(key.currency0) == USDC) {
            return state.aToken0;
        }
        if (Currency.unwrap(key.currency1) == USDC) {
            return state.aToken1;
        }
        return address(0);
    }

    modifier checkFork() {
        if (!forking) {
            vm.skip(true, "This test requires a fork.");
        }
        _;
    }

    /*//////////////////////////////////////////////////////////////
                        DEPLOYMENT TESTS
    //////////////////////////////////////////////////////////////*/

    function testDeployment() public checkFork {
        assertEq(address(hook.aavePool()), AAVE_POOL);
        assertEq(hook.maintainer(), maintainer);
        assertEq(hook.owner(), owner);
        assertEq(hook.getTotalPools(), 0);
    }

    function testMultiPoolInitialization() public checkFork {
        (address ethAToken0, address ethAToken1) = _aTokensForKey(ethUsdcKey);
        (address linkAToken0, address linkAToken1) = _aTokensForKey(linkUsdcKey);

        // Initialize ETH/USDC pool
        hook.initializePool(
            ethUsdcKey,
            ETH_USD_FEED,
            true,
            ethAToken0,
            ethAToken1,
            500, // 5% max deviation
            -887220,
            887220
        );

        // Initialize LINK/USDC pool
        hook.initializePool(
            linkUsdcKey,
            LINK_USD_FEED,
            true,
            linkAToken0,
            linkAToken1,
            800, // 8% max deviation (more volatile)
            -276300,
            276300
        );

        // Verify both pools are tracked
        assertEq(hook.getTotalPools(), 2);

        // Verify pool states are isolated
        SentinelHook.PoolState memory ethState = hook.getPoolState(ethUsdcPoolId);
        SentinelHook.PoolState memory linkState = hook.getPoolState(linkUsdcPoolId);

        assertTrue(ethState.isInitialized);
        assertTrue(linkState.isInitialized);
        assertEq(ethState.priceFeed, ETH_USD_FEED);
        assertEq(linkState.priceFeed, LINK_USD_FEED);
        assertEq(ethState.maxDeviationBps, 500);
        assertEq(linkState.maxDeviationBps, 800);
        assertEq(_usdcATokenFromState(ethUsdcKey, ethState), AUSDC);
        assertEq(_usdcATokenFromState(linkUsdcKey, linkState), AUSDC);
    }

    function testPoolIndexLookup() public checkFork {
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -887220, 887220);

        PoolId fetched = hook.getPoolByIndex(0);
        assertEq(PoolId.unwrap(fetched), PoolId.unwrap(ethUsdcPoolId));
    }

    function testEmergencyWithdraw_NoRevert() public checkFork {
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -887220, 887220);

        hook.emergencyWithdrawFromAave(ethUsdcPoolId);
    }

    function testCannotInitializePoolTwice() public checkFork {
        // Initialize first time
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -887220, 887220);

        // Try to initialize again - should revert
        vm.expectRevert(SentinelHook.PoolAlreadyInitialized.selector);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -887220, 887220);
    }

    function testOnlyOwnerCanInitializePool() public checkFork {
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        vm.prank(user);
        vm.expectRevert(SentinelHook.Unauthorized.selector);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -887220, 887220);
    }

    function testInitializePool_StoresATokens() public checkFork {
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -887220, 887220);

        SentinelHook.PoolState memory state = hook.getPoolState(ethUsdcPoolId);
        assertEq(state.aToken0, aToken0);
        assertEq(state.aToken1, aToken1);
    }

    /*//////////////////////////////////////////////////////////////
                        ORACLE TESTS
    //////////////////////////////////////////////////////////////*/

    function testOracleLib() public checkFork {
        // Test that we can read from the oracle
        uint256 price = OracleLib.getOraclePrice(AggregatorV3Interface(ETH_USD_FEED));
        console.log("Current ETH/USD price:", price);

        assertTrue(price > 0, "Price should be positive");
        assertTrue(price < 100000e18, "Price should be reasonable");
    }

    /*//////////////////////////////////////////////////////////////
                    YIELD ROUTER TESTS
    //////////////////////////////////////////////////////////////*/

    function testYieldRouterCalculations() public pure {
        uint256 totalBalance = 100000e18; // 100k
        int24 tickLower = -1000;
        int24 tickUpper = 1000;
        int24 currentTick = 0;
        uint256 volatility = 500; // 5%

        (uint256 activeAmount, int256 idleAmount) =
            YieldRouter.calculateIdealRatio(totalBalance, tickLower, tickUpper, currentTick, volatility);

        console.log("Active amount:", activeAmount);
        console.log("Idle amount:", uint256(idleAmount));

        assertTrue(activeAmount > 0, "Active amount should be positive");
        assertTrue(activeAmount <= totalBalance, "Active amount should not exceed total");
        assertTrue(idleAmount >= 0, "Idle amount should be non-negative");
    }

    /*//////////////////////////////////////////////////////////////
                    LP LIFECYCLE TESTS
    //////////////////////////////////////////////////////////////*/

    function testLPDDeposit() public checkFork {
        // Initialize pool
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -199980, 199980);
        _ensurePoolInitialized(ethUsdcKey);

        // Mint some test tokens for the LP
        deal(WETH, lp1, 1e18); // 1 WETH
        deal(USDC, lp1, 3000e6); // 3000 USDC

        // LP must approve the hook to spend their tokens
        vm.startPrank(lp1);
        IERC20(WETH).approve(address(hook), 1e18);
        IERC20(USDC).approve(address(hook), 3000e6);

        (uint256 amount0, uint256 amount1) = _amountsForKey(ethUsdcKey, 1e18, 3000e6);

        // Deposit liquidity
        uint256 shares = hook.depositLiquidity(ethUsdcKey, amount0, amount1);
        vm.stopPrank();

        assertTrue(shares > 0, "LP should receive shares");
        assertEq(hook.lpShares(ethUsdcPoolId, lp1), shares, "LP share balance should be updated");
        assertEq(hook.getLPCount(ethUsdcPoolId), 1, "LP count should be 1");

        // Check that the hook now holds the tokens
        assertEq(IERC20(WETH).balanceOf(address(hook)), 1e18);
        assertEq(IERC20(USDC).balanceOf(address(hook)), 3000e6);
    }

    function testLPWithdraw() public checkFork {
        // First, deposit liquidity
        testLPDDeposit();

        uint256 sharesToWithdraw = hook.lpShares(ethUsdcPoolId, lp1);
        assertTrue(sharesToWithdraw > 0, "Should have shares to withdraw");

        uint256 lpWethBalanceBefore = IERC20(WETH).balanceOf(lp1);
        uint256 lpUsdcBalanceBefore = IERC20(USDC).balanceOf(lp1);

        // Withdraw liquidity
        vm.startPrank(lp1);
        (uint256 amount0, uint256 amount1) = hook.withdrawLiquidity(ethUsdcKey, sharesToWithdraw);
        vm.stopPrank();

        assertTrue(amount0 > 0, "Should have withdrawn WETH");
        assertTrue(amount1 > 0, "Should have withdrawn USDC");

        assertEq(hook.lpShares(ethUsdcPoolId, lp1), 0, "LP should have no shares left");

        // Check LP token balances increased
        if (Currency.unwrap(ethUsdcKey.currency0) == WETH) {
            assertEq(IERC20(WETH).balanceOf(lp1), lpWethBalanceBefore + amount0);
            assertEq(IERC20(USDC).balanceOf(lp1), lpUsdcBalanceBefore + amount1);
        } else {
            assertEq(IERC20(WETH).balanceOf(lp1), lpWethBalanceBefore + amount1);
            assertEq(IERC20(USDC).balanceOf(lp1), lpUsdcBalanceBefore + amount0);
        }
    }

    /*//////////////////////////////////////////////////////////////
                    MAINTAIN ACCESS CONTROL TESTS
    //////////////////////////////////////////////////////////////*/

    function testMaintainOnlyByMaintainer() public checkFork {
        // Initialize pool first
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -887220, 887220);

        // Test that only maintainer can call maintain()
        vm.prank(user);
        vm.expectRevert(SentinelHook.Unauthorized.selector);
        hook.maintain(ethUsdcPoolId, -1000, 1000, 500);
    }

    function testMaintainRequiresInitializedPool() public checkFork {
        // Try to maintain uninitialized pool
        vm.prank(maintainer);
        vm.expectRevert(SentinelHook.PoolNotInitialized.selector);
        hook.maintain(ethUsdcPoolId, -1000, 1000, 500);
    }

    function testMaintainInvalidRange() public checkFork {
        // Initialize pool first
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -887220, 887220);

        // Test that invalid ranges are rejected
        vm.prank(maintainer);
        vm.expectRevert(SentinelHook.InvalidRange.selector);
        hook.maintain(ethUsdcPoolId, 1000, -1000, 500); // Lower > Upper
    }

    function testMaintain() public checkFork {
        // 1. Initialize pool and deposit
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -199980, 199980);
        bool poolOk = _ensurePoolInitialized(ethUsdcKey);
        if (!poolOk) {
            vm.skip(true, "Pool initialization failed on fork");
            return;
        }
        deal(WETH, lp1, 2000e18); // 2,000 WETH
        deal(USDC, lp1, 6_000_000e6); // 6,000,000 USDC
        vm.startPrank(lp1);
        IERC20(WETH).approve(address(hook), 2000e18);
        IERC20(USDC).approve(address(hook), 6_000_000e6);
        (uint256 amount0, uint256 amount1) = _amountsForKey(ethUsdcKey, 2000e18, 6_000_000e6);
        hook.depositLiquidity(ethUsdcKey, amount0, amount1);
        vm.stopPrank();

        // For simplicity, let's assume the initial deposit is all idle and deploy it
        vm.prank(maintainer);
        hook.maintain(ethUsdcPoolId, -199980, 199980, 500);

        SentinelHook.PoolState memory stateBefore = hook.getPoolState(ethUsdcPoolId);
        assertTrue(stateBefore.activeLiquidity > 0, "Should have active liquidity after initial maintain");

        // 2. Call maintain with a new range
        int24 newLowerTick = -210000;
        int24 newUpperTick = 189960;
        vm.prank(maintainer);
        hook.maintain(ethUsdcPoolId, newLowerTick, newUpperTick, 600);

        // 3. Assertions
        SentinelHook.PoolState memory stateAfter = hook.getPoolState(ethUsdcPoolId);
        assertEq(stateAfter.activeTickLower, newLowerTick, "Lower tick should be updated");
        assertEq(stateAfter.activeTickUpper, newUpperTick, "Upper tick should be updated");
        assertTrue(stateAfter.activeLiquidity > 0, "Should have active liquidity in the new range");

        // Check if some funds were deposited to Aave
        uint256 aaveBalance = AaveAdapter.getAaveBalance(AUSDC, address(hook));
        if (aaveBalance == 0) {
            uint256 remainingYield = Currency.wrap(USDC).balanceOf(address(hook));
            assertTrue(remainingYield < YieldRouter.MIN_YIELD_DEPOSIT, "Idle USDC should be below min deposit");
        }
    }

    function testFullFlow_MultiPoolLifecycle() public checkFork {
        (address ethAToken0, address ethAToken1) = _aTokensForKey(ethUsdcKey);
        (address linkAToken0, address linkAToken1) = _aTokensForKey(linkUsdcKey);

        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, ethAToken0, ethAToken1, 500, -199980, 199980);
        hook.initializePool(linkUsdcKey, LINK_USD_FEED, true, linkAToken0, linkAToken1, 800, -276300, 276300);

        bool ethPoolOk = _ensurePoolInitialized(ethUsdcKey);
        bool linkPoolOk = _ensurePoolInitialized(linkUsdcKey);
        if (!ethPoolOk || !linkPoolOk) {
            vm.skip(true, "Pool initialization failed on fork");
            return;
        }

        deal(WETH, lp1, 2000e18);
        deal(USDC, lp1, 6_000_000e6);
        deal(LINK, lp2, 1_000_000e18);
        deal(USDC, lp2, 3_000_000e6);

        vm.startPrank(lp1);
        IERC20(WETH).approve(address(hook), 2000e18);
        IERC20(USDC).approve(address(hook), 6_000_000e6);
        (uint256 ethAmount0, uint256 ethAmount1) = _amountsForKey(ethUsdcKey, 2000e18, 6_000_000e6);
        uint256 lp1Shares = hook.depositLiquidity(ethUsdcKey, ethAmount0, ethAmount1);
        vm.stopPrank();

        vm.startPrank(lp2);
        IERC20(LINK).approve(address(hook), 1_000_000e18);
        IERC20(USDC).approve(address(hook), 3_000_000e6);
        (uint256 linkAmount0, uint256 linkAmount1) =
            _amountsForKeyAssets(linkUsdcKey, LINK, 1_000_000e18, USDC, 3_000_000e6);
        uint256 lp2Shares = hook.depositLiquidity(linkUsdcKey, linkAmount0, linkAmount1);
        vm.stopPrank();

        assertTrue(lp1Shares > 0);
        assertTrue(lp2Shares > 0);
        assertEq(hook.getLPCount(ethUsdcPoolId), 1);
        assertEq(hook.getLPCount(linkUsdcPoolId), 1);

        vm.prank(maintainer);
        hook.maintain(ethUsdcPoolId, -199980, 199980, 500);
        vm.prank(maintainer);
        hook.maintain(linkUsdcPoolId, -276300, 276300, 700);

        SentinelHook.PoolState memory ethState = hook.getPoolState(ethUsdcPoolId);
        SentinelHook.PoolState memory linkState = hook.getPoolState(linkUsdcPoolId);
        assertTrue(ethState.activeLiquidity > 0);
        assertTrue(linkState.activeLiquidity > 0);

        uint256 lp1SharesBefore = hook.lpShares(ethUsdcPoolId, lp1);
        uint256 lp2SharesBefore = hook.lpShares(linkUsdcPoolId, lp2);

        vm.startPrank(lp1);
        hook.withdrawLiquidity(ethUsdcKey, lp1SharesBefore / 2);
        vm.stopPrank();

        vm.startPrank(lp2);
        hook.withdrawLiquidity(linkUsdcKey, lp2SharesBefore / 3);
        vm.stopPrank();

        assertEq(hook.lpShares(ethUsdcPoolId, lp1), lp1SharesBefore - (lp1SharesBefore / 2));
        assertEq(hook.lpShares(linkUsdcPoolId, lp2), lp2SharesBefore - (lp2SharesBefore / 3));
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN TESTS
    //////////////////////////////////////////////////////////////*/

    function testSetMaintainer() public checkFork {
        address newMaintainer = makeAddr("newMaintainer");

        hook.setMaintainer(newMaintainer);
        assertEq(hook.maintainer(), newMaintainer);
    }

    function testOnlyOwnerCanSetMaintainer() public checkFork {
        address newMaintainer = makeAddr("newMaintainer");

        vm.prank(user);
        vm.expectRevert(SentinelHook.Unauthorized.selector);
        hook.setMaintainer(newMaintainer);
    }

    function testTransferOwnership() public checkFork {
        address newOwner = makeAddr("newOwner");

        hook.transferOwnership(newOwner);
        assertEq(hook.owner(), newOwner);
    }

    /*//////////////////////////////////////////////////////////////
                    VIEW FUNCTION TESTS
    //////////////////////////////////////////////////////////////*/

    function testGetPoolByIndex() public checkFork {
        // Initialize two pools
        (address ethAToken0, address ethAToken1) = _aTokensForKey(ethUsdcKey);
        (address linkAToken0, address linkAToken1) = _aTokensForKey(linkUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, ethAToken0, ethAToken1, 500, -887220, 887220);

        hook.initializePool(linkUsdcKey, LINK_USD_FEED, true, linkAToken0, linkAToken1, 800, -276300, 276300);

        // Verify pool retrieval by index
        PoolId pool0 = hook.getPoolByIndex(0);
        PoolId pool1 = hook.getPoolByIndex(1);

        assertTrue(PoolId.unwrap(pool0) == PoolId.unwrap(ethUsdcPoolId));
        assertTrue(PoolId.unwrap(pool1) == PoolId.unwrap(linkUsdcPoolId));
    }

    function testSharePriceInitialValue() public checkFork {
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -887220, 887220);

        // With no deposits, share price should be 1e18
        uint256 sharePrice = hook.getSharePrice(ethUsdcPoolId);
        assertEq(sharePrice, 1e18);
    }

    function testLPCountInitialValue() public checkFork {
        (address aToken0, address aToken1) = _aTokensForKey(ethUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, aToken0, aToken1, 500, -887220, 887220);

        // Initially no LPs
        uint256 lpCount = hook.getLPCount(ethUsdcPoolId);
        assertEq(lpCount, 0);
    }

    /*//////////////////////////////////////////////////////////////
                    MULTI-POOL ISOLATION TESTS
    //////////////////////////////////////////////////////////////*/

    function testPoolStateIsolation() public checkFork {
        // Initialize two pools with different configurations
        (address ethAToken0, address ethAToken1) = _aTokensForKey(ethUsdcKey);
        (address linkAToken0, address linkAToken1) = _aTokensForKey(linkUsdcKey);
        hook.initializePool(ethUsdcKey, ETH_USD_FEED, true, ethAToken0, ethAToken1, 500, -887220, 887220);

        hook.initializePool(linkUsdcKey, LINK_USD_FEED, true, linkAToken0, linkAToken1, 800, -276300, 276300);

        // Get states
        SentinelHook.PoolState memory ethState = hook.getPoolState(ethUsdcPoolId);
        SentinelHook.PoolState memory linkState = hook.getPoolState(linkUsdcPoolId);

        // Verify isolation
        assertTrue(ethState.activeTickLower != linkState.activeTickLower);
        assertTrue(ethState.maxDeviationBps != linkState.maxDeviationBps);
        assertTrue(ethState.priceFeed != linkState.priceFeed);

        // Both use USDC aToken for yield on the USDC side
        assertEq(_usdcATokenFromState(ethUsdcKey, ethState), AUSDC);
        assertEq(_usdcATokenFromState(linkUsdcKey, linkState), AUSDC);
    }
}
