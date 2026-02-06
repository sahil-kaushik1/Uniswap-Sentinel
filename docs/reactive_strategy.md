# Reactive Rebalancing Strategy (Sentinel Standard)

The **Reactive Strategy** is the core decision-making logic used by the Sentinel Chainlink Automation + Functions flow. It aims to maximize fee capture while minimizing rebalancing costs by dynamically adjusting range width based on market conditions.

## 1. The Core Philosophy
> "Don't predict where the price *will* go. Adapt to where the price *is* and how fast it is moving."

- **Center:** Always anchors to the **Current Market Price** (Oracle).
- **Width:** Expands or contracts based on **Volatility** (Past).

---

## 2. Inputs (Data Sources)

The off-chain agent (Chainlink Functions) gathers three key data points before making a decision:

### A. Current Price ($P_{current}$)
*   **Source:** Chainlink Oracle (e.g., ETH/USD).
*   **Purpose:** Determines the **Center** of the new range.
*   *Why Oracle?* Oracles are manipulation-resistant. Using the Uniswap pool's internal price as a reference can lead to "sandwich attacks" during rebalancing.

### B. Volatility Index ($V_{vol}$)
*   **Source:** Historical Price Data (e.g., last 24 hours of Oracle pings).
*   **Metric:** We use **ATR (Average True Range)** or Standard Deviation (~Bollinger Bands).
*   **Purpose:** Determines the **Width** of the new range.
    *   *Low Volatility:* Price is stable → Use **Narrow Range** (Concentrated Liquidity = Higher Multiplier).
    *   *High Volatility:* Price is thrashing → Use **Wide Range** (Safety = Lower Impermanent Loss Risk).

### C. Gas Price ($G_{gwei}$)
*   **Source:** Chain RPC.
*   **Purpose:** Determines the **Cost Threshold**. We only rebalance if `ProjectedFees > GasCost`.

---

## 3. The Algorithm (Logic Flow)

### Step 1: Calculate Dynamic Range Width ($W$)
Instead of a fixed percentage (e.g., always +/- 5%), we calculate $W$ dynamically:

$$ W = BaseWidth \times (1 + V_{vol\_factor}) $$

*   **Base Width:** The minimum safe width (e.g., 2%).
*   **Vol Factor:** A multiplier derived from ATR.
    *   If ATR is low (Quiet Weekend): $W = 2\%$.
    *   If ATR is high (Market Crash): $W = 10\%$.

### Step 2: Set New Bounds
$$ Tick_{Lower} = P_{current} \times (1 - W) $$
$$ Tick_{Upper} = P_{current} \times (1 + W) $$

### Step 3: Drift Check (The "Do Nothing" Filter)
We compare the *New Ideal Range* with the *Current Active Range* on-chain.

