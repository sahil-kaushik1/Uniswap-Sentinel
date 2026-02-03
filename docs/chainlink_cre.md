# Chainlink Runtime Environment (CRE) Reference

## Overview
The **Chainlink Runtime Environment (CRE)** is an institutional-grade orchestration layer that replaces traditional off-chain bots with secure, decentralized workflows. In the Sentinel Liquidity Protocol, CRE acts as the **"Strategist"**, managing liquidity rebalancing and yield optimization without a single point of failure.

## Key Concepts

### 1. Workflows
A **Workflow** is a program that defines the logic for connecting distinct capabilities (e.g., triggers, data fetching, computation, and consensus). 
*   **Sentinel Role:** The Sentinel Workflow is triggered by on-chain events (`TickCrossed`) or time-based schedules. It computes the new optimal range and orchestrates the `maintain()` transaction.

### 2. Capabilities
Capabilities are the building blocks of a workflow.
*   **Triggers:** Listen for events on Uniswap v4.
*   **Actions:** Fetch price data, calculate volatility, and compute complex math (e.g., Black-Scholes).
*   **Consensus:** A Decentralized Oracle Network (DON) reaches agreement on the "Correct" rebalance parameters before any transaction is signed.
*   **Targets:** Submit the transaction to the destination chain.

### 3. Decentralized Oracle Networks (DONs)
Instead of a single server running a TypeScript bot, a **DON** executes the workflow. This ensures:
*   **Liveness:** If one node fails, others ensure the rebalance happens.
*   **Security:** Malicious actors cannot alter the strategy logic without compromising the entire network consensus.

## Why CRE for Sentinel?

| Feature | Legacy Bot (TypeScript) | Chainlink CRE |
| :--- | :--- | :--- |
| **Infrastructure** | Requires hosting (AWS/VPS) | Serverless, Decentralized |
| **Security** | Single Key Risk | Multi-party Computation / Consensus |
| **Trust** | "Trust me, I'm a bot" | Cryptographically Verified Execution |
| **Connectivity** | Manual RPC management | Native Interoperability |

## Conceptual Workflow Logic
```yaml
name: Sentinel Liquidity Manager
trigger:
  type: event
  contract: SentinelHook
  event: TickCrossed
  chain: Base

steps:
  - name: FetchMarketData
    action: http_get
    url: "https://api.chain.link/prices/ETH-USD"

  - name: CalculateDrift
    action: compute
    code: |
      // Volatility Logic
      const drift = abs(currentPrice - rangeCenter);
      const threshold = volatility * 2;
      return drift > threshold;

  - name: Consensus
    action: report_consensus
    input: [CalculateDrift.result]

  - name: ExecuteRebalance
    action: submit_tx
    if: Consensus.result == true
    target: SentinelHook.maintain()
```

## Resources
*   [Chainlink Platform Docs](https://docs.chain.link/)
*   [CRE Whitepaper / Architecture](https://chain.link/whitepaper)
