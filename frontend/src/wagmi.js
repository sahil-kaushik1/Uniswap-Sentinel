import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  mainnet,
  sepolia,
  base,
  baseSepolia,
  arbitrumSepolia
} from 'wagmi/chains';
import { http } from 'viem';

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  'SET_WALLETCONNECT_PROJECT_ID';

export const supportedChains = [sepolia, baseSepolia, arbitrumSepolia, base, mainnet];

export const wagmiConfig = getDefaultConfig({
  appName: 'Sentinel Liquidity Protocol',
  projectId,
  chains: supportedChains,
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http()
  }
});
