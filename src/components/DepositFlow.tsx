"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, lazy, Suspense } from "react";
import { baseSepolia } from "viem/chains";
import { CONTRACTS } from "@/lib/constants";

// Error boundary component to catch LI.FI widget crashes gracefully
import React from "react";

class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center gap-3 min-h-[300px]">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">Cross-chain widget unavailable</p>
          <p className="text-xs text-gray-400 max-w-[260px]">
            Use the testnet faucets below to get free USDC directly, or send USDC to your wallet address from another wallet.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy load the heavy LI.FI widget
const LiFiWidget = lazy(() =>
  import("@lifi/widget").then((mod) => ({ default: mod.LiFiWidget }))
);

export default function DepositFlow() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [copied, setCopied] = useState(false);

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4">Please connect wallet to continue.</div>;
  }

  const address = wallets[0].address;

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const widgetConfig = {
    integrator: 'zkpay',
    fee: 0.01, // 1% commission
    toChain: baseSepolia.id,
    toToken: CONTRACTS.USDC,
    toAddress: {
      address: address,
      chainType: 'EVM' as const,
      name: 'ZkPay Embedded Wallet'
    },
    variant: 'compact' as const,
    theme: {
      palette: {
        primary: { main: '#000000' },
        secondary: { main: '#8E8E93' },
        background: { default: '#FFFFFF', paper: '#F2F2F2' },
        text: { primary: '#000000', secondary: '#5d5e63' }
      },
      shape: {
        borderRadius: 4,
        borderRadiusSecondary: 4
      },
      typography: {
        fontFamily: 'Hanken Grotesk, sans-serif'
      }
    }
  };

  return (
    <div className="flex flex-col gap-6">

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-4 shadow-sm w-full">
        <div className="flex items-center gap-3 w-full border-b border-gray-100 pb-3">
          <div className="w-8 h-8 bg-gray-100 flex items-center justify-center rounded">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m2 9 3-3 3 3"/>
              <path d="M13 18L15 21L17 18"/>
              <path d="M5 6v11a4 4 0 0 0 4 4h6"/>
              <path d="M19 18V7a4 4 0 0 0-4-4H9"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold font-['Inter']">Cross-Chain Deposit</h2>
        </div>
        <p className="text-sm text-gray-500 font-['Hanken_Grotesk'] text-left w-full mb-2">
          Bridge tokens directly to your ZkPay wallet from any chain.
        </p>
        
        {/* LI.FI Widget Container — wrapped in error boundary */}
        <div className="w-full rounded-lg overflow-hidden border border-gray-200 bg-white min-h-[400px]">
          <WidgetErrorBoundary>
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              </div>
            }>
              <LiFiWidget integrator="zkpay" config={widgetConfig as any} />
            </Suspense>
          </WidgetErrorBoundary>
        </div>
      </div>

      <div className="relative flex items-center my-6">
        <div className="flex-grow border-t border-gray-200"></div>
        <span className="flex-shrink-0 mx-4 text-[11px] font-bold text-gray-400 tracking-widest uppercase font-['Geist']">TESTNET FAUCETS</span>
        <div className="flex-grow border-t border-gray-200"></div>
      </div>

      {/* Testnet Faucets */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
        <p className="text-xs text-gray-500 leading-relaxed font-['Hanken_Grotesk']">
          Testing on <strong>Base Sepolia</strong>? Copy your embedded wallet address and use the faucets below to get free testnet tokens.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md p-1.5 pl-3">
            <code className="text-[13px] font-mono text-gray-700 flex-1 truncate font-['Geist']">
              {address}
            </code>
            <button 
              onClick={copyAddress}
              className="bg-white border border-gray-200 hover:bg-gray-50 text-black px-3 py-1.5 text-xs font-bold rounded uppercase tracking-wider transition-colors font-['Geist']"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          
          <div className="flex gap-2 mt-1">
            <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank" rel="noopener noreferrer" className="flex-1 bg-white border border-black hover:bg-gray-50 text-center text-[11px] font-bold tracking-wider py-3 rounded uppercase text-black transition-colors font-['Geist']">
              Get Test ETH
            </a>
            <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer" className="flex-1 bg-white border border-black hover:bg-gray-50 text-center text-[11px] font-bold tracking-wider py-3 rounded uppercase text-black transition-colors font-['Geist']">
              Get Test USDC
            </a>
          </div>
        </div>
      </div>

    </div>
  );
}
