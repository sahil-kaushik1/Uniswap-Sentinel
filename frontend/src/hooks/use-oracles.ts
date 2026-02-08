import { useReadContract } from "wagmi"
import { aggregatorV3Abi } from "@/lib/abi"
import { ETH_USD_FEED_ADDRESS, BTC_USD_FEED_ADDRESS } from "@/lib/addresses"

export function useEthUsdPrice() {
  return useReadContract({
    address: ETH_USD_FEED_ADDRESS as `0x${string}`,
    abi: aggregatorV3Abi,
    functionName: "latestRoundData",
    query: {
      enabled: true,
      refetchInterval: 5000,
    },
  })
}

export function useBtcUsdPrice() {
  return useReadContract({
    address: BTC_USD_FEED_ADDRESS as `0x${string}`,
    abi: aggregatorV3Abi,
    functionName: "latestRoundData",
    query: {
      enabled: true,
      refetchInterval: 5000,
    },
  })
}
