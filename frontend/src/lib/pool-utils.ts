export function totalLiquidityUnitsFromSharePrice(
  sharePrice: bigint,
  totalShares: bigint
): bigint {
  if (sharePrice <= 0n || totalShares <= 0n) return 0n
  return (sharePrice * totalShares) / 10n ** 18n
}

export function computeActiveIdle(
  state: {
    activeLiquidity: bigint
    totalShares: bigint
    isInitialized?: boolean
  } | undefined,
  sharePrice: bigint
) {
  const totalLiquidityUnits = state && sharePrice > 0n && state.totalShares > 0n
    ? totalLiquidityUnitsFromSharePrice(sharePrice, state.totalShares)
    : 0n

  const activeLiquidityUnits = state ? BigInt(state.activeLiquidity) : 0n
  const idleLiquidityUnits = totalLiquidityUnits > activeLiquidityUnits ? totalLiquidityUnits - activeLiquidityUnits : 0n

  const hasActive = state ? state.activeLiquidity > 0n : false
  const activePercent = hasActive && totalLiquidityUnits > 0n
    ? Number((activeLiquidityUnits * 100n) / (totalLiquidityUnits > 0n ? totalLiquidityUnits : 1n))
    : hasActive ? 100 : 0

  return {
    totalLiquidityUnits,
    activeLiquidityUnits,
    idleLiquidityUnits,
    activePercent,
  }
}
