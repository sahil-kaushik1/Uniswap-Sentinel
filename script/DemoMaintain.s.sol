// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SentinelHook} from "../src/SentinelHook.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @title DemoMaintain
/// @notice Calls maintain() to trigger a rebalance on a pool
/// @dev Usage: forge script script/DemoMaintain.s.sol --account test1 --sender <ADDR> --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
///   Requires: SENTINEL_HOOK, POOL_ID, TICK_LOWER, TICK_UPPER, VOLATILITY
contract DemoMaintain is Script {
    function run() external {
        address hookAddr = vm.envAddress("SENTINEL_HOOK");
        bytes32 poolIdRaw = vm.envBytes32("POOL_ID");
        int24 tickLower = int24(vm.envInt("TICK_LOWER"));
        int24 tickUpper = int24(vm.envInt("TICK_UPPER"));
        uint256 volatility = vm.envUint("VOLATILITY");

        SentinelHook hook = SentinelHook(payable(hookAddr));
        PoolId poolId = PoolId.wrap(poolIdRaw);

        vm.startBroadcast();

        console.log("Calling maintain() on pool:", vm.toString(poolIdRaw));
        console.log("  tickLower:", vm.toString(int256(tickLower)));
        console.log("  tickUpper:", vm.toString(int256(tickUpper)));
        console.log("  Volatility:", volatility);

        hook.maintain(poolId, tickLower, tickUpper, volatility);

        console.log("Maintain executed successfully!");
        vm.stopBroadcast();
    }
}