*   **Logic:**
    > If (Current Price is still within `SafeZone` of Old Range) AND (Volatility hasn't spiked): **DO NOTHING.**

    *   *Why?* Moving liquidity costs gas ($20-$50). We don't move just because the price shifted 0.1%. We drift until we hit a "Soft Limit" (e.g., 80% to the edge).

### Step 4: Execution
If the **Drift Check** fails (Price is near edge OR Volatility spiked), we call `SentinelHook.maintain()`:

1.  **Withdraw** liquidity + Yield from Aave.
2.  **Deploy** to new $[Tick_{Lower}, Tick_{Upper}]$.
3.  **Deposit** remaining inventory to Aave.

---

## 4. Example Scenarios

### Scenario A: The "Sideways" Market (Low Volatility)
*   **Market:** ETH is boring, moving between $2500 and $2550.
*   **Agent Action:**
    *   Calculates Low Volatility.
    *   Sets **Tight Range** ($2450 - $2600).
    *   **Result:** You capture **Maximum Fees** (20x-50x multiplier vs v2) because your capital is highly concentrated.

### Scenario B: The "Breakout" (High Volatility)
*   **Market:** News drops. ETH pumps from $2550 to $2700 in 1 hour.
*   **Agent Action:**
    *   Price hits Upper Limit ($2600).
    *   Agent detects High Volatility (ATR spikes).
    *   **Rebalance Priority:** WIDEN the range.
    *   Sets **Wide Range** ($2500 - $2900).
    *   **Result:** Safety. The wide range ensures you don't get "booted out" of position 10 minutes later if the price whipsaws. You accept lower fee multiplier for higher reliability.

---

## 5. Summary of Advantages

| Feature | Predictive Strategy | **Reactive Strategy (This One)** |
| :--- | :--- | :--- |
| **Reliability** | Low (Models fail) | **High** (Follows math) |
| **Risk** | High (Speculative) | **Low** (Defensive) |
| **Maintenance** | Complex (AI Models) | **Simple** (Math Formulas) |
| **Performance** | High Upside / High Downside | **Consistent Yield** |

This strategy basically automates what a professional Market Maker does manually: **Tighten up when calm, loosen up when chaotic.**

---

## 6. Detailed Mathematical Example

Let's walk through the lung "breathing" logic with real numbers.

### Baseline Constants
*   **Base Width:** 2% (0.02)
*   **Target Fee Multiplier:** 50x (vs full range)

### Scenario 1: "The Quiet Weekend" (Low Volatility)
*   **Current ETH Price ($P$):** $2,000
*   **ATR (Average True Range, 24h):** $20 (Very stable, 1% movement)
*   **Logic:**
    1.  **Calculate Vol Factor:** $ATR / P = 20 / 2000 = 0.01$ (1%)
    2.  **Determine Range Width:**
        $$ Width = Base (2\%) + VolFactor (1\%) = 3\% $$
    3.  **Calculate Ticks:**
        *   $Lower = 2000 \times (1 - 0.03) = \$1,940$
        *   $Upper = 2000 \times (1 + 0.03) = \$2,060$
*   **Outcome:**
    *   **Range:** \$1,940 - \$2,060 (+/- 3%)
    *   **Efficiency:** Very High. You capture 100% of fees in this narrow band.
    *   **Gas:** Low. Price rarely hits 1940 or 2060, so you don't rebalance.

### Scenario 2: "The FOMC Meeting" (High Volatility)
*   **Current ETH Price ($P$):** $2,000
*   **ATR (Average True Range, 24h):** $200 (Violent, 10% movement swings)
*   **Logic:**
    1.  **Calculate Vol Factor:** $ATR / P = 200 / 2000 = 0.10$ (10%)
    2.  **Determine Range Width:**
        $$ Width = Base (2\%) + VolFactor (10\%) = 12\% $$
    3.  **Calculate Ticks:**
        *   $Lower = 2000 \times (1 - 0.12) = \$1,760$
        *   $Upper = 2000 \times (1 + 0.12) = \$2,240$
*   **Outcome:**
    *   **Range:** \$1,760 - \$2,240 (+/- 12%)
    *   **Efficiency:** Lower. Your liquidity is spread thin.
    *   **Safety:** **Critical.** Examples:
        *   If Price crashes to $1,800 (-10%), you are **Still In Range**.
        *   If you had stayed with the "Scenario 1" range ($1,940), you would be 100% idle (holding 100% ETH) and suffering massive Impermanent Loss.
        *   By "Inhaling" (Widening) to $1,760, you survived the crash, kept earning fees, and avoided a panic rebalance.

### Comparison Table

| Metric | Scenario 1 (Quiet) | Scenario 2 (Volatile) |
| :--- | :--- | :--- |
| **ATR** | $20 | $200 |
| **Range Width** | +/- 3% | +/- 12% |
| **Lower Price** | $1,940 | $1,760 |
| **Liquidity Density** | High (Concentrated) | Low (Diluted) |
| **Fee Capture** | Max | Medium |
| **Gas Spend** | Low | Low (Prevents Churn) |

**Conclusion:** The agent successfully prioritized **Profit** in Scenario 1 and **Survival** in Scenario 2.
