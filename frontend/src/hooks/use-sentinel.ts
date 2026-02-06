import { useReadContract, useReadContracts, useAccount } from "wagmi"
import { sentinelHookAbi } from "@/lib/abi"
import { SENTINEL_HOOK_ADDRESS, POOLS } from "@/lib/addresses"

// ─── Pool State ─────────────────────────────────────────────

export interface PoolState {
  activeTickLower: number
  activeTickUpper: number
  activeLiquidity: bigint
  priceFeed: string
  priceFeedInverted: boolean
  maxDeviationBps: bigint
  aToken0: string
  aToken1: string
  idle0: bigint
  idle1: bigint
  aave0: bigint
  aave1: bigint
  currency0: string
  currency1: string
  decimals0: number
  decimals1: number
  fee: number
  tickSpacing: number
  totalShares: bigint
  isInitialized: boolean
}

const hookAddress = SENTINEL_HOOK_ADDRESS as `0x${string}`
const isDeployed = hookAddress !== "0x0000000000000000000000000000000000000000"

export function usePoolState(poolId: `0x${string}`) {
  return useReadContract({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: "getPoolState",
    args: [poolId],
    query: { enabled: isDeployed && poolId !== "0x0000000000000000000000000000000000000000000000000000000000000000" },
  })
}

export function useSharePrice(poolId: `0x${string}`) {
  return useReadContract({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: "getSharePrice",
    args: [poolId],
    query: { enabled: isDeployed && poolId !== "0x0000000000000000000000000000000000000000000000000000000000000000" },
  })
}

export function useLPPosition(poolId: `0x${string}`) {
  const { address } = useAccount()
  return useReadContract({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: "getLPPosition",
    args: [poolId, address!],
    query: { enabled: isDeployed && !!address },
  })
}

export function useTotalPools() {
  return useReadContract({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: "getTotalPools",
    query: { enabled: isDeployed },
  })
}

export function useLPCount(poolId: `0x${string}`) {
  return useReadContract({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: "getLPCount",
    args: [poolId],
    query: { enabled: isDeployed },
  })
}

export function useOwner() {
  return useReadContract({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: "owner",
    query: { enabled: isDeployed },
  })
}

export function useMaintainer() {
  return useReadContract({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: "maintainer",
    query: { enabled: isDeployed },
  })
}

// ─── Batch: All pool states at once ─────────────────────────

export function useAllPoolStates() {
  const contracts = POOLS.map((pool) => ({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: "getPoolState" as const,
    args: [pool.id] as const,
  }))

  return useReadContracts({
    contracts,
    query: { enabled: isDeployed },
  })
}

export function useAllSharePrices() {
  const contracts = POOLS.map((pool) => ({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: "getSharePrice" as const,
    args: [pool.id] as const,
  }))

  return useReadContracts({
    contracts,
    query: { enabled: isDeployed },
  })
}

export function useAllLPPositions() {
  const { address } = useAccount()
  const contracts = POOLS.map((pool) => ({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: "getLPPosition" as const,
    args: [pool.id, address!] as const,
  }))

  return useReadContracts({
    contracts,
    query: { enabled: isDeployed && !!address },
  })
}
