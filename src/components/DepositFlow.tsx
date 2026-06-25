"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Copy, ExternalLink, CheckCircle2 } from "lucide-react";
import { useState } from "react";

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

  return (
    <div className="w-full flex flex-col gap-4">
      
      {/* Real Cross-Chain Bridging (External Link) */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center text-center gap-4 shadow-sm">
        <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center transform rotate-3">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2 9 3-3 3 3"/>
            <path d="M13 18L15 21L17 18"/>
            <path d="M5 6v11a4 4 0 0 0 4 4h6"/>
            <path d="M19 18V7a4 4 0 0 0-4-4H9"/>
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold">Cross-Chain Deposit</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-[280px]">
            Bridge tokens from Solana, Ethereum, or Arbitrum directly to your ZkPay wallet using Li.Fi.
          </p>
        </div>
        <a 
          href="https://jumper.exchange/?toChain=8453&toToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" 
          target="_blank" 
          rel="noopener noreferrer"
          className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
        >
          Open Jumper <ExternalLink size={16} />
        </a>
      </div>

      <div className="flex items-center gap-4 opacity-50 px-4 py-2">
        <div className="h-px bg-gray-400 flex-1"></div>
        <span className="text-xs font-semibold uppercase tracking-widest">Testnet Faucets</span>
        <div className="h-px bg-gray-400 flex-1"></div>
      </div>

      {/* Testnet Faucets */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
        <p className="text-xs text-gray-500 leading-relaxed">
          Testing on <strong>Base Sepolia</strong>? Copy your embedded wallet address and use the faucets below to get free testnet tokens.
        </p>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1.5 pl-3">
            <code className="text-xs font-mono text-gray-600 flex-1 truncate">
              {address}
            </code>
            <button 
              onClick={copyAddress}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 text-xs font-bold rounded-md transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          
          <div className="flex gap-2 mt-1">
            <a href="https://sepoliafaucet.com/" target="_blank" rel="noopener noreferrer" className="flex-1 bg-white border border-gray-200 hover:border-black text-center text-xs font-semibold py-2.5 rounded-lg text-black transition-colors">
              Get Test ETH
            </a>
            <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer" className="flex-1 bg-white border border-gray-200 hover:border-black text-center text-xs font-semibold py-2.5 rounded-lg text-black transition-colors">
              Get Test USDC
            </a>
          </div>
        </div>
      </div>

    </div>
  );
}
