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
import { useAccount } from "wagmi"
import { formatUnits } from "viem"
import { useAllPoolStates, useTotalPools } from "@/hooks/use-sentinel"
import { POOLS } from "@/lib/addresses"
import { MintDialog } from "@/components/mint-dialog"

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
    // Estimate active % from whether liquidity is deployed
    const activePercent = hasActive && totalIdle > 0 ? 60 : hasActive ? 100 : 0

    return {
      name: pool.name,
      tvl: totalIdle > 0 ? `$${totalIdle.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : state.totalShares > 0n ? "Pending Deploy" : "$0",
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
      value: "—",
      change: "Post-rebalance",
      trend: "up" as const,
      icon: TrendingUp,
      description: "Requires active trading + Aave yield",
    },
    {
      title: "Rebalances (24h)",
      value: "—",
      change: "Monitoring",
      trend: "up" as const,
      icon: Activity,
      description: "Chainlink Automation active on Sepolia",
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

      {/* Pool Summary */}
      <Card className="border-border/30 bg-card/80">
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

      <MintDialog open={mintOpen} onOpenChange={setMintOpen} />
    </div>
  )
}
