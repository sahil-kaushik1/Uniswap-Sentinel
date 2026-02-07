// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
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
    // ─── Deployed contract addresses (from DeployFullDemo) ─────
    address constant SENTINEL_HOOK = 0x386bc633421dD0416E357ae1c34177568dA52080;

    // ─── Pool IDs (from deployment output) ─────────────────────
    bytes32 constant POOL1_ID = 0xebd975263c29db205914ec03bc0bb7b43c34ab833ae24c7f521a4c0edc3eb8f5; // mUSDC/mETH
    bytes32 constant POOL2_ID = 0xb86d98b048c5f61f5b9e8a7c7d769b0971aba0948777e349a21314e1429f9266; // mWBTC/mETH
    bytes32 constant POOL3_ID = 0x42cc361675a03875472eb6f267b516a0f88a4cafe0d7265905b761f2fbded3d6; // mUSDT/mETH

    // ─── Chainlink Functions (Ethereum Sepolia) ────────────────
    address constant CL_FUNCTIONS_ROUTER = 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0;
    bytes32 constant CL_DON_ID = 0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000; // fun-ethereum-sepolia-1
    uint32  constant CL_GAS_LIMIT = 300_000;

    function run() external {
        // Load subscription ID from env (must create subscription first)
        uint64 subId = uint64(vm.envUint("CL_SUB_ID"));
        
        console.log("========================================");
        console.log("  SENTINEL AUTOMATION DEPLOYMENT");
        console.log("========================================");
        console.log("Hook:", SENTINEL_HOOK);
        console.log("Functions Router:", CL_FUNCTIONS_ROUTER);
        console.log("Subscription ID:", subId);

        vm.startBroadcast();

        // ── Step 1: Read rebalancer.js source ──────────────────
        string memory source = vm.readFile("src/automation/functions/rebalancer.js");
        console.log("\n--- 1. Loaded rebalancer.js source ---");
        console.log("Source length:", bytes(source).length, "bytes");

        // ── Step 2: Deploy SentinelAutomation ──────────────────
        SentinelAutomation automation = new SentinelAutomation(
            SENTINEL_HOOK,
            CL_FUNCTIONS_ROUTER,
            CL_DON_ID,
            subId,
            CL_GAS_LIMIT,
            source
        );
        console.log("\n--- 2. Deployed SentinelAutomation ---");
        console.log("SentinelAutomation:", address(automation));

        // ── Step 3: Set automation as maintainer on hook ───────
        ISentinelHookAdmin hook = ISentinelHookAdmin(SENTINEL_HOOK);
        console.log("\n--- 3. Setting Maintainer ---");
        console.log("Current maintainer:", hook.maintainer());
        hook.setMaintainer(address(automation));
        console.log("New maintainer:", address(automation));

        // ── Step 4: Register all 3 pools ───────────────────────
        console.log("\n--- 4. Registering Pools ---");
        
        automation.addPool(PoolId.wrap(POOL1_ID), 0); // ETH/USDC
        console.log("Pool 1 (mUSDC/mETH) registered as type 0");
        
        automation.addPool(PoolId.wrap(POOL2_ID), 1); // WBTC/ETH
        console.log("Pool 2 (mWBTC/mETH) registered as type 1");
        
        automation.addPool(PoolId.wrap(POOL3_ID), 2); // ETH/USDT
        console.log("Pool 3 (mUSDT/mETH) registered as type 2");

        vm.stopBroadcast();

        // ── Summary ────────────────────────────────────────────
        console.log("\n========================================");
        console.log("  AUTOMATION DEPLOYMENT COMPLETE");
        console.log("========================================");
        console.log("SentinelAutomation:", address(automation));
        console.log("Maintainer set:     true");
        console.log("Pools registered:   3/3");
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
        console.log("========================================");
    }
}
