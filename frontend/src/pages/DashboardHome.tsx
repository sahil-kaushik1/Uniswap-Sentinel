import {
  TrendingUp,
  Layers,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
  { pool: "WBTC/ETH", active: 11.7, idle: 3.2 },
  { pool: "ARB/USDC", active: 18.6, idle: 5.1 },
  { pool: "stETH/ETH", active: 8.4, idle: 3.8 },
]

const kpis = [
  {
    title: "Total Value Locked",
    value: "$312,640",
    change: "+12.4%",
    trend: "up" as const,
    icon: DollarSign,
    description: "Across all managed pools",
  },
  {
    title: "Active Pools",
    value: "4",
    change: "+1",
    trend: "up" as const,
    icon: Layers,
    description: "Sentinel hook attached",
  },
  {
    title: "Average APR",
    value: "14.7%",
    change: "+2.1%",
    trend: "up" as const,
    icon: TrendingUp,
    description: "Combined active + idle yield",
  },
  {
    title: "Rebalances (24h)",
    value: "7",
    change: "-2",
    trend: "down" as const,
    icon: Activity,
    description: "Gelato maintain cycles",
  },
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
    pool: "ARB/USDC",
    action: "Idle Deposited",
    time: "45 min ago",
    detail: "$4,200 → Aave v3",
    status: "success",
  },
  {
    pool: "WBTC/ETH",
    action: "Tick Crossed",
    time: "1h ago",
    detail: "Maintain pending",
    status: "warning",
  },
  {
    pool: "stETH/ETH",
    action: "LP Deposit",
    time: "3h ago",
    detail: "+$15,000 liquidity",
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

const poolSummary = [
  {
    name: "ETH / USDC",
    tvl: "$84,210",
    active: 68,
    apr: "14.2%",
    status: "In Range",
    statusColor: "oklch(0.72 0.19 155)",
  },
  {
    name: "WBTC / ETH",
    tvl: "$41,890",
    active: 54,
    apr: "11.7%",
    status: "Rebalancing",
    statusColor: "oklch(0.8 0.16 85)",
  },
  {
    name: "ARB / USDC",
    tvl: "$29,540",
    active: 72,
    apr: "18.6%",
    status: "In Range",
    statusColor: "oklch(0.72 0.19 155)",
  },
  {
    name: "stETH / ETH",
    tvl: "$157,000",
    active: 85,
    apr: "8.4%",
    status: "In Range",
    statusColor: "oklch(0.72 0.19 155)",
  },
]

export function DashboardHome() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Sentinel Control Center
        </h1>
        <p className="text-sm text-muted-foreground">
          Monitor pool health, balances, and automation status across all
          managed pools.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.title}
            className="border-border/30 bg-card/80"
          >
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
                <span className="text-muted-foreground">
                  {kpi.description}
                </span>
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
              config={{
                tvl: {
                  label: "TVL",
                  color: "var(--color-chart-1)",
                },
              }}
              className="h-[280px] w-full"
            >
              <AreaChart data={tvlData}>
                <defs>
                  <linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-chart-1)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-chart-1)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value / 1000}k`}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        `$${Number(value).toLocaleString()}`
                      }
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="tvl"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  fill="url(#tvlGradient)"
                />
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
                active: {
                  label: "Active Yield",
                  color: "var(--color-chart-1)",
                },
                idle: {
                  label: "Idle Yield",
                  color: "var(--color-chart-2)",
                },
              }}
              className="h-[280px] w-full"
            >
              <BarChart data={yieldData}>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="pool"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${value}%`}
                    />
                  }
                />
                <Bar
                  dataKey="active"
                  fill="var(--color-chart-1)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="idle"
                  fill="var(--color-chart-2)"
                  radius={[4, 4, 0, 0]}
                />
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
            <CardDescription>Status of all managed pools</CardDescription>
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
                    <span>APR: {pool.apr}</span>
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
              <div
                key={i}
                className="flex gap-3 rounded-lg border border-border/20 p-3"
              >
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
                    <span className="text-xs text-muted-foreground">
                      {event.time}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {event.action}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {event.detail}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
