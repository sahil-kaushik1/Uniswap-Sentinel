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
import { ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, PiggyBank } from "lucide-react"

const positions = [
  {
    pool: "ETH / USDC",
    shares: "12,400",
    value: "$84,210",
    costBasis: "$72,800",
    pnl: "+$11,410",
    pnlPercent: "+15.7%",
    pnlPositive: true,
    apr: "14.2%",
    activeYield: "$6,840",
    idleYield: "$2,120",
    status: "In Range",
    statusColor: "oklch(0.72 0.19 155)",
    active: 68,
  },
  {
    pool: "WBTC / ETH",
    shares: "4,320",
    value: "$41,890",
    costBasis: "$38,200",
    pnl: "+$3,690",
    pnlPercent: "+9.7%",
    pnlPositive: true,
    apr: "11.7%",
    activeYield: "$2,890",
    idleYield: "$1,340",
    status: "Rebalancing",
    statusColor: "oklch(0.8 0.16 85)",
    active: 54,
  },
  {
    pool: "ARB / USDC",
    shares: "25,610",
    value: "$29,540",
    costBasis: "$31,000",
    pnl: "-$1,460",
    pnlPercent: "-4.7%",
    pnlPositive: false,
    apr: "18.6%",
    activeYield: "$3,210",
    idleYield: "$890",
    status: "In Range",
    statusColor: "oklch(0.72 0.19 155)",
    active: 72,
  },
]

const summary = {
  totalValue: "$155,640",
  totalPnl: "+$13,640",
  totalPnlPercent: "+9.6%",
  totalYield: "$17,290",
  avgApr: "14.8%",
}

export function PositionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Positions</h1>
        <p className="text-sm text-muted-foreground">
          Track your liquidity across all Sentinel-managed pools.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/30 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Portfolio Value
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalValue}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-[oklch(0.72_0.19_155)]">
              <ArrowUpRight className="h-3 w-3" />
              {summary.totalPnlPercent} all time
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/30 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total P&L
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[oklch(0.72_0.19_155)]">
              {summary.totalPnl}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Unrealized gains/losses
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/30 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Yield Earned
            </CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalYield}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Active + Idle combined
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/30 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg APR
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.avgApr}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Weighted average across pools
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Positions Table */}
      <Card className="border-border/30 bg-card/80">
        <CardHeader>
          <CardTitle>Active Positions</CardTitle>
          <CardDescription>
            Per-pool breakdown of your share ownership and yield
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead>Pool</TableHead>
                <TableHead>Shares</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>P&L</TableHead>
                <TableHead>APR</TableHead>
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
                  <TableCell className="text-muted-foreground">
                    {pos.shares}
                  </TableCell>
                  <TableCell>{pos.value}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {pos.pnlPositive ? (
                        <ArrowUpRight className="h-3 w-3 text-[oklch(0.72_0.19_155)]" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 text-destructive" />
                      )}
                      <span
                        className={
                          pos.pnlPositive
                            ? "text-[oklch(0.72_0.19_155)]"
                            : "text-destructive"
                        }
                      >
                        {pos.pnl}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({pos.pnlPercent})
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-[oklch(0.72_0.19_155)]">
                    {pos.apr}
                  </TableCell>
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
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        Deposit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
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

      {/* Yield Breakdown */}
      <div className="grid gap-6 lg:grid-cols-3">
        {positions.map((pos) => (
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
                  <p className="text-xs text-muted-foreground">Active Yield</p>
                  <p className="mt-1 text-lg font-bold text-[oklch(0.65_0.25_290)]">
                    {pos.activeYield}
                  </p>
                </div>
                <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Idle Yield</p>
                  <p className="mt-1 text-lg font-bold text-[oklch(0.75_0.15_195)]">
                    {pos.idleYield}
                  </p>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Cost Basis: {pos.costBasis}</span>
                  <span>Current: {pos.value}</span>
                </div>
                <Progress
                  value={pos.pnlPositive ? 60 : 40}
                  className="h-1.5"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
