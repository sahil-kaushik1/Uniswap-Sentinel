import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { ArrowUpRight, Wallet, TrendingUp, PiggyBank, AlertCircle } from "lucide-react"
import { useAccount } from "wagmi"
import { formatUnits } from "viem"
import { useAllPoolStates, useAllLPPositions, useAllSharePrices } from "@/hooks/use-sentinel"
import { useAllATokenBalances } from "@/hooks/use-aTokens"
import { useAllSlot0 } from "@/hooks/use-slot0"
import { useEthUsdPrice } from "@/hooks/use-oracles"
import { computeActiveIdle } from "@/lib/pool-utils"
import { POOLS, TOKENS, type PoolConfig } from "@/lib/addresses"
import { DepositDialog } from "@/components/deposit-dialog"
import { WithdrawDialog } from "@/components/withdraw-dialog"
import { usePoolEvents } from "@/hooks/use-pool-events"

export function PositionsPage() {
  const { isConnected, address } = useAccount()
  const { data: poolStates } = useAllPoolStates()
  const { data: lpPositions } = useAllLPPositions()
  const { data: sharePrices } = useAllSharePrices()
  const { data: aTokenBalances } = useAllATokenBalances()
  const { data: slot0s } = useAllSlot0()
  const ethPrice = useEthUsdPrice()
  const [depositPool, setDepositPool] = useState<PoolConfig | null>(null)
  const [withdrawPool, setWithdrawPool] = useState<PoolConfig | null>(null)

  // Build position rows from live data
  const positions = POOLS.map((pool, i) => {
    const posResult = lpPositions?.[i]
    const pos = posResult?.status === "success" ? (posResult.result as [bigint, bigint]) : undefined
    const shares = pos ? pos[0] : 0n
    const value = pos ? pos[1] : 0n

    const stateResult = poolStates?.[i]
    const state = stateResult?.status === "success" ? (stateResult.result as {
      activeLiquidity: bigint
      totalShares: bigint
      isInitialized: boolean
      decimals0: number
      decimals1: number
      idle0: bigint
      idle1: bigint
    }) : undefined

    const priceResult = sharePrices?.[i]
    const sharePrice = priceResult?.status === "success" ? priceResult.result as bigint : 0n

    const hasActive = state ? state.activeLiquidity > 0n : false
    const isInit = state?.isInitialized ?? false
    // compute idle liquidity units using shared helper
    const { idleLiquidityUnits, activePercent } = computeActiveIdle(state, sharePrice)

    // compute Aave yield similar to PoolsPage
    let yield0 = 0n
    let yield1 = 0n
    try {
      const totals = new Map<string, bigint>()
      poolStates?.forEach((r: any) => {
        if (r?.status === "success") {
          const s = r.result as any
          if (s.aToken0 && s.aToken0 !== "0x0000000000000000000000000000000000000000") totals.set(s.aToken0, (totals.get(s.aToken0) || 0n) + BigInt(s.aave0))
          if (s.aToken1 && s.aToken1 !== "0x0000000000000000000000000000000000000000") totals.set(s.aToken1, (totals.get(s.aToken1) || 0n) + BigInt(s.aave1))
        }
      })

      const tokenAddrsSet = new Set<string>()
      poolStates?.forEach((r: any) => {
        if (r?.status === "success") {
          const s = r.result as any
          if (s.aToken0) tokenAddrsSet.add(s.aToken0)
          if (s.aToken1) tokenAddrsSet.add(s.aToken1)
        }
      })

      const tokenAddrs = Array.from(tokenAddrsSet)
      const balMap = new Map<string, bigint>()
      if (aTokenBalances) {
        aTokenBalances.forEach((r: any, idx: number) => {
          if (r?.status === "success") balMap.set(tokenAddrs[idx], BigInt(r.result))
        })
      }

      const s = state as any
      if (s && s.aToken0 && totals.get(s.aToken0) && balMap.has(s.aToken0)) {
        const totalSharesFor = totals.get(s.aToken0) || 0n
        const currentBalance = balMap.get(s.aToken0) || 0n
        const poolShares = BigInt(s.aave0)
        const claim = totalSharesFor > 0n ? (currentBalance * poolShares) / totalSharesFor : 0n
        if (claim > poolShares) yield0 = claim - poolShares
      }
      if (s && s.aToken1 && totals.get(s.aToken1) && balMap.has(s.aToken1)) {
        const totalSharesFor = totals.get(s.aToken1) || 0n
        const currentBalance = balMap.get(s.aToken1) || 0n
        const poolShares = BigInt(s.aave1)
        const claim = totalSharesFor > 0n ? (currentBalance * poolShares) / totalSharesFor : 0n
        if (claim > poolShares) yield1 = claim - poolShares
      }
    } catch (e) {
      // ignore
    }

    // compute USD yield like PoolsPage
    let yieldUsd = 0n
    try {
      const slot = slot0s?.[i]
      let poolPriceX18 = 0n
      if (slot?.status === "success") {
        const sqrt = BigInt(slot.result[0] as unknown as string)
        poolPriceX18 = (sqrt * sqrt * 1000000000000000000n) / (1n << 192n)
      }

      const yield0Amount18 = yield0 > 0n ? yield0 * (10n ** (18n - BigInt(state?.decimals0 ?? 18))) : 0n
      const yield1Amount18 = yield1 > 0n ? yield1 * (10n ** (18n - BigInt(state?.decimals1 ?? 18))) : 0n
      const yieldToken1_18 = yield1Amount18 + (poolPriceX18 > 0n ? (yield0Amount18 * poolPriceX18) / 1000000000000000000n : 0n)
      if (ethPrice?.status === "success") {
        const answer = BigInt(ethPrice.data[1] as unknown as string)
        const feedDecimals = 8n
        yieldUsd = (yieldToken1_18 * answer) / (10n ** feedDecimals)
      }
    } catch (e) {
      yieldUsd = 0n
    }

    return {
      pool: pool.name,
      config: pool,
      shares: shares > 0n ? shares.toLocaleString() : "0",
      sharesRaw: shares,
      value: value > 0n ? value.toLocaleString() : "0",
      sharePrice: sharePrice > 0n ? Number(formatUnits(sharePrice, 18)).toFixed(4) : "1.0",
      status: !isInit ? "Not Deployed" : hasActive ? "In Range" : state!.totalShares > 0n ? "Idle" : "Empty",
      statusColor: !isInit ? "oklch(0.6 0.05 250)" : hasActive ? "oklch(0.72 0.19 155)" : "oklch(0.8 0.16 85)",
      active: activePercent,
      idleLQ: idleLiquidityUnits > 0n ? idleLiquidityUnits.toLocaleString() : "0",
      yield0: yield0 > 0n ? yield0.toLocaleString() : "0",
      yield1: yield1 > 0n ? yield1.toLocaleString() : "0",
      yieldUsd: yieldUsd > 0n ? (Number(yieldUsd / 100000000n)).toLocaleString() : "0",
      hasPosition: shares > 0n,
    }
  })

  const positionsWithShares = positions.filter((p) => p.hasPosition)
  const totalValue = positionsWithShares.reduce((sum, p) => {
    const val = Number(p.value.replace(/[,]/g, ""))
    return sum + (isNaN(val) ? 0 : val)
  }, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Positions</h1>
        <p className="text-sm text-muted-foreground">
          Track your liquidity across all Sentinel-managed pools.
        </p>
      </div>

      {!isConnected ? (
        <Card className="border-border/30 bg-card/80">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connect your wallet to view positions</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border/30 bg-card/80">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Portfolio Liquidity Units
                </CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Liquidity units across {positionsWithShares.length} position{positionsWithShares.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/30 bg-card/80">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pools Invested
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{positionsWithShares.length}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  of {POOLS.length} available pools
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/30 bg-card/80">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Average APR
                </CardTitle>
                <PiggyBank className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">—</div>
                <p className="mt-1 text-xs text-muted-foreground">Post-rebalance</p>
              </CardContent>
            </Card>
            <Card className="border-border/30 bg-card/80">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Wallet
                </CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold font-mono">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Sepolia testnet</p>
              </CardContent>
            </Card>
          </div>

          {/* Positions Table */}
          <Card className="border-border/30 bg-card/80">
            <CardHeader>
              <CardTitle>All Positions</CardTitle>
              <CardDescription>
                Per-pool breakdown of your share ownership
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead>Pool</TableHead>
                    <TableHead>Shares</TableHead>
                    <TableHead>Liquidity Units</TableHead>
                    <TableHead>Share Price</TableHead>
                    <TableHead>Active / Idle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((pos) => (
                    <TableRow
                      key={pos.pool}
                      className="border-border/20 hover:bg-muted/10"
                    >
                      <TableCell className="font-semibold">{pos.pool}</TableCell>
                      <TableCell className="font-mono text-muted-foreground text-sm">
                        {pos.shares}
                      </TableCell>
                      <TableCell>{pos.value}</TableCell>
                      <TableCell className="font-mono text-sm">{pos.sharePrice}</TableCell>
                      <TableCell>
                        <div className="w-24">
                          <Progress value={pos.active} className="h-1.5" />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {pos.active}% / {100 - pos.active}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="text-xs"
                          style={{
                            backgroundColor: `color-mix(in oklch, ${pos.statusColor} 15%, transparent)`,
                            color: pos.statusColor,
                          }}
                        >
                          {pos.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setDepositPool(pos.config)}
                          >
                            <ArrowUpRight className="mr-1 h-3 w-3" />
                            Deposit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setWithdrawPool(pos.config)}
                            disabled={!pos.hasPosition}
                          >
                            Withdraw
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Per-Pool Yield Cards */}
          {positionsWithShares.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-3">
              {positionsWithShares.map((pos) => (
                <Card key={pos.pool} className="border-border/30 bg-card/80">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{pos.pool}</CardTitle>
                      <Badge
                        variant="secondary"
                        className="text-xs"
                        style={{
                          backgroundColor: `color-mix(in oklch, ${pos.statusColor} 15%, transparent)`,
                          color: pos.statusColor,
                        }}
                      >
                        {pos.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Your Shares</p>
                        <p className="mt-1 text-lg font-bold text-[oklch(0.65_0.25_290)]">
                          {pos.shares}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Share Units</p>
                        <p className="mt-1 text-lg font-bold text-[oklch(0.75_0.15_195)]">
                          {pos.value}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Idle Liquidity Units</p>
                        <p className="mt-1 text-lg font-bold">{pos.idleLQ}</p>
                      </div>
                      <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Active %</p>
                        <p className="mt-1 text-lg font-bold">{pos.active}%</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Aave Yield (token0)</p>
                        <p className="mt-1 text-lg font-bold">{pos.yield0}</p>
                      </div>
                      <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Aave Yield (token1)</p>
                        <p className="mt-1 text-lg font-bold">{pos.yield1}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Aave Yield (USD)</p>
                        <p className="mt-1 text-lg font-bold">{pos.yieldUsd}</p>
                      </div>
                    </div>
                    {/* Event history + realized yield */}
                    <PoolEventsSummary
                      poolConfig={pos.config}
                      slot0s={slot0s}
                      ethPrice={ethPrice}
                      userAddress={address}
                    />
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>Active: {pos.active}%</span>
                        <span>Idle: {100 - pos.active}%</span>
                      </div>
                      <Progress value={pos.active} className="h-1.5" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {depositPool && (
        <DepositDialog
          pool={depositPool}
          open={!!depositPool}
          onOpenChange={(open) => { if (!open) setDepositPool(null) }}
        />
      )}
      {withdrawPool && (
        <WithdrawDialog
          pool={withdrawPool}
          open={!!withdrawPool}
          onOpenChange={(open) => { if (!open) setWithdrawPool(null) }}
        />
      )}
    </div>
  )
}

function PoolEventsSummary({
  poolConfig,
  slot0s,
  ethPrice,
  userAddress,
}: {
  poolConfig: PoolConfig
  slot0s: any
  ethPrice: any
  userAddress?: `0x${string}` | undefined
}) {
  // show recent deposits/withdraws made by connected user in this pool
  const { deposits, withdraws } = usePoolEvents(poolConfig.id, userAddress)
  const idx = POOLS.findIndex((p) => p.id === poolConfig.id)
  const slot = slot0s?.[idx]

  // totals
  const totalDeposited0 = deposits.reduce((s, d) => s + BigInt(d.amount0), 0n)
  const totalDeposited1 = deposits.reduce((s, d) => s + BigInt(d.amount1), 0n)
  const totalWithdrawn0 = withdraws.reduce((s, w) => s + BigInt(w.amount0), 0n)
  const totalWithdrawn1 = withdraws.reduce((s, w) => s + BigInt(w.amount1), 0n)

  // convert to token1-equivalent (18) using poolPrice from slot0
  let poolPriceX18 = 0n
  try {
    if (slot?.status === "success") {
      const sqrt = BigInt(slot.result[0] as unknown as string)
      poolPriceX18 = (sqrt * sqrt * 1000000000000000000n) / (1n << 192n)
    }
  } catch (e) {
    poolPriceX18 = 0n
  }

  // normalize decimals: fetch decimals from TOKENS mapping by symbol
  const token0meta = (poolConfig.token0Symbol && (TOKENS as any)[poolConfig.token0Symbol]) || { decimals: 18 }
  const token1meta = (poolConfig.token1Symbol && (TOKENS as any)[poolConfig.token1Symbol]) || { decimals: 18 }
  const dep0_18 = totalDeposited0 * (10n ** (18n - BigInt(token0meta.decimals)))
  const dep1_18 = totalDeposited1 * (10n ** (18n - BigInt(token1meta.decimals)))
  const wit0_18 = totalWithdrawn0 * (10n ** (18n - BigInt(token0meta.decimals)))
  const wit1_18 = totalWithdrawn1 * (10n ** (18n - BigInt(token1meta.decimals)))

  const depositedToken1_18 = dep1_18 + (poolPriceX18 > 0n ? (dep0_18 * poolPriceX18) / 1000000000000000000n : 0n)
  const withdrawnToken1_18 = wit1_18 + (poolPriceX18 > 0n ? (wit0_18 * poolPriceX18) / 1000000000000000000n : 0n)

  const realizedToken1_18 = withdrawnToken1_18 > depositedToken1_18 ? withdrawnToken1_18 - depositedToken1_18 : 0n
  let realizedUsd = 0n
  if (ethPrice?.status === "success") {
    const answer = BigInt(ethPrice.data[1] as unknown as string)
    const feedDecimals = 8n
    realizedUsd = (realizedToken1_18 * answer) / (10n ** feedDecimals)
  }

  const recent = [...deposits.map((d) => ({ kind: "deposit", ev: d })), ...withdraws.map((w) => ({ kind: "withdraw", ev: w }))]
    .sort((a, b) => b.ev.blockNumber - a.ev.blockNumber)
    .slice(0, 6)

  return (
    <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Realized Yield (USD)</p>
          <p className="mt-1 text-lg font-bold">{realizedUsd > 0n ? (Number(realizedUsd / 100000000n)).toLocaleString() : "0"}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Deposited: {formatBig(dep1_18, token1meta.decimals)} {poolConfig.token1Symbol}</div>
          <div>Withdrawn: {formatBig(wit1_18, token1meta.decimals)} {poolConfig.token1Symbol}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        <p className="mb-1">Recent activity</p>
        <ul className="space-y-1">
          {recent.map((r, i) => (
            <li key={i} className="flex items-center justify-between text-[0.85rem]">
              <span>{r.kind === "deposit" ? "Deposit" : "Withdraw"} — {r.ev.txHash.slice(0, 10)}…</span>
              <span className="text-muted-foreground">blk {r.ev.blockNumber}</span>
            </li>
          ))}
          {recent.length === 0 && <li className="text-xs text-muted-foreground">No events</li>}
        </ul>
      </div>
    </div>
  )
}

function formatBig(v: bigint, decimals: number) {
  if (!v) return "0"
  // v expected in 18-decimals for this helper, convert back to token decimals for display
  const factor = 10n ** (18n - BigInt(decimals))
  const raw = factor > 0n ? v / factor : v
  return Number(raw).toLocaleString()
}
