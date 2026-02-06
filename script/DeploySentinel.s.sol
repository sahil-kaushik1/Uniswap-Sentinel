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
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

/// @title DeploySentinel
/// @notice Multi-Pool Deployment script for Sentinel Hook
/// @dev Supports ETH Sepolia testnet and Anvil local development
contract DeploySentinel is Script {
    using PoolIdLibrary for PoolKey;

    /*//////////////////////////////////////////////////////////////
                        SEPOLIA ADDRESSES
    //////////////////////////////////////////////////////////////*/

    // Uniswap v4 on Sepolia
    address constant SEPOLIA_POOL_MANAGER =
        0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;

    // Chainlink Price Feeds on Sepolia
    address constant SEPOLIA_ETH_USD_FEED =
        0x694AA1769357215DE4FAC081bf1f309aDC325306;
    address constant SEPOLIA_USDC_USD_FEED =
        0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E;
    address constant SEPOLIA_BTC_USD_FEED =
        0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43;
    address constant SEPOLIA_LINK_USD_FEED =
        0xc59E3633BAAC79493d908e63626716e204A45EdF;

    // Aave v3 on Sepolia
    address constant SEPOLIA_AAVE_POOL =
        0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;

    // Test Tokens on Sepolia (Aave Faucet Tokens)
    address constant SEPOLIA_WETH = 0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c;
    address constant SEPOLIA_USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
    address constant SEPOLIA_DAI = 0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357;
    address constant SEPOLIA_LINK = 0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5;

    // Aave aTokens on Sepolia
    address constant SEPOLIA_AUSDC = 0x16dA4541aD1807f4443d92D26044C1147406EB80;
    address constant SEPOLIA_ADAI = 0x29598b72eb5CeBd806C5dCD549490FdA35B13cD8;
    address constant SEPOLIA_AWETH = 0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830;

    /*//////////////////////////////////////////////////////////////
                        ANVIL LOCAL ADDRESSES
    //////////////////////////////////////////////////////////////*/

    // Note: For Anvil, these would be deployed mock contracts
    // Use forge script to deploy mocks first, then update these
    address constant ANVIL_POOL_MANAGER = address(0);
    address constant ANVIL_AAVE_POOL = address(0);

    /*//////////////////////////////////////////////////////////////
                        STATE
    //////////////////////////////////////////////////////////////*/

    SentinelHook public hook;
    IPoolManager public poolManager;
    address public aavePool;
    address public maintainer;

    function run() external {
        // Determine network
        bool isSepolia = block.chainid == 11155111;
        bool isAnvil = block.chainid == 31337;

        require(
            isSepolia || isAnvil,
            "Unsupported network: use Sepolia or Anvil"
        );

        console.log("=== Sentinel Multi-Pool Hook Deployment ===");
        console.log("Deployer:", tx.origin);
        console.log("Chain ID:", block.chainid);
        console.log("Network:", isSepolia ? "ETH Sepolia" : "Anvil (Local)");

        // Set network-specific addresses
        if (isSepolia) {
            poolManager = IPoolManager(SEPOLIA_POOL_MANAGER);
            aavePool = SEPOLIA_AAVE_POOL;
        } else {
            require(
                ANVIL_POOL_MANAGER != address(0),
                "Deploy mock contracts first"
            );
            poolManager = IPoolManager(ANVIL_POOL_MANAGER);
            aavePool = ANVIL_AAVE_POOL;
        }

        // Start broadcast with keystore or private key
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        if (deployerPrivateKey != 0) {
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }

        address deployer = tx.origin;

        // Automation executor (Chainlink Automation) - deployer acts as maintainer initially
        maintainer = vm.envOr("CHAINLINK_MAINTAINER", deployer);

        // Deploy the multi-pool Sentinel Hook at a valid hook address
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG
        );
        bytes memory constructorArgs = abi.encode(
            poolManager,
            aavePool,
            maintainer,
            deployer
        );
        address create2Deployer = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
        (address expectedAddress, bytes32 salt) = HookMiner.find(
            create2Deployer,
            flags,
            type(SentinelHook).creationCode,
            constructorArgs
        );

        hook = new SentinelHook{salt: salt}(poolManager, aavePool, maintainer, deployer);
        require(address(hook) == expectedAddress, "Hook address mismatch");

        console.log("\n=== Hook Deployed ===");
        console.log("Sentinel Hook:", address(hook));
        console.log("Pool Manager:", address(poolManager));
        console.log("Aave Pool:", aavePool);
        console.log("Maintainer:", maintainer);

        // Verify hook permissions
        address hookAddress = address(hook);
        console.log("\n=== Hook Permissions ===");
        console.log(
            "beforeInitialize:",
            Hooks.hasPermission(
                IHooks(hookAddress),
                Hooks.BEFORE_INITIALIZE_FLAG
            )
        );
        console.log(
            "beforeSwap:",
            Hooks.hasPermission(IHooks(hookAddress), Hooks.BEFORE_SWAP_FLAG)
        );

        vm.stopBroadcast();

        console.log("\n=== Next Steps ===");
        console.log("1. Verify the hook contract on Etherscan (Sepolia)");
        console.log("2. Initialize pools with `initializePool()` function");
        console.log(
            "3. Configure Chainlink Automation executor as maintainer (or keep deployer for manual testing)"
        );
        console.log(
            "4. Register Automation to call maintain(poolId, ...)\n"
        );
    }

    /// @notice Initialize an ETH/USDC pool with Sentinel management
    function initializeEthUsdcPool() external {
        address hookAddress = vm.envAddress("SENTINEL_HOOK");

        require(hookAddress != address(0), "Set SENTINEL_HOOK env var");

        SentinelHook sentinelHook = SentinelHook(payable(hookAddress));

        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        if (deployerPrivateKey != 0) {
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }

        // Create pool key - currencies must be sorted: currency0 < currency1
        // USDC (0x94...) < WETH (0xC5...) on Sepolia
        (Currency c0, Currency c1) = _sortCurrencies(SEPOLIA_WETH, SEPOLIA_USDC);
        bool wethIsToken0 = Currency.unwrap(c0) == SEPOLIA_WETH;

        PoolKey memory key = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: 3000, // 0.3% fee
            tickSpacing: 60,
            hooks: IHooks(hookAddress)
        });

        // Initialize Sentinel management for this pool
        // Assign aTokens based on actual sort order
        address aT0 = wethIsToken0 ? SEPOLIA_AWETH : SEPOLIA_AUSDC;
        address aT1 = wethIsToken0 ? SEPOLIA_AUSDC : SEPOLIA_AWETH;
        sentinelHook.initializePool(
            key,
            SEPOLIA_ETH_USD_FEED,
            true,
            aT0,
            aT1,            500,
            -887220,
            887220
        );

        vm.stopBroadcast();

        PoolId poolId = key.toId();
        console.log("ETH/USDC Pool initialized with Sentinel");
        console.log("Pool ID:", vm.toString(PoolId.unwrap(poolId)));
    }

    /// @notice Initialize a LINK/USDC pool with Sentinel management
    function initializeLinkUsdcPool() external {
        address hookAddress = vm.envAddress("SENTINEL_HOOK");

        require(hookAddress != address(0), "Set SENTINEL_HOOK env var");

        SentinelHook sentinelHook = SentinelHook(payable(hookAddress));

        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        if (deployerPrivateKey != 0) {
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }

        // Create pool key - currencies must be sorted: currency0 < currency1
        // USDC (0x94...) < LINK (0xf8...) on Sepolia
        (Currency c0, Currency c1) = _sortCurrencies(SEPOLIA_LINK, SEPOLIA_USDC);
        bool linkIsToken0 = Currency.unwrap(c0) == SEPOLIA_LINK;

        PoolKey memory key = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: 3000, // 0.3% fee
            tickSpacing: 60,
            hooks: IHooks(hookAddress)
        });

        // Initialize Sentinel management for this pool
        // Assign aTokens based on actual sort order
        address aT0 = linkIsToken0 ? address(0) : SEPOLIA_AUSDC;
        address aT1 = linkIsToken0 ? SEPOLIA_AUSDC : address(0);
        sentinelHook.initializePool(
            key,
            SEPOLIA_LINK_USD_FEED,
            true,
            aT0,
            aT1,            800,
            -276324,
            276324
        );

        vm.stopBroadcast();

        PoolId poolId = key.toId();
        console.log("LINK/USDC Pool initialized with Sentinel");
        console.log("Pool ID:", vm.toString(PoolId.unwrap(poolId)));
    }

    /// @notice Helper to sort two addresses into (currency0, currency1) order
    function _sortCurrencies(address a, address b) internal pure returns (Currency c0, Currency c1) {
        if (a < b) {
            c0 = Currency.wrap(a);
            c1 = Currency.wrap(b);
        } else {
            c0 = Currency.wrap(b);
            c1 = Currency.wrap(a);
        }
    }
}
