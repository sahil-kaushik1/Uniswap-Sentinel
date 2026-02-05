// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";

contract MockAToken is ERC20 {
    address public pool;
    address public underlyingAsset;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _pool,
        address _underlying
    ) ERC20(_name, _symbol, _decimals) {
        pool = _pool;
        underlyingAsset = _underlying;
    }

    modifier onlyPool() {
        require(msg.sender == pool, "Only Pool");
        _;
    }

    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyPool {
        _burn(from, amount);
    }
}

contract MockAavePool {
    using SafeTransferLib for ERC20;

    mapping(address => address) public assetToAToken;

    function initReserve(
        address asset,
        string memory name,
        string memory symbol
    ) external returns (address) {
        ERC20 underlying = ERC20(asset);
        MockAToken aToken = new MockAToken(
            name,
            symbol,
            underlying.decimals(),
            address(this),
            asset
        );
        assetToAToken[asset] = address(aToken);
        return address(aToken);
    }

    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 /*referralCode*/
    ) external {
        address aTokenAddr = assetToAToken[asset];
        require(aTokenAddr != address(0), "Reserve not initialized");

        // Transfer Asset from sender to this pool
        ERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        // Mint aTokens
        MockAToken(aTokenAddr).mint(onBehalfOf, amount);
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256) {
        address aTokenAddr = assetToAToken[asset];
        require(aTokenAddr != address(0), "Reserve not initialized");

        MockAToken aToken = MockAToken(aTokenAddr);
        uint256 userBalance = aToken.balanceOf(msg.sender);

        uint256 amountToWithdraw = amount;
        if (amount == type(uint256).max) {
            amountToWithdraw = userBalance;
        }

        require(userBalance >= amountToWithdraw, "Insufficient balance");

        // Burn aTokens
        aToken.burn(msg.sender, amountToWithdraw);

        // Transfer underlying to user
        ERC20(asset).safeTransfer(to, amountToWithdraw);

        return amountToWithdraw;
    }

    function getReserveNormalizedIncome(
        address /*asset*/
    ) external pure returns (uint256) {
        return 1e27; // 1.0 ray
    }
}
