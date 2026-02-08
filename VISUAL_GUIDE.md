# Multi-Pool LP Management System - Visual Guide

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SENTINEL HOOK (Single Contract)                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                    POOL STATES (Per-Pool Isolation)                        │ │
│  ├────────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                             │ │
│  │  PoolId(mUSDC/mETH)         PoolId(mWBTC/mETH)        PoolId(mUSDT/mETH)   │ │
│  │  ┌──────────────────┐       ┌──────────────────┐      ┌──────────────────┐ │ │
│  │  │ Range: [100,200] │       │ Range: [-50,150] │      │ Range: [80,180]  │ │ │
│  │  │ ActiveLiq: 5000  │       │ ActiveLiq: 2000  │      │ ActiveLiq: 1500  │ │ │
│  │  │ TotalShares: 6000│       │ TotalShares: 2500│      │ TotalShares: 1800│ │ │
│  │  │ aToken0: aWETH   │       │ aToken0: aWBTC   │      │ aToken0: 0x0     │ │ │
│  │  │ aToken1: aUSDC   │       │ aToken1: aWETH   │      │ aToken1: aUSDC   │ │ │
│  │  │ Oracle: ETH/USD  │       │ Oracle: BTC/ETH  │      │ Oracle: ARB/USD  │ │ │
│  │  │                  │       │                  │      │                  │ │ │
│  │  │ LP Shares:       │       │ LP Shares:       │      │ LP Shares:       │ │ │
│  │  │  0xLP1: 1000     │       │  0xLP4: 800      │      │  0xLP1: 500      │ │ │
│  │  │  0xLP2: 2000     │       │  0xLP5: 1200     │      │  0xLP6: 1300     │ │ │
│  │  │  0xLP3: 3000     │       │  0xLP6: 500      │      │                  │ │ │
│  │  └──────────────────┘       └──────────────────┘      └──────────────────┘ │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐  │
│  │ HOT PATH            │  │ COLD PATH           │  │ LP INTERFACE            │  │
│  │ (beforeSwap)        │  │ (maintain)          │  │                         │  │
│  │                     │  │                     │  │ depositLiquidity(       │  │
│  │ • Oracle Check      │  │ • Chainlink Only    │  │   poolId, amt0, amt1)   │  │
│  │ • Emit TickCrossed  │  │ • Rebalance Range   │  │                         │  │
│  │ • <50k gas          │  │ • Aave Deposit/     │  │ withdrawLiquidity(      │  │
│  │                     │  │   Withdraw          │  │   poolId, shares)       │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                           │                    │
           ┌───────────────┴────────────────────┴───────────────┐
           ▼                        ▼                           ▼
    ┌─────────────────┐     ┌─────────────────┐         ┌─────────────────┐
    │ Uniswap v4      │     │ Aave v3         │         │ Chainlink       │
    │ PoolManager     │     │ Lending Pool    │         │ Platform        │
    │                 │     │                 │         │                 │
    │ • modifyLiq     │     │ • supply()      │         │ • Data Feeds    │
    │ • getSlot0      │     │ • withdraw()    │         │ • Chainlink Auto │
    └─────────────────┘     └─────────────────┘         └─────────────────┘
```

---

## Multi-Pool Asset Flow

```
                              ┌─────────────────────────────────────┐
                              │          LP DEPOSITS                 │
                              │  (Can deposit to multiple pools)     │
                              └─────────────┬───────────────────────┘
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              ▼                             ▼                             ▼
    ┌─────────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
    │ mUSDC/mETH Pool     │       │ mWBTC/mETH Pool     │       │ mUSDT/mETH Pool     │
    │                     │       │                     │       │                     │
    │ LP1: 1000 shares    │       │ LP4: 800 shares     │       │ LP1: 500 shares     │
    │ LP2: 2000 shares    │       │ LP5: 1200 shares    │       │ LP6: 1300 shares    │
    │ LP3: 3000 shares    │       │ LP6: 500 shares     │       │                     │
    │                     │       │                     │       │                     │
              Active: 70%         │       │ Active: 60%         │       │ Active: 80%         │
    │ Idle(USDC): To Aave │       │ Idle(WBTC): To Aave │       │ Idle(USDT): To Aave │
    │ Idle(ETH): To Aave  │       │ Idle(ETH): To Aave  │       │ Idle(USDC): To Aave │
    └──────────┬──────────┘       └──────────┬──────────┘       └──────────┬──────────┘
               │                             │                             │
               │    ┌────────────────────────┼────────────────────────┐    │
               │    │                        │                        │    │
               ▼    ▼                        ▼                        ▼    ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              AAVE v3 LENDING POOL                               │
    │                                                                                  │
    │   aUSDC: 2500                aWBTC: 0.2                 aARB:  500              │
    │   aWETH: 1.5                 aWETH: 0.8                 aUSDC: 300              │
    │   (Pool 1 Yield)             (Pool 2 Yield)             (Pool 3 Yield)          │
    │                                                                                  │
    │   *All idle assets from every pool are earning yield simultaneously            │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## LP Lifecycle (Per-Pool)

