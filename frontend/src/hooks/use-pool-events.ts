import { useEffect, useState } from "react"
import { usePublicClient } from "wagmi"
import { sentinelHookAbi } from "@/lib/abi"
import { SENTINEL_HOOK_ADDRESS } from "@/lib/addresses"
import { keccak256, decodeEventLog } from "viem"

type DepositEvent = {
  type: "deposit"
  poolId: string
  lp: string
  amount0: bigint
  amount1: bigint
  sharesReceived: bigint
  txHash: string
  blockNumber: number
}

type WithdrawEvent = {
  type: "withdraw"
  poolId: string
  lp: string
  amount0: bigint
  amount1: bigint
  sharesBurned: bigint
  txHash: string
  blockNumber: number
}

type RebalanceEvent = {
  type: "rebalance"
  poolId: string
  newTickLower: number
  newTickUpper: number
  activeAmount: bigint
  idleAmount: bigint
  txHash: string
  blockNumber: number
}

export function usePoolEvents(poolId: `0x${string}`, filterLp?: `0x${string}`) {
  const publicClient = usePublicClient()
  const [deposits, setDeposits] = useState<DepositEvent[]>([])
  const [withdraws, setWithdraws] = useState<WithdrawEvent[]>([])
  const [rebalances, setRebalances] = useState<RebalanceEvent[]>([])

  useEffect(() => {
    if (!poolId || poolId === "0x0000000000000000000000000000000000000000000000000000000000000000") return

    let mounted = true

    async function fetchLogs() {
      try {
        const depositSig = "LPDeposited(bytes32,address,uint256,uint256,uint256)"
        const withdrawSig = "LPWithdrawn(bytes32,address,uint256,uint256,uint256)"
        const rebalanceSig = "LiquidityRebalanced(bytes32,int24,int24,uint256,int256)"

        const depositTopic = keccak256(new TextEncoder().encode(depositSig))
        const withdrawTopic = keccak256(new TextEncoder().encode(withdrawSig))
        const rebalanceTopic = keccak256(new TextEncoder().encode(rebalanceSig))

        const depositFilter: any = {
          address: SENTINEL_HOOK_ADDRESS as `0x${string}`,
          topics: [depositTopic, poolId, filterLp ?? null],
        }

        const withdrawFilter: any = {
          address: SENTINEL_HOOK_ADDRESS as `0x${string}`,
          topics: [withdrawTopic, poolId, filterLp ?? null],
        }

        const rebalanceFilter: any = {
          address: SENTINEL_HOOK_ADDRESS as `0x${string}`,
          topics: [rebalanceTopic, poolId],
        }

        const [rawDeposits, rawWithdraws, rawRebalances] = await Promise.all([
          publicClient.getLogs(depositFilter),
          publicClient.getLogs(withdrawFilter),
          publicClient.getLogs(rebalanceFilter),
        ])

        const depEvents: DepositEvent[] = rawDeposits.map((log: any) => {
          const decoded = decodeEventLog({
            abi: sentinelHookAbi as any,
            data: log.data,
            topics: log.topics,
          }) as any
          return {
            type: "deposit",
            poolId: decoded.args[0] as string,
            lp: decoded.args[1] as string,
            amount0: BigInt(decoded.args[2] as string),
            amount1: BigInt(decoded.args[3] as string),
            sharesReceived: BigInt(decoded.args[4] as string),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          }
        })

        const wEvents: WithdrawEvent[] = rawWithdraws.map((log: any) => {
          const decoded = decodeEventLog({
            abi: sentinelHookAbi as any,
            data: log.data,
            topics: log.topics,
          }) as any
          return {
            type: "withdraw",
            poolId: decoded.args[0] as string,
            lp: decoded.args[1] as string,
            amount0: BigInt(decoded.args[2] as string),
            amount1: BigInt(decoded.args[3] as string),
            sharesBurned: BigInt(decoded.args[4] as string),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          }
        })

        const rEvents: RebalanceEvent[] = rawRebalances.map((log: any) => {
          const decoded = decodeEventLog({
            abi: sentinelHookAbi as any,
            data: log.data,
            topics: log.topics,
          }) as any
          return {
            type: "rebalance",
            poolId: decoded.args[0] as string,
            newTickLower: Number(decoded.args[1] as any),
            newTickUpper: Number(decoded.args[2] as any),
            activeAmount: BigInt(decoded.args[3] as string),
            idleAmount: BigInt(decoded.args[4] as string),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          }
        })

        if (!mounted) return
        setDeposits(depEvents)
        setWithdraws(wEvents)
        setRebalances(rEvents)
      } catch (e) {
        // ignore errors
      }
    }

    fetchLogs()

    return () => {
      mounted = false
    }
  }, [poolId, filterLp, publicClient])

  return { deposits, withdraws, rebalances }
}
