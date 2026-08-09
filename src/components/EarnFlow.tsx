"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getAccessToken } from "@privy-io/react-auth";

interface VaultInfo {
  name: string;
  provider: string;
  apy: string;
  tvlUsd: number | null;
  availableLiquidityUsd: number | null;
  asset: string;
}

interface PositionInfo {
  totalDeposited: number;
  totalWithdrawn: number;
  assetsInVault: number;
  earnedYield: number;
}

export default function EarnFlow() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();

  const [amount, setAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [position, setPosition] = useState<PositionInfo | null>(null);
  const [isLoadingPosition, setIsLoadingPosition] = useState(true);

  const getWalletId = useCallback(() => {
    const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
    return embeddedWallet?.meta?.id || embeddedWallet?.address || null;
  }, [wallets]);

  const fetchPosition = useCallback(async () => {
    const walletId = getWalletId();
    if (!walletId || !authenticated) return;

    try {
      setIsLoadingPosition(true);
      const accessToken = await getAccessToken();

      const res = await fetch(
        `/api/earn/position?walletId=${encodeURIComponent(walletId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setVault(data.vault);
        setPosition(data.position);
      }
    } catch {
    } finally {
      setIsLoadingPosition(false);
    }
  }, [getWalletId, authenticated]);

  useEffect(() => {
    fetchPosition();
  }, [fetchPosition]);

  const handleDeposit = async () => {
    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const walletId = getWalletId();
    if (!walletId) {
      setError("Embedded wallet required for Earn.");
      return;
    }

    setIsDepositing(true);
    setError("");
    setSuccess("");

    try {
      const accessToken = await getAccessToken();

      const response = await fetch("/api/earn/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ amount: parsedAmount, walletId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Deposit failed");
      }

      setSuccess(`Deposit of $${parsedAmount} submitted!`);
      setAmount("");
      setTimeout(fetchPosition, 5000);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!position || position.assetsInVault <= 0) {
      setError("No assets to withdraw.");
      return;
    }

    const walletId = getWalletId();
    if (!walletId) {
      setError("Embedded wallet required.");
      return;
    }

    setIsWithdrawing(true);
    setError("");
    setSuccess("");

    try {
      const accessToken = await getAccessToken();

      const response = await fetch("/api/earn/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          amount: position.assetsInVault,
          walletId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Withdrawal failed");
      }

      setSuccess("Withdrawal submitted!");
      setTimeout(fetchPosition, 5000);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const displayApy = vault?.apy ? `${vault.apy}%` : "12.4%";
  const displayVaultName = vault?.name || "ZkPay Liquidity Vault V4";
  const displayPosition = position ? `$${position.assetsInVault.toFixed(2)}` : "$0.00";
  const displayYield = position ? `+$${position.earnedYield.toFixed(2)}` : "+$0.00";
  const hasPosition = position && position.assetsInVault > 0;
  const isLoading = isDepositing || isWithdrawing;

  return (
    <div className="w-full relative flex flex-col items-center justify-start pt-8 pb-32 animate-in fade-in duration-700 font-body-md overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .glass-card {
            background: rgba(53, 53, 53, 0.2);
            backdrop-filter: blur(24px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .radial-glow {
            background: radial-gradient(circle at center, rgba(82, 255, 172, 0.08) 0%, transparent 70%);
        }
      `}} />
      
      {/* Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] radial-glow pointer-events-none opacity-60"></div>
      
      {/* Hero Content */}
      <div className="relative z-10 text-center mb-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
        <span className="font-label-caps text-[12px] text-[#909097] uppercase tracking-[0.2em] font-bold mb-4 block">Current Performance</span>
        <h1 className="font-display-xl text-[72px] md:text-[120px] font-extrabold text-[#e5e2e3] drop-shadow-[0_0_30px_rgba(255,255,255,0.2)] tracking-tighter leading-none">
          {displayApy} <span className="text-[32px] md:text-[48px] text-[#52ffac] align-top">APY</span>
        </h1>
      </div>
      
      {/* Main Dashboard Card */}
      <div className="glass-card w-full max-w-2xl p-8 md:p-12 rounded-xl flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
        <div className="flex flex-col md:flex-row justify-between items-center text-center md:text-left gap-6">
          <div>
            <p className="font-body-md text-[#909097] mb-2 font-semibold">Total Deposited</p>
            {isLoadingPosition ? (
              <div className="w-8 h-8 border-2 border-[#52ffac] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <div className="font-headline-lg text-[40px] font-bold text-[#e5e2e3] tracking-tight">{displayPosition}</div>
            )}
          </div>
          {hasPosition && (
            <div className="text-center md:text-right">
              <p className="font-body-md text-[#909097] mb-2 font-semibold">Earned Yield</p>
              <div className="font-headline-md text-2xl font-bold text-[#52ffac]">{displayYield}</div>
            </div>
          )}
        </div>
        
        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
        
        {/* Action Area */}
        <div className="flex flex-col w-full gap-6">
          <div className="flex flex-col gap-2">
            <p className="font-label-caps text-[10px] text-[#909097] uppercase font-bold tracking-widest pl-1">Amount (USDC)</p>
            <div className="flex gap-4">
              <input 
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={isLoading}
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-4 text-xl font-bold text-[#e5e2e3] focus:border-[#52ffac] focus:ring-1 focus:ring-[#52ffac] outline-none transition-all placeholder:text-[#46464c]"
              />
              <button 
                onClick={handleDeposit}
                disabled={!amount || isLoading || Number(amount) <= 0}
                className="px-8 bg-[#e5e2e3] text-[#131315] font-headline-md font-bold text-[18px] tracking-tight hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 rounded-lg flex items-center justify-center min-w-[140px]"
              >
                {isDepositing ? <div className="w-6 h-6 border-2 border-[#131315] border-t-transparent rounded-full animate-spin"></div> : 'Deposit'}
              </button>
            </div>
            {error && <p className="text-xs font-bold text-[#ffb4ab] pl-1 mt-1">{error}</p>}
            {success && <p className="text-xs font-bold text-[#52ffac] pl-1 mt-1">{success}</p>}
          </div>

          <div className="flex justify-between items-center mt-2">
            <p className="font-label-caps text-[10px] text-[#909097] uppercase font-bold tracking-widest">Protocol: {displayVaultName}</p>
            
            <button 
              onClick={handleWithdraw}
              disabled={!hasPosition || isLoading}
              className="text-[#909097] hover:text-[#e5e2e3] font-label-caps text-[10px] uppercase font-bold tracking-widest disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
            >
              {isWithdrawing ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></div> : null}
              Withdraw All
            </button>
          </div>
        </div>
      </div>
      
      {/* Decorative Elements */}
      <div className="mt-24 w-full max-w-3xl grid grid-cols-1 md:grid-cols-3 gap-8 opacity-40 mx-auto px-4">
        <div className="p-6 border-l border-white/10">
          <p className="font-label-caps text-[10px] text-[#909097] uppercase font-bold tracking-widest mb-1">Status</p>
          <p className="font-body-md text-[#e5e2e3] font-semibold">Optimized</p>
        </div>
        <div className="p-6 border-l border-white/10">
          <p className="font-label-caps text-[10px] text-[#909097] uppercase font-bold tracking-widest mb-1">Security</p>
          <p className="font-body-md text-[#e5e2e3] font-semibold">Zero-Knowledge Proof</p>
        </div>
        <div className="p-6 border-l border-white/10">
          <p className="font-label-caps text-[10px] text-[#909097] uppercase font-bold tracking-widest mb-1">Last Rebalance</p>
          <p className="font-body-md text-[#e5e2e3] font-semibold">2m ago</p>
        </div>
      </div>
    </div>
  );
}
