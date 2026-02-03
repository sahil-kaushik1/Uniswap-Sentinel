// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {SentinelHook} from "../src/SentinelHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

/// @title DeploySentinel
/// @notice Deployment script for Sentinel Hook on Base network
/// @dev This script deploys the hook and initializes a pool
contract DeploySentinel is Script {
    // Base Mainnet addresses
    address constant POOL_MANAGER = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865; // Uniswap v4 PoolManager on Base
    
    // Chainlink Price Feeds on Base
    address constant ETH_USD_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70; // ETH/USD on Base
    address constant USDC_USD_FEED = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B; // USDC/USD on Base
    
    // Aave v3 on Base
    address constant AAVE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5; // Aave v3 Pool on Base
    address constant AUSDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB; // aUSDC on Base
    
    // Tokens on Base
    address constant WETH = 0x4200000000000000000000000000000000000006; // WETH on Base
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // USDC on Base
    
    // Chainlink CRE Maintainer address (will be updated with actual CRE address)
    address constant CRE_MAINTAINER = address(0x0); // TODO: Update with CRE contract address

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying Sentinel Hook from:", deployer);
        console.log("Target Chain: Base Mainnet");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the hook
        // For this example, we'll manage USDC liquidity in a WETH/USDC pool
        SentinelHook hook = new SentinelHook(
            IPoolManager(POOL_MANAGER),
            ETH_USD_FEED, // Price feed for the pair
            AAVE_POOL,
            AUSDC,
            Currency.wrap(USDC), // Managing USDC side
            CRE_MAINTAINER
        );
        
        console.log("Sentinel Hook deployed at:", address(hook));
        console.log("Hook permissions configured for beforeSwap");
        
        // Log deployment info for verification
        console.log("=== Deployment Configuration ===");
        console.log("Pool Manager:", POOL_MANAGER);
        console.log("Price Feed:", ETH_USD_FEED);
        console.log("Aave Pool:", AAVE_POOL);
        console.log("aToken:", AUSDC);
        console.log("Managed Currency:", USDC);
        console.log("CRE Maintainer:", CRE_MAINTAINER);
        
        // Verify hook address has correct permissions encoded
        address hookAddress = address(hook);
        console.log("=== Hook Address Validation ===");
        console.log("Hook Address:", hookAddress);
        console.log("Address encodes beforeSwap permission:", 
            Hooks.hasPermission(IHooks(hookAddress), Hooks.BEFORE_SWAP_FLAG));
        
        vm.stopBroadcast();
        
        console.log("\n=== Next Steps ===");
        console.log("1. Verify the hook contract on BaseScan");
        console.log("2. Update CRE_MAINTAINER with the Chainlink CRE contract address");
        console.log("3. Initialize a pool with this hook using the PoolManager");
        console.log("4. Fund the hook with initial liquidity");
        console.log("5. Deploy the Chainlink CRE workflow");
    }
}
