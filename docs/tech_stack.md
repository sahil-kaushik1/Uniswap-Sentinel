# Technology Stack & Dependencies

## Core Infrastructure

### 🦄 Uniswap v4

**Role:** The Liquidity Engine

The Sentinel Protocol is built as a **Uniswap v4 Hook** that can manage liquidity across ANY pool that attaches it.

#### Key Concepts

| Concept | Description | Sentinel Usage |
|---------|-------------|----------------|
| **PoolManager** | Singleton contract managing all pool state | Sentinel interacts via `modifyLiquidity`, `unlock` |
| **Hooks** | External contracts intercepting pool lifecycle | `SentinelHook` uses `beforeSwap` for safety |
| **PoolKey** | Identifies a unique pool (tokens, fee, tickSpacing, hook) | Converted to `PoolId` for state lookups |
| **PoolId** | Hash of PoolKey, used as mapping key | Per-pool state stored under PoolId |
| **Flash Accounting** | Transient storage for efficient token settlements | Used during `maintain()` rebalancing |

#### Hook Permissions Used
```solidity
Hooks.Permissions({
    beforeInitialize: true, // ✓ Register pool state
    beforeSwap: true,       // ✓ Circuit breaker (Hot Path)
    // All other hooks: false - minimal gas footprint
});
```

#### Multi-Pool Architecture
- **One Hook, Infinite Pools:** Single `SentinelHook` contract serves all pools
- **Pool-Specific State:** Each pool has isolated tick ranges, LP shares, oracle config
- **Unified Interface:** LPs interact with one contract regardless of which pool they use

