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
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Bot,
  Play,
  Settings,
  Clock,
  CheckCircle,
  AlertTriangle,
  Zap,
  RotateCcw,
} from "lucide-react"

const automationHistory = [
  {
    id: 1,
    pool: "ETH/USDC",
    action: "maintain()",
    newRange: "[-204720, -194280]",
    volatility: "2.1%",
    gasUsed: "342,100",
    time: "12 min ago",
    status: "success",
    txHash: "0xab12...ef34",
  },
  {
    id: 2,
    pool: "ARB/USDC",
    action: "maintain()",
    newRange: "[-18600, -12400]",
    volatility: "3.4%",
    gasUsed: "298,400",
    time: "45 min ago",
    status: "success",
    txHash: "0xcd56...gh78",
  },
  {
    id: 3,
    pool: "WBTC/ETH",
    action: "maintain()",
    newRange: "[-72800, -65200]",
    volatility: "4.8%",
    gasUsed: "—",
    time: "1h ago",
    status: "pending",
    txHash: "—",
  },
  {
    id: 4,
    pool: "stETH/ETH",
    action: "maintain()",
    newRange: "[-120, 120]",
    volatility: "0.3%",
    gasUsed: "285,200",
    time: "6h ago",
    status: "success",
    txHash: "0xij90...kl12",
  },
  {
    id: 5,
    pool: "ETH/USDC",
    action: "maintain()",
    newRange: "[-205200, -193800]",
    volatility: "2.8%",
    gasUsed: "—",
    time: "8h ago",
    status: "reverted",
    txHash: "0xmn34...op56",
  },
]

const gelato = {
  taskId: "0x7a3b...9f12",
  status: "Active",
  executor: "Gelato Network",
  trigger: "TickCrossed Event",
  cooldown: "5 min",
  totalExecutions: 142,
  successRate: "97.2%",
  avgGas: "310,400",
}

export function AutomationPage() {
  const [poolId, setPoolId] = useState("")
  const [tickLower, setTickLower] = useState("")
  const [tickUpper, setTickUpper] = useState("")
  const [volatility, setVolatility] = useState("")
  const [targetActive, setTargetActive] = useState("")
  const [maxDeviation, setMaxDeviation] = useState("")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Automation Controls
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure and monitor Gelato-powered automation for pool maintenance.
        </p>
      </div>

      {/* Gelato Status */}
      <Card className="border-border/30 bg-card/80">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.65_0.25_290_/_0.15)] to-[oklch(0.75_0.15_195_/_0.15)]">
                <Bot className="h-5 w-5 text-[oklch(0.75_0.15_195)]" />
              </div>
              <div>
                <CardTitle>Gelato Automate</CardTitle>
                <CardDescription>
                  Task ID: {gelato.taskId}
                </CardDescription>
              </div>
            </div>
            <Badge className="bg-[oklch(0.72_0.19_155_/_0.15)] text-[oklch(0.72_0.19_155)]">
              {gelato.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            <div>
              <p className="text-xs text-muted-foreground">Executor</p>
              <p className="mt-1 text-sm font-medium">{gelato.executor}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Trigger</p>
              <p className="mt-1 text-sm font-medium">{gelato.trigger}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cooldown</p>
              <p className="mt-1 text-sm font-medium">{gelato.cooldown}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Executions</p>
              <p className="mt-1 text-sm font-medium">
                {gelato.totalExecutions}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Success Rate</p>
              <p className="mt-1 text-sm font-medium text-[oklch(0.72_0.19_155)]">
                {gelato.successRate}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Gas</p>
              <p className="mt-1 text-sm font-medium">{gelato.avgGas}</p>
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Settings className="h-3 w-3" />
                Configure
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Control Panels */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Maintain Cycle */}
        <Card className="border-border/30 bg-card/80 lg:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[oklch(0.65_0.25_290)]" />
              <div>
                <CardTitle>Maintain Cycle</CardTitle>
                <CardDescription>
                  Trigger a pool-specific maintain call with new range inputs
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Pool ID
                </label>
                <Input
                  placeholder="0x..."
                  value={poolId}
                  onChange={(e) => setPoolId(e.target.value)}
                  className="bg-muted/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Volatility (%)
                </label>
                <Input
                  placeholder="2.5"
                  value={volatility}
                  onChange={(e) => setVolatility(e.target.value)}
                  className="bg-muted/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  New Tick Lower
                </label>
                <Input
                  placeholder="-204720"
                  value={tickLower}
                  onChange={(e) => setTickLower(e.target.value)}
                  className="bg-muted/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  New Tick Upper
                </label>
                <Input
                  placeholder="-194280"
                  value={tickUpper}
                  onChange={(e) => setTickUpper(e.target.value)}
                  className="bg-muted/30"
                />
              </div>
            </div>
            <Separator className="opacity-50" />
            <div className="flex gap-3">
              <Button className="flex-1 bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-white hover:opacity-90">
                <Play className="mr-2 h-4 w-4" />
                Simulate Maintain
              </Button>
              <Button variant="outline">
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Yield Policy */}
        <Card className="border-border/30 bg-card/80 lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-[oklch(0.75_0.15_195)]" />
              <div>
                <CardTitle>Yield Routing Policy</CardTitle>
                <CardDescription>
                  Adjust active vs idle split based on risk profile
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Target Active (%)
              </label>
              <Input
                placeholder="70"
                value={targetActive}
                onChange={(e) => setTargetActive(e.target.value)}
                className="bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Max Deviation (bps)
              </label>
              <Input
                placeholder="500"
                value={maxDeviation}
                onChange={(e) => setMaxDeviation(e.target.value)}
                className="bg-muted/30"
              />
            </div>
            <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                The YieldRouter will calculate the ideal active/idle split based
                on volatility. These values set the upper bounds for policy
                enforcement.
              </p>
            </div>
            <Button variant="outline" className="w-full">
              Update Policy
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Execution History */}
      <Card className="border-border/30 bg-card/80">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Execution History</CardTitle>
              <CardDescription>
                Recent Gelato maintain() executions across all pools
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Clock className="h-3 w-3" />
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead>Pool</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>New Range</TableHead>
                <TableHead>Volatility</TableHead>
                <TableHead>Gas Used</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automationHistory.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="border-border/20 hover:bg-muted/10"
                >
                  <TableCell className="font-medium">{entry.pool}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {entry.action}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {entry.newRange}
                  </TableCell>
                  <TableCell>{entry.volatility}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.gasUsed}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.time}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {entry.status === "success" ? (
                        <CheckCircle className="h-3.5 w-3.5 text-[oklch(0.72_0.19_155)]" />
                      ) : entry.status === "pending" ? (
                        <Clock className="h-3.5 w-3.5 text-[oklch(0.8_0.16_85)]" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      )}
                      <span
                        className={`text-xs capitalize ${
                          entry.status === "success"
                            ? "text-[oklch(0.72_0.19_155)]"
                            : entry.status === "pending"
                              ? "text-[oklch(0.8_0.16_85)]"
                              : "text-destructive"
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
