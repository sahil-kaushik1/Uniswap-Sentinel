import "dotenv/config"
import { ethers } from "ethers"

const REQUIRED_ENV = [
  "RPC_URL",
  "PRIVATE_KEY",
  "HOOK_ADDRESS",
  "POOL_MANAGER_ADDRESS",
  "POOLS",
]

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`)
    process.exit(1)
  }
}

const RPC_URL = process.env.RPC_URL
const WS_RPC_URL = process.env.WS_RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY
const HOOK_ADDRESS = process.env.HOOK_ADDRESS
const POOL_MANAGER_ADDRESS = process.env.POOL_MANAGER_ADDRESS
const DRY_RUN = (process.env.DRY_RUN || "false").toLowerCase() === "true"
const CHECK_INTERVAL_SEC = Number(process.env.CHECK_INTERVAL_SEC || "60")
const DEFAULT_TICK_WIDTH = Number(process.env.DEFAULT_TICK_WIDTH || "600")
const DEFAULT_EDGE_BPS = Number(process.env.DEFAULT_EDGE_BPS || "2000")
const DEFAULT_MAX_SLIPPAGE_BPS = Number(process.env.MAX_SLIPPAGE_BPS || "300")
const REBALANCE_COOLDOWN_SEC = Number(process.env.REBALANCE_COOLDOWN_SEC || "120")
const MAX_REBALANCES_PER_HOUR = Number(process.env.MAX_REBALANCES_PER_HOUR || "6")
const TICK_HISTORY_SIZE = Number(process.env.TICK_HISTORY_SIZE || "48")
const ENABLE_EVENT_LISTENER = (process.env.ENABLE_EVENT_LISTENER || "true").toLowerCase() === "true"
const MIN_ACTIVE_LIQUIDITY = BigInt(process.env.MIN_ACTIVE_LIQUIDITY || "0")
const MIN_TOTAL_SHARES = BigInt(process.env.MIN_TOTAL_SHARES || "0")
const MAX_DEVIATION_BPS_OVERRIDE = process.env.MAX_DEVIATION_BPS_OVERRIDE
  ? BigInt(process.env.MAX_DEVIATION_BPS_OVERRIDE)
  : null

let pools
try {
  pools = JSON.parse(process.env.POOLS)
  if (!Array.isArray(pools) || pools.length === 0) {
    throw new Error("POOLS must be a non-empty JSON array")
  }
} catch (err) {
  console.error("Failed to parse POOLS env var (expected JSON array)")
  console.error(err)
  process.exit(1)
}

const provider = new ethers.JsonRpcProvider(RPC_URL)
const eventProvider = WS_RPC_URL ? new ethers.WebSocketProvider(WS_RPC_URL) : provider
const wallet = new ethers.Wallet(PRIVATE_KEY, provider)

const hookAbi = [
  "function getPoolState(bytes32 poolId) view returns (tuple(int24 activeTickLower,int24 activeTickUpper,uint128 activeLiquidity,address priceFeed,bool priceFeedInverted,uint256 maxDeviationBps,address aToken0,address aToken1,uint256 idle0,uint256 idle1,uint256 aave0,uint256 aave1,address currency0,address currency1,uint8 decimals0,uint8 decimals1,uint24 fee,int24 tickSpacing,uint256 totalShares,bool isInitialized))",
  "function maintain(bytes32 poolId,int24 newLower,int24 newUpper,uint256 volatility)",
  "event PoolInitialized(bytes32 indexed poolId,address priceFeed,bool priceFeedInverted,address aToken0,address aToken1)",
  "event TickCrossed(bytes32 indexed poolId,int24 tickLower,int24 tickUpper,int24 currentTick)",
]

const poolManagerAbi = [
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality)",
]

const aggregatorAbi = [
  "function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]

const hook = new ethers.Contract(HOOK_ADDRESS, hookAbi, wallet)
const hookEvents = new ethers.Contract(HOOK_ADDRESS, hookAbi, eventProvider)
const poolManager = new ethers.Contract(POOL_MANAGER_ADDRESS, poolManagerAbi, provider)

const lastRebalanceByPool = new Map()
const rebalanceHistoryByPool = new Map()
const tickHistoryByPool = new Map()
const priceHistoryByPool = new Map()
const workQueue = []
const queuedPools = new Set()
let isRunning = false

function toNumber(value) {
  if (typeof value === "bigint") return Number(value)
  return Number(value)
}

function pow10(decimals) {
  const count = typeof decimals === "bigint" ? Number(decimals) : decimals
  let result = 1n
  for (let i = 0; i < count; i += 1) result *= 10n
  return result
}

function enqueuePool(poolId, reason) {
  if (queuedPools.has(poolId)) return
  queuedPools.add(poolId)
  workQueue.push({ poolId, reason, ts: Date.now() })
}

function alignTick(tick, spacing) {
  if (spacing === 0) return tick
  return Math.trunc(tick / spacing) * spacing
}

function shouldCooldown(poolId) {
  const last = lastRebalanceByPool.get(poolId)
  if (!last) return false
  return Date.now() - last < REBALANCE_COOLDOWN_SEC * 1000
}

function recordTick(poolId, tick) {
  const history = tickHistoryByPool.get(poolId) || []
  history.push({ tick, ts: Date.now() })
  while (history.length > TICK_HISTORY_SIZE) history.shift()
  tickHistoryByPool.set(poolId, history)
}

function recordPrice(poolId, price) {
  const history = priceHistoryByPool.get(poolId) || []
  history.push({ price, ts: Date.now() })
  while (history.length > TICK_HISTORY_SIZE) history.shift()
  priceHistoryByPool.set(poolId, history)
}

function computeVolatilityBps(poolId) {
  const history = tickHistoryByPool.get(poolId) || []
  if (history.length < 6) return 1000

  const deltas = []
  for (let i = 1; i < history.length; i += 1) {
    deltas.push(history[i].tick - history[i - 1].tick)
  }

  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length
  const variance = deltas.reduce((sum, d) => sum + (d - mean) ** 2, 0) / deltas.length
  const std = Math.sqrt(variance)

  if (std < 5) return 500
  if (std < 15) return 800
  if (std < 30) return 1200
  if (std < 60) return 1500
  return 2000
}

function recordRebalance(poolId) {
  const history = rebalanceHistoryByPool.get(poolId) || []
  const now = Date.now()
  history.push(now)
  const cutoff = now - 60 * 60 * 1000
  while (history.length && history[0] < cutoff) history.shift()
  rebalanceHistoryByPool.set(poolId, history)
}

function canRebalance(poolId) {
  const history = rebalanceHistoryByPool.get(poolId) || []
  const cutoff = Date.now() - 60 * 60 * 1000
  const recent = history.filter((ts) => ts >= cutoff)
  return recent.length < MAX_REBALANCES_PER_HOUR
}

async function getOraclePrice(feedAddress) {
  const feed = new ethers.Contract(feedAddress, aggregatorAbi, provider)
  const [roundId, answer, , updatedAt, answeredInRound] = await feed.latestRoundData()
  if (updatedAt === 0n || answeredInRound < roundId) {
    throw new Error("stale-oracle")
  }
  if (answer <= 0n) throw new Error("invalid-oracle")
  const decimals = await feed.decimals()
  const answerAbs = BigInt(answer)
  if (decimals === 18) return answerAbs
  if (decimals < 18) return answerAbs * pow10(18 - decimals)
  return answerAbs / pow10(decimals - 18)
}

function estimatePoolPriceX18(sqrtPriceX96, decimals0, decimals1) {
  const sqrt = BigInt(sqrtPriceX96)
  const priceX18 = (sqrt * sqrt * 1000000000000000000n) / (1n << 192n)
  const scaleUp = pow10(BigInt(decimals0))
  const scaleDown = pow10(BigInt(decimals1))
  return (priceX18 * scaleUp) / scaleDown
}

function deviationBps(price1, price2) {
  if (price1 === 0n || price2 === 0n) return 10_000n
  const diff = price1 > price2 ? price1 - price2 : price2 - price1
  const avg = (price1 + price2) / 2n
  return (diff * 10_000n) / avg
}

async function checkPool(pool) {
  const poolId = pool.id
  const poolName = pool.name || poolId

  const state = await hook.getPoolState(poolId)
  if (!state.isInitialized) {
    return { action: "skip", reason: "not-initialized", poolId, poolName }
  }

  if (MIN_ACTIVE_LIQUIDITY > 0n && BigInt(state.activeLiquidity) < MIN_ACTIVE_LIQUIDITY) {
    return { action: "skip", reason: "min-liquidity", poolId, poolName }
  }

  if (MIN_TOTAL_SHARES > 0n && BigInt(state.totalShares) < MIN_TOTAL_SHARES) {
    return { action: "skip", reason: "min-shares", poolId, poolName }
  }

  const slot0 = await poolManager.getSlot0(poolId)
  const currentTick = toNumber(slot0.tick)
  recordTick(poolId, currentTick)
  const activeLower = toNumber(state.activeTickLower)
  const activeUpper = toNumber(state.activeTickUpper)
  const tickSpacing = Math.abs(toNumber(state.tickSpacing))
  const rangeWidth = activeUpper - activeLower

  if (rangeWidth <= 0 || tickSpacing === 0) {
    return { action: "skip", reason: "invalid-range", poolId, poolName }
  }

  const defaultWidth = Number(pool.defaultTickWidth || DEFAULT_TICK_WIDTH)
  const edgeBps = Number(pool.edgeBps || DEFAULT_EDGE_BPS)
  const maxSlippageBps = Number(pool.maxSlippageBps || DEFAULT_MAX_SLIPPAGE_BPS)
  const newLower = alignTick(currentTick - defaultWidth, tickSpacing)
  const newUpper = alignTick(currentTick + defaultWidth, tickSpacing)
  const volatility = computeVolatilityBps(poolId)

  const poolPrice = estimatePoolPriceX18(slot0.sqrtPriceX96, state.decimals0, state.decimals1)
  recordPrice(poolId, poolPrice)

  const priceHistory = priceHistoryByPool.get(poolId) || []
  if (priceHistory.length > 1) {
    const lastPrice = priceHistory[priceHistory.length - 2].price
    const priceMove = deviationBps(poolPrice, lastPrice)
    if (priceMove > BigInt(maxSlippageBps)) {
      return { action: "skip", reason: "max-slippage", poolId, poolName }
    }
  }

  try {
    let oraclePrice = await getOraclePrice(state.priceFeed)
    if (state.priceFeedInverted) {
      oraclePrice = (1000000000000000000000000000000000000n) / oraclePrice
    }
    const maxDeviationBps = MAX_DEVIATION_BPS_OVERRIDE ?? BigInt(state.maxDeviationBps)
    const deviation = deviationBps(poolPrice, oraclePrice)
    if (deviation > maxDeviationBps) {
      return { action: "skip", reason: "oracle-deviation", poolId, poolName }
    }
  } catch (err) {
    return { action: "skip", reason: "oracle-error", poolId, poolName }
  }

  if (currentTick < activeLower || currentTick > activeUpper) {
    return {
      action: "rebalance",
      reason: "out-of-range",
      poolId,
      poolName,
      newLower,
      newUpper,
      volatility,
      currentTick,
      activeLower,
      activeUpper,
    }
  }

  const edgeThreshold = Math.max(1, Math.trunc((rangeWidth * edgeBps) / 10000))
  const nearLowerEdge = currentTick - activeLower < edgeThreshold
  const nearUpperEdge = activeUpper - currentTick < edgeThreshold

  if (nearLowerEdge || nearUpperEdge) {
    return {
      action: "rebalance",
      reason: "near-edge",
      poolId,
      poolName,
      newLower,
      newUpper,
      volatility,
      currentTick,
      activeLower,
      activeUpper,
    }
  }

  return { action: "skip", reason: "in-range", poolId, poolName }
}

async function runCycle() {
  if (isRunning) return
  isRunning = true

  try {
    while (workQueue.length) {
      const job = workQueue.shift()
      if (!job) break
      queuedPools.delete(job.poolId)
      const pool = pools.find((p) => p.id === job.poolId) || { id: job.poolId, name: job.poolId }
      if (shouldCooldown(job.poolId) || !canRebalance(job.poolId)) continue
      const result = await checkPool(pool)
      if (result.action !== "rebalance") continue

      console.log(
        `[${result.poolName}] Event rebalance (${job.reason}) tick=${result.currentTick} range=[${result.activeLower},${result.activeUpper}] -> [${result.newLower},${result.newUpper}] vol=${result.volatility}`
      )

      if (!DRY_RUN) {
        const tx = await hook.maintain(
          result.poolId,
          result.newLower,
          result.newUpper,
          result.volatility
        )
        console.log(`[${result.poolName}] maintain() tx: ${tx.hash}`)
        await tx.wait(1)
        lastRebalanceByPool.set(result.poolId, Date.now())
        recordRebalance(result.poolId)
      }
    }

    for (const pool of pools) {
      if (!pool?.id) continue

      if (shouldCooldown(pool.id)) {
        continue
      }

      if (!canRebalance(pool.id)) {
        continue
      }

      const result = await checkPool(pool)
      if (result.action !== "rebalance") {
        continue
      }

      if (result.newLower >= result.newUpper) {
        console.warn(`[${result.poolName}] Skipping: invalid new range`) 
        continue
      }

      console.log(
        `[${result.poolName}] Rebalance (${result.reason}) tick=${result.currentTick} range=[${result.activeLower},${result.activeUpper}] -> [${result.newLower},${result.newUpper}] vol=${result.volatility}`
      )

      if (DRY_RUN) {
        continue
      }

      const tx = await hook.maintain(
        result.poolId,
        result.newLower,
        result.newUpper,
        result.volatility
      )
      console.log(`[${result.poolName}] maintain() tx: ${tx.hash}`)
      await tx.wait(1)
      lastRebalanceByPool.set(result.poolId, Date.now())
      recordRebalance(result.poolId)
    }
  } catch (err) {
    console.error("Cycle error:", err)
  } finally {
    isRunning = false
  }
}

console.log("Sentinel Azure Agent starting...")
console.log(`Wallet: ${wallet.address}`)
console.log(`Hook: ${HOOK_ADDRESS}`)
console.log(`PoolManager: ${POOL_MANAGER_ADDRESS}`)
console.log(`Pools: ${pools.length}`)
console.log(`Interval: ${CHECK_INTERVAL_SEC}s | Dry run: ${DRY_RUN}`)

if (ENABLE_EVENT_LISTENER) {
  hookEvents.on("TickCrossed", (poolId) => {
    enqueuePool(poolId, "tick-crossed")
  })

  hookEvents.on("PoolInitialized", (poolId) => {
    enqueuePool(poolId, "pool-initialized")
    const exists = pools.some((p) => p.id === poolId)
    if (!exists) {
      pools.push({ id: poolId, name: poolId })
      console.log(`Discovered new pool: ${poolId}`)
    }
  })
}

await runCycle()
setInterval(runCycle, CHECK_INTERVAL_SEC * 1000)
