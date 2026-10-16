import { useReadContracts } from "wagmi"
import { poolManagerAbi } from "@/lib/abi"
import { POOLS, POOL_MANAGER_ADDRESS } from "@/lib/addresses"

export function useAllSlot0() {
  const contracts = POOLS.map((p) => ({
    address: POOL_MANAGER_ADDRESS as `0x${string}`,
    abi: poolManagerAbi,
    functionName: "getSlot0" as const,
    args: [p.id] as const,
  }))

  return useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      refetchInterval: 5000,
    },
  })
}