```
                        ┌─────────────────────────────┐
                        │     LP (e.g., 0xLP1)        │
                        └─────────────┬───────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ DEPOSIT to Pool A   │    │ HOLD SHARES         │    │ WITHDRAW from Pool A│
├─────────────────────┤    ├─────────────────────┤    ├─────────────────────┤
│                     │    │                     │    │                     │
│ depositLiquidity(   │    │ Shares accrue value │    │ withdrawLiquidity(  │
│   poolIdA,          │    │ as:                 │    │   poolIdA,          │
│   1000 USDC,        │    │                     │    │   500 shares        │
│   0.5 ETH           │    │ • Fees earned       │    │ )                   │
│ )                   │    │ • Aave yield        │    │                     │
│                     │    │ • Range efficiency  │    │ Returns:            │
│ Receives:           │    │                     │    │ • Proportional LP   │
│ 1500 shares         │    │ SharePrice =        │    │ • Proportional Aave │
│                     │    │   NAV / TotalShares │    │ • Including yield   │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      │
                      Same LP can participate in MULTIPLE pools
                      Each pool has INDEPENDENT share accounting
```

---

## Hot Path Flow (Per-Pool Oracle Check)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            SWAP on ETH/USDC Pool                                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    beforeSwap(sender, key, params, hookData)                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────────┐
                        │ PoolId = key.toId()         │
                        │ state = poolStates[poolId]  │
                        └─────────────┬───────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────────┐
                        │ Get Pool-Specific Oracle    │
                        │ oracle = state.priceFeed    │
                        │ (ETH/USD for this pool)     │
                        └─────────────┬───────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────────┐
                        │ OracleLib.checkPriceDeviation(
                        │   state.priceFeed,          │
                        │   poolPrice,                │
                        │   state.maxDeviationBps     │
                        │ )                           │
                        └─────────────┬───────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
        ┌───────────────────────┐           ┌───────────────────────┐
        │ Deviation > Max       │           │ Deviation OK          │
        │                       │           │                       │
        │ REVERT:               │           │ Check tick crossing   │
        │ PriceDeviationTooHigh │           │                       │
        │                       │           │ if (tick outside      │
        │ Swap blocked (safety) │           │     activeRange)      │
        └───────────────────────┘           │   emit TickCrossed(   │
                                            │     poolId, ticks)    │
                                            │                       │
                                            │ Allow swap            │
                                            └───────────────────────┘
