# Multi-LP Share System - Visual Guide

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SENTINEL HOOK (Smart Contract)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            SHARE TRACKING SYSTEM                         │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                           │   │
│  │  totalLiquidity: 6000 USDC                               │   │
│  │  totalShares: 6000                                       │   │
│  │  Share Price: 1.0 USDC/share                             │   │
│  │                                                           │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │  LP Mappings:                                       │ │   │
│  │  │  lpShares[0xLP1] = 1000                             │ │   │
│  │  │  lpShares[0xLP2] = 2000                             │ │   │
│  │  │  lpShares[0xLP3] = 3000                             │ │   │
│  │  │                                                     │ │   │
│  │  │  lpIdleInAave[0xLP1] = 300                          │ │   │
│  │  │  lpIdleInAave[0xLP2] = 600                          │ │   │
│  │  │  lpIdleInAave[0xLP3] = 900                          │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                           │   │
│  │  registeredLPs = [0xLP1, 0xLP2, 0xLP3]                   │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                ┌──────────┴──────────┬──────────────────┐        │
│                ▼                     ▼                  ▼        │
│        ┌──────────────┐      ┌──────────────┐   ┌──────────────┐│
│        │ ACTIVE PATH  │      │ YIELD MGMT   │   │ HOT PATH     ││
│        │              │      │              │   │              ││
│        │ Uniswap v4   │      │ Aave Lending │   │ beforeSwap   ││
│        │ Pool [100,200]       │ Protocol     │   │ Circuit      ││
│        │              │      │              │   │ Breaker      ││
│        │ 4200 USDC    │      │ 1800 USDC    │   │              ││
│        └──────────────┘      └──────────────┘   │ Oracle Check ││
│                                                  │ Price Safety ││
│                                                  └──────────────┘│
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## LP Interaction Flow

```
                              ┌─────────────────┐
                              │  LP (User)      │
                              └────────┬────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
            ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
            │ DEPOSIT        │  │ HOLD SHARES    │  │ WITHDRAW       │
            ├────────────────┤  ├────────────────┤  ├────────────────┤
            │ depositLiquidity
(1000)      │ Share price    │  │ Earning yield  │  │ withdrawLiquidity(500)
            │ Receive: 1000  │  │ Auto compound  │  │ Share price: 1.01
            │ shares         │  │ No action      │  │ Receive: 505 USDC
            └────────────────┘  └────────────────┘  └────────────────┘
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                       │
                            (Share balance updated)
                            lpShares[lp] changes
                                       │
                                       ▼
                         New balance = shares × price
```

## Deposit Flow (Detailed)

```
┌─────────────────────────────────────────────────────────────┐
│  LP Calls: depositLiquidity(1000)                            │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │ Validation                   │
            │ if (amount == 0)             │
            │   revert InvalidDepositAmount
            └──────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │ Transfer Tokens              │
            │ IERC20.transferFrom(         │
            │   msg.sender,                │
            │   address(this),             │
            │   1000                       │
            │ )                            │
            └──────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────────┐
            │ Calculate Shares                 │
            │                                  │
            │ if (totalShares == 0):           │
            │   sharesToMint = 1000  (1:1)     │
            │ else:                            │
            │   sharesToMint =                 │
            │   (1000 * totalShares) /         │
            │     totalLiquidity               │
            └──────────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────────┐
            │ Register LP (if first time)      │
            │ isLPRegistered[msg.sender] ✓     │
            │ registeredLPs.push(msg.sender)   │
            │ emit LPRegistered(...)           │
            └──────────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────────┐
            │ Update State                     │
            │ lpShares[msg.sender] += shares   │
            │ totalShares += shares            │
            │ totalLiquidity += 1000           │
            └──────────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────────┐
            │ Emit Event & Return              │
            │ LPDeposited(lp, 1000, shares)    │
            │ return sharesReceived            │
            └──────────────────────────────────┘
```

## Rebalancing & Idle Distribution

```
                 ┌────────────────────────────┐
                 │ Chainlink CRE Detects      │
                 │ TickCrossed Event          │
                 └─────────────┬──────────────┘
                               │
                               ▼
                ┌──────────────────────────────┐
                │ maintain() Called by CRE     │
                │ volatility = 150 (LOW)       │
                └─────────────┬────────────────┘
                              │
                ┌─────────────┴──────────────┐
                ▼                            ▼
        ┌─────────────────┐       ┌─────────────────┐
        │ Calculate Split │       │ Withdraw All    │
        │                 │       │ Liquidity       │
        │ Low vol = 70%   │       │ totalBalance =  │
        │ active, 30% idle        │ 6000 USDC       │
        │                 │       │                 │
        └────────┬────────┘       └────────┬────────┘
                 │                        │
                 └────────────┬───────────┘
                              ▼
                ┌──────────────────────────────┐
                │ _distributeIdleCapitalToLPs  │
                │ (1800 USDC idle)             │
                └─────────────┬────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
    LP1 (16.67%)         LP2 (33.33%)         LP3 (50%)
    300 USDC             600 USDC             900 USDC
    │                    │                    │
    ▼                    ▼                    ▼
lpIdleInAave[LP1] = 300
lpIdleInAave[LP2] = 600
lpIdleInAave[LP3] = 900
    │                    │                    │
    └────────────────────┼────────────────────┘
                         │
                         ▼
                ┌──────────────────────────────┐
                │ AaveAdapter.depositToAave    │
                │ (1800 USDC) → Earning yield  │
                └──────────────────────────────┘
```

