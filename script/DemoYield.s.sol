// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockAavePool} from "../test/mocks/MockAavePool.sol";

/// @title DemoYield
/// @notice Simulates Aave yield by minting extra aToken interest
/// @dev Usage: forge script script/DemoYield.s.sol --account test1 --sender <ADDR> --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
///   Requires: MOCK_AAVE, TOKEN (underlying asset address), AMOUNT (interest to simulate)
contract DemoYield is Script {
    function run() external {
        address mockAaveAddr = vm.envAddress("MOCK_AAVE");
        address token = vm.envAddress("TOKEN");
        uint256 amount = vm.envUint("AMOUNT");
        address beneficiary = vm.envOr("BENEFICIARY", address(0));

        MockAavePool mockAave = MockAavePool(mockAaveAddr);

        vm.startBroadcast();

        // Default beneficiary = the hook (where aTokens are held)
        address to = beneficiary == address(0) ? vm.envAddress("SENTINEL_HOOK") : beneficiary;

        console.log("Simulating yield accrual...");
        console.log("  Token:", token);
        console.log("  Amount:", amount);
        console.log("  Beneficiary:", to);

        mockAave.mintInterest(token, to, amount);

        console.log("Yield simulation complete! aToken holders earned interest.");
        vm.stopBroadcast();
    }
}
