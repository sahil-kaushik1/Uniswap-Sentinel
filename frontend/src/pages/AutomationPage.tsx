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
  Loader2,
} from "lucide-react"
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { parseUnits } from "viem"
import { sentinelHookAbi } from "@/lib/abi"
import { SENTINEL_HOOK_ADDRESS, POOLS, etherscanTx } from "@/lib/addresses"
import { useMaintainer, useOwner } from "@/hooks/use-sentinel"

const hookAddress = SENTINEL_HOOK_ADDRESS as `0x${string}`

// Static automation history (would come from event indexing in production)
const automationHistory = [
  {
    id: 1,
    pool: "ETH/USDC",
    action: "maintain()",
    newRange: "[-887220, 887220]",
    volatility: "2.1%",
    gasUsed: "342,100",
    time: "12 min ago",
    status: "success",
    txHash: "0xab12...ef34",
  },
  {
    id: 2,
    pool: "ETH/USDT",
    action: "maintain()",
    newRange: "[-887220, 887220]",
    volatility: "3.4%",
    gasUsed: "298,400",
    time: "45 min ago",
    status: "success",
    txHash: "0xcd56...gh78",
  },
  {
    id: 3,
    pool: "ETH/WBTC",
    action: "maintain()",
    newRange: "[-887220, 887220]",
    volatility: "4.8%",
    gasUsed: "—",
    time: "1h ago",
    status: "pending",
    txHash: "—",
  },
]

export function AutomationPage() {
  const { address, isConnected } = useAccount()
  const { data: maintainer } = useMaintainer()
  const { data: owner } = useOwner()

  const [poolIdx, setPoolIdx] = useState(0)
  const [tickLower, setTickLower] = useState("-887220")
  const [tickUpper, setTickUpper] = useState("887220")
  const [volatility, setVolatility] = useState("200")

  const { writeContract: maintain, data: maintainHash, isPending: isMaintaining, error: maintainError } = useWriteContract()
  const { isSuccess: maintainConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash: maintainHash })

  const isMaintainerOrOwner = address && (
    address.toLowerCase() === maintainer?.toString().toLowerCase() ||
    address.toLowerCase() === owner?.toString().toLowerCase()
  )

  const handleMaintain = () => {
    const pool = POOLS[poolIdx]
    maintain({
      address: hookAddress,
      abi: sentinelHookAbi,
      functionName: "maintain",
      args: [
        pool.id,
        Number(tickLower),
        Number(tickUpper),
        parseUnits(volatility, 0),
      ],
    })
  }

  const handleReset = () => {
    setPoolIdx(0)
    setTickLower("-887220")
    setTickUpper("887220")
    setVolatility("200")
  }

  const chainlinkAutomation = {
    status: isConnected ? "Active" : "Unknown",
    executor: "Chainlink Automation",
    trigger: "TickCrossed Event",
    cooldown: "5 min",
    maintainerAddr: maintainer ? `${String(maintainer).slice(0, 6)}…${String(maintainer).slice(-4)}` : "—",
    ownerAddr: owner ? `${String(owner).slice(0, 6)}…${String(owner).slice(-4)}` : "—",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Automation Controls
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure and monitor Chainlink-powered automation for pool maintenance.
        </p>
      </div>

      {/* Chainlink Status */}
      <Card className="border-border/30 bg-card/80">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.65_0.25_290_/_0.15)] to-[oklch(0.75_0.15_195_/_0.15)]">
                <Bot className="h-5 w-5 text-[oklch(0.75_0.15_195)]" />
              </div>
              <div>
                <CardTitle>Chainlink Automation</CardTitle>
                <CardDescription>
                  Hook: {SENTINEL_HOOK_ADDRESS.slice(0, 10)}…
                </CardDescription>
              </div>
            </div>
            <Badge className="bg-[oklch(0.72_0.19_155_/_0.15)] text-[oklch(0.72_0.19_155)]">
              {chainlinkAutomation.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-xs text-muted-foreground">Executor</p>
              <p className="mt-1 text-sm font-medium">{chainlinkAutomation.executor}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Trigger</p>
              <p className="mt-1 text-sm font-medium">{chainlinkAutomation.trigger}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cooldown</p>
              <p className="mt-1 text-sm font-medium">{chainlinkAutomation.cooldown}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Maintainer</p>
              <p className="mt-1 text-sm font-medium font-mono">{chainlinkAutomation.maintainerAddr}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="mt-1 text-sm font-medium font-mono">{chainlinkAutomation.ownerAddr}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Your Role</p>
              <p className="mt-1 text-sm font-medium">
                {isMaintainerOrOwner ? (
                  <Badge className="bg-[oklch(0.72_0.19_155_/_0.15)] text-[oklch(0.72_0.19_155)]">
                    {address?.toLowerCase() === owner?.toString().toLowerCase() ? "Owner" : "Maintainer"}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Viewer</span>
                )}
              </p>
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
                  Trigger a pool-specific maintain call with new range inputs.
                  {!isMaintainerOrOwner && isConnected && " (Only owner/maintainer can execute)"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Pool</label>
                <select
                  value={poolIdx}
                  onChange={(e) => setPoolIdx(Number(e.target.value))}
                  className="flex h-9 w-full rounded-md border border-input bg-muted/30 px-3 py-1 text-sm shadow-xs transition-colors"
                >
                  {POOLS.map((pool, i) => (
                    <option key={pool.name} value={i}>{pool.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Volatility (bps)
                </label>
                <Input
                  placeholder="200"
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
                  placeholder="-887220"
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
                  placeholder="887220"
                  value={tickUpper}
                  onChange={(e) => setTickUpper(e.target.value)}
                  className="bg-muted/30"
                />
              </div>
            </div>

            {/* Pool ID display */}
            <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground mb-1">Pool ID:</p>
              <p className="text-xs font-mono break-all">{POOLS[poolIdx]?.id}</p>
            </div>

            {maintainError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-xs text-destructive">{maintainError.message.slice(0, 200)}</p>
              </div>
            )}

            {maintainConfirmed && receipt && (
              <div className="rounded-lg border border-[oklch(0.72_0.19_155_/_0.3)] bg-[oklch(0.72_0.19_155_/_0.1)] p-3">
                <p className="text-xs text-[oklch(0.72_0.19_155)]">
                  ✓ Maintain executed!{" "}
                  <a
                    href={etherscanTx(receipt.transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    View tx
                  </a>
                </p>
              </div>
            )}

            <Separator className="opacity-50" />
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-white hover:opacity-90"
                onClick={handleMaintain}
                disabled={!isConnected || isMaintaining}
              >
                {isMaintaining ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Execute Maintain
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleReset}>
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
                  View the active/idle split strategy managed by YieldRouter
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/30 bg-muted/20 p-3 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Default Active Target</p>
                <p className="text-sm font-medium">60% (volatility-adjusted)</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Min Idle Reserve</p>
                <p className="text-sm font-medium">10% of total capital</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Yield Protocol</p>
                <p className="text-sm font-medium">Aave v3 (Mock)</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Strategy</p>
                <p className="text-sm font-medium">Dual-token yield on both pool assets</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                The YieldRouter calculates the ideal active/idle split based
                on volatility. Maintain calls automatically route idle capital
                to Aave v3 for yield generation.
              </p>
            </div>
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
                Recent maintain() executions across all pools
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
                  <TableCell className="font-mono text-xs">{entry.newRange}</TableCell>
                  <TableCell>{entry.volatility}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.gasUsed}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.time}</TableCell>
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
