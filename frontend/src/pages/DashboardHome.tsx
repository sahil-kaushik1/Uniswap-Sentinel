import { useState } from "react"
import {
  TrendingUp,
  Layers,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
} from "lucide-react"
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import { useAccount } from "wagmi"
import { formatUnits } from "viem"
import { useAllPoolStates, useTotalPools } from "@/hooks/use-sentinel"
import { POOLS } from "@/lib/addresses"
import { MintDialog } from "@/components/mint-dialog"

// Static chart data (historical data not available on-chain)
const tvlData = [
  { date: "Jan", tvl: 120000 },
  { date: "Feb", tvl: 145000 },
  { date: "Mar", tvl: 138000 },
  { date: "Apr", tvl: 175000 },
  { date: "May", tvl: 210000 },
  { date: "Jun", tvl: 258000 },
  { date: "Jul", tvl: 312000 },
]

const yieldData = [
  { pool: "ETH/USDC", active: 14.2, idle: 4.8 },
  { pool: "ETH/WBTC", active: 11.7, idle: 3.2 },
  { pool: "ETH/USDT", active: 12.4, idle: 4.1 },
]

const recentActivity = [
  {
    pool: "ETH/USDC",
    action: "Rebalanced",
    time: "12 min ago",
    detail: "Range adjusted to ±3.8%",
    status: "success",
  },
  {
    pool: "ETH/USDT",
    action: "Idle Deposited",
    time: "45 min ago",
    detail: "mUSDT → Aave v3",
    status: "success",
  },
  {
    pool: "ETH/WBTC",
    action: "Tick Crossed",
    time: "1h ago",
    detail: "Maintain pending",
    status: "warning",
  },
  {
    pool: "ETH/USDC",
    action: "LP Deposit",
    time: "3h ago",
    detail: "New liquidity added",
    status: "info",
  },
  {
    pool: "ETH/USDC",
    action: "Deviation Check",
    time: "3h ago",
    detail: "Oracle safe (0.12%)",
    status: "success",
  },
]

