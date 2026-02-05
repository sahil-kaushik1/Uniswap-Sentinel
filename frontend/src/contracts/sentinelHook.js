export const sentinelHookAbi = [
  {
    type: 'function',
    name: 'depositLiquidity',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'key',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' }
        ]
      },
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' }
    ],
    outputs: [{ name: 'sharesReceived', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'withdrawLiquidity',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'key',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' }
        ]
      },
      { name: 'sharesToWithdraw', type: 'uint256' }
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' }
    ]
  },
  {
    type: 'function',
    name: 'getPoolState',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      {
        name: 'state',
        type: 'tuple',
        components: [
          { name: 'activeTickLower', type: 'int24' },
          { name: 'activeTickUpper', type: 'int24' },
          { name: 'activeLiquidity', type: 'uint128' },
          { name: 'priceFeed', type: 'address' },
          { name: 'maxDeviationBps', type: 'uint256' },
          { name: 'aToken0', type: 'address' },
          { name: 'aToken1', type: 'address' },
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'totalShares', type: 'uint256' },
          { name: 'isInitialized', type: 'bool' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'getSharePrice',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'price', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'getLPPosition',
    stateMutability: 'view',
    inputs: [
      { name: 'poolId', type: 'bytes32' },
      { name: 'lp', type: 'address' }
    ],
    outputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'value', type: 'uint256' }
    ]
  }
];
