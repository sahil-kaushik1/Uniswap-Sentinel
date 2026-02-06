// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "foundry-chainlink-toolkit/src/interfaces/feeds/AggregatorV3Interface.sol";

/// @title OracleLib
/// @notice Provides price validation and circuit breaker functionality using Chainlink Data Feeds
/// @dev This library is critical for the "Hot Path" - it must be gas-efficient
library OracleLib {
    /// @notice Maximum allowed price deviation before reverting (in basis points)
    /// @dev 500 = 5% deviation threshold
    uint256 public constant MAX_PRICE_DEVIATION_BPS = 500;

    /// @notice Maximum age for oracle data to be considered valid
    /// @dev 1 hour staleness threshold
    uint256 public constant MAX_ORACLE_STALENESS = 1 hours;

    error StaleOracleData();
    error InvalidOraclePrice();
    error PriceDeviationTooHigh();

    /// @notice Checks if the current pool price deviates significantly from the oracle price
    /// @param chainlinkFeed The Chainlink price feed to query
    /// @param poolPrice The current price in the Uniswap pool (in 18 decimals)
    /// @param maxDeviationBps Maximum allowed deviation in basis points (e.g., 500 = 5%)
    /// @return isValid True if price is within acceptable range
    /// @return oraclePrice The current oracle price (scaled to 18 decimals)
    function checkPriceDeviation(AggregatorV3Interface chainlinkFeed, uint256 poolPrice, uint256 maxDeviationBps)
        internal
        view
        returns (bool isValid, uint256 oraclePrice)
    {
        // Fetch latest price from Chainlink
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = chainlinkFeed.latestRoundData();

        // Validate oracle data freshness
        if (updatedAt == 0 || answeredInRound < roundId) {
            revert StaleOracleData();
        }

        if (block.timestamp - updatedAt > MAX_ORACLE_STALENESS) {
            revert StaleOracleData();
        }

        // Validate price is positive
        if (answer <= 0) {
            revert InvalidOraclePrice();
        }

        // Scale oracle price to 18 decimals
        uint8 oracleDecimals = chainlinkFeed.decimals();
        oraclePrice = _scalePrice(uint256(answer), oracleDecimals, 18);

        // Calculate deviation percentage
        uint256 deviation = _calculateDeviation(poolPrice, oraclePrice);

        // Check if deviation exceeds threshold
        isValid = deviation <= maxDeviationBps;

        if (!isValid) {
            revert PriceDeviationTooHigh();
        }
    }

    /// @notice Scales a price from one decimal precision to another
    /// @param price The price to scale
    /// @param fromDecimals Current decimal precision
    /// @param toDecimals Target decimal precision
    /// @return scaledPrice The price scaled to target decimals
    function _scalePrice(uint256 price, uint8 fromDecimals, uint8 toDecimals)
        private
        pure
        returns (uint256 scaledPrice)
    {
        if (fromDecimals == toDecimals) {
            return price;
        }

        if (fromDecimals < toDecimals) {
            scaledPrice = price * (10 ** (toDecimals - fromDecimals));
        } else {
            scaledPrice = price / (10 ** (fromDecimals - toDecimals));
        }
    }

    /// @notice Calculates the deviation percentage between two prices
    /// @param price1 First price
    /// @param price2 Second price
    /// @return deviation Deviation in basis points
    function _calculateDeviation(uint256 price1, uint256 price2) private pure returns (uint256 deviation) {
        if (price1 == 0 || price2 == 0) {
            return type(uint256).max;
        }

        uint256 diff = price1 > price2 ? price1 - price2 : price2 - price1;

        // Calculate deviation in basis points (1 bp = 0.01%)
        // deviation = (diff * 10000) / average_price
        uint256 avgPrice = (price1 + price2) / 2;
        deviation = (diff * 10000) / avgPrice;
    }

    /// @notice Get the current oracle price in 18 decimals
    /// @param chainlinkFeed The Chainlink price feed
    /// @return price The current price from oracle
    function getOraclePrice(AggregatorV3Interface chainlinkFeed) internal view returns (uint256 price) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            chainlinkFeed.latestRoundData();

        // Validate freshness
        if (updatedAt == 0 || answeredInRound < roundId) {
            revert StaleOracleData();
        }
        if (block.timestamp - updatedAt > MAX_ORACLE_STALENESS) {
            revert StaleOracleData();
        }

        if (answer <= 0) {
            revert InvalidOraclePrice();
        }

        // Scale to 18 decimals
        uint8 oracleDecimals = chainlinkFeed.decimals();
        price = _scalePrice(uint256(answer), oracleDecimals, 18);
    }
}
