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
    <div className="w-full border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white p-6 flex flex-col gap-6">
      
      <div className="text-center">
        <h3 className="text-lg font-bold">Fund Testnet Account</h3>
        <p className="text-sm text-gray-500 mt-1">
          You are on <strong>Base Sepolia Testnet</strong>. Real cross-chain swaps (Li.Fi) are disabled here. You must use a testnet faucet.
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
        <div className="flex flex-col overflow-hidden mr-4">
          <span className="label-caps mb-1">Your Wallet Address</span>
          <span className="text-sm font-mono truncate">{address}</span>
        </div>
        <button 
          onClick={copyAddress}
          className="p-2 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          {copied ? <CheckCircle2 size={16} className="text-green-600" /> : <Copy size={16} />}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-sm">Step 1: Get ETH for Gas</span>
          <a 
            href="https://sepoliafaucet.com/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:border-black transition-colors"
          >
            <span className="text-sm">Alchemy Base Sepolia Faucet</span>
            <ExternalLink size={14} className="text-gray-400" />
          </a>
        </div>

        <div className="flex flex-col gap-1 mt-2">
          <span className="font-semibold text-sm">Step 2: Get Testnet USDC</span>
          <a 
            href="https://faucet.circle.com/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:border-black transition-colors"
          >
            <span className="text-sm">Circle USDC Faucet</span>
            <ExternalLink size={14} className="text-gray-400" />
          </a>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800">
        <strong>Tip:</strong> In the Circle Faucet, select "Base Sepolia" as the network, paste your wallet address, and click "Send".
      </div>

    </div>
  );
}
