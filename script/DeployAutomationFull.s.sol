// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {SentinelAutomation} from "../src/automation/SentinelAutomation.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

interface ISentinelHookAdmin {
    function setMaintainer(address newMaintainer) external;
    function maintainer() external view returns (address);
    function owner() external view returns (address);
}

/// @title DeployAutomationFull
/// @notice All-in-one: Deploy SentinelAutomation, set as maintainer, register all 3 pools
contract DeployAutomationFull is Script {
    using stdJson for string;

    // ─── Chainlink Functions (Ethereum Sepolia defaults) ────────────────
    address constant DEFAULT_CL_FUNCTIONS_ROUTER = 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0;
    bytes32 constant DEFAULT_CL_DON_ID = 0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000; // fun-ethereum-sepolia-1
    uint32  constant DEFAULT_CL_GAS_LIMIT = 300_000;

    function run() external {
        bool useFunctions = vm.envOr("USE_FUNCTIONS", false);
        uint64 subId = useFunctions ? uint64(vm.envUint("CL_SUB_ID")) : 0;
        address functionsRouter = useFunctions
            ? vm.envOr("CL_FUNCTIONS_ROUTER", DEFAULT_CL_FUNCTIONS_ROUTER)
            : address(0);
        bytes32 donId = useFunctions
            ? vm.envOr("CL_DON_ID", DEFAULT_CL_DON_ID)
            : bytes32(0);
        uint32 gasLimit = useFunctions
            ? uint32(vm.envOr("CL_GAS_LIMIT", uint256(DEFAULT_CL_GAS_LIMIT)))
            : 0;

        (
            address hookAddress,
            address poolManager,
            bytes32 pool1Id,
            bytes32 pool2Id,
            bytes32 pool3Id
        ) = _loadDeployment();
        
        console.log("========================================");
        console.log("  SENTINEL AUTOMATION DEPLOYMENT");
        console.log("========================================");
        console.log("Hook:", hookAddress);
        console.log("PoolManager:", poolManager);
        console.log("Use Functions:", useFunctions);
        if (useFunctions) {
            console.log("Functions Router:", functionsRouter);
            console.log("Subscription ID:", subId);
        }

        vm.startBroadcast();

        string memory source = "";
        if (useFunctions) {
            // ── Step 1: Read rebalancer.js source ──────────────────
            source = vm.readFile("src/automation/functions/rebalancer.js");
            console.log("\n--- 1. Loaded rebalancer.js source ---");
            console.log("Source length:", bytes(source).length, "bytes");
        }

        // ── Step 2: Deploy SentinelAutomation ──────────────────
        SentinelAutomation automation = new SentinelAutomation(
            hookAddress,
            poolManager,
            functionsRouter,
            donId,
            subId,
            gasLimit,
            source,
            useFunctions
        );
        console.log("\n--- 2. Deployed SentinelAutomation ---");
        console.log("SentinelAutomation:", address(automation));

        // ── Step 3: Set automation as maintainer on hook ───────
        ISentinelHookAdmin hook = ISentinelHookAdmin(hookAddress);
        console.log("\n--- 3. Setting Maintainer ---");
        console.log("Current maintainer:", hook.maintainer());
        hook.setMaintainer(address(automation));
        console.log("New maintainer:", address(automation));

        // ── Step 4: Register all 3 pools ───────────────────────
        console.log("\n--- 4. Registering Pools ---");
        
        automation.addPool(PoolId.wrap(pool1Id), 0); // ETH/USDC
        console.log("Pool 1 (mUSDC/mETH) registered as type 0");
        
        automation.addPool(PoolId.wrap(pool2Id), 1); // WBTC/ETH
        console.log("Pool 2 (mWBTC/mETH) registered as type 1");
        
        automation.addPool(PoolId.wrap(pool3Id), 2); // ETH/USDT
        console.log("Pool 3 (mUSDT/mETH) registered as type 2");

        vm.stopBroadcast();

        // ── Summary ────────────────────────────────────────────
        console.log("\n========================================");
        console.log("  AUTOMATION DEPLOYMENT COMPLETE");
        console.log("========================================");
        console.log("SentinelAutomation:", address(automation));
        console.log("Maintainer set:     true");
        console.log("Pools registered:   3/3");
        if (useFunctions) {
            console.log("Subscription ID:   ", subId);
            console.log("");
            console.log("=== REMAINING MANUAL STEPS ===");
            console.log("1. Add SentinelAutomation as consumer to your Functions subscription:");
            console.log("   -> https://functions.chain.link");
            console.log("   -> Subscription", subId);
            console.log("   -> Add Consumer:", address(automation));
            console.log("");
            console.log("2. Register Custom Logic Upkeep on Chainlink Automation:");
            console.log("   -> https://automation.chain.link/sepolia");
            console.log("   -> Register new upkeep -> Custom logic");
            console.log("   -> Target contract:", address(automation));
            console.log("   -> Fund with LINK (3-5 LINK recommended)");
        } else {
            console.log("");
            console.log("=== REMAINING MANUAL STEPS ===");
            console.log("1. Register Custom Logic Upkeep on Chainlink Automation:");
            console.log("   -> https://automation.chain.link/sepolia");
            console.log("   -> Register new upkeep -> Custom logic");
            console.log("   -> Target contract:", address(automation));
            console.log("   -> Fund with LINK (Automation only)");
        }
        console.log("========================================");
    }

    function _loadDeployment()
        internal
        view
        returns (
            address hookAddress,
            address poolManager,
            bytes32 pool1Id,
            bytes32 pool2Id,
            bytes32 pool3Id
        )
    {
        string memory defaultPath = string.concat(
            vm.projectRoot(),
            "/deployment.json"
        );
        string memory path = vm.envOr("DEPLOYMENT_JSON", defaultPath);
        string memory json = vm.readFile(path);

        hookAddress = json.readAddress(".SENTINEL_HOOK");
        poolManager = json.readAddress(".POOL_MANAGER");
        pool1Id = json.readBytes32(".POOL_ID_ETH_USDC");
        pool2Id = json.readBytes32(".POOL_ID_WBTC_ETH");
        pool3Id = json.readBytes32(".POOL_ID_ETH_USDT");
    }
}
