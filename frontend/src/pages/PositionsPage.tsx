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
import { POOLS, type PoolConfig } from "@/lib/addresses"
import { DepositDialog } from "@/components/deposit-dialog"
import { WithdrawDialog } from "@/components/withdraw-dialog"

export function PositionsPage() {
  const { isConnected, address } = useAccount()
  const { data: poolStates } = useAllPoolStates()
  const { data: lpPositions } = useAllLPPositions()
  const { data: sharePrices } = useAllSharePrices()
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

    return {
      pool: pool.name,
      config: pool,
      shares: shares > 0n ? shares.toLocaleString() : "0",
      sharesRaw: shares,
      value: value > 0n ? value.toLocaleString() : "0",
      sharePrice: sharePrice > 0n ? Number(formatUnits(sharePrice, 18)).toFixed(4) : "1.0",
      status: !isInit ? "Not Deployed" : hasActive ? "In Range" : state!.totalShares > 0n ? "Idle" : "Empty",
      statusColor: !isInit ? "oklch(0.6 0.05 250)" : hasActive ? "oklch(0.72 0.19 155)" : "oklch(0.8 0.16 85)",
      active: hasActive && state!.totalShares > 0n ? 60 : hasActive ? 100 : 0,
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
