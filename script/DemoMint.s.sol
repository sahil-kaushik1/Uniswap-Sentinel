// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @title MintTokens
/// @notice Mints mock tokens to any address for demo/testing
/// @dev Usage: forge script script/DemoActions.s.sol:MintTokens --account test1 --sender <ADDR> --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
///   Requires env vars: METH, MUSDC, MWBTC, MUSDT (token addresses)
///   Optional: MINT_TO (default: deployer)
contract MintTokens is Script {
    function run() external {
        address mETH = vm.envAddress("METH");
        address mUSDC = vm.envAddress("MUSDC");
        address mWBTC = vm.envAddress("MWBTC");
        address mUSDT = vm.envAddress("MUSDT");

        vm.startBroadcast();
        address to = vm.envOr("MINT_TO", msg.sender);

        MockERC20(mETH).mint(to, 1000 ether);
        MockERC20(mUSDC).mint(to, 10_000_000e6);
        MockERC20(mWBTC).mint(to, 100e8);
        MockERC20(mUSDT).mint(to, 10_000_000e6);

        console.log("Minted to:", to);
        console.log("  1000 mETH, 10M mUSDC, 100 mWBTC, 10M mUSDT");
        vm.stopBroadcast();
    }
}
