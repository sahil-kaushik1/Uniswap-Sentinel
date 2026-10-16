import { useState, useEffect } from "react"
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { parseUnits, formatUnits } from "viem"
import { useQueryClient } from "@tanstack/react-query"
import { sentinelHookAbi } from "@/lib/abi"
import { SENTINEL_HOOK_ADDRESS, TOKENS, type PoolConfig } from "@/lib/addresses"
import { useLPPosition } from "@/hooks/use-sentinel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Check, AlertCircle } from "lucide-react"

const hookAddress = SENTINEL_HOOK_ADDRESS as `0x${string}`

interface WithdrawDialogProps {
  pool: PoolConfig
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WithdrawDialog({ pool, open, onOpenChange }: WithdrawDialogProps) {
  const { address } = useAccount()
  const queryClient = useQueryClient()
  const [sharesInput, setSharesInput] = useState("")
  const [step, setStep] = useState<"input" | "withdrawing" | "done">("input")

  const { data: position } = useLPPosition(pool.id)
  const userShares = position ? (position as [bigint, bigint])[0] : 0n

  const token0 = TOKENS[pool.token0Symbol]
  const token1 = TOKENS[pool.token1Symbol]
  const token0Addr = token0.address as `0x${string}`
  const token1Addr = token1.address as `0x${string}`

  const parsedShares = sharesInput ? parseUnits(sharesInput, 18) : 0n

  const { writeContract: withdraw, data: withdrawHash, isPending: isWithdrawing, error: withdrawError } = useWriteContract()
  const { isSuccess: withdrawConfirmed } = useWaitForTransactionReceipt({ hash: withdrawHash })

  useEffect(() => {
    if (withdrawConfirmed && step === "withdrawing") {
      queryClient.invalidateQueries()
      setStep("done")
    }
  }, [withdrawConfirmed, step, queryClient])

  const handleWithdraw = () => {
    setStep("withdrawing")
    // Sort token addresses to match Uniswap v4 PoolKey ordering
    const [currency0, currency1] =
      token0Addr.toLowerCase() < token1Addr.toLowerCase()
        ? [token0Addr, token1Addr]
        : [token1Addr, token0Addr]

    withdraw({
      address: hookAddress,
      abi: sentinelHookAbi,
      functionName: "withdrawLiquidity",
      args: [
        {
          currency0,
          currency1,
          fee: pool.fee,
          tickSpacing: pool.tickSpacing,
          hooks: hookAddress,
        },
        parsedShares,
      ],
    })
  }

  const resetAndClose = () => {
    setStep("input")
    setSharesInput("")
    onOpenChange(false)
  }

  const isValid = parsedShares > 0n && parsedShares <= userShares

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw from {pool.name}</DialogTitle>
          <DialogDescription>
            Burn your LP shares to receive back proportional tokens from both active and idle capital.
          </DialogDescription>
        </DialogHeader>

        {step === "done" ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[oklch(0.72_0.19_155_/_0.15)]">
              <Check className="h-6 w-6 text-[oklch(0.72_0.19_155)]" />
            </div>
            <p className="text-sm font-medium">Withdrawal Successful!</p>
            <p className="text-xs text-muted-foreground">Tokens have been returned to your wallet.</p>
            <Button onClick={resetAndClose} className="w-full">Close</Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Shares to Withdraw</label>
                <span className="text-xs text-muted-foreground">
                  Your shares: {formatUnits(userShares, 18)}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="0.0"
                  value={sharesInput}
                  onChange={(e) => setSharesInput(e.target.value)}
                  className="bg-muted/30"
                  disabled={step !== "input"}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setSharesInput(formatUnits(userShares, 18))}
                  disabled={step !== "input"}
                >
                  Max
                </Button>
              </div>
            </div>

            {withdrawError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{(withdrawError as Error).message?.slice(0, 200) || "Transaction failed"}</p>
              </div>
            )}

            <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                You will receive proportional amounts of {token0.symbol} and {token1.symbol} based on your share of the pool.
                If capital is deployed in Aave, it will be automatically withdrawn.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose} disabled={isWithdrawing}>
                Cancel
              </Button>
              <Button
                onClick={handleWithdraw}
                disabled={!isValid || !address || isWithdrawing}
                variant="destructive"
              >
                {isWithdrawing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Withdrawing...
                  </>
                ) : (
                  "Withdraw"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
