// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OracleLib} from "../../src/libraries/OracleLib.sol";
import {MockOracle} from "../mocks/MockOracle.sol";
import {AggregatorV3Interface} from "foundry-chainlink-toolkit/src/interfaces/feeds/AggregatorV3Interface.sol";

contract OracleLibFuzzTest is Test {
    function testFuzz_GetOraclePriceScales(uint8 decimals, uint256 answer) public {
        vm.assume(decimals <= 18);
        vm.assume(answer > 0 && answer <= 1e18);

        MockOracle oracle = new MockOracle(decimals, int256(answer));
        oracle.setRoundData(1, int256(answer), block.timestamp, block.timestamp, 1);

        uint256 expected;
        if (decimals < 18) {
            expected = answer * (10 ** (18 - decimals));
        } else {
            expected = answer / (10 ** (decimals - 18));
        }

        uint256 price = OracleLib.getOraclePrice(AggregatorV3Interface(address(oracle)));
        assertEq(price, expected);
    }

    function testFuzz_CheckPriceDeviation_PassesWhenEqual(uint8 decimals, uint256 answer) public {
        vm.assume(decimals <= 18);
        vm.assume(answer > 0 && answer <= 1e18);

        MockOracle oracle = new MockOracle(decimals, int256(answer));
        oracle.setRoundData(1, int256(answer), block.timestamp, block.timestamp, 1);

        uint256 poolPrice;
        if (decimals < 18) {
            poolPrice = answer * (10 ** (18 - decimals));
        } else {
            poolPrice = answer / (10 ** (decimals - 18));
        }

        (bool ok,) = OracleLib.checkPriceDeviation(AggregatorV3Interface(address(oracle)), poolPrice, 500);
        assertTrue(ok);
    }
}
