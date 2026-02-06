import { useState, useEffect } from "react"
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { parseUnits, formatUnits } from "viem"
import { erc20Abi } from "@/lib/abi"
import { TOKENS, FAUCET_AMOUNTS, etherscanTx } from "@/lib/addresses"
import { useTokenBalance } from "@/hooks/use-tokens"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Droplets,
  Loader2,
  Check,
  ExternalLink,
  Wallet,
  RefreshCw,
} from "lucide-react"

const tokenList = Object.values(TOKENS)

interface TokenRowProps {
  token: (typeof tokenList)[number]
  defaultAmount: string
}

function TokenRow({ token, defaultAmount }: TokenRowProps) {
  const { address } = useAccount()
  const { data: balance, refetch: refetchBalance } = useTokenBalance(token.address)
  const [status, setStatus] = useState<"idle" | "minting" | "done">("idle")

  const { writeContract: mint, data: mintHash, isPending } = useWriteContract()
  const { isSuccess: mintConfirmed, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: mintHash,
  })

  useEffect(() => {
    if (mintConfirmed && status === "minting") {
      setStatus("done")
      refetchBalance()
      // Reset after 4 seconds
      const timer = setTimeout(() => setStatus("idle"), 4000)
      return () => clearTimeout(timer)
    }
  }, [mintConfirmed, status, refetchBalance])

  const handleClaim = () => {
    if (!address) return
    setStatus("minting")
    mint({
      address: token.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "mint",
      args: [address, parseUnits(defaultAmount, token.decimals)],
    })
  }

  const formattedBalance =
    balance !== undefined
      ? Number(formatUnits(balance as bigint, token.decimals)).toLocaleString(undefined, {
          maximumFractionDigits: token.decimals === 18 ? 4 : 2,
        })
      : "—"

  const isBusy = isPending || isConfirming || status === "minting"

  return (
    <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-card/80">
      {/* Token info */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.65_0.25_290_/_0.15)] to-[oklch(0.75_0.15_195_/_0.15)] font-bold text-sm">
          {token.symbol.slice(1, 2)}
        </div>
        <div>
          <p className="font-semibold">{token.symbol}</p>
          <p className="text-xs text-muted-foreground">{token.name}</p>
        </div>
      </div>

      {/* Balance */}
      <div className="text-right mr-4 hidden sm:block">
        <p className="text-xs text-muted-foreground">Your Balance</p>
        <p className="font-mono text-sm">
          {formattedBalance} {token.symbol}
        </p>
      </div>

      {/* Claim amount */}
      <div className="text-right mr-4">
        <p className="text-xs text-muted-foreground">Claim Amount</p>
        <p className="font-mono text-sm font-semibold">
          {Number(defaultAmount).toLocaleString()} {token.symbol}
        </p>
      </div>

      {/* Claim button */}
      <div className="flex items-center gap-2">
        {status === "done" && mintHash ? (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-[oklch(0.72_0.19_155)] text-[oklch(0.72_0.19_155)]"
            >
              <Check className="mr-1 h-3 w-3" />
              Minted!
            </Badge>
            <a
              href={etherscanTx(mintHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <Button
            onClick={handleClaim}
            disabled={!address || isBusy}
            size="sm"
            className="min-w-[90px]"
          >
            {isBusy ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {isConfirming ? "Confirming" : "Minting"}
              </>
            ) : (
              <>
                <Droplets className="mr-1.5 h-3.5 w-3.5" />
                Claim
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

export function FaucetPage() {
  const { isConnected } = useAccount()

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Testnet Faucet</h1>
        <p className="text-muted-foreground">
          Claim mock tokens to test Sentinel on Sepolia. These tokens have no real value.
        </p>
      </div>

      {/* Not connected banner */}
      {!isConnected && (
        <Card className="border-[oklch(0.8_0.16_85_/_0.3)] bg-[oklch(0.8_0.16_85_/_0.05)]">
          <CardContent className="flex items-center gap-4 py-4">
            <Wallet className="h-5 w-5 text-[oklch(0.8_0.16_85)]" />
            <div>
              <p className="text-sm font-medium">Connect your wallet</p>
              <p className="text-xs text-muted-foreground">
                You need a connected wallet to claim test tokens.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Faucet card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-[oklch(0.65_0.25_290)]" />
            Claim Tokens
          </CardTitle>
          <CardDescription>
            Click &quot;Claim&quot; to mint tokens directly to your wallet. You can claim as many
            times as you need.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tokenList.map((token) => (
            <TokenRow
              key={token.symbol}
              token={token}
              defaultAmount={FAUCET_AMOUNTS[token.symbol]}
            />
          ))}
        </CardContent>
      </Card>

      {/* Quick-start guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-[oklch(0.72_0.19_155)]" />
            Quick Start
          </CardTitle>
          <CardDescription>Follow these steps to get started with Sentinel.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[oklch(0.65_0.25_290_/_0.15)] text-xs font-bold text-[oklch(0.65_0.25_290)]">
                1
              </span>
              <span>
                <strong>Claim tokens</strong> — Use the faucet above to get mETH, mUSDC, mWBTC,
                and mUSDT.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[oklch(0.65_0.25_290_/_0.15)] text-xs font-bold text-[oklch(0.65_0.25_290)]">
                2
              </span>
              <span>
                <strong>Browse pools</strong> — Go to the{" "}
                <a href="/app/pools" className="underline underline-offset-4 hover:text-foreground">
                  Pools
                </a>{" "}
                page to see available pools.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[oklch(0.65_0.25_290_/_0.15)] text-xs font-bold text-[oklch(0.65_0.25_290)]">
                3
              </span>
              <span>
                <strong>Deposit liquidity</strong> — Pick a pool and deposit both tokens.
                Sentinel will manage your position automatically.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[oklch(0.65_0.25_290_/_0.15)] text-xs font-bold text-[oklch(0.65_0.25_290)]">
                4
              </span>
              <span>
                <strong>Watch Sentinel work</strong> — Check the{" "}
                <a
                  href="/app/automation"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Automation
                </a>{" "}
                page to see rebalancing in action.
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