```

---

## Cold Path Flow (Chainlink Multi-Pool Rebalancing)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CHAINLINK AUTOMATION EXECUTOR                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Event Monitor: Listening to ALL pools using SentinelHook                       │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │  TickCrossed(poolId: ETH/USDC, tickLower: 100, tickUpper: 200, current: 210)
│  │                                                                            │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 1: Fetch Pool Config                                                 │  │
│  │  getPoolState(poolId) → oracle, yieldCurrency, currentRange               │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 2: Parallel Node Computation                                         │  │
│  │                                                                            │  │
│  │  Node 1          Node 2          Node 3          Node N                   │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐            │  │
│  │  │Fetch data│    │Fetch data│    │Fetch data│    │Fetch data│            │  │
│  │  │Calculate │    │Calculate │    │Calculate │    │Calculate │            │  │
│  │  │range     │    │range     │    │range     │    │range     │            │  │
│  │  │[190,250] │    │[190,250] │    │[185,255] │    │[190,250] │            │  │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘            │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 3: DON Consensus (2/3 required)                                      │  │
│  │                                                                            │  │
│  │  Result: [190, 250] with volatility = 350 bps                             │  │
│  │  Consensus: 3/4 nodes agree ✓                                              │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                          │
└──────────────────────────────────────┼──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                  maintain(poolId, 190, 250, 350)                                │
│                                                                                  │
│  Only affects ETH/USDC pool - other pools unchanged                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        SENTINEL HOOK - _handleMaintain                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  1. state = poolStates[poolId]                                                  │
│                                                                                  │
│  2. Withdraw current liquidity from pool                                        │
│     modifyLiquidity(poolKey, -activeLiquidity)                                  │
│                                                                                  │
│  3. Withdraw from Aave (consolidate all capital)                                │
│     if (aave0 > 0) AaveAdapter.withdrawFromAave(aToken0, aave0)                │
│     if (aave1 > 0) AaveAdapter.withdrawFromAave(aToken1, aave1)                │
│                                                                                  │
│  4. Calculate new split                                                         │
│     (active, idle) = YieldRouter.calculateIdealRatio(                           │
│       totalBalance, newRange, volatility                                        │
│     )                                                                           │
│                                                                                  │
│  5. Deploy to new range                                                         │
│     modifyLiquidity(poolKey, +newLiquidity)                                     │
│     state.activeTickLower = 190                                                 │
│     state.activeTickUpper = 250                                                 │
│                                                                                  │
│  6. Deposit idle to Aave                                                        │
│     if (aToken0 != 0) AaveAdapter.depositToAave(currency0, idle0)              │
│     if (aToken1 != 0) AaveAdapter.depositToAave(currency1, idle1)              │
│                                                                                  │
│  7. Emit LiquidityRebalanced(poolId, 190, 250, active, idle)                    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Share Price Evolution (Per-Pool)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          ETH/USDC POOL SHARE PRICE                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Time    Event                    TotalNAV    TotalShares   SharePrice         │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  T=0     Pool initialized         0           0             1.00               │
│                                                                                  │
│  T=1     LP1 deposits 1000 USDC   1000        1000          1.00               │
│          LP2 deposits 2000 USDC   3000        3000          1.00               │
│          LP3 deposits 3000 USDC   6000        6000          1.00               │
│                                                                                  │
│  T=1h    maintain() rebalances    6000        6000          1.00               │
│          70% active, 30% to Aave  (4200 pool + 1800 Aave)                       │
│                                                                                  │
│  T=7d    Fees + Aave yield        6050        6000          1.0083             │
│          NAV increased by 50      (LP value = shares × 1.0083)                  │
│                                                                                  │
│  T=14d   maintain() rebalances    6100        6000          1.0167             │
│          Price moved, optimize    (wider range due to vol)                      │
│                                                                                  │
│  T=30d   LP1 withdraws 500 shares 5600        5500          1.0167             │
│          Receives 508 USDC worth  (500 × 1.0167 = 508.35)                       │
│                                                                                  │
│  T=60d   Continued yield          5750        5500          1.0454             │
│          Share price grows        LP2 now worth 2091, LP3 worth 3136            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

                    MEANWHILE, WBTC/ETH POOL HAS DIFFERENT TRAJECTORY
                    (Independent share price, independent LPs)

┌─────────────────────────────────────────────────────────────────────────────────┐
│                          WBTC/ETH POOL SHARE PRICE                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Time    Event                    TotalNAV    TotalShares   SharePrice         │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  T=5     Pool initialized         0           0             1.00               │
│          LP4 deposits 0.5 ETH     1000        1000          1.00               │
│          LP5 deposits 0.75 ETH    2500        2500          1.00               │
│                                                                                  │
│  T=7d    High volatility          2400        2500          0.96               │
│          IL from price swing      (some IL, Aave yield helped)                  │
│                                                                                  │
│  T=30d   Market recovered         2700        2500          1.08               │
│          Good fee income          (volatile = more fees)                        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Per-Pool State Structure Visualization

```
Contract: SentinelHook
├── poolManager: IPoolManager (immutable)
├── aavePool: IPool (immutable)
├── maintainer: address
├── owner: address
│
└── poolStates: mapping(PoolId => PoolState)
    │
    ├── PoolId(mUSDC/mETH) => PoolState
    │   ├── activeTickLower: 100
    │   ├── activeTickUpper: 200
    │   ├── activeLiquidity: 5000e18
    │   ├── priceFeed: 0x694A...5306 (ETH/USD)
    │   ├── priceFeedInverted: false
    │   ├── maxDeviationBps: 500
    │   ├── aToken0: aWETH
    │   ├── aToken1: aUSDC
    │   ├── idle0: 0.5e18 (WETH)
    │   ├── idle1: 1500e6 (USDC)
    │   ├── aave0: 1.5e18 (aWETH shares)
    │   ├── aave1: 2500e6 (aUSDC shares)
    │   ├── currency0: WETH
    │   ├── currency1: USDC
    │   ├── decimals0: 18
    │   ├── decimals1: 6
    │   ├── fee: 3000
    │   ├── tickSpacing: 60
    │   ├── totalShares: 6000e18
    │   └── isInitialized: true
    │
    ├── PoolId(mWBTC/mETH) => PoolState
    │   ├── activeTickLower: -50
    │   ├── activeTickUpper: 150
    │   ├── activeLiquidity: 2000e18
    │   ├── priceFeed: 0x... (BTC/ETH)
    │   ├── priceFeedInverted: false
    │   ├── maxDeviationBps: 800 (higher for volatile pair)
    │   ├── aToken0: aWBTC
    │   ├── aToken1: aWETH
    │   ├── idle0: 0.01e8 (WBTC)
    │   ├── idle1: 0.3e18 (WETH)
    │   ├── aave0: 0.2e8 (aWBTC shares)
    │   ├── aave1: 0.8e18 (aWETH shares)
    │   ├── currency0: WBTC
    │   ├── currency1: WETH
    │   ├── decimals0: 8
    │   ├── decimals1: 18
    │   ├── fee: 3000
    │   ├── tickSpacing: 60
    │   ├── totalShares: 2500e18
    │   └── isInitialized: true
    │
    └── PoolId(mUSDT/mETH) => PoolState
        ├── ... (similar structure)
        └── isInitialized: true
