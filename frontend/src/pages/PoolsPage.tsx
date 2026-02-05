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
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowUpRight, ExternalLink, TrendingUp, Shield, Activity } from "lucide-react"

const pools = [
  {
    id: "eth-usdc",
    name: "ETH / USDC",
    tvl: "$84,210",
    tvlNum: 84210,
    active: 68,
    idle: 32,
    apr: "14.2%",
    volume24h: "$2.4M",
    fees24h: "$7,200",
    status: "In Range",
    statusColor: "oklch(0.72 0.19 155)",
    yieldCurrency: "USDC",
    oracle: "ETH/USD",
    tickRange: "±4.2%",
    volatility: "2.1%",
    deviationBps: 500,
    rebalances7d: 12,
    history: [
      { date: "Mon", tvl: 78000, apr: 13.1 },
      { date: "Tue", tvl: 80200, apr: 13.8 },
      { date: "Wed", tvl: 79100, apr: 12.9 },
      { date: "Thu", tvl: 82500, apr: 14.5 },
      { date: "Fri", tvl: 83800, apr: 14.1 },
      { date: "Sat", tvl: 85100, apr: 14.8 },
      { date: "Sun", tvl: 84210, apr: 14.2 },
    ],
  },
  {
    id: "wbtc-eth",
    name: "WBTC / ETH",
    tvl: "$41,890",
    tvlNum: 41890,
    active: 54,
    idle: 46,
    apr: "11.7%",
    volume24h: "$1.1M",
    fees24h: "$3,300",
    status: "Rebalancing",
    statusColor: "oklch(0.8 0.16 85)",
    yieldCurrency: "ETH",
    oracle: "BTC/ETH",
    tickRange: "±7.5%",
    volatility: "4.8%",
    deviationBps: 800,
    rebalances7d: 18,
    history: [
      { date: "Mon", tvl: 39000, apr: 10.2 },
      { date: "Tue", tvl: 40100, apr: 10.9 },
      { date: "Wed", tvl: 38500, apr: 9.8 },
      { date: "Thu", tvl: 41000, apr: 11.2 },
      { date: "Fri", tvl: 42200, apr: 12.1 },
      { date: "Sat", tvl: 41500, apr: 11.5 },
      { date: "Sun", tvl: 41890, apr: 11.7 },
    ],
  },
  {
    id: "arb-usdc",
    name: "ARB / USDC",
    tvl: "$29,540",
    tvlNum: 29540,
    active: 72,
    idle: 28,
    apr: "18.6%",
    volume24h: "$890K",
    fees24h: "$2,670",
    status: "In Range",
    statusColor: "oklch(0.72 0.19 155)",
    yieldCurrency: "USDC",
    oracle: "ARB/USD",
    tickRange: "±5.1%",
    volatility: "3.4%",
    deviationBps: 600,
    rebalances7d: 15,
    history: [
      { date: "Mon", tvl: 25000, apr: 16.1 },
      { date: "Tue", tvl: 26200, apr: 17.2 },
      { date: "Wed", tvl: 27800, apr: 18.1 },
      { date: "Thu", tvl: 28100, apr: 17.8 },
      { date: "Fri", tvl: 29000, apr: 18.5 },
      { date: "Sat", tvl: 29200, apr: 18.2 },
      { date: "Sun", tvl: 29540, apr: 18.6 },
    ],
  },
  {
    id: "steth-eth",
    name: "stETH / ETH",
    tvl: "$157,000",
    tvlNum: 157000,
    active: 85,
    idle: 15,
    apr: "8.4%",
    volume24h: "$5.2M",
    fees24h: "$15,600",
    status: "In Range",
    statusColor: "oklch(0.72 0.19 155)",
    yieldCurrency: "ETH",
    oracle: "stETH/ETH",
    tickRange: "±0.8%",
    volatility: "0.3%",
    deviationBps: 200,
    rebalances7d: 4,
    history: [
      { date: "Mon", tvl: 148000, apr: 7.8 },
      { date: "Tue", tvl: 150000, apr: 8.0 },
      { date: "Wed", tvl: 152000, apr: 8.1 },
      { date: "Thu", tvl: 154000, apr: 8.2 },
      { date: "Fri", tvl: 155500, apr: 8.3 },
      { date: "Sat", tvl: 156200, apr: 8.3 },
      { date: "Sun", tvl: 157000, apr: 8.4 },
    ],
  },
]

export function PoolsPage() {
  const [selectedPool, setSelectedPool] = useState(pools[0])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Managed Pools</h1>
        <p className="text-sm text-muted-foreground">
          Browse and inspect all Uniswap v4 pools with the Sentinel hook
          attached.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pool List */}
        <div className="space-y-3 lg:col-span-1">
          {pools.map((pool) => (
            <Card
              key={pool.id}
              className={`cursor-pointer border-border/30 bg-card/80 transition-all hover:border-border/60 ${
                selectedPool.id === pool.id
                  ? "border-[oklch(0.65_0.25_290_/_0.5)] glow-violet"
                  : ""
              }`}
              onClick={() => setSelectedPool(pool)}
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
                    <p className="text-muted-foreground">APR</p>
                    <p className="font-medium text-[oklch(0.72_0.19_155)]">
                      {pool.apr}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Vol</p>
                    <p className="font-medium">{pool.volatility}</p>
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
                <CardTitle className="text-xl">
                  {selectedPool.name}
                </CardTitle>
                <CardDescription>
                  Yield: {selectedPool.yieldCurrency} · Oracle:{" "}
                  {selectedPool.oracle}
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                View on Explorer
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">24h Volume</p>
                <p className="mt-1 text-lg font-bold">{selectedPool.volume24h}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">24h Fees</p>
                <p className="mt-1 text-lg font-bold">{selectedPool.fees24h}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Tick Range</p>
                <p className="mt-1 text-lg font-bold">{selectedPool.tickRange}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Rebalances (7d)</p>
                <p className="mt-1 text-lg font-bold">
                  {selectedPool.rebalances7d}
                </p>
              </div>
            </div>

            <Tabs defaultValue="tvl">
              <TabsList className="bg-muted/30">
                <TabsTrigger value="tvl">TVL History</TabsTrigger>
                <TabsTrigger value="apr">APR History</TabsTrigger>
              </TabsList>
              <TabsContent value="tvl">
                <ChartContainer
                  config={{
                    tvl: {
                      label: "TVL",
                      color: "var(--color-chart-1)",
                    },
                  }}
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
                  config={{
                    apr: {
                      label: "APR",
                      color: "var(--color-chart-2)",
                    },
                  }}
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
                  <p className="text-xs text-muted-foreground">Volatility</p>
                  <p className="text-sm font-medium">{selectedPool.volatility}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/20 p-3">
                <Shield className="h-4 w-4 text-[oklch(0.8_0.16_85)]" />
                <div>
                  <p className="text-xs text-muted-foreground">Max Deviation</p>
                  <p className="text-sm font-medium">
                    {selectedPool.deviationBps} bps
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/20 p-3">
                <Activity className="h-4 w-4 text-[oklch(0.65_0.25_290)]" />
                <div>
                  <p className="text-xs text-muted-foreground">Active Split</p>
                  <p className="text-sm font-medium">
                    {selectedPool.active}% / {selectedPool.idle}%
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button className="flex-1 bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-white hover:opacity-90">
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Deposit Liquidity
              </Button>
              <Button variant="outline" className="flex-1">
                Withdraw
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