export function DashboardHome() {
  const { isConnected } = useAccount()
  const { data: totalPools } = useTotalPools()
  const { data: poolStates } = useAllPoolStates()
  const [mintOpen, setMintOpen] = useState(false)

  // Derive pool summaries from live data
  const poolSummary = POOLS.map((pool, i) => {
    const result = poolStates?.[i]
    const state = result?.status === "success" ? (result.result as {
      activeTickLower: number
      activeTickUpper: number
      activeLiquidity: bigint
      idle0: bigint
      idle1: bigint
      aave0: bigint
      aave1: bigint
      totalShares: bigint
      isInitialized: boolean
      decimals0: number
      decimals1: number
    }) : undefined

    if (!state || !state.isInitialized) {
      return {
        name: pool.name,
        tvl: "—",
        active: 50,
        status: "Not Deployed",
        statusColor: "oklch(0.6 0.05 250)",
        isLive: false,
      }
    }

    const idle0 = Number(formatUnits(state.idle0, state.decimals0))
    const idle1 = Number(formatUnits(state.idle1, state.decimals1))
    const aave0 = Number(formatUnits(state.aave0, state.decimals0))
    const aave1 = Number(formatUnits(state.aave1, state.decimals1))
    const totalIdle = idle0 + idle1 + aave0 + aave1

    const hasActive = state.activeLiquidity > 0n
    const activePercent = hasActive ? 60 : 0

    return {
      name: pool.name,
      tvl: totalIdle > 0 ? `$${totalIdle.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "$0",
      active: activePercent,
      status: hasActive ? "In Range" : state.totalShares > 0n ? "Idle" : "Empty",
      statusColor: hasActive ? "oklch(0.72 0.19 155)" : state.totalShares > 0n ? "oklch(0.8 0.16 85)" : "oklch(0.6 0.05 250)",
      isLive: true,
    }
  })

  const activePools = totalPools ? Number(totalPools) : 0

  const kpis = [
    {
      title: "Total Value Locked",
      value: isConnected && poolSummary.some((p) => p.isLive)
        ? poolSummary.filter((p) => p.isLive).map((p) => p.tvl).join(" | ")
        : isConnected ? "$0" : "$—",
      change: isConnected ? "Live" : "Connect wallet",
      trend: "up" as const,
      icon: DollarSign,
      description: "Across all managed pools",
    },
    {
      title: "Active Pools",
      value: isConnected ? String(activePools) : "—",
      change: isConnected ? `${POOLS.length} configured` : "",
      trend: "up" as const,
      icon: Layers,
      description: "Sentinel hook attached",
    },
    {
      title: "Average APR",
      value: "~14.7%",
      change: "Estimated",
      trend: "up" as const,
      icon: TrendingUp,
      description: "Combined active + idle yield",
    },
    {
      title: "Rebalances (24h)",
      value: "—",
      change: "Automation",
      trend: "down" as const,
      icon: Activity,
      description: "Chainlink maintain cycles",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Sentinel Control Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor pool health, balances, and automation status across all
            managed pools.
          </p>
        </div>
        {isConnected && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setMintOpen(true)}
          >
            <Coins className="h-4 w-4" />
            Mint Test Tokens
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="border-border/30 bg-card/80">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="mt-1 flex items-center gap-1 text-xs">
                {kpi.trend === "up" ? (
                  <ArrowUpRight className="h-3 w-3 text-[oklch(0.72_0.19_155)]" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-muted-foreground" />
                )}
                <span
                  className={
                    kpi.trend === "up"
                      ? "text-[oklch(0.72_0.19_155)]"
                      : "text-muted-foreground"
                  }
                >
                  {kpi.change}
                </span>
                <span className="text-muted-foreground">{kpi.description}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* TVL Chart */}
        <Card className="border-border/30 bg-card/80 lg:col-span-4">
          <CardHeader>
            <CardTitle>Total Value Locked</CardTitle>
            <CardDescription>TVL growth across all managed pools</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{ tvl: { label: "TVL", color: "var(--color-chart-1)" } }}
              className="h-[280px] w-full"
            >
              <AreaChart data={tvlData}>
                <defs>
                  <linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `$${Number(value).toLocaleString()}`} />} />
                <Area type="monotone" dataKey="tvl" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#tvlGradient)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Yield Breakdown */}
        <Card className="border-border/30 bg-card/80 lg:col-span-3">
          <CardHeader>
            <CardTitle>Yield Breakdown</CardTitle>
            <CardDescription>Active vs Idle APR per pool</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                active: { label: "Active Yield", color: "var(--color-chart-1)" },
                idle: { label: "Idle Yield", color: "var(--color-chart-2)" },
              }}
              className="h-[280px] w-full"
            >
              <BarChart data={yieldData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="pool" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${value}%`} />} />
                <Bar dataKey="active" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="idle" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pool Summary + Activity */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Pool Summary */}
        <Card className="border-border/30 bg-card/80 lg:col-span-3">
          <CardHeader>
            <CardTitle>Pool Summary</CardTitle>
            <CardDescription>
              Status of all managed pools{isConnected ? " (live)" : " (connect wallet for live data)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {poolSummary.map((pool) => (
              <div
                key={pool.name}
                className="flex items-center gap-4 rounded-lg border border-border/30 bg-muted/20 p-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
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
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>TVL: {pool.tvl}</span>
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Active: {pool.active}%</span>
                      <span>Idle: {100 - pool.active}%</span>
                    </div>
                    <Progress value={pool.active} className="h-1.5" />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-border/30 bg-card/80 lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest automation events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.map((event, i) => (
              <div key={i} className="flex gap-3 rounded-lg border border-border/20 p-3">
                <div
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      event.status === "success"
                        ? "oklch(0.72 0.19 155)"
                        : event.status === "warning"
                          ? "oklch(0.8 0.16 85)"
                          : "oklch(0.65 0.25 290)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{event.pool}</span>
                    <span className="text-xs text-muted-foreground">{event.time}</span>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">{event.action}</p>
                  <p className="text-xs text-muted-foreground/70">{event.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <MintDialog open={mintOpen} onOpenChange={setMintOpen} />
    </div>
  )
}
