"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import WalletConnect from "@/components/WalletConnect";
import Scanner from "@/components/Scanner";
import PaymentEntry from "@/components/PaymentEntry";
import CashoutFlow from "@/components/CashoutFlow";
import PaymentHistory from "@/components/PaymentHistory";
import DepositFlow from "@/components/DepositFlow";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";

export default function Home() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [balance, setBalance] = useState("0.00");
  const [activeTab, setActiveTab] = useState("pay"); // 'pay', 'cashout', 'deposit', 'history'
  
  // Scanner / Payment State
  const [isScanning, setIsScanning] = useState(false);
  const [merchantId, setMerchantId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBalance() {
      if (!ready || !authenticated || !wallets.length) return;
      const wallet = wallets[0];
      
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http()
      });

      try {
        const bal = await publicClient.readContract({
          address: CONTRACTS.USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [wallet.address as `0x${string}`],
        });
        setBalance(formatUnits(bal as bigint, 6));
      } catch (e) {
        console.error("Failed to fetch balance", e);
      }
    }
    fetchBalance();
  }, [ready, authenticated, wallets]);

  const handleScan = (data: string) => {
    setIsScanning(false);
    setMerchantId(data);
  };

  return (
    <main className="min-h-screen pb-24 flex flex-col items-center">
      {isScanning && (
        <Scanner 
          onScan={handleScan} 
          onCancel={() => setIsScanning(false)} 
        />
      )}

      <div className="w-full max-w-md px-4 py-6 flex flex-col gap-8">
        {/* Header */}
        <header className="flex justify-between items-center animate-fade-in-up">
          <h1 className="text-xl font-bold tracking-tight">ZkPay</h1>
          <WalletConnect />
        </header>

        {/* Portfolio Balance */}
        <section className="flex flex-col items-center gap-2 mt-4 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
          <p className="label-caps">USDC Balance</p>
          <h2 className="text-5xl font-bold tracking-tighter">${balance}</h2>
          <p className="text-sm text-gray-500">Base Sepolia</p>
        </section>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
          <button 
            onClick={() => { setActiveTab('pay'); setMerchantId(null); }}
            className={`btn-primary ${activeTab === 'pay' ? '' : '!bg-white !text-black border border-gray-200'}`}
          >
            Pay Merchant
          </button>
          <button 
            onClick={() => { setActiveTab('cashout'); setMerchantId(null); }}
            className={`btn-secondary ${activeTab === 'cashout' ? '!bg-gray-100' : ''}`}
          >
            Cash Out (INR)
          </button>
        </div>

        {/* Tab Content */}
        <div className="mt-4 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
          {activeTab === 'pay' && !merchantId && (
            <div className="flex flex-col gap-4">
              <div className="glass-card-static p-6 flex flex-col items-center gap-4 text-center border-2 border-dashed border-gray-300">
                <h3 className="text-lg font-semibold">Scan QR Code</h3>
                <p className="text-sm text-gray-500">Point your camera at a merchant's QR code to initiate payment.</p>
                <button onClick={() => setIsScanning(true)} className="btn-primary w-full mt-2">Open Scanner</button>
              </div>
            </div>
          )}

          {activeTab === 'pay' && merchantId && (
            <PaymentEntry merchantId={merchantId} onCancel={() => setMerchantId(null)} />
          )}
          
          {activeTab === 'cashout' && (
             <CashoutFlow />
          )}

          {activeTab === 'deposit' && (
            <DepositFlow />
          )}
        </div>

        {/* Action Link for Deposit */}
        {activeTab !== 'deposit' && (
          <div className="text-center animate-fade-in-up" style={{ animationDelay: "0.35s" }}>
            <button onClick={() => { setActiveTab('deposit'); setMerchantId(null); }} className="text-sm font-semibold text-gray-500 underline decoration-gray-300 hover:text-black">
              Want to fund your account from another chain?
            </button>
          </div>
        )}

        {/* Recent Activity */}
        <section className="animate-fade-in-up mt-8 border-t border-gray-200 pt-8" style={{ animationDelay: "0.4s" }}>
          <div className="flex justify-between items-end mb-4">
            <h3 className="text-lg font-bold">Recent Activity</h3>
          </div>
          <PaymentHistory />
        </section>

      </div>
    </main>
  );
}
