"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import {
  ArrowLeft,
  DollarSign,
  ArrowUpRight,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Key,
  Shield,
  Coins,
  AlertCircle,
  X,
  ChevronRight,
} from "lucide-react";

interface PartnerBalance {
  availableBalanceUsd: number;
  pendingPayoutUsd: number;
  totalEarnedUsd: number;
  totalWithdrawnUsd: number;
  settledSwapsCount: number;
  updatedAt: number;
}

interface PayoutTicket {
  id: string;
  amountUsd: number;
  payoutOption: "ltc" | "sol" | "usdt-polygon" | "usdc-base";
  targetAsset: string;
  targetChain: string;
  destinationAddress: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "REJECTED";
  txHash?: string;
  adminNote?: string;
  createdAt: number;
  processedAt?: number;
}

interface FeeCredit {
  id: string;
  swapId: string;
  chain: string;
  fromAsset: string;
  humanTokenAmount: string;
  usdRate: number;
  feeUsd: number;
  settledAt: number;
}

interface ApiKeyItem {
  id: string;
  label: string;
  maskedKey: string;
  status: string;
}

interface PartnerSwapTx {
  id: string;
  status: "COMPLETED" | "PENDING" | "FAILED" | "EXPIRED";
  rawStatus: string;
  amount: string;
  fromAsset: string;
  toAsset: string;
  chain: string;
  destinationChain: string;
  partnerFeeAmount: string | null;
  partnerFeeUsdEstimate: number;
  explorerUrl?: string | null;
  createdAt: number;
}

const PAYOUT_OPTIONS = [
  { id: "usdc-base", asset: "USDC", chain: "Base", code: "USDC", placeholder: "0x..." },
  { id: "usdt-polygon", asset: "USDT", chain: "Polygon", code: "USDT", placeholder: "0x..." },
  { id: "sol", asset: "SOL", chain: "Solana", code: "SOL", placeholder: "Base58 address (e.g. 7vN2...)" },
  { id: "ltc", asset: "LTC", chain: "Litecoin", code: "LTC", placeholder: "Litecoin address (L..., M..., ltc1...)" },
] as const;

