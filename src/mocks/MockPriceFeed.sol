// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "foundry-chainlink-toolkit/src/interfaces/feeds/AggregatorV3Interface.sol";

/// @title MockPriceFeed
/// @notice Simple, owner-controlled Chainlink price feed mock
contract MockPriceFeed is AggregatorV3Interface {
    address public owner;

    uint8 private _decimals;
    string private _description;
    uint256 private _version;

    int256 private _answer;
    uint80 private _roundId;
    uint80 private _answeredInRound;
    uint256 private _updatedAt;
    uint256 private _startedAt;

    error NotOwner();

    constructor(uint8 decimals_, int256 answer_, string memory description_) {
        owner = msg.sender;
        _decimals = decimals_;
        _description = description_;
        _version = 1;

        _roundId = 1;
        _answeredInRound = 1;
        _answer = answer_;
        _updatedAt = block.timestamp;
        _startedAt = block.timestamp;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function setPrice(int256 answer) external onlyOwner {
        _roundId += 1;
        _answeredInRound = _roundId;
        _answer = answer;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
    }

    function setRoundData(
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) external onlyOwner {
        _roundId = roundId;
        _answer = answer;
        _startedAt = startedAt;
        _updatedAt = updatedAt;
        _answeredInRound = answeredInRound;
    }

    function setDecimals(uint8 decimals_) external onlyOwner {
        _decimals = decimals_;
    }

    function setDescription(string calldata description_) external onlyOwner {
        _description = description_;
    }

    function setVersion(uint256 version_) external onlyOwner {
        _version = version_;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external view override returns (uint256) {
        return _version;
    }

    function getRoundData(uint80)
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }
}
