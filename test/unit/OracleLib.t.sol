// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OracleLib} from "../../src/libraries/OracleLib.sol";
import {MockOracle} from "../mocks/MockOracle.sol";
import {AggregatorV3Interface} from "foundry-chainlink-toolkit/src/interfaces/feeds/AggregatorV3Interface.sol";

contract OracleLibHarness {
    function callCheckPriceDeviation(AggregatorV3Interface feed, uint256 poolPrice, uint256 maxDeviationBps)
        external
        view
        returns (bool isValid, uint256 oraclePrice)
    {
        return OracleLib.checkPriceDeviation(feed, poolPrice, maxDeviationBps);
    }

    function callGetOraclePrice(AggregatorV3Interface feed) external view returns (uint256 price) {
        return OracleLib.getOraclePrice(feed);
    }
}

contract OracleLibUnitTest is Test {
    OracleLibHarness harness;

    function setUp() public {
        harness = new OracleLibHarness();
    }

    function testCheckPriceDeviation_RevertsOnStaleRound() public {
        MockOracle oracle = new MockOracle(8, 1e8);
        oracle.setRoundData(2, 1e8, block.timestamp, block.timestamp, 1);

        vm.expectRevert(OracleLib.StaleOracleData.selector);
        harness.callCheckPriceDeviation(AggregatorV3Interface(address(oracle)), 1e18, 500);
    }

    function testCheckPriceDeviation_RevertsOnStaleTimestamp() public {
        vm.warp(OracleLib.MAX_ORACLE_STALENESS + 10);
        MockOracle oracle = new MockOracle(8, 1e8);
        uint256 oldTime = block.timestamp - OracleLib.MAX_ORACLE_STALENESS - 1;
        oracle.setRoundData(1, 1e8, oldTime, oldTime, 1);

        vm.expectRevert(OracleLib.StaleOracleData.selector);
        harness.callCheckPriceDeviation(AggregatorV3Interface(address(oracle)), 1e18, 500);
    }

    function testCheckPriceDeviation_RevertsOnInvalidPrice() public {
        MockOracle oracle = new MockOracle(8, 0);
        oracle.setRoundData(1, 0, block.timestamp, block.timestamp, 1);

        vm.expectRevert(OracleLib.InvalidOraclePrice.selector);
        harness.callCheckPriceDeviation(AggregatorV3Interface(address(oracle)), 1e18, 500);
    }

    function testCheckPriceDeviation_RevertsOnDeviationTooHigh() public {
        MockOracle oracle = new MockOracle(8, 1000e8);
        oracle.setRoundData(1, 1000e8, block.timestamp, block.timestamp, 1);

        vm.expectRevert(OracleLib.PriceDeviationTooHigh.selector);
        harness.callCheckPriceDeviation(AggregatorV3Interface(address(oracle)), 1e18, 1);
    }

    function testCheckPriceDeviation_ReturnsOraclePrice() public {
        MockOracle oracle = new MockOracle(8, 2000e8);
        oracle.setRoundData(1, 2000e8, block.timestamp, block.timestamp, 1);

        (bool ok, uint256 oraclePrice) =
            harness.callCheckPriceDeviation(AggregatorV3Interface(address(oracle)), 2000e18, 500);

        assertTrue(ok);
        assertEq(oraclePrice, 2000e18);
    }

    function testGetOraclePrice_RevertsOnStale() public {
        vm.warp(OracleLib.MAX_ORACLE_STALENESS + 10);
        MockOracle oracle = new MockOracle(8, 1e8);
        uint256 oldTime = block.timestamp - OracleLib.MAX_ORACLE_STALENESS - 1;
        oracle.setRoundData(1, 1e8, oldTime, oldTime, 1);

        vm.expectRevert(OracleLib.StaleOracleData.selector);
        harness.callGetOraclePrice(AggregatorV3Interface(address(oracle)));
    }

    function testGetOraclePrice_ScalesDecimals() public {
        MockOracle oracle = new MockOracle(6, 1234567);
        oracle.setRoundData(1, 1234567, block.timestamp, block.timestamp, 1);

        uint256 price = harness.callGetOraclePrice(AggregatorV3Interface(address(oracle)));
        assertEq(price, 1234567 * 1e12);
    }
}
