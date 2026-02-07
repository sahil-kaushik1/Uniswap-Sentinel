import { http, createConfig } from "wagmi"
import { sepolia } from "wagmi/chains"
import { injected } from "wagmi/connectors"

// Use env var or fallback to public RPC
// Create frontend/.env with VITE_SEPOLIA_RPC_URL=https://... for a private RPC
const sepoliaRpc = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined

export const config = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(sepoliaRpc || "https://ethereum-sepolia-rpc.publicnode.com"),
  },
})

declare module "wagmi" {
  interface Register {
    config: typeof config
  }
}
