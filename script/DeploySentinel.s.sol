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
/// @notice Deployment script for Sentinel Hook
/// @dev This script deploys the hook and initializes a pool
contract DeploySentinel is Script {
    
}
