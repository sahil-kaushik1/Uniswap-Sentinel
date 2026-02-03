# Technology Stack & Dependencies

## Core Infrastructure

### 🦄 Uniswap v4
**Role:** The Liquidity Engine.
The protocol is built as a **Uniswap v4 Hook**.
*   **Hooks:** The `SentinelHook` intercepts `beforeSwap` to enforce safety.
*   **PoolManager:** Manages the actual token balances.
*   **Documentation:** [Uniswap v4 Concepts](https://docs.uniswap.org/contracts/v4/concepts/V4-overview)

### 🔗 Chainlink Platform
**Role:** The Decentralized "Backend".
We rely on Chainlink for off-chain computation and data integrity.
*   **Chainlink Runtime Environment (CRE):** Orchestrates the strategy workflows (see [CRE Reference](./chainlink_cre.md)).
*   **Decentralized Oracle Networks (DONs):** Execute the consensus logic for rebalancing.
*   **Chainlink Data Feeds:** Provide the "True Price" for the on-chain circuit breaker.
*   **Documentation:** [Chainlink Developer Hub](https://dev.chain.link/)

### 👻 Aave v3
**Role:** The Yield Source.
Idle capital (liquidity not currently needed active in the pool) is routed here.
*   **Supply/Withdraw:** We interact directly with the Aave `IPool` to earn lending interest.
*   **aTokens:** The protocol holds interest-bearing tokens (e.g., aUSDC) as collateral.
*   **Documentation:** [Aave V3 Developers](https://docs.aave.com/developers/)

## Development Tools

### ⚒️ Foundry
**Role:** Smart Contract Framework.
*   **Forge:** Used for compilation (`forge build`), testing (`forge test`), and scripting.
*   **Cast:** Used for CLI interaction with the blockchain.
*   **Chisel:** Solidity REPL for quick checks.
*   **Documentation:** [Foundry Book](https://book.getfoundry.sh/)

### 📦 Solmate
**Role:** Gas-Optimized Libraries.
We use Solmate for efficient arithmetic and token interactions where standard OpenZeppelin implementations might be too heavy.
*   **Documentation:** [Solmate GitHub](https://github.com/transmissions11/solmate)

## Verification & Safety
*   **Certora (Future):** For formal verification of the Hook's invariants.
*   **Halmos:** Symbolic testing for the critical `beforeSwap` path.
