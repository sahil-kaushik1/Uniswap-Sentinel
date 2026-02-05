import { encodeAbiParameters, keccak256 } from 'viem';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function computePoolId({
  currency0,
  currency1,
  fee,
  tickSpacing,
  hooks
}) {
  const encoded = encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'address' },
      { type: 'uint24' },
      { type: 'int24' },
      { type: 'address' }
    ],
    [currency0, currency1, fee, tickSpacing, hooks]
  );
  return keccak256(encoded);
}

export function isZeroAddress(address) {
  return address?.toLowerCase() === ZERO_ADDRESS;
}
