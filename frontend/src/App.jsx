import React, { useMemo, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt
} from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { isAddress } from 'viem';

import { sentinelHookAbi } from './contracts/sentinelHook.js';
import { computePoolId, isZeroAddress, ZERO_ADDRESS } from './utils/poolId.js';

const defaultHookAddress =
  import.meta.env.VITE_SENTINEL_HOOK_ADDRESS || ZERO_ADDRESS;

function formatBigInt(value) {
  if (value === undefined || value === null) return '—';
  try {
    return value.toString();
  } catch {
    return '—';
  }
}

export default function App() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState(null);

  const [hookAddress, setHookAddress] = useState(defaultHookAddress);
  const [currency0, setCurrency0] = useState('');
  const [currency1, setCurrency1] = useState('');
  const [fee, setFee] = useState('3000');
  const [tickSpacing, setTickSpacing] = useState('60');
  const [hooks, setHooks] = useState(defaultHookAddress);

  const [amount0, setAmount0] = useState('0');
  const [amount1, setAmount1] = useState('0');
  const [sharesToWithdraw, setSharesToWithdraw] = useState('0');

  const poolId = useMemo(() => {
    if (!isAddress(currency0) || !isAddress(currency1) || !isAddress(hooks)) {
      return '';
    }

    try {
      return computePoolId({
        currency0,
        currency1,
        fee: Number(fee),
        tickSpacing: Number(tickSpacing),
        hooks
      });
    } catch {
      return '';
    }
  }, [currency0, currency1, fee, tickSpacing, hooks]);

  const isHookReady = isAddress(hookAddress);
  const isPoolReady = isHookReady && Boolean(poolId);

  const poolState = useReadContract({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: 'getPoolState',
    args: [poolId],
    query: { enabled: isPoolReady }
  });

  const sharePrice = useReadContract({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: 'getSharePrice',
    args: [poolId],
    query: { enabled: isPoolReady }
  });

  const lpPosition = useReadContract({
    address: hookAddress,
    abi: sentinelHookAbi,
    functionName: 'getLPPosition',
    args: [poolId, address || ZERO_ADDRESS],
    query: { enabled: isPoolReady && Boolean(address) }
  });

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash
  });

  const poolKey = useMemo(() => {
    if (!isAddress(currency0) || !isAddress(currency1) || !isAddress(hooks)) {
      return null;
    }

    return {
      currency0,
      currency1,
      fee: Number(fee),
      tickSpacing: Number(tickSpacing),
      hooks
    };
  }, [currency0, currency1, fee, tickSpacing, hooks]);

  const handleDeposit = async () => {
    if (!poolKey || !isHookReady) return;

    const parsedAmount0 = BigInt(amount0 || '0');
    const parsedAmount1 = BigInt(amount1 || '0');

    const value =
      (isZeroAddress(currency0) ? parsedAmount0 : 0n) +
      (isZeroAddress(currency1) ? parsedAmount1 : 0n);

    const hash = await writeContractAsync({
      address: hookAddress,
      abi: sentinelHookAbi,
      functionName: 'depositLiquidity',
      args: [poolKey, parsedAmount0, parsedAmount1],
      value
    });

    setTxHash(hash);
  };

  const handleWithdraw = async () => {
    if (!poolKey || !isHookReady) return;

    const parsedShares = BigInt(sharesToWithdraw || '0');

    const hash = await writeContractAsync({
      address: hookAddress,
      abi: sentinelHookAbi,
      functionName: 'withdrawLiquidity',
      args: [poolKey, parsedShares]
    });

    setTxHash(hash);
  };

  const state = poolState.data;
  const position = lpPosition.data;

  return (
    <div className="app">
      <header className="top-bar">
        <div>
          <div className="app-title">Sentinel Liquidity Protocol</div>
          <div className="app-subtitle">Advanced Liquidity Management Interface</div>
        </div>
        <ConnectButton showBalance />
      </header>

      <main className="grid">
        {/* Left Column: Configuration */}
        <div className="col-span-8 grid">
          <section className="sentinel-card col-span-12">
            <h2>Contract + Pool Key</h2>
            <p className="hint">
              Enter the SentinelHook address and the pool key. PoolId is derived
              using the Uniswap v4 $keccak256(abi.encode(poolKey))$ format.
            </p>

            <div className="grid-2">
              <label>
                SentinelHook address
                <input
                  value={hookAddress}
                  onChange={(event) => {
                    const next = event.target.value;
                    setHookAddress(next);
                    if (hooks === defaultHookAddress) {
                      setHooks(next);
                    }
                  }}
                  placeholder="0x..."
                />
              </label>
              <label>
                hooks address
                <input
                  value={hooks}
                  onChange={(event) => setHooks(event.target.value)}
                  placeholder="0x..."
                />
              </label>
            </div>

            <div className="grid-2" style={{ marginTop: '1rem' }}>
              <label>
                currency0
                <input
                  value={currency0}
                  onChange={(event) => setCurrency0(event.target.value)}
                  placeholder="0x..."
                />
              </label>
              <label>
                currency1
                <input
                  value={currency1}
                  onChange={(event) => setCurrency1(event.target.value)}
                  placeholder="0x..."
                />
              </label>
            </div>

            <div className="grid-2" style={{ marginTop: '1rem' }}>
              <label>
                fee (uint24)
                <input
                  value={fee}
                  onChange={(event) => setFee(event.target.value)}
                  placeholder="3000"
                />
              </label>
              <label>
                tick spacing (int24)
                <input
                  value={tickSpacing}
                  onChange={(event) => setTickSpacing(event.target.value)}
                  placeholder="60"
                />
              </label>
            </div>

            <div className="pill">
              <span>Derived PoolId</span>
              <strong>{poolId || '—'}</strong>
            </div>
          </section>

          <section className="sentinel-card col-span-6">
            <h2>Deposit Liquidity</h2>
            <p className="hint">
              Enter raw token amounts. Native ETH is sent as msg.value if applicable.
            </p>
            <div className="grid-1" style={{ display: 'grid', gap: '1rem' }}>
              <label>
                amount0
                <input
                  value={amount0}
                  onChange={(event) => setAmount0(event.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                amount1
                <input
                  value={amount1}
                  onChange={(event) => setAmount1(event.target.value)}
                  placeholder="0"
                />
              </label>
            </div>
            <button
              className="primary-btn"
              onClick={handleDeposit}
              disabled={!isPoolReady}
            >
              Deposit Liquidity
            </button>
          </section>

          <section className="sentinel-card col-span-6">
            <h2>Withdraw Liquidity</h2>
            <p className="hint">
              Burn your LP shares to redeem underlying assets.
            </p>
            <label>
              shares to withdraw
              <input
                value={sharesToWithdraw}
                onChange={(event) => setSharesToWithdraw(event.target.value)}
                placeholder="0"
              />
            </label>
            <button
              className="primary-btn"
              onClick={handleWithdraw}
              disabled={!isPoolReady}
              style={{ marginTop: 'auto' }}
            >
              Withdraw Liquidity
            </button>
          </section>
        </div>

        {/* Right Column: Status & State */}
        <div className="col-span-4 grid" style={{ alignContent: 'start' }}>

          <section className="sentinel-card col-span-12">
            <h2>System Status</h2>
            <div className="kv">
              <div className="kv-item">
                <span>Wallet Connected</span>
                <strong>{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}</strong>
              </div>
              <div className="kv-item">
                <span>Latest Transaction</span>
                <strong>{txHash ? `${txHash.slice(0, 10)}...` : '—'}</strong>
              </div>
              <div className="kv-item">
                <span>Transaction Status</span>
                <strong style={{ color: isConfirming ? '#fbbf24' : 'var(--accent-primary)' }}>
                  {isConfirming ? 'Confirming...' : 'Idle'}
                </strong>
              </div>
            </div>
          </section>

          <section className="sentinel-card col-span-12">
            <h2>Pool State</h2>
            <div className="kv">
              <div className="kv-item">
                <span>Initialized</span>
                <strong>
                  {state ? (state.isInitialized ? 'Yes' : 'No') : '—'}
                </strong>
              </div>
              <div className="kv-item">
                <span>Active Tick Range</span>
                <strong>
                  {state
                    ? `${state.activeTickLower} ↔ ${state.activeTickUpper}`
                    : '—'}
                </strong>
              </div>
              <div className="kv-item">
                <span>Active Liquidity</span>
                <strong>{formatBigInt(state?.activeLiquidity)}</strong>
              </div>
              <div className="kv-item">
                <span>Share Price (1e18)</span>
                <strong>{formatBigInt(sharePrice.data)}</strong>
              </div>
            </div>

            <div className="divider" />

            <h3>Your Position</h3>
            <div className="kv">
              <div className="kv-item">
                <span>Your Shares</span>
                <strong>{formatBigInt(position?.[0])}</strong>
              </div>
              <div className="kv-item">
                <span>Position Value</span>
                <strong>{formatBigInt(position?.[1])}</strong>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="footer">
        <div>Sentinel Liquidity Protocol</div>
        <div>Built for HackMoney 2026</div>
      </footer>
    </div>
  );
}
