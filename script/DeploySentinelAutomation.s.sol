// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SentinelAutomation} from "../src/automation/SentinelAutomation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @title DeploySentinelAutomation
/// @notice Deploys the SentinelAutomation contract and optionally registers pools
contract DeploySentinelAutomation is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envAddress("SENTINEL_HOOK_ADDRESS");
        address poolManagerAddress = vm.envAddress("POOL_MANAGER_ADDRESS");
        
        console.log("Deploying SentinelAutomation...");
        console.log("Hook Address:", hookAddress);
        console.log("PoolManager Address:", poolManagerAddress);

        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy automation contract
        SentinelAutomation automation = new SentinelAutomation(
            hookAddress,
            poolManagerAddress
        );
        
        console.log("SentinelAutomation deployed at:", address(automation));
        
        vm.stopBroadcast();
        
        // Output deployment info for Chainlink registration
        console.log("");
        console.log("=== NEXT STEPS ===");
        console.log("1. Register on https://automation.chain.link/");
        console.log("2. Target Contract:", address(automation));
        console.log("3. Set hook.setMaintainer(", address(automation), ")");
        console.log("4. Add pools via automation.addPool(poolId)");
    }
}

/// @title RegisterPools
/// @notice Registers pools with an existing SentinelAutomation contract
contract RegisterPools is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address automationAddress = vm.envAddress("AUTOMATION_ADDRESS");
        
        // Example pool IDs - replace with actual
        bytes32[] memory poolIds = new bytes32[](1);
        poolIds[0] = bytes32(0); // Replace with actual pool ID
        
        SentinelAutomation automation = SentinelAutomation(automationAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        for (uint256 i = 0; i < poolIds.length; i++) {
            PoolId poolId = PoolId.wrap(poolIds[i]);
            automation.addPool(poolId);
            console.log("Added pool:", uint256(poolIds[i]));
        }
        
        vm.stopBroadcast();
    }
}

/// @title SetMaintainer
/// @notice Updates the SentinelHook maintainer to the automation contract
contract SetMaintainer is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envAddress("SENTINEL_HOOK_ADDRESS");
        address automationAddress = vm.envAddress("AUTOMATION_ADDRESS");
        
        // Minimal interface for setMaintainer
        interface ISentinelHook {
            function setMaintainer(address newMaintainer) external;
            function maintainer() external view returns (address);
        }
        
        ISentinelHook hook = ISentinelHook(hookAddress);
        
        console.log("Current maintainer:", hook.maintainer());
        console.log("Setting new maintainer:", automationAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        hook.setMaintainer(automationAddress);
        vm.stopBroadcast();
        
        console.log("New maintainer set:", hook.maintainer());
    }
}
