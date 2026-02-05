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
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Determine network
        bool isSepolia = block.chainid == 11155111;
        bool isAnvil = block.chainid == 31337;

        require(
            isSepolia || isAnvil,
            "Unsupported network: use Sepolia or Anvil"
        );

        console.log("=== Sentinel Multi-Pool Hook Deployment ===");
        console.log("Deployer:", deployer);
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

        // Automation executor (Gelato recommended) - deployer acts as maintainer initially
        maintainer = vm.envOr("GELATO_EXECUTOR", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy the multi-pool Sentinel Hook at a valid hook address
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG
        );
        bytes memory constructorArgs = abi.encode(
            poolManager,
            aavePool,
            maintainer
        );
        address create2Deployer = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
        (address expectedAddress, bytes32 salt) = HookMiner.find(
            create2Deployer,
            flags,
            type(SentinelHook).creationCode,
            constructorArgs
        );

        hook = new SentinelHook{salt: salt}(poolManager, aavePool, maintainer);
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
            "3. Configure Gelato Automate executor as maintainer (or keep deployer for manual testing)"
        );
        console.log(
            "4. Create a Gelato Automate task to call maintain(poolId, ...)\n"
        );
    }

    /// @notice Initialize an ETH/USDC pool with Sentinel management
    function initializeEthUsdcPool() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envAddress("SENTINEL_HOOK");

        require(hookAddress != address(0), "Set SENTINEL_HOOK env var");

        SentinelHook sentinelHook = SentinelHook(payable(hookAddress));

        vm.startBroadcast(deployerPrivateKey);

        // Create pool key
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(SEPOLIA_WETH),
            currency1: Currency.wrap(SEPOLIA_USDC),
            fee: 3000, // 0.3% fee
            tickSpacing: 60,
            hooks: IHooks(hookAddress)
        });

        // Initialize Sentinel management for this pool
        // Initialize Sentinel management for this pool
        // WETH is currency0 (smaller address), USDC is currency1 usually.
        // We verify sort order: WETH < USDC?
        // Assuming WETH is token0, we pass address(0) for aToken0 if we don't have aWETH configured.
        // Assuming USDC is token1, we pass SEPOLIA_AUSDC for aToken1.
        sentinelHook.initializePool(
            key,
            SEPOLIA_ETH_USD_FEED,
            address(0), // aToken0 (WETH) - No yield for now
            SEPOLIA_AUSDC, // aToken1 (USDC)
            500,
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
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envAddress("SENTINEL_HOOK");

        require(hookAddress != address(0), "Set SENTINEL_HOOK env var");

        SentinelHook sentinelHook = SentinelHook(payable(hookAddress));

        vm.startBroadcast(deployerPrivateKey);

        // Create pool key
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(SEPOLIA_LINK),
            currency1: Currency.wrap(SEPOLIA_USDC),
            fee: 3000, // 0.3% fee
            tickSpacing: 60,
            hooks: IHooks(hookAddress)
        });

        // Initialize Sentinel management for this pool
        // Initialize Sentinel management for this pool
        sentinelHook.initializePool(
            key,
            SEPOLIA_LINK_USD_FEED,
            address(0), // aToken0 (LINK)
            SEPOLIA_AUSDC, // aToken1 (USDC)
            800,
            -276324,
            276324
        );

        vm.stopBroadcast();

        PoolId poolId = key.toId();
        console.log("LINK/USDC Pool initialized with Sentinel");
        console.log("Pool ID:", vm.toString(PoolId.unwrap(poolId)));
    }
}
