"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getAccessToken } from "@privy-io/react-auth";

// ──────────────────────────────────────────────
// Types for the /api/earn/position response
// ──────────────────────────────────────────────
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

  // Form state
  const [amount, setAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Vault & position data (fetched from backend)
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [position, setPosition] = useState<PositionInfo | null>(null);
  const [isLoadingPosition, setIsLoadingPosition] = useState(true);

  // ──────────────────────────────────────────
  // Helper: get the embedded wallet ID
  // ──────────────────────────────────────────
  const getWalletId = useCallback(() => {
    const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
    // Privy embedded wallets store the server-side wallet ID in meta.id
    return embeddedWallet?.meta?.id || embeddedWallet?.address || null;
  }, [wallets]);

  // ──────────────────────────────────────────
  // Fetch vault details + user position
  // ──────────────────────────────────────────
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
      // Silently fail on position fetch — vault might not be set up yet
    } finally {
      setIsLoadingPosition(false);
    }
  }, [getWalletId, authenticated]);

  useEffect(() => {
    fetchPosition();
  }, [fetchPosition]);

  // ──────────────────────────────────────────
  // Deposit handler
  // ──────────────────────────────────────────
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

      setSuccess(
        `Deposit of $${parsedAmount} submitted! It will confirm on-chain shortly.`
      );
      setAmount("");
      // Refresh position after a short delay (action is async)
      setTimeout(fetchPosition, 5000);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsDepositing(false);
    }
  };

  // ──────────────────────────────────────────
  // Withdraw handler
  // ──────────────────────────────────────────
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

      setSuccess("Withdrawal submitted! It will confirm on-chain shortly.");
      setTimeout(fetchPosition, 5000);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  // ──────────────────────────────────────────
  // Derived display values
  // ──────────────────────────────────────────
  const displayApy = vault?.apy ? `${vault.apy}%` : "—";
  const displayVaultName = vault?.name || "Yield Vault";
  const displayPosition = position
    ? `$${position.assetsInVault.toFixed(2)}`
    : "$0.00";
  const displayYield = position
    ? `+$${position.earnedYield.toFixed(2)}`
    : "+$0.00";
  const hasPosition = position && position.assetsInVault > 0;
  const isLoading = isDepositing || isWithdrawing;

  return (
    <div className="w-full flex flex-col gap-6 animate-fade-in-up">
      {/* Vault Info Card */}
      <div className="glass-card p-6 flex flex-col items-center text-center">
        <div className="w-12 h-12 glass-card-elevated rounded-full flex items-center justify-center mb-3 text-[#c0c6de]">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="2" x2="12" y2="22"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </div>
        <h3 className="text-xl font-bold tracking-tight text-[#e5e2e3]">Generate Yield</h3>
        <p className="text-sm text-[#909097] mt-1 mb-5">
          Deposit USDC into the {displayVaultName} to earn passive interest.
        </p>

        <div className="w-full glass-card-static p-4 flex justify-between items-center">
          <span className="text-sm font-semibold tracking-wide text-[#909097]">
            Current APY
          </span>
          {isLoadingPosition ? (
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <span className="text-lg font-bold text-emerald-400">
              {displayApy}
            </span>
          )}
        </div>
      </div>

      {/* Deposit Form */}
      <div className="flex flex-col gap-3">
        <label className="label-caps pl-1">
          Amount to Deposit
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent border-b border-[#46464c] rounded-none py-4 px-2 text-3xl font-bold text-[#e5e2e3] focus:outline-none focus:border-[#c0c6de] transition-colors placeholder:text-[#46464c]"
            disabled={isLoading}
            min="0"
            step="0.01"
          />
          <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
            <span className="text-sm font-bold text-[#46464c]">USDC</span>
          </div>
        </div>

        {error && (
          <p className="text-sm font-medium text-[#ffb4ab] mt-1 px-1">{error}</p>
        )}
        {success && (
          <p className="text-sm font-medium text-emerald-400 mt-1 px-1">
            {success}
          </p>
        )}

        <button
          onClick={handleDeposit}
          disabled={!amount || isLoading || Number(amount) <= 0}
          className="btn-primary mt-2 flex justify-center items-center h-[56px] disabled:bg-[#353436] disabled:text-[#909097] disabled:opacity-100"
        >
          {isDepositing ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            "Deposit to Vault"
          )}
        </button>
      </div>

      {/* Position Card */}
      <div className="glass-card-static p-5 mt-2">
        <div className="flex justify-between items-center">
          <div>
            <p className="label-caps">
              Your Position
            </p>
            {isLoadingPosition ? (
              <div className="w-4 h-4 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin mt-2"></div>
            ) : (
              <>
                <p className="text-3xl font-bold mt-1 tracking-tighter text-[#e5e2e3]">
                  {displayPosition}
                </p>
                {hasPosition && (
                  <p className="text-xs font-semibold text-emerald-400 mt-0.5">
                    {displayYield} earned
                  </p>
                )}
              </>
            )}
          </div>
          <button
            onClick={handleWithdraw}
            disabled={!hasPosition || isLoading}
            className="btn-secondary px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isWithdrawing ? (
              <div className="w-4 h-4 border-2 border-[#e5e2e3] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              "Withdraw"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
