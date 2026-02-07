# Sentinel Liquidity Protocol — Whitepaper

## Abstract
Sentinel Liquidity Protocol is a trust‑minimized liquidity management layer for Uniswap v4 that combines an immutable hook (safety) with off‑chain automation (execution). LPs deposit assets into a pool‑scoped share system, and Sentinel autonomously maintains active liquidity ranges while routing idle capital to Aave v3. The protocol is designed to scale across many pools with isolated state and deterministic, per‑pool accounting.

## 1. Problem Statement
Uniswap v3/v4 liquidity provision is capital‑inefficient and operationally demanding. LPs must:
- Constantly monitor price ranges
- Rebalance to maintain fee capture
- Tolerate idle capital when out of range
- Accept operational trust when delegating to centralized agents

## 2. Sentinel Solution
Sentinel provides **Liquidity‑as‑a‑Service** with:
- **Safety on‑chain:** A hook validates swap safety via oracle checks in the hot path.
- **Execution on‑chain:** Chainlink Automation rebalances ranges on demand.
- **Idle yield routing:** Unused capital is deployed to Aave v3.
- **Multi‑pool design:** One hook serves many pools, with strict per‑pool state isolation.

## 3. Architecture Overview
The protocol consists of:
- **SentinelHook.sol** — The core Uniswap v4 hook and LP interface.
- **OracleLib.sol** — Chainlink deviation checks per pool.
- **YieldRouter.sol** — Active/Idle split heuristics (stateless math).
- **AaveAdapter.sol** — Aave v3 supply/withdraw adapter.

### 3.1 Multi‑Pool Isolation
All state is keyed by `PoolId` derived from `PoolKey`. Each pool has:
- Active range and liquidity
- Dual-asset yield configuration (aToken0, aToken1)
- LP shares and total shares
- Oracle feed and deviation threshold

## 4. LP Share Model
Each pool maintains a share ledger:
- `lpShares[poolId][lp]` stores LP shares.
- `totalShares` tracks total issued shares.

Shares represent a claim on pool NAV (active liquidity + idle balances + Aave balance). The share price is:

$$\text{SharePrice} = \frac{\text{NAV}}{\text{TotalShares}}$$

### 4.1 Deposit
LPs deposit token0/token1 via `depositLiquidity`:
1. Tokens transferred to the hook
2. Shares minted proportional to NAV
3. Shares recorded under pool scope

### 4.2 Withdrawal
LPs withdraw via `withdrawLiquidity`:
1. Pro‑rata claim is computed
2. Active liquidity and idle balances are withdrawn
3. Aave withdrawals occur if needed
4. Tokens transferred, shares burned

## 5. Rebalancing Lifecycle
Rebalancing occurs per pool:
1. **Tick cross** emits `TickCrossed` in `beforeSwap`.
2. Automation computes a new range and calls `maintain(poolId, ...)`.
3. Hook withdraws active liquidity and recalls Aave funds.
4. Assets are redeployed to the new range.
5. Idle yield asset is re‑supplied to Aave.

## 6. Oracle Safety Model
On every swap, the hook checks:
- Pool price vs. Chainlink oracle price
- Reverts if deviation exceeds `maxDeviationBps`

This protects LPs from extreme price manipulation and oracle drift.

## 7. Yield Routing
Idle assets for both pool tokens (tracked via `idle0`/`idle1`) can be deposited into Aave v3 via their respective aTokens (`aToken0`/`aToken1`). Either token can have yield disabled by setting its aToken to `address(0)`. Withdrawals are proportional on LP exit or during rebalancing.

## 8. Security Considerations
- **Hot path gas ceiling:** `beforeSwap` is optimized and avoids storage writes.
- **Per‑pool isolation:** No global cross‑pool state is used in economic logic.
- **Oracle validation:** Per‑pool price feeds with deviation checks.
- **Access control:** `maintain` callable only by `maintainer`.

## 9. Limitations
- NAV calculation is simplified and may require oracle‑based valuation for production precision.
- Pool key reconstruction is simplified; production deployment should store full `PoolKey`.

## 10. Testing Strategy- **Unit tests** (`test/unit/`): SentinelHookUnit, OracleLib, YieldRouter, AaveAdapter, DeploySentinel
- **Fuzz tests** (`test/fuzz/`): OracleLibFuzz, YieldRouterFuzz, AaveAdapterFuzz, YieldRouterInvariant
- **Integration tests** (`test/integration/`): Multi‑pool deployment, LP lifecycle, rebalancing
- **81 tests passing** across all suites- Fork tests validate multi‑pool initialization, deposits, withdrawals, rebalancing, and Aave integration.
- Tests can run on:
  - **Sepolia fork** (using `SEPOLIA_RPC_URL`)
  - **Anvil fork** (run Anvil with `--fork-url`)

## 11. Roadmap
- Implement accurate NAV valuation via oracles
- Store full `PoolKey` at initialization
- Add configurable strategy modules per pool
- Expand Aave support to more assets

---

**Sentinel Liquidity Protocol** — Autonomous liquidity management at scale with trust‑minimized safety guarantees.
