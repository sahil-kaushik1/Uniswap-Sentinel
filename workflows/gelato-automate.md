# Gelato Automate: Sentinel Rebalance Execution

This folder used to contain a Chainlink CRE workflow spec. In the `gelato` branch we use **Gelato Automate** to execute rebalances.

## Target call
Gelato executes the following function on the hook (the hook must whitelist the executor as `maintainer`):

- `SentinelHook.maintain(poolId, newTickLower, newTickUpper, volatility)`

## Suggested triggering
You have a few viable options:

### Option 1: Event-driven (recommended)
- Listen for `TickCrossed(poolId, tickLower, tickUpper, currentTick)` emitted by `beforeSwap`.
- When seen, compute a new range + volatility off-chain.
- Execute `maintain()`.

### Option 2: Cron fallback
- Periodically scan pools (e.g., every 1-4 hours).
- Rebalance when range drift/idle ratio thresholds are met.

## Dedicated msg.sender
When creating a task, enable Gelato’s dedicated msg.sender (proxy) mode and set the hook’s `maintainer` to that dedicated address.

## Notes
- This repo intentionally keeps strategy computation *off-chain*; the hook remains the safety boundary.
- The hook emits events instead of storing swap-path state to keep gas <50k in `beforeSwap`.
