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
import { Progress } from "@/components/ui/progress"
import { ArrowUpRight, ExternalLink, TrendingUp, Shield, Activity } from "lucide-react"
import { useAccount } from "wagmi"
import { formatUnits } from "viem"
import { useAllPoolStates, useAllSharePrices } from "@/hooks/use-sentinel"
import { computeActiveIdle } from "@/lib/pool-utils"
import { useAllATokenBalances } from "@/hooks/use-aTokens"
import { useAllSlot0 } from "@/hooks/use-slot0"
import { useEthUsdPrice } from "@/hooks/use-oracles"
import { POOLS, SENTINEL_HOOK_ADDRESS, etherscanAddress, type PoolConfig } from "@/lib/addresses"
import { DepositDialog } from "@/components/deposit-dialog"
import { WithdrawDialog } from "@/components/withdraw-dialog"

interface PoolDisplayData {
  config: PoolConfig
  name: string
  tvl: string
  active: number
  idle: number
  status: string
  statusColor: string
  oracle: string
  tickRange: string
  deviationBps: number
  sharePrice: string
  lpCount: string
  idleLQ?: string
  yield0?: string | number
  yield1?: string | number
  tvlUsd?: string
  yieldUsd?: string
}

export function PoolsPage() {
  const { isConnected } = useAccount()
  const { data: poolStates } = useAllPoolStates()
  const { data: sharePrices } = useAllSharePrices()
  const { data: aTokenBalances } = useAllATokenBalances()

  const [selectedIdx, setSelectedIdx] = useState(0)
  const { data: slot0s } = useAllSlot0()
  const ethPrice = useEthUsdPrice()
  const [depositPool, setDepositPool] = useState<PoolConfig | null>(null)
  const [withdrawPool, setWithdrawPool] = useState<PoolConfig | null>(null)

  // Build pool display data from live reads
  const pools: PoolDisplayData[] = POOLS.map((pool, i) => {
    const result = poolStates?.[i]
    const state = result?.status === "success" ? (result.result as {
      activeTickLower: number
      activeTickUpper: number
      activeLiquidity: bigint
      maxDeviationBps: bigint
      idle0: bigint
      idle1: bigint
      aave0: bigint
      aave1: bigint
      totalShares: bigint
      isInitialized: boolean
      decimals0: number
      decimals1: number
    }) : undefined

    const priceResult = sharePrices?.[i]
    const sharePrice = priceResult?.status === "success" ? priceResult.result as bigint : 0n

    if (!state || !state.isInitialized) {
      return {
        config: pool,
        name: pool.name,
        tvl: "0",
        active: 50,
        idle: 50,
        status: "Not Deployed",
        statusColor: "oklch(0.6 0.05 250)",
        oracle: pool.oracle,
        tickRange: "—",
        deviationBps: 0,
        sharePrice: "—",
        lpCount: "0",
      }
    }

    const { totalLiquidityUnits, idleLiquidityUnits, activePercent } = computeActiveIdle(state, sharePrice)
    const tickLower = state.activeTickLower
    const tickUpper = state.activeTickUpper
    const hasActive = state.activeLiquidity > 0n

    // compute Aave-derived yield (token0 + token1) using batch aToken balances
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

      const sState = state as any
      if (sState.aToken0 && totals.get(sState.aToken0) && balMap.has(sState.aToken0)) {
        const totalSharesFor = totals.get(sState.aToken0) || 0n
        const currentBalance = balMap.get(sState.aToken0) || 0n
        const poolShares = BigInt(sState.aave0)
        const claim = totalSharesFor > 0n ? (currentBalance * poolShares) / totalSharesFor : 0n
        if (claim > poolShares) yield0 = claim - poolShares
      }

      if (sState.aToken1 && totals.get(sState.aToken1) && balMap.has(sState.aToken1)) {
        const totalSharesFor = totals.get(sState.aToken1) || 0n
        const currentBalance = balMap.get(sState.aToken1) || 0n
        const poolShares = BigInt(sState.aave1)
        const claim = totalSharesFor > 0n ? (currentBalance * poolShares) / totalSharesFor : 0n
        if (claim > poolShares) yield1 = claim - poolShares
      }
    } catch (e) {
      // ignore
    }

    // compute poolPrice from slot0 (if available)
    let poolPriceX18 = 0n
    try {
      const slot = slot0s?.[i]
      if (slot?.status === "success") {
        const sqrt = BigInt(slot.result[0] as unknown as string)
        const numerator = sqrt * sqrt * 1000000000000000000n
        const denom = 1n << 192n
        poolPriceX18 = numerator / denom
      }
    } catch (e) {
      poolPriceX18 = 0n
    }

    // compute total value in token1-equivalent (18-decimals)
    const idle0Amount18 = state.idle0 > 0n ? (state.idle0 * (10n ** (18n - BigInt(state.decimals0)))) : 0n
    const idle1Amount18 = state.idle1 > 0n ? (state.idle1 * (10n ** (18n - BigInt(state.decimals1)))) : 0n
    const idle0Value18 = poolPriceX18 > 0n ? (idle0Amount18 * poolPriceX18) / 1000000000000000000n : 0n
    const totalValueToken1_18 = idle0Value18 + idle1Amount18

    // convert to USD using ETH/USD feed (token1 is mETH)
    let totalValueUsd = 0n
    try {
      if (ethPrice?.status === "success") {
        const answer = BigInt(ethPrice.data[1] as unknown as string)
        const feedDecimals = 8n
        totalValueUsd = (totalValueToken1_18 * answer) / (10n ** feedDecimals)
      }
    } catch (e) {
      totalValueUsd = 0n
    }

    // USD yield: convert yield0/yield1 to token1-equivalent then to USD
    const yield0Amount18 = yield0 > 0n ? yield0 * (10n ** (18n - BigInt(state.decimals0))) : 0n
    const yield1Amount18 = yield1 > 0n ? yield1 * (10n ** (18n - BigInt(state.decimals1))) : 0n
    const yieldToken1_18 = yield1Amount18 + (poolPriceX18 > 0n ? (yield0Amount18 * poolPriceX18) / 1000000000000000000n : 0n)
    let yieldUsd = 0n
    try {
      if (ethPrice?.status === "success") {
        const answer = BigInt(ethPrice.data[1] as unknown as string)
        const feedDecimals = 8n
        yieldUsd = (yieldToken1_18 * answer) / (10n ** feedDecimals)
      }
    } catch (e) {
      yieldUsd = 0n
    }

    return {
      config: pool,
      name: pool.name,
      tvl:
        totalLiquidityUnits > 0n
          ? totalLiquidityUnits.toLocaleString()
          : state.totalShares > 0n
            ? "Pending Deploy"
            : "0",
      idleLQ: idleLiquidityUnits > 0n ? idleLiquidityUnits.toLocaleString() : "0",
      active: activePercent,
      idle: 100 - activePercent,
      status: hasActive ? "In Range" : state.totalShares > 0n ? "Idle" : "Empty",
      statusColor: hasActive ? "oklch(0.72 0.19 155)" : state.totalShares > 0n ? "oklch(0.8 0.16 85)" : "oklch(0.6 0.05 250)",
      oracle: pool.oracle,
      tickRange: `[${tickLower}, ${tickUpper}]`,
      deviationBps: Number(state.maxDeviationBps),
      sharePrice: sharePrice > 0n ? formatUnits(sharePrice, 18) : "1.0",
      lpCount: "—",
      yield0: yield0 > 0n ? yield0.toLocaleString() : "0",
      yield1: yield1 > 0n ? yield1.toLocaleString() : "0",
      tvlUsd: totalValueUsd > 0n ? (Number(totalValueUsd / 100000000n)).toLocaleString() : undefined,
      yieldUsd: yieldUsd > 0n ? (Number(yieldUsd / 100000000n)).toLocaleString() : undefined,
    }
  })

  const selectedPool = pools[selectedIdx]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Managed Pools</h1>
        <p className="text-sm text-muted-foreground">
          Browse and inspect all Uniswap v4 pools with the Sentinel hook attached.
          {!isConnected && " Connect wallet for live data."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pool List */}
        <div className="space-y-3 lg:col-span-1">
          {pools.map((pool, i) => (
            <Card
              key={pool.name}
              className={`cursor-pointer border-border/30 bg-card/80 transition-all hover:border-border/60 ${
                selectedIdx === i
                  ? "border-[oklch(0.65_0.25_290_/_0.5)] glow-violet"
                  : ""
              }`}
              onClick={() => setSelectedIdx(i)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{pool.name}</span>
                  <Badge
                    variant="secondary"
                    className="text-xs"
                    style={{
                      backgroundColor: `color-mix(in oklch, ${pool.statusColor} 15%, transparent)`,
                      color: pool.statusColor,
                    }}
                  >
                    {pool.status}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Liquidity Units</p>
                    <p className="font-medium">{pool.tvl}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Share Price</p>
                    <p className="font-medium text-[oklch(0.72_0.19_155)]">{pool.sharePrice}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Oracle</p>
                    <p className="font-medium truncate">{pool.oracle.split(" ")[0]}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Idle Liquidity Units</p>
                    <p className="font-medium">{pool.idleLQ}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Active</p>
                    <p className="font-medium">{pool.active}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Idle</p>
                    <p className="font-medium">{pool.idle}%</p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Active {pool.active}%</span>
                    <span>Idle {pool.idle}%</span>
                  </div>
                  <Progress value={pool.active} className="h-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pool Detail */}
        <Card className="border-border/30 bg-card/80 lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">{selectedPool.name}</CardTitle>
                <CardDescription>Oracle: {selectedPool.oracle}</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                asChild
              >
                <a
                  href={etherscanAddress(SENTINEL_HOOK_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Explorer
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>
            {/* Aave Yield */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Aave Yield (token0)</p>
                <p className="mt-1 text-lg font-bold">{selectedPool.yield0 ?? "0"}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Aave Yield (token1)</p>
                <p className="mt-1 text-lg font-bold">{selectedPool.yield1 ?? "0"}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Liquidity Units</p>
                <p className="mt-1 text-lg font-bold">{selectedPool.tvl}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Share Price</p>
                <p className="mt-1 text-lg font-bold">{selectedPool.sharePrice}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Tick Range</p>
                <p className="mt-1 text-sm font-bold font-mono">{selectedPool.tickRange}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Max Deviation</p>
                <p className="mt-1 text-lg font-bold">{selectedPool.deviationBps} bps</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">TVL (USD)</p>
                <p className="mt-1 text-lg font-bold">{selectedPool.tvlUsd ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Aave Yield (USD)</p>
                <p className="mt-1 text-lg font-bold">{selectedPool.yieldUsd ?? "0"}</p>
              </div>
            </div>

            {/* Historical charts will appear here once rebalancing data is available */}
            <div className="rounded-lg border border-dashed border-border/40 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
              <Activity className="mx-auto h-8 w-8 mb-2 opacity-40" />
              <p>Liquidity &amp; APR history will populate after Chainlink Automation begins rebalancing cycles.</p>
            </div>

            {/* Pool Config */}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/20 p-3">
                <TrendingUp className="h-4 w-4 text-[oklch(0.72_0.19_155)]" />
                <div>
                  <p className="text-xs text-muted-foreground">Fee</p>
                  <p className="text-sm font-medium">{selectedPool.config.fee / 10000}%</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/20 p-3">
                <Shield className="h-4 w-4 text-[oklch(0.8_0.16_85)]" />
                <div>
                  <p className="text-xs text-muted-foreground">Max Deviation</p>
                  <p className="text-sm font-medium">{selectedPool.deviationBps} bps</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/20 p-3">
                <Activity className="h-4 w-4 text-[oklch(0.65_0.25_290)]" />
                <div>
                  <p className="text-xs text-muted-foreground">Active Split</p>
                  <p className="text-sm font-medium">{selectedPool.active}% / {selectedPool.idle}%</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                className="flex-1 bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-white hover:opacity-90"
                onClick={() => setDepositPool(selectedPool.config)}
                disabled={!isConnected}
              >
                <ArrowUpRight className="mr-2 h-4 w-4" />
                {isConnected ? "Deposit Liquidity" : "Connect Wallet to Deposit"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setWithdrawPool(selectedPool.config)}
                disabled={!isConnected}
              >
                Withdraw
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

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
