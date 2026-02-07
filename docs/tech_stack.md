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
| **SentinelHook** | `0x386bc633421dD0416E357ae1c34177568dA52080` | [Verified ✅](https://sepolia.etherscan.io/address/0x386bc633421dD0416E357ae1c34177568dA52080#code) |
| **SwapHelper** | `0x8B6e80F6b28b07b16E532A647d00c64bDb6c29d8` | [Verified ✅](https://sepolia.etherscan.io/address/0x8B6e80F6b28b07b16E532A647d00c64bDb6c29d8#code) |
| **SentinelAutomation** | `0xa0ce362C6D2D482d7147E6a1F98706eA9Ac82Ffb` | [Verified ✅](https://sepolia.etherscan.io/address/0xa0ce362C6D2D482d7147E6a1F98706eA9Ac82Ffb#code) |
| **MockAave** | `0x5e541e338E73BCdAD9cD4F61cd6DD4e6434B214e` | [View](https://sepolia.etherscan.io/address/0x5e541e338E73BCdAD9cD4F61cd6DD4e6434B214e) |

#### Mock Tokens

| Token | Address | Etherscan |
|-------|---------|----------|
| **mETH** | `0xbb8Db005968AD75dc1521c61a2bAC6e7CB5C42d5` | [View](https://sepolia.etherscan.io/address/0xbb8Db005968AD75dc1521c61a2bAC6e7CB5C42d5) |
| **mUSDC** | `0xaA19cF38Ec024e47542e0aFfb029784486317d3A` | [View](https://sepolia.etherscan.io/address/0xaA19cF38Ec024e47542e0aFfb029784486317d3A) |
| **mWBTC** | `0xb75fDB4A4b685429447B54972e089e1c9b239fCF` | [View](https://sepolia.etherscan.io/address/0xb75fDB4A4b685429447B54972e089e1c9b239fCF) |
| **mUSDT** | `0x19180e57e6640f9A51dEF8c8a7137c78e75704D2` | [View](https://sepolia.etherscan.io/address/0x19180e57e6640f9A51dEF8c8a7137c78e75704D2) |

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
| **mUSDC/mETH** | `0xebd975263c29db205914ec03bc0bb7b43c34ab833ae24c7f521a4c0edc3eb8f5` |
| **mWBTC/mETH** | `0xb86d98b048c5f61f5b9e8a7c7d769b0971aba0948777e349a21314e1429f9266` |
| **mUSDT/mETH** | `0x42cc361675a03875472eb6f267b516a0f88a4cafe0d7265905b761f2fbded3d6` |

### Chainlink Oracles (Sepolia — Real Feeds)

| Feed | Address | Usage |
|------|---------|-------|
| ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | ETH pairs circuit breaker |
| BTC/USD | `0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43` | BTC pairs circuit breaker |
| USDC/USD | `0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E` | Stablecoin validation |
| BTC/ETH (Ratio) | `0xc596b108197aEF64c6d349DcA8515dFFe4615502` | WBTC/ETH pool (derived ratio oracle) |

### Chainlink Automation & Functions

| Component | Details |
|-----------|--------|
| **Automation Upkeep** | "hackmoney-1" — Active, 5 LINK funded, gas limit 500,000 |
| **Functions Subscription** | #6244 — 7 LINK funded |
| **DON ID** | `fun-ethereum-sepolia-1` |
| **Functions Router** | `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0` |

---

## External Resources

- **Uniswap v4 Docs:** [https://docs.uniswap.org/contracts/v4/overview](https://docs.uniswap.org/contracts/v4/overview)
- **Uniswap v4 Hooks:** [https://docs.uniswap.org/contracts/v4/concepts/hooks](https://docs.uniswap.org/contracts/v4/concepts/hooks)
- **Aave v3 Docs:** [https://aave.com/docs/aave-v3/overview](https://aave.com/docs/aave-v3/overview)
- **Chainlink Data Feeds:** [https://docs.chain.link/data-feeds](https://docs.chain.link/data-feeds)
- **Foundry Book:** [https://book.getfoundry.sh/](https://book.getfoundry.sh/)