export default function PartnerDashboard() {
  const { ready, authenticated, login, user, getAccessToken } = usePrivy();

  // Tab state
  const [activeTab, setActiveTab] = useState<"payouts" | "credits" | "swaps" | "apikeys">("payouts");

  // Data state
  const [balance, setBalance] = useState<PartnerBalance | null>(null);
  const [payouts, setPayouts] = useState<PayoutTicket[]>([]);
  const [credits, setCredits] = useState<FeeCredit[]>([]);
  const [swaps, setSwaps] = useState<PartnerSwapTx[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Payout Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [payoutOption, setPayoutOption] = useState<"ltc" | "sol" | "usdt-polygon" | "usdc-base">("usdc-base");
  const [payoutAmount, setPayoutAmount] = useState<string>("");
  const [payoutAddress, setPayoutAddress] = useState<string>("");
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccess, setPayoutSuccess] = useState<string | null>(null);

  // Copy helper
  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Load all dashboard data
  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (!authenticated) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [balRes, payoutsRes, creditsRes, overviewRes, swapsRes] = await Promise.all([
        fetch("/api/partner/balance", { headers }).then((r) => r.json()).catch(() => null),
        fetch("/api/partner/payouts", { headers }).then((r) => r.json()).catch(() => null),
        fetch("/api/partner/credits", { headers }).then((r) => r.json()).catch(() => null),
        fetch("/api/partner/overview", { headers }).then((r) => r.json()).catch(() => null),
        fetch("/api/partner/transactions?type=swaps&limit=50", { headers }).then((r) => r.json()).catch(() => null),
      ]);

      if (balRes?.success) setBalance(balRes.balance);
      if (payoutsRes?.success) setPayouts(payoutsRes.payouts || []);
      if (creditsRes?.success) setCredits(creditsRes.credits || []);
      if (overviewRes?.success && overviewRes.apiKeys) setApiKeys(overviewRes.apiKeys);
      if (swapsRes?.success && swapsRes.transactions) setSwaps(swapsRes.transactions);
    } catch (err) {
      console.error("Failed to load partner data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    if (ready && authenticated) {
      loadDashboardData();
    } else if (ready && !authenticated) {
      setLoading(false);
    }
  }, [ready, authenticated, loadDashboardData]);

  // Submit Payout Request
  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayoutError(null);
    setPayoutSuccess(null);

    const amt = parseFloat(payoutAmount);
    if (isNaN(amt) || amt < 1.0) {
      setPayoutError("Minimum payout amount is $1.00 USD.");
      return;
    }

    if (!balance || amt > balance.availableBalanceUsd + 0.0001) {
      setPayoutError("Requested amount exceeds available balance.");
      return;
    }

    if (!payoutAddress.trim()) {
      setPayoutError("Destination address is required.");
      return;
    }

    setSubmittingPayout(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/partner/payouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amountUsd: amt,
          payoutOption,
          destinationAddress: payoutAddress.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit payout request");
      }

      setPayoutSuccess(`Payout request for $${amt.toFixed(2)} USD submitted successfully!`);
      setPayoutAmount("");
      setPayoutAddress("");
      loadDashboardData(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setPayoutSuccess(null);
      }, 1500);
    } catch (err: any) {
      setPayoutError(err.message || "Failed to submit payout request.");
    } finally {
      setSubmittingPayout(false);
    }
  };

  const getExplorerUrl = (chain: string, txHash?: string) => {
    if (!txHash) return null;
    const c = chain.toLowerCase();
    if (c.includes("poly") || c.includes("matic")) return `https://polygonscan.com/tx/${txHash}`;
    if (c.includes("base")) return `https://basescan.org/tx/${txHash}`;
    if (c.includes("sol")) return `https://solscan.io/tx/${txHash}`;
    if (c.includes("ltc") || c.includes("lite")) return `https://litecoinspace.org/tx/${txHash}`;
    return `https://basescan.org/tx/${txHash}`;
  };

  // Not authenticated screen
  if (!ready || (ready && !authenticated)) {
    return (
      <div className="min-h-screen bg-surface text-on-surface flex flex-col justify-center items-center px-4">
        <div className="w-full max-w-sm border border-outline-variant rounded-2xl p-6 text-center bg-surface-container">
          <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center mx-auto mb-4 text-secondary">
            <Coins className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-medium tracking-tight mb-1">ZkPay Partner Portal</h1>
          <p className="text-on-surface-variant text-xs mb-6 leading-relaxed">
            Connect your partner wallet to view settled swap earnings and request fee payouts.
          </p>
          <button
            type="button"
            onClick={login}
            className="w-full py-2.5 px-4 rounded-xl bg-on-surface text-surface font-semibold text-sm hover:bg-white transition-colors"
          >
            Connect Partner Wallet
          </button>
          <div className="mt-4">
            <Link href="/" className="text-xs text-on-surface-variant hover:text-on-surface transition-colors inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col items-center">
      {/* Top Navbar */}
      <header className="w-full max-w-lg border-b border-outline-variant px-4 py-3 flex items-center justify-between sticky top-0 bg-surface z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-on-surface tracking-tight">Partner Portal</h1>
            <p className="text-xs text-on-surface-variant font-mono">
              {user?.wallet?.address ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` : "Connected"}
            </p>
          </div>
        </div>

        <button
          onClick={() => loadDashboardData(true)}
          disabled={refreshing}
          className="p-1.5 rounded-lg border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors disabled:opacity-50"
          title="Refresh Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </header>

      {/* Main Container (Strictly Mobile-First, max-w-lg) */}
      <main className="w-full max-w-lg px-4 py-4 space-y-4 pb-20">
        {/* Available Balance Hero Card */}
        <div className="border border-outline-variant rounded-2xl p-5 bg-surface-container relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium text-on-surface-variant block mb-1">
                Available payout balance
              </span>
              <div className="text-3xl font-semibold tracking-tight text-on-surface flex items-baseline gap-1.5">
                ${balance ? balance.availableBalanceUsd.toFixed(2) : "0.00"}
                <span className="text-xs font-normal text-on-surface-variant">USD</span>
              </div>
            </div>

            <button
              onClick={() => {
                setPayoutError(null);
                setPayoutSuccess(null);
                setIsModalOpen(true);
              }}
              disabled={!balance || balance.availableBalanceUsd < 1.0}
              className="py-2 px-3.5 rounded-xl bg-on-surface text-surface text-xs font-semibold hover:bg-white transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Withdraw</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Pending Payout Pill if exists */}
          {balance && balance.pendingPayoutUsd > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
              <Clock className="w-3 h-3" />
              <span>${balance.pendingPayoutUsd.toFixed(2)} USD in pending payout</span>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-outline-variant">
            <div>
              <span className="text-xs text-on-surface-variant block">Total earned</span>
              <span className="text-xs font-medium text-on-surface font-mono">
                ${balance ? balance.totalEarnedUsd.toFixed(2) : "0.00"}
              </span>
            </div>
            <div>
              <span className="text-xs text-on-surface-variant block">Withdrawn</span>
              <span className="text-xs font-medium text-on-surface font-mono">
                ${balance ? balance.totalWithdrawnUsd.toFixed(2) : "0.00"}
              </span>
            </div>
            <div>
              <span className="text-xs text-on-surface-variant block">Settled swaps</span>
              <span className="text-xs font-medium text-secondary font-mono">
                {balance ? balance.settledSwapsCount : 0}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-outline-variant text-xs font-medium">
          <button
            onClick={() => setActiveTab("payouts")}
            className={`flex-1 pb-2.5 text-center transition-colors relative ${
              activeTab === "payouts" ? "text-white font-semibold" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Payouts ({payouts.length})
            {activeTab === "payouts" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("credits")}
            className={`flex-1 pb-2.5 text-center transition-colors relative ${
              activeTab === "credits" ? "text-white font-semibold" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Credits ({credits.length})
            {activeTab === "credits" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("swaps")}
            className={`flex-1 pb-2.5 text-center transition-colors relative ${
              activeTab === "swaps" ? "text-white font-semibold" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Swaps ({swaps.length})
            {activeTab === "swaps" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("apikeys")}
            className={`flex-1 pb-2.5 text-center transition-colors relative ${
              activeTab === "apikeys" ? "text-white font-semibold" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Keys ({apiKeys.length})
            {activeTab === "apikeys" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="py-12 flex justify-center items-center text-neutral-600">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div>
            {/* TAB 1: PAYOUTS */}
            {activeTab === "payouts" && (
              <div className="space-y-2.5">
                {payouts.length === 0 ? (
                  <div className="border border-dashed border-neutral-800 rounded-xl p-8 text-center text-neutral-500 text-xs">
                    <Clock className="w-5 h-5 mx-auto mb-2 text-neutral-600" />
                    No payout requests yet. When your balance reaches $1.00 USD, you can withdraw in LTC, SOL, USDT, or USDC.
                  </div>
                ) : (
                  payouts.map((p) => {
                    const explorer = getExplorerUrl(p.targetChain, p.txHash);
                    return (
                      <div
                        key={p.id}
                        className="border border-neutral-900 rounded-xl p-3.5 bg-neutral-950/40 hover:border-neutral-800 transition-colors text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white text-sm font-mono">
                              ${p.amountUsd.toFixed(2)}
                            </span>
                            <span className="text-[11px] text-neutral-400">
                              in {p.targetAsset} ({p.targetChain})
                            </span>
                          </div>

                          {/* Status Badge */}
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1 ${
                              p.status === "COMPLETED"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : p.status === "REJECTED"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {p.status === "COMPLETED" && <CheckCircle2 className="w-2.5 h-2.5" />}
                            {p.status === "REJECTED" && <XCircle className="w-2.5 h-2.5" />}
                            {p.status === "PENDING" && <Clock className="w-2.5 h-2.5" />}
                            {p.status.toLowerCase()}
                          </span>
                        </div>

                        {/* Recipient Address */}
                        <div className="flex items-center justify-between text-[11px] text-neutral-400 bg-neutral-900/50 rounded-lg px-2.5 py-1.5 font-mono">
                          <span className="truncate max-w-[240px]">{p.destinationAddress}</span>
                          <button
                            onClick={() => copyText(p.destinationAddress, p.id)}
                            className="text-neutral-400 hover:text-white"
                          >
                            {copiedId === p.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>

                        {/* Footer / Tx Hash */}
                        <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1">
                          <span>{new Date(p.createdAt).toLocaleDateString()} {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {p.txHash && explorer && (
                            <a
                              href={explorer}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                            >
                              <span>View Tx</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                          {p.adminNote && (
                            <span className="text-rose-400 italic">Note: {p.adminNote}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 2: SETTLED FEE CREDITS */}
            {activeTab === "credits" && (
              <div className="space-y-2">
                {credits.length === 0 ? (
                  <div className="border border-dashed border-neutral-800 rounded-xl p-8 text-center text-neutral-500 text-xs">
                    <Coins className="w-5 h-5 mx-auto mb-2 text-neutral-600" />
                    No settled swap fees credited yet. As swaps created with your API key finish settlement, fees are converted to USD at the live CoinGecko rate and credited here.
                  </div>
                ) : (
                  credits.map((c) => (
                    <div
                      key={c.id}
                      className="border border-neutral-900 rounded-xl p-3 bg-neutral-950/40 text-xs flex items-center justify-between hover:border-neutral-800 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-semibold text-secondary">
                            <span className="font-mono tabular-nums">+${c.feeUsd.toFixed(4)}</span> USD
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            ({c.humanTokenAmount} {c.fromAsset})
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          Swap <span className="font-mono">{c.swapId.slice(0, 12)}…</span> · 1 {c.fromAsset} = <span className="font-mono">${c.usdRate.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="text-[10px] text-neutral-500 text-right">
                        <div>{new Date(c.settledAt).toLocaleDateString()}</div>
                        <div>{new Date(c.settledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: PARTNER SWAPS */}
            {activeTab === "swaps" && (
              <div className="space-y-2">
                {swaps.length === 0 ? (
                  <div className="border border-dashed border-neutral-800 rounded-xl p-8 text-center text-neutral-500 text-xs">
                    <RefreshCw className="w-5 h-5 mx-auto mb-2 text-neutral-600" />
                    No API swaps recorded yet. Swaps created with your API key or partner fee recipient appear here automatically.
                  </div>
                ) : (
                  swaps.map((s) => (
                    <div
                      key={s.id}
                      className="border border-neutral-900 rounded-xl p-3 bg-neutral-950/40 text-xs space-y-1.5 hover:border-neutral-800 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white font-mono">
                            {s.amount}
                          </span>
                          <span className="text-neutral-500">→</span>
                          <span className="text-neutral-300 font-medium">
                            {s.toAsset} ({s.destinationChain})
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1 ${
                            s.rawStatus === "SETTLED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : s.rawStatus === "FORWARDED"
                              ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                              : s.rawStatus === "EXPIRED" || s.rawStatus === "FAILED"
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {s.rawStatus.toLowerCase()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-on-surface-variant">
                        <span>
                          <span className="font-mono">{s.id.slice(0, 14)}…</span> · Partner Fee:{" "}
                          <span className="text-secondary font-mono">
                            {s.partnerFeeUsdEstimate > 0
                              ? `$${s.partnerFeeUsdEstimate.toFixed(4)} USD`
                              : s.partnerFeeAmount && s.partnerFeeAmount !== "0"
                              ? s.partnerFeeAmount
                              : "50% share"}
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          {s.explorerUrl && (
                            <a
                              href={s.explorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                            >
                              <span>Tx</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                          <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 4: API KEYS */}
            {activeTab === "apikeys" && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-neutral-400">Keys tied to this partner account</span>
                  <Link
                    href="/profile"
                    className="text-xs text-white hover:underline flex items-center gap-0.5 font-medium"
                  >
                    <span>Manage Keys</span>
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>

                {apiKeys.length === 0 ? (
                  <div className="border border-dashed border-neutral-800 rounded-xl p-6 text-center text-neutral-500 text-xs">
                    <Key className="w-5 h-5 mx-auto mb-2 text-neutral-600" />
                    No API keys found. Generate an API key from your Profile to attribute swaps to this account.
                  </div>
                ) : (
                  apiKeys.map((k) => (
                    <div
                      key={k.id}
                      className="border border-neutral-900 rounded-xl p-3 bg-neutral-950/40 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-medium text-white mb-0.5">{k.label}</div>
                        <div className="text-[11px] font-mono text-neutral-400">{k.maskedKey}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        {k.status.toLowerCase()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* REQUEST PAYOUT MODAL (Mobile-friendly bottom sheet / dialog) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-sm bg-surface-container border border-outline-variant rounded-t-2xl sm:rounded-2xl p-5 relative pb-safe">
            <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mb-3 sm:hidden" />
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant mb-4">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-secondary" />
                <h3 className="text-sm font-semibold text-on-surface">Request Fee Payout</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestPayout} className="space-y-4">
              {/* Asset / Option Selection */}
              <div>
                <label className="text-xs font-medium text-on-surface-variant block mb-1.5">
                  Payout asset and network
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYOUT_OPTIONS.map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => setPayoutOption(opt.id)}
                      className={`p-2.5 rounded-xl border text-left transition-colors text-xs flex items-center gap-2.5 cursor-pointer ${
                        payoutOption === opt.id
                          ? "border-secondary bg-surface-container text-on-surface shadow-sm"
                          : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-outline"
                      }`}
                    >
                      <span className="w-8 h-8 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center font-bold text-[10px] text-on-surface">
                        {opt.code}
                      </span>
                      <div>
                        <div className="font-semibold text-on-surface leading-tight">{opt.asset}</div>
                        <div className="text-[10px] text-on-surface-variant leading-tight">{opt.chain}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-on-surface-variant">
                    Amount (USD)
                  </label>
                  <span className="text-xs text-on-surface-variant">
                    Available: <span className="font-mono text-on-surface">${balance ? balance.availableBalanceUsd.toFixed(2) : "0.00"}</span>
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-on-surface-variant text-xs">$</span>
                  <input
                    type="number"
                    step="any"
                    min="1.00"
                    max={balance?.availableBalanceUsd || 0}
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    placeholder="1.00"
                    required
                    className="w-full pl-7 pr-16 py-2.5 bg-surface border border-outline-variant rounded-xl text-on-surface text-sm font-mono focus:outline-none focus:border-secondary transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (balance) setPayoutAmount(balance.availableBalanceUsd.toString());
                    }}
                    className="absolute right-2 top-2 px-2 py-1 bg-surface-container-high hover:bg-surface border border-outline-variant text-on-surface-variant hover:text-on-surface rounded-md text-[10px] font-medium"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Destination Address */}
              <div>
                <label className="text-xs font-medium text-on-surface-variant block mb-1.5">
                  Destination {PAYOUT_OPTIONS.find((o) => o.id === payoutOption)?.asset} address
                </label>
                <input
                  type="text"
                  value={payoutAddress}
                  onChange={(e) => setPayoutAddress(e.target.value)}
                  placeholder={PAYOUT_OPTIONS.find((o) => o.id === payoutOption)?.placeholder}
                  required
                  className="w-full px-3 py-2.5 bg-surface border border-outline-variant rounded-xl text-on-surface text-xs font-mono focus:outline-none focus:border-secondary transition-colors"
                />
              </div>

              {/* Error Message */}
              {payoutError && (
                <div className="p-2.5 rounded-xl bg-error-container/40 border border-error/25 text-on-error-container text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-error" />
                  <span>{payoutError}</span>
                </div>
              )}

              {/* Success Message */}
              {payoutSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{payoutSuccess}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submittingPayout || !balance || balance.availableBalanceUsd < 1.0}
                className="w-full py-2.5 px-4 rounded-xl bg-on-surface text-surface font-semibold text-xs hover:bg-white transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {submittingPayout ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting request…</span>
                  </>
                ) : (
                  <span>Submit payout request</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
