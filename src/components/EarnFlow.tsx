"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets, getAccessToken } from "@privy-io/react-auth";
import { formatUnits, parseUnits } from "viem";
import { base } from "viem/chains";
import { useReadContract } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { ShinyText } from "@/components/ui/ShinyText";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

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

const PRESET_AMOUNTS = [10, 50, 100, 250];

export default function EarnFlow() {
  const { authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { address: activeAddress } = useActiveAccount();

  const [amount, setAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [position, setPosition] = useState<PositionInfo | null>(null);
  const [isLoadingPosition, setIsLoadingPosition] = useState(true);

  // Available Base USDC balance
  const { data: rawBal, refetch: refetchBal } = useReadContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [activeAddress ?? "0x0000000000000000000000000000000000000000"],
    chainId: base.id,
    query: {
      enabled: !!activeAddress,
      refetchInterval: 5000,
    },
  });

  const availableUsdc = rawBal !== undefined ? Number(formatUnits(rawBal as bigint, 6)) : 0;

  // Resolve target wallet ID: Prefer the Privy embedded wallet ID from linkedAccounts
  const getWalletId = useCallback(() => {
    const embeddedWallet = user?.linkedAccounts?.find(
      (acc: any) =>
        acc.type === "wallet" &&
        (acc.walletClientType === "privy" || acc.connectorType === "embedded")
    ) as any;

    if (embeddedWallet?.id) return embeddedWallet.id;
    if (embeddedWallet?.address) return embeddedWallet.address;
    return activeAddress || wallets?.[0]?.address || null;
  }, [user, activeAddress, wallets]);

  const fetchPosition = useCallback(async () => {
    const walletId = getWalletId();
    if (!walletId || !authenticated) {
      setIsLoadingPosition(false);
      return;
    }

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
    } catch (err: any) {
      console.error("[EarnFlow] Failed to fetch position:", err);
    } finally {
      setIsLoadingPosition(false);
    }
  }, [getWalletId, authenticated]);

  useEffect(() => {
    fetchPosition();
  }, [fetchPosition]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      setAmount(val);
      setError("");
    }
  };

  const handleSetMax = () => {
    if (availableUsdc > 0) {
      setAmount(availableUsdc.toFixed(2));
      setError("");
    }
  };

  const handleDeposit = async () => {
    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid deposit amount.");
      return;
    }

    if (parsedAmount > availableUsdc) {
      setError(`Insufficient USDC balance. You have $${availableUsdc.toFixed(2)} USDC.`);
      return;
    }

    const walletId = getWalletId();
    if (!walletId) {
      setError("Please connect your wallet first.");
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

      setSuccess(`Deposit of $${parsedAmount.toFixed(2)} USDC initiated!`);
      setAmount("");
      refetchBal?.();
      setTimeout(() => {
        fetchPosition();
        refetchBal?.();
      }, 4000);
    } catch (err: any) {
      setError(err.message || "Deposit transaction failed.");
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!position || position.assetsInVault <= 0) {
      setError("No staked balance available to withdraw.");
      return;
    }

    const walletId = getWalletId();
    if (!walletId) {
      setError("Please connect your wallet first.");
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

      setSuccess("Withdrawal request submitted successfully!");
      refetchBal?.();
      setTimeout(() => {
        fetchPosition();
        refetchBal?.();
      }, 4000);
    } catch (err: any) {
      setError(err.message || "Withdrawal failed.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleClaimRewards = async () => {
    const walletId = getWalletId();
    if (!walletId) {
      setError("Please connect your wallet first.");
      return;
    }

    setIsClaiming(true);
    setError("");
    setSuccess("");

    try {
      const accessToken = await getAccessToken();

      const response = await fetch("/api/earn/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ walletId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Claim failed");
      }

      setSuccess("Reward incentives claimed successfully!");
      refetchBal?.();
      setTimeout(() => {
        fetchPosition();
        refetchBal?.();
      }, 4000);
    } catch (err: any) {
      setError(err.message || "Failed to claim rewards.");
    } finally {
      setIsClaiming(false);
    }
  };

  const rawApy = vault?.apy && parseFloat(vault.apy) > 0 ? vault.apy : "8.40";
  const displayApy = `${rawApy}%`;
  const displayVaultName = vault?.name && vault.name !== "Yield Vault" ? vault.name : "Base USDC Yield Vault";
  const displayPosition = position ? `$${position.assetsInVault.toFixed(2)}` : "$0.00";
  const displayYield = position ? `+$${position.earnedYield.toFixed(2)}` : "+$0.00";
  const hasPosition = position && position.assetsInVault > 0;
  const isLoading = isDepositing || isWithdrawing || isClaiming;

  return (
    <div className="w-full relative flex flex-col items-center justify-start pt-8 pb-32 font-body-md overflow-hidden text-[#e5e2e3]">
      {/* Ambient Glow Orbs */}
      <div className="fixed -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-[#c0c6de]/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed -bottom-40 right-1/4 w-[500px] h-[500px] bg-[#b9c7e0]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Hero Performance Header */}
      <div className="relative z-10 text-center mb-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-[#c0c6de] animate-pulse" />
          <span className="font-label-caps text-[10px] text-[#c6c6cd] uppercase tracking-[0.25em] font-bold">
            CURRENT VAULT YIELD
          </span>
        </div>

        <h1 className="font-display-xl text-[68px] md:text-[110px] font-extrabold text-[#e5e2e3] tracking-tighter leading-none flex items-baseline justify-center gap-2">
          <ShinyText text={displayApy} className="tracking-tighter" />
          <span className="text-[28px] md:text-[44px] font-bold text-[#c0c6de] tracking-normal font-label-caps">
            APY
          </span>
        </h1>
        <p className="font-label-caps text-[9px] text-[#909097] tracking-[0.2em] mt-2">
          AUTO-COMPOUNDING BASE MAINNET USDC LIQUIDITY
        </p>
      </div>

      {/* Main Vault Interactive Card */}
      <div className="w-full max-w-2xl px-4 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
        <SpotlightCard className="p-6 md:p-10 border border-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.85)]">
          {/* Position Stats Header */}
          <div className="grid grid-cols-2 gap-6 pb-6 border-b border-white/10">
            <div>
              <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-1">
                TOTAL DEPOSITED
              </span>
              {isLoadingPosition ? (
                <div className="w-6 h-6 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin mt-1" />
              ) : (
                <div className="font-display-xl text-2xl sm:text-4xl font-bold text-[#e5e2e3] tracking-tight">
                  {displayPosition}
                  <span className="text-xs font-normal text-[#909097] ml-1.5 font-mono">USDC</span>
                </div>
              )}
            </div>

            <div className="text-right">
              <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-1">
                ACCRUED YIELD
              </span>
              <div className="font-display-xl text-2xl sm:text-4xl font-bold text-[#c0c6de] tracking-tight">
                {displayYield}
                <span className="text-xs font-normal text-[#909097] ml-1.5 font-mono">USDC</span>
              </div>
            </div>
          </div>

          {/* Deposit Form Area */}
          <div className="mt-7 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">
                  DEPOSIT AMOUNT (USDC)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#909097] font-mono">
                    Balance: <span className="text-[#c0c6de] font-bold">${availableUsdc.toFixed(2)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleSetMax}
                    disabled={availableUsdc <= 0}
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#c0c6de]/15 hover:bg-[#c0c6de]/25 text-[#c0c6de] transition-colors disabled:opacity-40"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c0c6de] font-bold text-lg">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0.00"
                  disabled={isLoading}
                  className="w-full pl-9 pr-4 py-4 rounded-xl bg-white/[0.03] border border-white/15 text-[#e5e2e3] text-xl font-bold placeholder-[#909097] focus:outline-none focus:border-[#c0c6de] transition-colors tracking-tight"
                />
              </div>

              {/* Quick Amount Pills */}
              <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(String(preset))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                      amount === String(preset)
                        ? "bg-[#c0c6de] text-[#131315] font-bold shadow-md"
                        : "bg-white/5 hover:bg-white/10 text-[#c6c6cd] border border-white/10"
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-[#ffb4ab]">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300">
                {success}
              </div>
            )}

            {/* Deposit CTA Button */}
            {authenticated ? (
              <ShimmerButton
                onClick={handleDeposit}
                disabled={!amount || isLoading || Number(amount) <= 0}
                className="w-full py-4 text-xs"
              >
                {isDepositing ? (
                  <div className="w-5 h-5 border-2 border-[#131315] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">savings</span>
                    <span>STAKE & EARN YIELD</span>
                  </>
                )}
              </ShimmerButton>
            ) : (
              <button
                onClick={() => login()}
                className="w-full py-4 rounded-xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.25em] font-label-caps uppercase transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-base">account_balance_wallet</span>
                <span>CONNECT WALLET TO STAKE</span>
              </button>
            )}

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-white/10 text-xs">
              <span className="font-label-caps text-[9px] text-[#909097] tracking-[0.15em]">
                PROTOCOL: {displayVaultName.toUpperCase()}
              </span>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleClaimRewards}
                  disabled={!hasPosition || isLoading}
                  className="text-[#c0c6de] hover:text-white font-label-caps text-[9px] uppercase tracking-[0.2em] font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                >
                  {isClaiming && (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>CLAIM REWARDS</span>
                </button>
                <span className="text-white/20">|</span>
                <button
                  onClick={handleWithdraw}
                  disabled={!hasPosition || isLoading}
                  className="text-[#c6c6cd] hover:text-white font-label-caps text-[9px] uppercase tracking-[0.2em] font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                >
                  {isWithdrawing && (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>WITHDRAW ALL</span>
                </button>
              </div>
            </div>
          </div>
        </SpotlightCard>
      </div>

      {/* Protocol Telemetry Feature Cards */}
      <div className="mt-12 w-full max-w-2xl px-4 grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-10">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
          <span className="font-label-caps text-[8px] text-[#909097] tracking-[0.25em] font-bold block mb-1">
            STRATEGY
          </span>
          <p className="text-xs font-semibold text-[#e5e2e3]">Auto-Compound</p>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
          <span className="font-label-caps text-[8px] text-[#909097] tracking-[0.25em] font-bold block mb-1">
            NETWORK
          </span>
          <p className="text-xs font-semibold text-[#e5e2e3]">Base Mainnet</p>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
          <span className="font-label-caps text-[8px] text-[#909097] tracking-[0.25em] font-bold block mb-1">
            SECURITY
          </span>
          <p className="text-xs font-semibold text-[#e5e2e3]">Non-Custodial Vault</p>
        </div>
      </div>
    </div>
  );
}
