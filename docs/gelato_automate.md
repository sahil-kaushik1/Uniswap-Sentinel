# Gelato Automate Reference (Sentinel)

## Overview
In the `gelato` branch, Sentinel replaces the **Chainlink CRE workflow** with **Gelato Automate** for the *cold-path* strategy execution.

- **Hot path (on-chain, every swap):** `beforeSwap` circuit breaker + `TickCrossed` event emission.
- **Cold path (automation):** Gelato executes `SentinelHook.maintain(poolId, newTickLower, newTickUpper, volatility)` when a strategy decides to rebalance.

## Execution Strategy: "Conditional Rebalancing"

Sentinel does **NOT** rebalance on every block or every tick change. Rebalancing is expensive (gas). The strategy follows a strict **Logic Gate** executed off-chain by Gelato Resolvers / Web3 Functions.

### The Decision Logic (Off-Chain Resolver)
Gelato runs this check periodically (e.g., every block or every minute):

1.  **Safety Check (The "Wake Up"):**
    - Is `CurrentTick < tickLower` OR `CurrentTick > tickUpper`?
    - *If Yes:* **TRIGGER IMMEDIATE REBALANCE** (Safety Priority).

2.  **Profitability Check (The "Optimizer"):**
    - *If Safety Check is OK (in range),* check for optimization opportunities.
    - Calculate `ProjectedFees` for moving to a tighter range.
    - Calculate `GasCost` of rebalance transaction.
    - *Logic:* `if (ProjectedFees - GasCost) > MinProfitThreshold`:
        - **TRIGGER REBALANCE**.
    - *Else:* **DO NOTHING** (Sleep).

### Why this works
- **No Swaps?** The Resolver polls time/oracle data. If the market moves violently while the pool is idle, the **Safety Check** triggers a rebalance based on the Oracle price, protecting funds even without swap events.
- **High Gas?** The **Profitability Check** prevents rebalancing if gas > profit, preventing "churn" that drains funds.

---

## How Gelato calls `maintain()`
`SentinelHook` enforces access control:
- `maintain()` is restricted to `maintainer`.
- For Gelato, set `maintainer` to Gelato’s **dedicated msg.sender** (recommended).

You can update it any time via:
- `SentinelHook.setMaintainer(address newMaintainer)` (owner-only)

## Recommended setup patterns

### Pattern A: Event-Driven (Simple)
*Good for low-volatility pairs.*
- Trigger: Gelato listerns for `TickCrossed` event.
- Action: Checks if new tick is valid, calls `maintain()`.
- **Pros:** Simple. **Cons:** Misses "silent" price moves (oracle deviates but no swaps occur).

### Pattern B: Polling Resolver (Robust)
*Recommended for Sentinel.*
- Trigger: Every 1-5 minutes (Time-based).
- Resolver Contract (or Web3 Function):
    - Fetches `slot0` (pool price) and `Oracle` price.
    - Checks `maintain()` preconditions off-chain.
    - Returns `true` + `calldata` only if rebalance is needed.
- **Pros:** Catches silent shifts, implements gas-profit logic detailed above.

---

## Setup Instructions

1. **Deploy Hook**: Get the `SentinelHook` address.
2. **Deploy Resolver (Optional)**: If using Pattern B, deploy a helper contract that returns `(bool canExec, bytes execPayload)`.
3. **Create Task on Gelato**:
   - **Type:** Resolver (or Web3 Function).
   - **Executor:** Enable "Dedicated msg.sender".
   - **Target:** `SentinelHook` address.
4. **Whitelist Executor**:
   - Call `hook.setMaintainer(gelatoDedicatedMsgSender)`.

## Operational Notes
- **Strategy Logic:** Lives in the Resolver/Web3 Function (Off-chain or read-only on-chain).
- **Safety Logic:** Lives in the Hook (On-chain, immutable).
- **Gas:** Set conservative thresholds. Don't rebalance for < $10 profit unless safety is at risk.
