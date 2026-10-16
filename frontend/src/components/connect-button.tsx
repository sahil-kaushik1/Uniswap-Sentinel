import { useAccount, useConnect, useDisconnect } from "wagmi"
import { Button } from "@/components/ui/button"
import { Wallet, LogOut, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <div className="h-2 w-2 rounded-full bg-[oklch(0.72_0.19_155)]" />
            {address.slice(0, 6)}…{address.slice(-4)}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(address)}>
            <Wallet className="mr-2 h-4 w-4" />
            Copy Address
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => disconnect()}>
            <LogOut className="mr-2 h-4 w-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Deduplicate connectors by id (MIPD discovery can create duplicates)
  const seen = new Set<string>()
  const uniqueConnectors = connectors.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          disabled={isPending}
          className="gap-2 bg-gradient-to-r from-[oklch(0.65_0.25_290)] to-[oklch(0.75_0.15_195)] text-white hover:opacity-90"
        >
          <Wallet className="h-4 w-4" />
          {isPending ? "Connecting…" : "Connect Wallet"}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {uniqueConnectors.map((connector) => (
          <DropdownMenuItem
            key={connector.uid}
            onClick={() => connect({ connector })}
            className="cursor-pointer"
          >
            <Wallet className="mr-2 h-4 w-4" />
            {connector.name}
          </DropdownMenuItem>
        ))}
        {error && (
          <div className="px-2 py-1.5 text-xs text-red-500">
            {error.message.length > 60
              ? error.message.slice(0, 60) + "…"
              : error.message}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
