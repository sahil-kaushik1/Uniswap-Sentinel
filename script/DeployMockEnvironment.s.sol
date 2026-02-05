// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {SentinelHook} from "../src/SentinelHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {RatioOracle} from "../test/mocks/RatioOracle.sol";
import {MockAavePool, MockAToken} from "../test/mocks/MockAavePool.sol";

/// @title DeployMockEnvironment
/// @notice Deploys Mock Tokens, Ratio Oracle, Mock Aave, Sentinel Hook, and initializes 3 test pools
contract DeployMockEnvironment is Script {
    using PoolIdLibrary for PoolKey;

    // Sepolia Real Feeds
    address constant SEPOLIA_ETH_USD =
        0x694AA1769357215DE4FAC081bf1f309aDC325306;
    address constant SEPOLIA_BTC_USD =
        0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43;
    address constant SEPOLIA_USDC_USD =
        0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E;

    address poolManager;
    SentinelHook hook;
    MockAavePool mockAave;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Sepolia PoolManager
        if (block.chainid == 11155111) {
            poolManager = 0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;
        } else {
            console.log("Please run on Sepolia for Chainlink Feeds");
            return;
        }

        vm.startBroadcast(deployerPrivateKey);

        console.log("=== Deploying Mock Environment ===");

        // 1. Deploy Mock Tokens
        MockERC20 mETH = new MockERC20("Mock ETH", "mETH", 18);
        MockERC20 mUSDC = new MockERC20("Mock USDC", "mUSDC", 6);
        MockERC20 mWBTC = new MockERC20("Mock WBTC", "mWBTC", 8);
        MockERC20 mUSDT = new MockERC20("Mock USDT", "mUSDT", 6);

        console.log("mETH:", address(mETH));
        console.log("mUSDC:", address(mUSDC));
        console.log("mWBTC:", address(mWBTC));
        console.log("mUSDT:", address(mUSDT));

        // Mint to deployer
        mETH.mint(deployer, 1000 ether);
        mUSDC.mint(deployer, 1_000_000e6);
        mWBTC.mint(deployer, 10e8);
        mUSDT.mint(deployer, 1_000_000e6);

        // 2. Deploy Mock Aave & Reserves
        mockAave = new MockAavePool();
        address maETH = mockAave.initReserve(
            address(mETH),
            "Mock aETH",
            "maETH"
        );
        address maUSDC = mockAave.initReserve(
            address(mUSDC),
            "Mock aUSDC",
            "maUSDC"
        );
        address maWBTC = mockAave.initReserve(
            address(mWBTC),
            "Mock aWBTC",
            "maWBTC"
        );
        address maUSDT = mockAave.initReserve(
            address(mUSDT),
            "Mock aUSDT",
            "maUSDT"
        );

        console.log("Mock Aave Pool:", address(mockAave));

        // 3. Deploy Ratio Oracle for WBTC/ETH
        RatioOracle btcEthOracle = new RatioOracle(
            SEPOLIA_BTC_USD,
            SEPOLIA_ETH_USD,
            "BTC/ETH Ratio"
        );
        console.log("BTC/ETH Ratio Oracle:", address(btcEthOracle));

        // 4. Deploy Sentinel Hook
        address maintainer = deployer;

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG
        );
        bytes memory constructorArgs = abi.encode(
            poolManager,
            address(mockAave),
            maintainer
        );

        (address expectedAddress, bytes32 salt) = HookMiner.find(
            0x4e59b44847b379578588920cA78FbF26c0B4956C,
            flags,
            type(SentinelHook).creationCode,
            constructorArgs
        );

        hook = new SentinelHook{salt: salt}(
            IPoolManager(poolManager),
            address(mockAave),
            maintainer
        );
        console.log("Sentinel Hook:", address(hook));

        // 5. Initialize Pools with Dual Yield

        // Pool 1: mETH / mUSDC
        (Currency token0, Currency token1) = sort(
            address(mETH),
            address(mUSDC)
        );

        // Determine which aToken corresponds to token0/token1
        address aToken0 = Currency.unwrap(token0) == address(mETH)
            ? maETH
            : maUSDC;
        address aToken1 = Currency.unwrap(token1) == address(mETH)
            ? maETH
            : maUSDC;

        PoolKey memory key1 = PoolKey({
            currency0: token0,
            currency1: token1,
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        hook.initializePool(
            key1,
            SEPOLIA_ETH_USD,
            aToken0, // Enable Yield for Token0
            aToken1, // Enable Yield for Token1
            500,
            -887220,
            887220
        );
        console.log("Initialized mETH/mUSDC Pool (Dual Yield)");

        // Pool 2: mWBTC / mETH
        (token0, token1) = sort(address(mWBTC), address(mETH));
        aToken0 = Currency.unwrap(token0) == address(mWBTC) ? maWBTC : maETH;
        aToken1 = Currency.unwrap(token1) == address(mWBTC) ? maWBTC : maETH;

        PoolKey memory key2 = PoolKey({
            currency0: token0,
            currency1: token1,
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        hook.initializePool(
            key2,
            address(btcEthOracle),
            aToken0,
            aToken1,
            500,
            -887220,
            887220
        );
        console.log("Initialized mWBTC/mETH Pool (Dual Yield)");

        // Pool 3: mETH / mUSDT
        (token0, token1) = sort(address(mETH), address(mUSDT));
        aToken0 = Currency.unwrap(token0) == address(mETH) ? maETH : maUSDT;
        aToken1 = Currency.unwrap(token1) == address(mETH) ? maETH : maUSDT;

        PoolKey memory key3 = PoolKey({
            currency0: token0,
            currency1: token1,
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        hook.initializePool(
            key3,
            SEPOLIA_ETH_USD,
            aToken0,
            aToken1,
            500,
            -887220,
            887220
        );
        console.log("Initialized mETH/mUSDT Pool (Dual Yield)");

        vm.stopBroadcast();
    }

    function sort(
        address a,
        address b
    ) internal pure returns (Currency, Currency) {
        if (a < b) return (Currency.wrap(a), Currency.wrap(b));
        return (Currency.wrap(b), Currency.wrap(a));
    }
}
