import { useAccount, useSwitchChain } from "wagmi"
import { sepolia } from "wagmi/chains"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CHAIN_ID, NETWORK_NAME } from "@/lib/addresses"

export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chain } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chain?.id === CHAIN_ID) {
    return <>{children}</>
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-8">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <h2 className="text-lg font-bold">Wrong Network</h2>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Sentinel is deployed on <strong>{NETWORK_NAME}</strong>. You are currently
        connected to <strong>{chain?.name ?? `Chain ${chain?.id}`}</strong>.
      </p>
      <Button
        onClick={() => switchChain({ chainId: sepolia.id })}
        disabled={isPending}
        className="bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-white hover:opacity-90"
      >
        {isPending ? "Switching..." : `Switch to ${NETWORK_NAME}`}
      </Button>
    </div>
  )
}
