// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SentinelAutomation} from "../src/automation/SentinelAutomation.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @title DeploySentinelAutomation
/// @notice Deploys the SentinelAutomation contract and optionally registers pools
contract DeploySentinelAutomation is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        address hookAddress = vm.envAddress("SENTINEL_HOOK_ADDRESS");
        address poolManager = vm.envAddress("POOL_MANAGER");
        bool useFunctions = vm.envOr("USE_FUNCTIONS", false);
        address functionsRouter = useFunctions
            ? vm.envAddress("CL_FUNCTIONS_ROUTER")
            : address(0);
        bytes32 donId = useFunctions ? vm.envBytes32("CL_DON_ID") : bytes32(0);
        uint64 subscriptionId = useFunctions ? uint64(vm.envUint("CL_SUB_ID")) : 0;
        uint32 gasLimit = useFunctions ? uint32(vm.envUint("CL_GAS_LIMIT")) : 0;
        string memory defaultSource = "";
        string memory source = vm.envOr("CL_FUNCTIONS_SOURCE", defaultSource);
        
        console.log("Deploying SentinelAutomation...");
        console.log("Hook Address:", hookAddress);
        console.log("PoolManager:", poolManager);
        console.log("Use Functions:", useFunctions);
        if (useFunctions) {
            console.log("Functions Router:", functionsRouter);
            console.log("DON ID:", vm.toString(donId));
            console.log("Subscription ID:", subscriptionId);
            console.log("Gas Limit:", gasLimit);
        }

        if (deployerPrivateKey != 0) {
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }
        
        if (useFunctions && bytes(source).length == 0) {
            source = vm.readFile("src/automation/functions/rebalancer.js");
        }

        // Deploy automation contract (Chainlink Functions + Automation)
        SentinelAutomation automation = new SentinelAutomation(
            hookAddress,
            poolManager,
            functionsRouter,
            donId,
            subscriptionId,
            gasLimit,
            source,
            useFunctions
        );
        
        console.log("SentinelAutomation deployed at:", address(automation));
        
        vm.stopBroadcast();
        
        // Output deployment info for Chainlink registration
        console.log("");
        console.log("=== NEXT STEPS ===");
        console.log("1. Register on https://automation.chain.link/");
        console.log("2. Target Contract:", address(automation));
        if (useFunctions) {
            console.log("3. Fund subscription:", subscriptionId);
            console.log("4. Set hook.setMaintainer(", address(automation), ")");
            console.log("5. Add pools via automation.addPool(poolId, poolType)");
        } else {
            console.log("3. Fund upkeep with LINK (Automation only)");
            console.log("4. Set hook.setMaintainer(", address(automation), ")");
            console.log("5. Add pools via automation.addPool(poolId, poolType)");
        }
    }
}

/// @title RegisterPools
/// @notice Registers pools with an existing SentinelAutomation contract
contract RegisterPools is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        address automationAddress = vm.envAddress("AUTOMATION_ADDRESS");
        
        bytes32 poolIdRaw = vm.envBytes32("POOL_ID");
        uint8 poolType = uint8(vm.envUint("POOL_TYPE"));
        
        SentinelAutomation automation = SentinelAutomation(automationAddress);
        
        if (deployerPrivateKey != 0) {
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }
        
        PoolId poolId = PoolId.wrap(poolIdRaw);
        automation.addPool(poolId, poolType);
        console.log("Added pool:", uint256(poolIdRaw));
        console.log("Pool type:", poolType);
        
        vm.stopBroadcast();
    }
}

interface ISetMaintainerHook {
    function setMaintainer(address newMaintainer) external;
    function maintainer() external view returns (address);
}

/// @title SetMaintainer
/// @notice Updates the SentinelHook maintainer to the automation contract
contract SetMaintainer is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        address hookAddress = vm.envAddress("SENTINEL_HOOK_ADDRESS");
        address automationAddress = vm.envAddress("AUTOMATION_ADDRESS");
        
        ISetMaintainerHook hook = ISetMaintainerHook(hookAddress);
        
        console.log("Current maintainer:", hook.maintainer());
        console.log("Setting new maintainer:", automationAddress);
        
        if (deployerPrivateKey != 0) {
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }
        hook.setMaintainer(automationAddress);
        vm.stopBroadcast();
        
        console.log("New maintainer set:", hook.maintainer());
    }
}
