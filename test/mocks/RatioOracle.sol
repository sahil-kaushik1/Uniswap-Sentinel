// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    AggregatorV3Interface
} from "foundry-chainlink-toolkit/src/interfaces/feeds/AggregatorV3Interface.sol";

/// @title RatioOracle
/// @notice Derives price of Base/Quote from Base/USD and Quote/USD feeds
/// @dev Implements a subset of AggregatorV3Interface needed by OracleLib
contract RatioOracle is AggregatorV3Interface {
    AggregatorV3Interface public immutable baseFeed;
    AggregatorV3Interface public immutable quoteFeed;
    uint8 public immutable decimals;
    string public description;
    uint256 public immutable version;

    constructor(address _baseFeed, address _quoteFeed, string memory _desc) {
        baseFeed = AggregatorV3Interface(_baseFeed);
        quoteFeed = AggregatorV3Interface(_quoteFeed);
        decimals = 18; // Standardizing to 18 decimals for ratio
        description = _desc;
        version = 1;
    }

    function getRoundData(
        uint80
    )
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return latestRoundData();
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        (, int256 basePrice, , , ) = baseFeed.latestRoundData();
        (, int256 quotePrice, , , ) = quoteFeed.latestRoundData();

        require(basePrice > 0 && quotePrice > 0, "Invalid feed price");

        // Calculate ratio: (Base / Quote)
        // Example: BTC ($50000) / ETH ($2500) = 20
        // Scaled: (50000e8 * 1e18) / 2500e8 = 20e18

        uint256 scale = 10 ** uint256(decimals);
        answer = (basePrice * int256(scale)) / quotePrice;

        return (0, answer, 0, block.timestamp, 0);
    }
}
