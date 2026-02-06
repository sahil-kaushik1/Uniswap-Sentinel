import { useState, useEffect } from "react"
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { parseUnits } from "viem"
import { sentinelHookAbi, erc20Abi } from "@/lib/abi"
import { SENTINEL_HOOK_ADDRESS, TOKENS, type PoolConfig } from "@/lib/addresses"
import { useTokenBalance, useTokenAllowance } from "@/hooks/use-tokens"
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
import { Badge } from "@/components/ui/badge"
import { Loader2, Check, ArrowRight } from "lucide-react"

const hookAddress = SENTINEL_HOOK_ADDRESS as `0x${string}`

interface DepositDialogProps {
  pool: PoolConfig
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DepositDialog({ pool, open, onOpenChange }: DepositDialogProps) {
  const { address } = useAccount()
  const [amount0, setAmount0] = useState("")
  const [amount1, setAmount1] = useState("")
  const [step, setStep] = useState<"input" | "approve0" | "approve1" | "deposit" | "done">("input")

  const token0 = TOKENS[pool.token0Symbol]
  const token1 = TOKENS[pool.token1Symbol]
  const token0Addr = token0.address as `0x${string}`
  const token1Addr = token1.address as `0x${string}`

  const { data: balance0 } = useTokenBalance(token0Addr)
  const { data: balance1 } = useTokenBalance(token1Addr)
  const { data: allowance0, refetch: refetchAllowance0 } = useTokenAllowance(token0Addr, hookAddress)
  const { data: allowance1, refetch: refetchAllowance1 } = useTokenAllowance(token1Addr, hookAddress)

  const parsedAmount0 = amount0 ? parseUnits(amount0, token0.decimals) : 0n
  const parsedAmount1 = amount1 ? parseUnits(amount1, token1.decimals) : 0n

  const needsApproval0 = parsedAmount0 > 0n && (allowance0 ?? 0n) < parsedAmount0
  const needsApproval1 = parsedAmount1 > 0n && (allowance1 ?? 0n) < parsedAmount1

  // Approve token0
  const { writeContract: approve0, data: approve0Hash, isPending: isApproving0 } = useWriteContract()
  const { isSuccess: approve0Confirmed } = useWaitForTransactionReceipt({ hash: approve0Hash })

  // Approve token1
  const { writeContract: approve1, data: approve1Hash, isPending: isApproving1 } = useWriteContract()
  const { isSuccess: approve1Confirmed } = useWaitForTransactionReceipt({ hash: approve1Hash })

  // Deposit
  const { writeContract: deposit, data: depositHash, isPending: isDepositing } = useWriteContract()
  const { isSuccess: depositConfirmed } = useWaitForTransactionReceipt({ hash: depositHash })

  // Step progression
  useEffect(() => {
    if (approve0Confirmed && step === "approve0") {
      refetchAllowance0()
      setStep(needsApproval1 ? "approve1" : "deposit")
    }
  }, [approve0Confirmed, step, needsApproval1, refetchAllowance0])

  useEffect(() => {
    if (approve1Confirmed && step === "approve1") {
      refetchAllowance1()
      setStep("deposit")
    }
  }, [approve1Confirmed, step, refetchAllowance1])

  useEffect(() => {
    if (depositConfirmed && step === "deposit") {
      setStep("done")
    }
  }, [depositConfirmed, step])

  const handleStart = () => {
    if (needsApproval0) {
      setStep("approve0")
      approve0({
        address: token0Addr,
        abi: erc20Abi,
        functionName: "approve",
        args: [hookAddress, parsedAmount0],
      })
    } else if (needsApproval1) {
      setStep("approve1")
      approve1({
        address: token1Addr,
        abi: erc20Abi,
        functionName: "approve",
        args: [hookAddress, parsedAmount1],
      })
    } else {
      doDeposit()
    }
  }

  const handleApprove1 = () => {
    setStep("approve1")
    approve1({
      address: token1Addr,
      abi: erc20Abi,
      functionName: "approve",
      args: [hookAddress, parsedAmount1],
    })
  }

  const doDeposit = () => {
    setStep("deposit")
    // Sort token addresses to match Uniswap v4 PoolKey ordering
    const [currency0, currency1] =
      token0Addr.toLowerCase() < token1Addr.toLowerCase()
        ? [token0Addr, token1Addr]
        : [token1Addr, token0Addr]
    const [dep0, dep1] =
      token0Addr.toLowerCase() < token1Addr.toLowerCase()
        ? [parsedAmount0, parsedAmount1]
        : [parsedAmount1, parsedAmount0]

    deposit({
      address: hookAddress,
      abi: sentinelHookAbi,
      functionName: "depositLiquidity",
      args: [
        {
          currency0,
          currency1,
          fee: pool.fee,
          tickSpacing: pool.tickSpacing,
          hooks: hookAddress,
        },
        dep0,
        dep1,
      ],
    })
  }

  // Auto-trigger next step
  useEffect(() => {
    if (step === "approve0" && approve0Confirmed && needsApproval1) {
      handleApprove1()
    } else if (step === "approve0" && approve0Confirmed && !needsApproval1) {
      doDeposit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approve0Confirmed])

  useEffect(() => {
    if (step === "approve1" && approve1Confirmed) {
      doDeposit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approve1Confirmed])

  const formatBalance = (bal: bigint | undefined, decimals: number) => {
    if (!bal) return "0"
    const num = Number(bal) / 10 ** decimals
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 })
  }

  const resetAndClose = () => {
    setStep("input")
    setAmount0("")
    setAmount1("")
    onOpenChange(false)
  }

  const isValid = parsedAmount0 > 0n || parsedAmount1 > 0n
  const isLoading = isApproving0 || isApproving1 || isDepositing

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deposit to {pool.name}</DialogTitle>
          <DialogDescription>
            Provide liquidity to earn automated yield. You'll receive LP shares proportional to your deposit.
          </DialogDescription>
        </DialogHeader>

        {step === "done" ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[oklch(0.72_0.19_155_/_0.15)]">
              <Check className="h-6 w-6 text-[oklch(0.72_0.19_155)]" />
            </div>
            <p className="text-sm font-medium">Deposit Successful!</p>
            <p className="text-xs text-muted-foreground">Your shares have been minted.</p>
            <Button onClick={resetAndClose} className="w-full">Close</Button>
          </div>
        ) : (
          <>
            {/* Token 0 Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">{token0.symbol}</label>
                <span className="text-xs text-muted-foreground">
                  Balance: {formatBalance(balance0, token0.decimals)}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="0.0"
                  value={amount0}
                  onChange={(e) => setAmount0(e.target.value)}
                  className="bg-muted/30"
                  disabled={step !== "input"}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    if (balance0) setAmount0(formatBalance(balance0, token0.decimals).replace(/,/g, ""))
                  }}
                  disabled={step !== "input"}
                >
                  Max
                </Button>
              </div>
            </div>

            {/* Token 1 Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">{token1.symbol}</label>
                <span className="text-xs text-muted-foreground">
                  Balance: {formatBalance(balance1, token1.decimals)}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="0.0"
                  value={amount1}
                  onChange={(e) => setAmount1(e.target.value)}
                  className="bg-muted/30"
                  disabled={step !== "input"}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    if (balance1) setAmount1(formatBalance(balance1, token1.decimals).replace(/,/g, ""))
                  }}
                  disabled={step !== "input"}
                >
                  Max
                </Button>
              </div>
            </div>

            {/* Step indicator */}
            {step !== "input" && (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={step === "approve0" ? "default" : "secondary"} className="gap-1">
                  {approve0Confirmed ? <Check className="h-3 w-3" /> : step === "approve0" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Approve {token0.symbol}
                </Badge>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Badge variant={step === "approve1" ? "default" : "secondary"} className="gap-1">
                  {approve1Confirmed ? <Check className="h-3 w-3" /> : step === "approve1" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Approve {token1.symbol}
                </Badge>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Badge variant={step === "deposit" ? "default" : "secondary"} className="gap-1">
                  {depositConfirmed ? <Check className="h-3 w-3" /> : step === "deposit" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Deposit
                </Badge>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                onClick={handleStart}
                disabled={!isValid || !address || isLoading}
                className="bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-white hover:opacity-90"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Deposit"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