## Withdrawal Flow (With Yield)

```
Initial State:
├─ totalLiquidity: 6050 USDC (earned 50)
├─ totalShares: 6000
├─ Share Price: 6050/6000 = 1.00833
└─ LP1 has: 1000 shares × 1.00833 = 1008.33 USDC

LP1 Calls: withdrawLiquidity(1000)
│
├─ Check: lpShares[LP1] >= 1000? ✓ (has exactly 1000)
│
├─ Calculate balance:
│  lpBalance = (1000 × 6050) / 6000 = 1008.33 USDC
│
├─ Calculate idle share:
│  lpIdleShare = (1000 × lpIdleInAave[LP1]) / 1000
│             = lpIdleInAave[LP1] = 300 USDC
│
├─ Withdraw from Aave:
│  AaveAdapter.withdrawFromAave(aavePool, asset, 300)
│  lpIdleInAave[LP1] -= 300
│  idleCapitalInAave -= 300
│
├─ Transfer to LP:
│  IERC20.transfer(LP1, 1008.33)
│
├─ Update shares:
│  lpShares[LP1] = 0
│  totalShares = 5000
│  totalLiquidity = 5041.67
│
└─ Emit event & return 1008.33

Result:
LP1 received: 1008.33 USDC
Profit: 8.33 USDC (from yield)
```

## Share Price Evolution Over Time

```
Time    Event                        LP Deposits    Active    Idle    Total    Share Price
────────────────────────────────────────────────────────────────────────────────────────
T=0     LP1 deposits 1000            1000           1000      0       1000     1.0
        LP1 gets 1000 shares

T=0     LP2 deposits 2000            2000           2000      1000    3000     1.0
        LP2 gets 2000 shares

T=0     LP3 deposits 3000            3000           3000      2000    6000     1.0
        LP3 gets 3000 shares

T=1h    maintain() rebalances        0              4200      1800    6000     1.0
        70% active, 30% idle
        Idle → Aave

T=7d    Aave earns 1.73 USDC         0              4200      1800    6001.73  1.00029
        Fees earn 15 USDC

T=14d   maintain() rebalances        0              2400      3600    6001.73  1.00029
        40% active, 60% idle
        More idle → Aave

T=30d   More interest accrues        0              2400      3600    6031.73  1.00529
        (combined 31.73 from all sources)

T=30d   LP1 withdraws 1000 shares    -1000          (closed)  (closed) 5031.73 1.00529
        Gets: 1000 × 1.00529 = 1005.29

T=45d   Continued accrual            0              2400      3600    6050     1.21
        (share price increases)

T=45d   LP2 withdraws 1000 shares    -1000          (closed)  (closed) 5040     1.21
        Gets: 1000 × 1.21 = 1210
```

## Data Structure Visualization

```
Contract State at T=30d:

totalLiquidity: 6031.73 ┐
totalShares: 6000       ├─ Share Price = 1.00529
                        ┘

lpShares Mapping:               lpIdleInAave Mapping:
┌─────────────┬────────┐       ┌─────────────┬────────┐
│ Address     │ Shares │       │ Address     │ Amount │
├─────────────┼────────┤       ├─────────────┼────────┤
│ 0xLP1...    │ 1000   │       │ 0xLP1...    │ 303.17 │
│ 0xLP2...    │ 2000   │       │ 0xLP2...    │ 606.34 │
│ 0xLP3...    │ 3000   │       │ 0xLP3...    │ 909.52 │
└─────────────┴────────┘       └─────────────┴────────┘
Total: 6000                    Total: 1819.03 (approx)

registeredLPs Array:
[0xLP1..., 0xLP2..., 0xLP3...]

isLPRegistered Mapping:
0xLP1: true
0xLP2: true
0xLP3: true

Aave Balance:
aToken balance in hook: ~1819.03 USDC
(+accrued interest as it compounds)
```

## Event Timeline

```
TimeStamp    Event                   Parameters
──────────────────────────────────────────────────────────────────
Block 1      LPRegistered            LP1, timestamp
             LPDeposited             LP1, 1000, 1000, timestamp

Block 5      LPRegistered            LP2, timestamp
             LPDeposited             LP2, 2000, 2000, timestamp

Block 9      LPRegistered            LP3, timestamp
             LPDeposited             LP3, 3000, 3000, timestamp

Block 100    LiquidityRebalanced     (100, 200), 4200, 1800, tstamp
             IdleCapitalDeposited    Aave addr, 1800, tstamp

Block 200    TickCrossed             (100, 200), (now: 205), tstamp

Block 201    LiquidityRebalanced     (50, 250), 2400, 3600, tstamp
             IdleCapitalWithdrawn    Aave addr, 1800, tstamp
             IdleCapitalDeposited    Aave addr, 3600, tstamp

Block 500    LPWithdrawn             LP1, 1005.29, 1000, tstamp
```

