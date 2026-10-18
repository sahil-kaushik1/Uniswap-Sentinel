import { useReadContract, useAccount } from "wagmi"
import { erc20Abi } from "@/lib/abi"

export function useTokenBalance(token: `0x${string}`) {
  const { address } = useAccount()
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: {
      enabled: !!address && token !== "0x0000000000000000000000000000000000000000",
      refetchInterval: 3000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
  })
}

export function useTokenAllowance(
  token: `0x${string}`,
  spender: `0x${string}`
) {
  const { address } = useAccount()
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address!, spender],
    query: {
      enabled: !!address && token !== "0x0000000000000000000000000000000000000000",
      refetchInterval: 3000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
  })
}

export function useTokenSymbol(token: `0x${string}`) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "symbol",
    query: {
      enabled: token !== "0x0000000000000000000000000000000000000000",
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
  })
}

export function useTokenDecimals(token: `0x${string}`) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
    query: {
      enabled: token !== "0x0000000000000000000000000000000000000000",
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
  })
}
