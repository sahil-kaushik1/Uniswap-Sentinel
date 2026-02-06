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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ArrowUpRight, ExternalLink, TrendingUp, Shield, Activity } from "lucide-react"
import { useAccount } from "wagmi"
import { formatUnits } from "viem"
import { useAllPoolStates, useAllSharePrices } from "@/hooks/use-sentinel"
import { POOLS, SENTINEL_HOOK_ADDRESS, etherscanAddress, type PoolConfig } from "@/lib/addresses"
import { DepositDialog } from "@/components/deposit-dialog"
import { WithdrawDialog } from "@/components/withdraw-dialog"

// Static history data per pool (no on-chain historical data)
const histories: Record<string, { date: string; tvl: number; apr: number }[]> = {
  "mETH / mUSDC": [
    { date: "Mon", tvl: 78000, apr: 13.1 },
    { date: "Tue", tvl: 80200, apr: 13.8 },
    { date: "Wed", tvl: 79100, apr: 12.9 },
    { date: "Thu", tvl: 82500, apr: 14.5 },
    { date: "Fri", tvl: 83800, apr: 14.1 },
    { date: "Sat", tvl: 85100, apr: 14.8 },
    { date: "Sun", tvl: 84210, apr: 14.2 },
  ],
  "mETH / mWBTC": [
    { date: "Mon", tvl: 39000, apr: 10.2 },
    { date: "Tue", tvl: 40100, apr: 10.9 },
    { date: "Wed", tvl: 38500, apr: 9.8 },
    { date: "Thu", tvl: 41000, apr: 11.2 },
    { date: "Fri", tvl: 42200, apr: 12.1 },
    { date: "Sat", tvl: 41500, apr: 11.5 },
    { date: "Sun", tvl: 41890, apr: 11.7 },
  ],
  "mETH / mUSDT": [
    { date: "Mon", tvl: 25000, apr: 11.1 },
    { date: "Tue", tvl: 26200, apr: 11.8 },
    { date: "Wed", tvl: 27800, apr: 12.1 },
    { date: "Thu", tvl: 28100, apr: 12.4 },
    { date: "Fri", tvl: 29000, apr: 12.5 },
    { date: "Sat", tvl: 29200, apr: 12.2 },
    { date: "Sun", tvl: 29540, apr: 12.4 },
  ],
}

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
  history: { date: string; tvl: number; apr: number }[]
}

export function PoolsPage() {
  const { isConnected } = useAccount()
  const { data: poolStates } = useAllPoolStates()
  const { data: sharePrices } = useAllSharePrices()

  const [selectedIdx, setSelectedIdx] = useState(0)
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
        tvl: "$0",
        active: 50,
        idle: 50,
        status: "Not Deployed",
        statusColor: "oklch(0.6 0.05 250)",
        oracle: pool.oracle,
        tickRange: "—",
        deviationBps: 0,
        sharePrice: "—",
        lpCount: "0",
        history: histories[pool.name] ?? [],
      }
    }

    const idle0 = Number(formatUnits(state.idle0, state.decimals0))
    const idle1 = Number(formatUnits(state.idle1, state.decimals1))
    const aave0 = Number(formatUnits(state.aave0, state.decimals0))
    const aave1 = Number(formatUnits(state.aave1, state.decimals1))
    const totalValue = idle0 + idle1 + aave0 + aave1

    const hasActive = state.activeLiquidity > 0n
    const activePercent = hasActive ? 60 : state.totalShares > 0n ? 0 : 50
    const tickLower = state.activeTickLower
    const tickUpper = state.activeTickUpper

    return {
      config: pool,
      name: pool.name,
      tvl: totalValue > 0 ? `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "$0",
      active: activePercent,
      idle: 100 - activePercent,
      status: hasActive ? "In Range" : state.totalShares > 0n ? "Idle" : "Empty",
      statusColor: hasActive ? "oklch(0.72 0.19 155)" : state.totalShares > 0n ? "oklch(0.8 0.16 85)" : "oklch(0.6 0.05 250)",
      oracle: pool.oracle,
      tickRange: `[${tickLower}, ${tickUpper}]`,
      deviationBps: Number(state.maxDeviationBps),
      sharePrice: sharePrice > 0n ? formatUnits(sharePrice, 18) : "1.0",
      lpCount: "—",
      history: histories[pool.name] ?? [],
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
                    <p className="text-muted-foreground">TVL</p>
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
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">TVL</p>
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

            <Tabs defaultValue="tvl">
              <TabsList className="bg-muted/30">
                <TabsTrigger value="tvl">TVL History</TabsTrigger>
                <TabsTrigger value="apr">APR History</TabsTrigger>
              </TabsList>
              <TabsContent value="tvl">
                <ChartContainer
                  config={{ tvl: { label: "TVL", color: "var(--color-chart-1)" } }}
                  className="h-[240px] w-full"
                >
                  <AreaChart data={selectedPool.history}>
                    <defs>
                      <linearGradient id="poolTvlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `$${v / 1000}k`} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(v) => `$${Number(v).toLocaleString()}`} />} />
                    <Area type="monotone" dataKey="tvl" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#poolTvlGrad)" />
                  </AreaChart>
                </ChartContainer>
              </TabsContent>
              <TabsContent value="apr">
                <ChartContainer
                  config={{ apr: { label: "APR", color: "var(--color-chart-2)" } }}
                  className="h-[240px] w-full"
                >
                  <AreaChart data={selectedPool.history}>
                    <defs>
                      <linearGradient id="poolAprGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
                    <Area type="monotone" dataKey="apr" stroke="var(--color-chart-2)" strokeWidth={2} fill="url(#poolAprGrad)" />
                  </AreaChart>
                </ChartContainer>
              </TabsContent>
            </Tabs>

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
