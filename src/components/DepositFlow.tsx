"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import { CONTRACTS } from "@/lib/constants";

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
    <div className="flex flex-col gap-6">

      <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center gap-4 shadow-sm w-full text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
            <path d="M12 2v20"></path>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </div>
        <h2 className="text-xl font-bold font-['Inter']">Custom Deposit System</h2>
        <p className="text-sm text-gray-500 font-['Hanken_Grotesk'] max-w-[280px]">
          Our new native deposit system is currently under construction.
        </p>
      </div>

      <div className="relative flex items-center my-2">
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