**Documentation:** [Uniswap v4 Overview](https://docs.uniswap.org/contracts/v4/overview)

---

### ⚙️ Chainlink Automation + 🔗 Chainlink Data Feeds

**Role:** Automation Execution + Oracle Safety

Sentinel uses:
- **Chainlink Automation** for scheduling/event-driven execution of `maintain()` (cold path)
- **Chainlink Data Feeds** for oracle-based circuit breaking (hot path)

#### Components Used

| Component | Purpose | Sentinel Integration |
|-----------|---------|---------------------|
| **Chainlink Automation** | Task execution network | Executes `maintain(poolId, ...)` via whitelisted executor |
| **Automation Registry** | Authenticated execution | Hook `maintainer` set to Automation contract |
| **Chainlink Data Feeds** | Price oracles | Circuit breaker price validation |

#### Automation Capabilities (high level)
- **Triggers:** event-driven (e.g., `TickCrossed`) and/or cron/time
- **Dynamic inputs:** Chainlink Functions or resolver logic
- **Security:** whitelist the executor via the hook’s `maintainer`

**Documentation:**
- [Chainlink Automation Reference](./chainlink_automate.md)
- [Chainlink Developer Hub](https://dev.chain.link/)
- [Data Feeds (Sepolia)](https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1&search=&testnet=sepolia)

---

### 👻 Aave v3

**Role:** The Yield Source

Idle capital (liquidity not currently needed in the active range) is deposited to Aave v3 to earn lending interest.

#### Integration Pattern
```
┌─────────────────────────────────────────────────────────────┐
│                    CAPITAL FLOW                             │
├─────────────────────────────────────────────────────────────┤
│ LP Deposits → SentinelHook → Split Decision                │
│                                    │                        │
│                    ┌───────────────┴───────────────┐       │
│                    ▼                               ▼       │
│              Active Capital                  Idle Capital  │
│              (Uniswap v4 Pool)              (Aave v3)      │
│                    │                               │       │
│                    └───────────────┬───────────────┘       │
│                                    ▼                        │
│                    On Withdrawal: Combine + Transfer to LP  │
└─────────────────────────────────────────────────────────────┘
```

#### Aave v3 Key Features Used

| Feature | Description | Sentinel Benefit |
|---------|-------------|------------------|
| **Supply** | Deposit assets to earn yield | Idle capital generates passive income |
| **aTokens** | Interest-bearing ERC-20 tokens | Balance automatically accrues interest |
| **Withdraw** | Redeem aTokens for underlying | On-demand liquidity for rebalancing |
| **Multiple Assets** | Each pool can use different yield asset | ETH pools → aWETH, USDC pools → aUSDC |

#### Per-Pool Yield Configuration
Sentinel supports **dual-asset yield**. Each pool can assign Aave aTokens per pool token.

```solidity
struct PoolState {
    address aToken0; // aToken for currency0 (address(0) disables yield)
    address aToken1; // aToken for currency1 (address(0) disables yield)
    uint256 idle0;
    uint256 idle1;
    uint256 aave0;
    uint256 aave1;
    // ...
}
```

**Documentation:** [Aave v3 Developers](https://aave.com/docs/aave-v3/overview)

---

## LP Management System

### Share Token Design

Sentinel uses an internal share accounting system (not ERC-20) for capital efficiency:

```solidity
// Per-pool LP accounting
mapping(PoolId => mapping(address => uint256)) lpShares;
mapping(PoolId => uint256) totalShares;
```

#### Share Price Calculation
```
SharePrice = TotalNAV / TotalShares

Where TotalNAV = ActiveLiquidity + IdleCapital + AaveYield
```

#### LP Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Deposit: depositLiquidity(poolId, amount0, amount1)
    Deposit --> Holding: Receive shares
    Holding --> Earning: Yield accrues automatically
    Earning --> Holding: Share price increases
    Holding --> Withdraw: withdrawLiquidity(poolId, shares)
    Withdraw --> [*]: Receive tokens + yield
```

### NAV (Net Asset Value) Components

| Component | Source | Calculation |
|-----------|--------|-------------|
| **Active Liquidity** | Uniswap v4 Pool | Convert LP units to token amounts |
| **Idle Tokens** | Hook Contract Balance | Direct token balances held |
| **Aave Deposits** | aToken Balance | aToken.balanceOf(hook) |
| **Accrued Yield** | Aave Interest | aToken balance growth over time |

---

## Development Tools

### ⚒️ Foundry

**Role:** Smart Contract Framework

| Tool | Purpose | Usage |
|------|---------|-------|
| **Forge** | Compilation, testing, scripting | `forge build`, `forge test --fork-url` |
| **Cast** | CLI blockchain interaction | `cast call`, `cast send` |
| **Chisel** | Solidity REPL | Quick contract checks |
| **Anvil** | Local testnet | Fork testing with real state |

**Fork Testing Required:**
```bash
# All integration tests must run against forked Sepolia
forge test --fork-url $SEPOLIA_RPC_URL -vvv
```

**Documentation:** [Foundry Book](https://book.getfoundry.sh/)

---

### 📦 Library Dependencies

| Library | Purpose | Usage |
|---------|---------|-------|
| **Solmate** | Gas-optimized primitives | `ReentrancyGuard`, `SafeTransferLib` |
| **v4-core** | Uniswap v4 core contracts | `IPoolManager`, `PoolKey`, `BalanceDelta` |
| **v4-periphery** | Uniswap v4 periphery | `BaseHook`, `LiquidityAmounts` |
| **foundry-chainlink-toolkit** | Chainlink integrations | `AggregatorV3Interface` |

---

## Contract Architecture

### File Structure
```
src/
├── SentinelHook.sol              # Main multi-pool hook contract
│   ├── Per-pool state management
│   ├── LP deposit/withdraw
│   ├── beforeSwap (Hot Path)
│   └── maintain (Cold Path)
│
└── libraries/
    ├── OracleLib.sol             # Price deviation checks
    │   └── checkPriceDeviation(feed, price, maxBps)
    │
    ├── YieldRouter.sol           # Active/Idle split calculations
    │   └── calculateIdealRatio(balance, range, volatility)
    │
    └── AaveAdapter.sol           # Aave v3 integration
        ├── depositToAave(pool, asset, amount)
        ├── withdrawFromAave(pool, asset, amount)
        └── getAaveBalance(aToken, user)
```

### State Management Pattern

```solidity
// Global (immutable)
IPoolManager public immutable poolManager;
IPool public immutable aavePool;
address public maintainer;

// Per-Pool State (mutable, indexed by PoolId)
mapping(PoolId => PoolState) public poolStates;

struct PoolState {
    // Range Management
    int24 activeTickLower;
    int24 activeTickUpper;
    uint128 activeLiquidity;

    // Oracle & Safety
    address priceFeed;
    bool priceFeedInverted;
    uint256 maxDeviationBps;

    // Yield Configuration (dual-asset)
    address aToken0;
    address aToken1;
    uint256 idle0;
    uint256 idle1;
    uint256 aave0;
    uint256 aave1;

    // Cached Pool Config
    Currency currency0;
    Currency currency1;
    uint8 decimals0;
    uint8 decimals1;
    uint24 fee;
    int24 tickSpacing;

    // LP Accounting
    uint256 totalShares;

    // Status
    bool isInitialized;
}
```

---

## Verification & Safety

### Security Measures

| Layer | Protection | Implementation |
|-------|------------|----------------|
| **Hot Path** | Oracle circuit breaker | `OracleLib.checkPriceDeviation()` |
| **Cold Path** | Whitelisted automation executor | `maintainer` gate (Chainlink Automation contract) |
| **LP Funds** | Share-based accounting | Cannot withdraw more than owned |
| **Reentrancy** | ReentrancyGuard | All external-facing functions |
| **Access Control** | Role-based | `onlyMaintainer`, `onlyOwner` |

### Future Enhancements
- **Certora:** Formal verification of Hook invariants
- **Halmos:** Symbolic testing for critical paths
- **OpenZeppelin Defender:** Monitoring and alerting

---

## Network Deployments

### Sepolia Testnet (Live Deployment)

#### Core Contracts

| Contract | Address | Etherscan |
|----------|---------|----------|
| **Uniswap PoolManager** | `0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A` | [View](https://sepolia.etherscan.io/address/0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A) |
| **SentinelHook** | `0xC4C486Ab67d6e1bceA5DF14eBE2393EEBa0a6080` | [Verified ✅](https://sepolia.etherscan.io/address/0xC4C486Ab67d6e1bceA5DF14eBE2393EEBa0a6080#code) |
| **SwapHelper** | `0x176F75Dc4B71FB1f3808A789Fd36a94aE343836f` | [Verified ✅](https://sepolia.etherscan.io/address/0x176F75Dc4B71FB1f3808A789Fd36a94aE343836f#code) |
| **SentinelAutomation** | Deployed via DeployAutomationFull | — |
| **MockAave** | `0xDDfDfD8b5313BcB7B2c60a604AC777F806747D31` | [View](https://sepolia.etherscan.io/address/0xDDfDfD8b5313BcB7B2c60a604AC777F806747D31) |

#### Mock Tokens

| Token | Address | Etherscan |
|-------|---------|----------|
| **mETH** | `0x0e36C47a2cCf406ee12fac225D3Dd3Da465B859c` | [View](https://sepolia.etherscan.io/address/0x0e36C47a2cCf406ee12fac225D3Dd3Da465B859c) |
| **mUSDC** | `0x69810Addf24E88fbfc39Cd207f9EE794E3f7Ba33` | [View](https://sepolia.etherscan.io/address/0x69810Addf24E88fbfc39Cd207f9EE794E3f7Ba33) |
| **mWBTC** | `0x4cF23E8f91b86ee28A483d4ed28A6d8e2f3f7FaC` | [View](https://sepolia.etherscan.io/address/0x4cF23E8f91b86ee28A483d4ed28A6d8e2f3f7FaC) |
| **mUSDT** | `0x001Aa5ae632aF10e4bf068D17be11ee984a3B400` | [View](https://sepolia.etherscan.io/address/0x001Aa5ae632aF10e4bf068D17be11ee984a3B400) |

#### Aave aTokens (Mock)

| aToken | Address | Underlying |
|--------|---------|------------|
| **maETH** | `0xE7F85Ee92dd51bbAB76700DF0198C366c2F9D07B` | mETH |
| **maUSDC** | `0x2b9a68fa35bb2F6f88E90FB68265315B9dc8fb03` | mUSDC |
| **maWBTC** | `0x049Ad2fc1b7d105C6c7502Cd1E1EF8af74c59139` | mWBTC |
| **maUSDT** | `0x4197Aa46167911C3Ed87d023C0B704e597be8989` | mUSDT |

#### Deployed Pools

| Pool | Pool ID |
|------|--------|
| **mUSDC/mETH** | `0xd81e2f7075ef839ab7897b6609296cb71b4b951bab1215cff428e8e58d6d9c86` |
| **mWBTC/mETH** | `0xedaee9b731b3f6b66651873d25251d4164f053f6338e20cad90121735c7c25a1` |
| **mUSDT/mETH** | `0x6c92e8eeb40fe91f771ca88bd635f4df6124ddf26602b17b58dc78c35d821890` |

### Chainlink Oracles (Sepolia — Real Feeds)

| Feed | Address | Usage |
|------|---------|-------|
| ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | ETH pairs circuit breaker |
| BTC/USD | `0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43` | BTC pairs circuit breaker |
| USDC/USD | `0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E` | Stablecoin validation |
| BTC/ETH (Ratio) | `0xc596b108197aEF64c6d349DcA8515dFFe4615502` | WBTC/ETH pool (derived ratio oracle) |

For deterministic testing, use the on‑chain mock feed in [src/mocks/MockPriceFeed.sol](../src/mocks/MockPriceFeed.sol) and enable it via `USE_MOCK_FEEDS=true` in the deploy scripts.

### Chainlink Automation & Functions

| Component | Details |
|-----------|--------|
| **Automation Upkeep** | Register via automation.chain.link |
| **Functions Subscription** | Your subscription ID |
| **DON ID** | `fun-ethereum-sepolia-1` |
| **Functions Router** | `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0` |

---

## External Resources

- **Uniswap v4 Docs:** [https://docs.uniswap.org/contracts/v4/overview](https://docs.uniswap.org/contracts/v4/overview)
- **Uniswap v4 Hooks:** [https://docs.uniswap.org/contracts/v4/concepts/hooks](https://docs.uniswap.org/contracts/v4/concepts/hooks)
- **Aave v3 Docs:** [https://aave.com/docs/aave-v3/overview](https://aave.com/docs/aave-v3/overview)
- **Chainlink Data Feeds:** [https://docs.chain.link/data-feeds](https://docs.chain.link/data-feeds)
- **Foundry Book:** [https://book.getfoundry.sh/](https://book.getfoundry.sh/)
