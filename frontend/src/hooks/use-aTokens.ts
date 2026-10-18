import { useReadContracts } from "wagmi"
import { erc20Abi } from "@/lib/abi"
import { POOLS, SENTINEL_HOOK_ADDRESS } from "@/lib/addresses"

export function useAllATokenBalances() {
  // collect unique aToken addresses from POOLS
  const tokens = new Set<string>()
  for (const p of POOLS as any) {
    if (p.aToken0 && p.aToken0 !== "0x0000000000000000000000000000000000000000") tokens.add(p.aToken0)
    if (p.aToken1 && p.aToken1 !== "0x0000000000000000000000000000000000000000") tokens.add(p.aToken1)
  }

  const contracts = Array.from(tokens).map((t) => ({
    address: t as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [SENTINEL_HOOK_ADDRESS as `0x${string}`] as const,
  }))

  return useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      refetchInterval: 5000,
      refetchIntervalInBackground: true,
    },
  })
}