```

---

## Event Timeline (Multi-Pool)

```
Block    Event                           Pool        Parameters
─────────────────────────────────────────────────────────────────────────────────
1000     PoolInitialized                ETH/USDC    oracle=ETH/USD, aToken0=aWETH, aToken1=aUSDC
1005     PoolInitialized                WBTC/ETH    oracle=BTC/ETH, aToken0=aWBTC, aToken1=aWETH
1010     LPDeposited                    ETH/USDC    LP1, 1000, 0.5, 1500 shares
1015     LPDeposited                    WBTC/ETH    LP4, 0.02, 0.3, 800 shares
1020     LPDeposited                    ETH/USDC    LP2, 2000, 1.0, 2500 shares
1050     TickCrossed                    ETH/USDC    range=[100,200], current=205
1051     LiquidityRebalanced            ETH/USDC    newRange=[180,280], active=4500
1051     IdleCapitalDeposited           ETH/USDC    Aave, 1500
1100     TickCrossed                    WBTC/ETH    range=[-50,150], current=-60
1101     LiquidityRebalanced            WBTC/ETH    newRange=[-100,100], active=1800
1500     LPWithdrawn                    ETH/USDC    LP1, 500 shares, 510 USDC worth
2000     PoolInitialized                ARB/USDC    oracle=ARB/USD, yield=USDC
2010     LPDeposited                    ARB/USDC    LP1, 500, 0, 500 shares
         (LP1 now in TWO pools)
