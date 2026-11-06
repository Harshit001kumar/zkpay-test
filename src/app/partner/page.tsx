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

const PAYOUT_OPTIONS = [
  { id: "usdc-base", asset: "USDC", chain: "Base", icon: "🔵", placeholder: "0x..." },
  { id: "usdt-polygon", asset: "USDT", chain: "Polygon", icon: "🟣", placeholder: "0x..." },
  { id: "sol", asset: "SOL", chain: "Solana", icon: "🟣", placeholder: "Base58 address (e.g. 7vN2...)" },
  { id: "ltc", asset: "LTC", chain: "Litecoin", icon: "⚪", placeholder: "Litecoin address (L..., M..., ltc1...)" },
] as const;

export default function PartnerDashboard() {
  const { ready, authenticated, login, user, getAccessToken } = usePrivy();

  // Tab state
  const [activeTab, setActiveTab] = useState<"payouts" | "credits" | "apikeys">("payouts");

  // Data state
  const [balance, setBalance] = useState<PartnerBalance | null>(null);
  const [payouts, setPayouts] = useState<PayoutTicket[]>([]);
  const [credits, setCredits] = useState<FeeCredit[]>([]);
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

      const [balRes, payoutsRes, creditsRes, overviewRes] = await Promise.all([
        fetch("/api/partner/balance", { headers }).then((r) => r.json()).catch(() => null),
        fetch("/api/partner/payouts", { headers }).then((r) => r.json()).catch(() => null),
        fetch("/api/partner/credits", { headers }).then((r) => r.json()).catch(() => null),
        fetch("/api/partner/overview", { headers }).then((r) => r.json()).catch(() => null),
      ]);

      if (balRes?.success) setBalance(balRes.balance);
      if (payoutsRes?.success) setPayouts(payoutsRes.payouts || []);
      if (creditsRes?.success) setCredits(creditsRes.credits || []);
      if (overviewRes?.success && overviewRes.apiKeys) setApiKeys(overviewRes.apiKeys);
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

    if (!balance || amt > balance.availableBalanceUsd) {
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
      <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center px-4">
        <div className="w-full max-w-sm border border-neutral-800 rounded-2xl p-6 text-center bg-neutral-950/60 backdrop-blur-md">
          <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto mb-4 text-emerald-400">
            <Coins className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-medium tracking-tight mb-1">ZkPay Partner Portal</h1>
          <p className="text-neutral-400 text-xs mb-6 leading-relaxed">
            Connect your partner wallet to view settled swap earnings and request fee payouts.
          </p>
          <button
            onClick={login}
            className="w-full py-2.5 px-4 rounded-xl bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors shadow-sm"
          >
            Connect Partner Wallet
          </button>
          <div className="mt-4">
            <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col items-center">
      {/* Top Navbar */}
      <header className="w-full max-w-lg border-b border-neutral-900/80 px-4 py-3 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-white tracking-tight">Partner Portal</h1>
            <p className="text-[10px] text-neutral-400 font-mono">
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
        <div className="border border-neutral-800/80 rounded-2xl p-5 bg-gradient-to-b from-neutral-950 to-neutral-950/40 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1">
                Available Payout Balance
              </span>
              <div className="text-3xl font-semibold tracking-tight text-white flex items-baseline gap-1.5">
                ${balance ? balance.availableBalanceUsd.toFixed(2) : "0.00"}
                <span className="text-xs font-normal text-neutral-500">USD</span>
              </div>
            </div>

            <button
              onClick={() => {
                setPayoutError(null);
                setPayoutSuccess(null);
                setIsModalOpen(true);
              }}
              disabled={!balance || balance.availableBalanceUsd < 1.0}
              className="py-2 px-3.5 rounded-xl bg-white text-black text-xs font-medium hover:bg-neutral-200 transition-all shadow-sm flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Withdraw</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Pending Payout Pill if exists */}
          {balance && balance.pendingPayoutUsd > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px]">
              <Clock className="w-3 h-3" />
              <span>${balance.pendingPayoutUsd.toFixed(2)} USD in pending payout</span>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-neutral-900">
            <div>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Total Earned</span>
              <span className="text-xs font-medium text-neutral-200 font-mono">
                ${balance ? balance.totalEarnedUsd.toFixed(2) : "0.00"}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Withdrawn</span>
              <span className="text-xs font-medium text-neutral-200 font-mono">
                ${balance ? balance.totalWithdrawnUsd.toFixed(2) : "0.00"}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Settled Swaps</span>
              <span className="text-xs font-medium text-emerald-400 font-mono">
                {balance ? balance.settledSwapsCount : 0}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-neutral-900 text-xs font-medium">
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
            Fee Credits ({credits.length})
            {activeTab === "credits" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("apikeys")}
            className={`flex-1 pb-2.5 text-center transition-colors relative ${
              activeTab === "apikeys" ? "text-white font-semibold" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            API Keys ({apiKeys.length})
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
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider inline-flex items-center gap-1 ${
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
                            {p.status}
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
                          <span className="font-semibold text-emerald-400 font-mono">
                            +${c.feeUsd.toFixed(4)} USD
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            ({c.humanTokenAmount} {c.fromAsset})
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-500 font-mono">
                          Swap {c.swapId.slice(0, 12)}... • 1 {c.fromAsset} = ${c.usdRate.toFixed(2)}
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

            {/* TAB 3: API KEYS */}
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
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-medium">
                        {k.status}
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-neutral-950 border border-neutral-800 rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-900 mb-4">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Request Fee Payout</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestPayout} className="space-y-4">
              {/* Asset / Option Selection */}
              <div>
                <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1.5">
                  Payout Asset & Network
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYOUT_OPTIONS.map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => setPayoutOption(opt.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all text-xs flex items-center gap-2 ${
                        payoutOption === opt.id
                          ? "border-white bg-neutral-900 text-white shadow-sm"
                          : "border-neutral-800/80 bg-neutral-950 text-neutral-400 hover:border-neutral-700"
                      }`}
                    >
                      <span className="text-base">{opt.icon}</span>
                      <div>
                        <div className="font-semibold text-white leading-tight">{opt.asset}</div>
                        <div className="text-[10px] text-neutral-400 leading-tight">{opt.chain}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                    Amount (USD)
                  </label>
                  <span className="text-[11px] text-neutral-400">
                    Avail: ${balance ? balance.availableBalanceUsd.toFixed(2) : "0.00"}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-neutral-500 text-xs">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1.00"
                    max={balance?.availableBalanceUsd || 0}
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    placeholder="1.00"
                    required
                    className="w-full pl-7 pr-16 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (balance) setPayoutAmount(balance.availableBalanceUsd.toString());
                    }}
                    className="absolute right-2 top-2 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md text-[10px] font-medium"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Destination Address */}
              <div>
                <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1.5">
                  Destination {PAYOUT_OPTIONS.find((o) => o.id === payoutOption)?.asset} Address
                </label>
                <input
                  type="text"
                  value={payoutAddress}
                  onChange={(e) => setPayoutAddress(e.target.value)}
                  placeholder={PAYOUT_OPTIONS.find((o) => o.id === payoutOption)?.placeholder}
                  required
                  className="w-full px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-white transition-colors"
                />
              </div>

              {/* Error Message */}
              {payoutError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
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
                className="w-full py-2.5 px-4 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submittingPayout ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <span>Submit Payout Request</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
