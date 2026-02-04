# Gelato Automate Reference (Sentinel)

## Overview
In the `gelato` branch, Sentinel replaces the **Chainlink CRE workflow** with **Gelato Automate** for the *cold-path* strategy execution.

- **Hot path (on-chain, every swap):** `beforeSwap` circuit breaker + `TickCrossed` event emission.
- **Cold path (automation):** Gelato executes `SentinelHook.maintain(poolId, newTickLower, newTickUpper, volatility)` when a strategy decides to rebalance.

Sentinel’s trust model remains the same:
- The hook is the *safety boundary* (oracle deviation check, range validation).
- Automation is just an *executor* that is allowed to call `maintain()`.

## How Gelato calls `maintain()`
`SentinelHook` already has a single automation gate:

- `maintain()` is restricted to `maintainer`.
- For Gelato, set `maintainer` to Gelato’s **dedicated msg.sender** (recommended) or to your own executor contract/EOA.

You can update it any time via:
- `SentinelHook.setMaintainer(address newMaintainer)` (owner-only)

## Recommended setup patterns
### Pattern A (simple): Dedicated msg.sender whitelisting
1. Create a Gelato task with `dedicatedMsgSender: true`.
2. Configure the hook’s `maintainer` to that dedicated sender address.

This mirrors Gelato’s documented “PROXY / dedicated msg.sender” security model (tasks execute via a dedicated caller you can whitelist).

### Pattern B (advanced): Resolver + dynamic inputs
If you need:
- custom execution conditions, and/or
- dynamic ticks/volatility per execution,

use a **resolver** (Gelato calls your resolver to decide whether to execute and what calldata to use), or use **Web3 Functions** to compute off-chain inputs.

At a high level:
- Trigger source: `TickCrossed(poolId, ...)` events (or time-based cron).
- Strategy compute: off-chain (volatility, range width, risk bucket).
- Execution: Gelato calls `maintain(poolId, newLower, newUpper, vol)`.

## Automate SDK sketch (example)
Gelato tasks are commonly created with `@gelatonetwork/automate-sdk`.

- Event triggers are supported (listen to `TickCrossed`).
- Cron/time triggers are supported.
- You can attach a resolver for conditional execution.

See Gelato docs for `createTask` + `dedicatedMsgSender` + resolver usage.

## What changed vs CRE
- There is no DON consensus layer in-protocol.
- The “strategist logic” is expected to live in Gelato automation (resolver/Web3 Function/bot), while Sentinel enforces safety on-chain.

## Operational notes
- Keep `beforeSwap` extremely lean (no loops, no storage writes beyond events).
- Consider a multi-pool monitor that batches rebalances over time.
- Set conservative `maxDeviationBps` per pool to avoid executing during oracle/pool desync.
