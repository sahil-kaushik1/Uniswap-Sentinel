// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeploySentinel} from "../../script/DeploySentinel.s.sol";
import {SentinelHook} from "../../src/SentinelHook.sol";
import {MockPoolManager} from "../mocks/MockPoolManager.sol";
import {MockAavePool} from "../mocks/MockAavePool.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

contract DeploySentinelUnitTest is Test {
    function testInitializeEthUsdcPool_Runs() public {
        uint256 privateKey = 1;
        address deployer = vm.addr(privateKey);

        MockPoolManager poolManager = new MockPoolManager();
        MockAavePool aavePool = new MockAavePool();

        uint160 flags = uint160(Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG);
        bytes memory constructorArgs = abi.encode(IPoolManager(address(poolManager)), address(aavePool), deployer);
        (address expectedAddress, bytes32 salt) =
            HookMiner.find(deployer, flags, type(SentinelHook).creationCode, constructorArgs);

        vm.prank(deployer);
        SentinelHook hook =
            new SentinelHook{salt: salt}(IPoolManager(address(poolManager)), address(aavePool), deployer);
        assertEq(address(hook), expectedAddress);

        vm.setEnv("PRIVATE_KEY", "1");
        vm.setEnv("SENTINEL_HOOK", vm.toString(address(hook)));

        DeploySentinel script = new DeploySentinel();
        script.initializeEthUsdcPool();
    }

    function testInitializeLinkUsdcPool_Runs() public {
        uint256 privateKey = 2;
        address deployer = vm.addr(privateKey);

        MockPoolManager poolManager = new MockPoolManager();
        MockAavePool aavePool = new MockAavePool();

        uint160 flags = uint160(Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG);
        bytes memory constructorArgs = abi.encode(IPoolManager(address(poolManager)), address(aavePool), deployer);
        (address expectedAddress, bytes32 salt) =
            HookMiner.find(deployer, flags, type(SentinelHook).creationCode, constructorArgs);

        vm.prank(deployer);
        SentinelHook hook =
            new SentinelHook{salt: salt}(IPoolManager(address(poolManager)), address(aavePool), deployer);
        assertEq(address(hook), expectedAddress);

        vm.setEnv("PRIVATE_KEY", "2");
        vm.setEnv("SENTINEL_HOOK", vm.toString(address(hook)));

        DeploySentinel script = new DeploySentinel();
        script.initializeLinkUsdcPool();
    }

    function testRun_OnSepoliaPath() public {
        vm.setEnv("PRIVATE_KEY", "3");
        vm.chainId(11155111);

        DeploySentinel script = new DeploySentinel();
        script.run();
    }
}
