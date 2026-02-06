import { useState, useEffect } from "react"
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { parseUnits } from "viem"
import { erc20Abi } from "@/lib/abi"
import { TOKENS } from "@/lib/addresses"
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
import { Loader2, Check, Coins } from "lucide-react"

interface MintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const tokenList = Object.values(TOKENS)

export function MintDialog({ open, onOpenChange }: MintDialogProps) {
  const { address } = useAccount()
  const [selectedToken, setSelectedToken] = useState(tokenList[0])
  const [amount, setAmount] = useState("")
  const [step, setStep] = useState<"input" | "minting" | "done">("input")

  const parsedAmount = amount ? parseUnits(amount, selectedToken.decimals) : 0n

  const { writeContract: mint, data: mintHash, isPending: isMinting } = useWriteContract()
  const { isSuccess: mintConfirmed } = useWaitForTransactionReceipt({ hash: mintHash })

  useEffect(() => {
    if (mintConfirmed && step === "minting") {
      setStep("done")
    }
  }, [mintConfirmed, step])

  const handleMint = () => {
    if (!address) return
    setStep("minting")
    mint({
      address: selectedToken.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "mint",
      args: [address, parsedAmount],
    })
  }

  const resetAndClose = () => {
    setStep("input")
    setAmount("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-[oklch(0.8_0.16_85)]" />
            Mint Test Tokens
          </DialogTitle>
          <DialogDescription>
            Mint mock tokens to your wallet for testing. These are testnet tokens with no real value.
          </DialogDescription>
        </DialogHeader>

        {step === "done" ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[oklch(0.72_0.19_155_/_0.15)]">
              <Check className="h-6 w-6 text-[oklch(0.72_0.19_155)]" />
            </div>
            <p className="text-sm font-medium">Tokens Minted!</p>
            <p className="text-xs text-muted-foreground">
              {amount} {selectedToken.symbol} sent to your wallet.
            </p>
            <Button onClick={resetAndClose} className="w-full">Close</Button>
          </div>
        ) : (
          <>
            {/* Token selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Select Token</label>
              <div className="grid grid-cols-4 gap-2">
                {tokenList.map((token) => (
                  <Button
                    key={token.symbol}
                    variant={selectedToken.symbol === token.symbol ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setSelectedToken(token)}
                    disabled={step !== "input"}
                  >
                    {token.symbol}
                  </Button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Amount</label>
              <Input
                placeholder={`e.g. ${selectedToken.decimals === 18 ? "10" : selectedToken.decimals === 8 ? "1" : "10000"}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-muted/30"
                disabled={step !== "input"}
              />
              <div className="flex gap-2">
                {[
                  selectedToken.decimals === 18 ? "10" : selectedToken.decimals === 8 ? "1" : "10000",
                  selectedToken.decimals === 18 ? "100" : selectedToken.decimals === 8 ? "10" : "100000",
                  selectedToken.decimals === 18 ? "1000" : selectedToken.decimals === 8 ? "100" : "1000000",
                ].map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setAmount(preset)}
                    disabled={step !== "input"}
                  >
                    {Number(preset).toLocaleString()}
                  </Button>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose} disabled={isMinting}>
                Cancel
              </Button>
              <Button
                onClick={handleMint}
                disabled={parsedAmount === 0n || !address || isMinting}
                className="bg-gradient-to-r from-[oklch(0.8_0.16_85)] to-[oklch(0.72_0.19_155)] text-white hover:opacity-90"
              >
                {isMinting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Minting...
                  </>
                ) : (
                  <>Mint {selectedToken.symbol}</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