```

---

## Security Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TRUST BOUNDARIES                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  LEVEL 1: IMMUTABLE CONTRACT CODE                                        │    │
│  │                                                                          │    │
│  │  ✓ Oracle deviation checks ALWAYS run on beforeSwap                     │    │
│  │  ✓ LP can ONLY withdraw their own shares                                │    │
│  │  ✓ Range bounds validated (min/max tick width)                          │    │
│  │  ✓ Reentrancy protection on all external functions                      │    │
│  │                                                                          │    │
│  │  CHAINLINK CANNOT bypass these checks                                    │    │
│  │  Owner CANNOT bypass these checks                                        │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  LEVEL 2: DON CONSENSUS                                                  │    │
│  │                                                                          │    │
│  │  ✓ 2/3 nodes must agree on rebalance parameters                         │    │
│  │  ✓ Cryptographic verification of computation                            │    │
│  │  ✓ No single key can submit arbitrary transactions                      │    │
│  │                                                                          │    │
│  │  Single node CANNOT submit maintain() alone                              │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  LEVEL 3: CONFIGURABLE PARAMETERS                                        │    │
│  │                                                                          │    │
│  │  • maxDeviationBps (per pool) - set at initialization                   │    │
│  │  • Range width bounds - set in YieldRouter                               │    │
│  │  • Yield protocol - Aave v3 (hardcoded for now)                          │    │
│  │                                                                          │    │
│  │  Owner CAN update maintainer address                                     │    │
│  │  Owner CAN do emergency Aave withdrawal                                  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---


---

## Deployment & Initialization Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STEP 1: HOOK DEPLOYMENT (Mining)                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Goal: Deploy SentinelHook at address with flags:                              │
│         0010 0000 ... 0000 0100 (BeforeSwap | BeforeInitialize)                 │
│                                                                                  │
│   ┌────────────────────────┐       ┌───────────────────────────────────────┐    │
│   │ HookMiner (Off-Chain)  ├──────►│ Find salt for CREATE2                 │    │
│   └────────────────────────┘       │ Result: 0x... (Valid Flag Address)    │    │
│                                    └──────────────────┬────────────────────┘    │
│                                                       │                         │
│                                                       ▼                         │
│                                    ┌───────────────────────────────────────┐    │
│                                    │ Deploy SentinelHook(manager, aave...) │    │
│                                    │ at: 0x[ValidFlags]...                 │    │
│                                    └───────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     STEP 2: MULTI-POOL INITIALIZATION                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Deployer/Owner calls initializePool() for EACH pair they want to manage       │
│                                                                                  │
│   ┌───────────────────────┐     ┌───────────────────────┐                       │
│   │ Initialize ETH/USDC   │     │ Initialize LINK/USDC  │                       │
│   ├───────────────────────┤     ├───────────────────────┤                       │
│   │ Key: {ETH, USDC,...}  │     │ Key: {LINK, USDC...}  │                       │
│   │ Oracle: ETH Feed      │     │ Oracle: LINK Feed     │                       │
│   │ aToken0: aWETH        │     │ aToken0: aLINK        │                       │
│   │ aToken1: aUSDC        │     │ aToken1: aUSDC        │                       │
│   │ MaxDev: 5% (500bps)   │     │ MaxDev: 8% (800bps)   │                       │
│   └───────────┬───────────┘     └───────────┬───────────┘                       │
│               │                             │                                   │
│               ▼                             ▼                                   │
│   ┌───────────────────────┐     ┌───────────────────────┐                       │
│   │ Sentinel Storage      │     │ Sentinel Storage      │                       │
│   │ poolStates[PoolId(A)] │     │ poolStates[PoolId(B)] │                       │
│   │ (Initialized = true)  │     │ (Initialized = true)  │                       │
│   └───────────────────────┘     └───────────────────────┘                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---


---

## Core Libraries & Internal Logic

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           INTERNAL COMPONENT LOGIC                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────┐      ┌────────────────────────┐                      │
│  │ OracleLib (Hot Path)   │      │ YieldRouter (Math)     │                      │
│  ├────────────────────────┤      ├────────────────────────┤                      │
│  │ Safety Circuit Breaker │      │ Capital Allocation     │                      │
│  │                        │      │                        │                      │
│  │ checkPriceDeviation(   │      │ calculateIdealRatio(   │                      │
│  │   feed,                │      │   totalBal,            │                      │
│  │   poolPrice,           │      │   rangeWidth,          │                      │
│  │   maxBps               │      │   volatility           │                      │
│  │ )                      │      │ )                      │                      │
│  │                        │      │                        │                      │
│  │ -> Reverts if unsafe   │      │ -> Returns (Act, Idle) │                      │
│  └────────────────────────┘      └────────────────────────┘                      │
│                                                                                  │
│                        ┌────────────────────────┐                                │
│                        │ AaveAdapter (Yield)    │                                │
│                        ├────────────────────────┤                                │
│                        │ External Integration   │                                │
│                        │                        │                                │
│                        │ depositToAave()        │                                │
│                        │ withdrawFromAave()     │                                │
│                        │ getAaveBalance()       │                                │
│                        │                        │                                │
│                        │ *Handles ERC20         │                                │
│                        │ approvals & safe ops   │                                │
│                        └────────────────────────┘                                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

*Sentinel Liquidity Protocol - Visual Architecture Guide*
