"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  LayoutDashboard,
  ArrowLeft,
  RefreshCw,
  Key,
  ExternalLink,
  Copy,
  Check,
  Search,
  Filter,
  ArrowLeftRight,
  CreditCard,
  FileText,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  X,
  ChevronDown,
  Terminal,
  ShieldCheck,
  Sparkles,
  Layers,
  Activity,
} from "lucide-react";
import { PartnerTransaction, PartnerMetrics, getExplorerTxUrl } from "@/lib/partnerTypes";

type TimeRange = "24h" | "7d" | "30d" | "all";
type ProductFilter = "all" | "swaps" | "payins" | "paylinks";
type StatusFilter = "all" | "COMPLETED" | "PENDING" | "FAILED";

export default function PartnerDashboardPage() {
  const router = useRouter();
  const { ready, authenticated, login, getAccessToken, user } = usePrivy();

  // Filters & State
  const [selectedApiKey, setSelectedApiKey] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Data
  const [metrics, setMetrics] = useState<PartnerMetrics | null>(null);
  const [apiKeys, setApiKeys] = useState<{ id: string; label: string; maskedKey: string; status: string }[]>([]);
  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // UI state
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [isLoadingTx, setIsLoadingTx] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTx, setSelectedTx] = useState<PartnerTransaction | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [apiKeyDropdownOpen, setApiKeyDropdownOpen] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 20;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 1. Fetch Metrics & API Keys list
  const loadOverview = async () => {
    if (!authenticated) return;
    try {
      setIsLoadingOverview(true);
      const token = await getAccessToken();
      if (!token) return;

      const params = new URLSearchParams({
        timeRange,
        ...(selectedApiKey !== "all" ? { apiKeyId: selectedApiKey } : {}),
      });

      const res = await fetch(`/api/partner/overview?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        setMetrics(data.metrics);
        setApiKeys(data.apiKeys || []);
      }
    } catch (err) {
      console.warn("[PartnerDashboard] Failed to load overview:", err);
    } finally {
      setIsLoadingOverview(false);
    }
  };

  // 2. Fetch Transactions Ledger
  const loadTransactions = async () => {
    if (!authenticated) return;
    try {
      setIsLoadingTx(true);
      const token = await getAccessToken();
      if (!token) return;

      const offset = (page - 1) * limit;
      const params = new URLSearchParams({
        type: productFilter,
        status: statusFilter,
        search: searchQuery,
        limit: String(limit),
        offset: String(offset),
        ...(selectedApiKey !== "all" ? { apiKeyId: selectedApiKey } : {}),
      });

      const res = await fetch(`/api/partner/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        setTransactions(data.transactions || []);
        setTotalCount(data.totalCount || 0);
      }
    } catch (err) {
      console.warn("[PartnerDashboard] Failed to load transactions:", err);
    } finally {
      setIsLoadingTx(false);
    }
  };

  // Refresh all data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadOverview(), loadTransactions()]);
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (ready && authenticated) {
      loadOverview();
    }
  }, [ready, authenticated, selectedApiKey, timeRange]);

  useEffect(() => {
    if (ready && authenticated) {
      loadTransactions();
    }
  }, [ready, authenticated, selectedApiKey, productFilter, statusFilter, searchQuery, page]);

  // Loading skeleton while Privy initializes
  if (!ready) {
    return (
      <div className="min-h-screen bg-[#07090e] text-[#e5e2e3] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
            <LayoutDashboard className="w-5 h-5 text-[#c0c6de]" />
          </div>
          <span className="text-xs font-mono text-[#909097] tracking-wider uppercase">Loading Partner Portal...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated splash
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#07090e] text-[#e5e2e3] flex flex-col justify-between p-6">
        <div className="max-w-md mx-auto w-full pt-12 space-y-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/10 border border-white/10 flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.15)]">
            <LayoutDashboard className="w-8 h-8 text-emerald-400" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-[#c0c6de]">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Partner Ecosystem</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Partner & API Portal</h1>
            <p className="text-sm text-[#909097] leading-relaxed">
              Track cross-chain swaps, checkout sessions, and pay links generated under your project API keys with real-time revenue analytics.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-left pt-4">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
              <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase tracking-wider block">50/50 Fee Split</span>
              <p className="text-xs text-[#909097]">Instant upfront fee routing with $0 minimum payout threshold.</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
              <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase tracking-wider block">Omnichain</span>
              <p className="text-xs text-[#909097]">Track swaps across Base, Arbitrum, Polygon, BSC, Solana, and more.</p>
            </div>
          </div>

          <button
            onClick={login}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-white to-[#c0c6de] hover:from-white hover:to-white text-[#07090e] font-bold text-sm tracking-wide transition-all shadow-[0_4px_25px_rgba(255,255,255,0.15)] active:scale-[0.98] cursor-pointer"
          >
            Connect Wallet / Log In
          </button>
        </div>

        <div className="max-w-md mx-auto w-full text-center pb-6">
          <Link href="/" className="text-xs text-[#909097] hover:text-white transition-colors inline-flex items-center gap-1.5 font-mono">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to ZkPay</span>
          </Link>
        </div>
      </div>
    );
  }

  const activeKeyObj = apiKeys.find((k) => k.id === selectedApiKey);

  return (
    <div className="min-h-screen bg-[#07090e] text-[#e5e2e3] font-sans pb-28">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-[#07090e]/80 backdrop-blur-2xl border-b border-white/5 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center transition-all text-[#c0c6de] hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">Partner Dashboard</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                  LIVE
                </span>
              </div>
              <p className="text-[11px] text-[#909097] font-mono truncate max-w-[200px] sm:max-w-xs">
                {user?.wallet?.address ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` : "Connected"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center transition-all text-[#c0c6de] hover:text-white disabled:opacity-50 cursor-pointer"
              title="Refresh Transactions"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-emerald-400" : ""}`} />
            </button>
            <Link
              href="/docs"
              className="hidden sm:inline-flex px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-[#c0c6de] hover:text-white font-mono transition-all"
            >
              API Docs
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-5">
        {/* API Key Selector & Time Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Key Dropdown */}
          <div className="relative">
            <button
              onClick={() => setApiKeyDropdownOpen(!apiKeyDropdownOpen)}
              className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between gap-2.5 text-xs font-mono transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-white font-semibold">
                  {selectedApiKey === "all" ? "All API Keys (Combined)" : (activeKeyObj?.label || activeKeyObj?.maskedKey || selectedApiKey)}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#909097]" />
            </button>

            {apiKeyDropdownOpen && (
              <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-[#0f121a] border border-white/10 shadow-2xl z-40 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => {
                    setSelectedApiKey("all");
                    setApiKeyDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition-colors flex items-center justify-between ${
                    selectedApiKey === "all" ? "bg-white/10 text-white font-bold" : "text-[#c0c6de] hover:bg-white/5"
                  }`}
                >
                  <span>All API Keys</span>
                  <span className="text-[10px] text-[#909097]">{apiKeys.length} keys</span>
                </button>

                {apiKeys.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => {
                      setSelectedApiKey(k.id);
                      setApiKeyDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition-colors flex items-center justify-between ${
                      selectedApiKey === k.id ? "bg-white/10 text-white font-bold" : "text-[#c0c6de] hover:bg-white/5"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="text-white font-medium truncate">{k.label}</div>
                      <div className="text-[10px] text-[#909097]">{k.maskedKey}</div>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {k.status}
                    </span>
                  </button>
                ))}

                <div className="border-t border-white/5 pt-1 mt-1">
                  <Link
                    href="/"
                    className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-mono text-cyan-400 hover:bg-cyan-500/10 transition-colors flex items-center gap-1.5"
                  >
                    <span>+ Manage / Create New Key in Profile</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Time range tabs */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 self-start sm:self-auto">
            {(["24h", "7d", "30d", "all"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                  timeRange === r
                    ? "bg-white/10 text-white font-bold shadow-sm"
                    : "text-[#909097] hover:text-[#c0c6de]"
                }`}
              >
                {r === "all" ? "All Time" : r}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Volume */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-1">
            <div className="flex items-center justify-between text-[#909097]">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider">Total Volume</span>
              <DollarSign className="w-4 h-4 text-[#c0c6de]" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {isLoadingOverview ? (
                <div className="h-7 w-24 bg-white/5 rounded animate-pulse"></div>
              ) : (
                `$${(metrics?.totalVolumeUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </div>
            <p className="text-[10px] text-[#909097] font-mono">USD processed</p>
          </div>

          {/* Total Transactions */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-1">
            <div className="flex items-center justify-between text-[#909097]">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider">Transactions</span>
              <Activity className="w-4 h-4 text-[#c0c6de]" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-baseline gap-2">
              {isLoadingOverview ? (
                <div className="h-7 w-16 bg-white/5 rounded animate-pulse"></div>
              ) : (
                <>
                  <span>{metrics?.totalTransactions || 0}</span>
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    {metrics?.successRate || 100}% ok
                  </span>
                </>
              )}
            </div>
            <p className="text-[10px] text-[#909097] font-mono">
              {metrics?.successfulTransactions || 0} settled · {metrics?.pendingTransactions || 0} pending
            </p>
          </div>

          {/* Estimated Partner Earnings */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 backdrop-blur-xl space-y-1">
            <div className="flex items-center justify-between text-emerald-400">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider">Partner Earnings</span>
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-300 tracking-tight">
              {isLoadingOverview ? (
                <div className="h-7 w-20 bg-emerald-500/10 rounded animate-pulse"></div>
              ) : (
                `+$${(metrics?.estimatedPartnerEarningsUsd || 0).toFixed(2)}`
              )}
            </div>
            <p className="text-[10px] text-emerald-400/80 font-mono">Instant upfront fee routing</p>
          </div>

          {/* Active API Keys */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-1">
            <div className="flex items-center justify-between text-[#909097]">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider">Active Keys</span>
              <Layers className="w-4 h-4 text-[#c0c6de]" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {isLoadingOverview ? (
                <div className="h-7 w-12 bg-white/5 rounded animate-pulse"></div>
              ) : (
                metrics?.activeKeysCount ?? apiKeys.length
              )}
            </div>
            <p className="text-[10px] text-[#909097] font-mono">Across Swaps & Pay</p>
          </div>
        </div>

        {/* Ledger Section Header & Filter Controls */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Transaction Ledger</h2>
            <span className="text-xs text-[#909097] font-mono">{totalCount} recorded</span>
          </div>

          {/* Product Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "all", label: "All Products" },
              { id: "swaps", label: "Cross-Chain Swaps" },
              { id: "payins", label: "Pay-In Checkout" },
              { id: "paylinks", label: "Pay Links" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setProductFilter(tab.id as ProductFilter);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono whitespace-nowrap transition-all cursor-pointer ${
                  productFilter === tab.id
                    ? "bg-white text-[#07090e] font-bold shadow-md"
                    : "bg-white/[0.04] text-[#c0c6de] hover:bg-white/[0.08] border border-white/5"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Status Bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#909097] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Tx ID, Hash, UPI, or Key..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-[#909097] focus:outline-none focus:border-white/30 font-mono transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#909097] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 self-start sm:self-auto">
              {[
                { id: "all", label: "All" },
                { id: "COMPLETED", label: "Settled" },
                { id: "PENDING", label: "Pending" },
                { id: "FAILED", label: "Failed" },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setStatusFilter(s.id as StatusFilter);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    statusFilter === s.id
                      ? "bg-white/10 text-white font-bold"
                      : "text-[#909097] hover:text-[#c0c6de]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transactions List */}
          <div className="space-y-2">
            {isLoadingTx ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 h-20 animate-pulse"></div>
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-[#909097]">
                  <Terminal className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">No transactions found</p>
                  <p className="text-xs text-[#909097] max-w-sm mx-auto">
                    Transactions generated by your API keys or checkout sessions will show up here automatically in real time.
                  </p>
                </div>
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-cyan-400 transition-all"
                >
                  <span>View API cURL Examples</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              transactions.map((tx) => {
                const isCompleted = tx.status === "COMPLETED";
                const isPending = tx.status === "PENDING";
                const isFailed = tx.status === "FAILED" || tx.status === "EXPIRED";

                return (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    {/* Left Icon + Type */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-[#c0c6de] group-hover:text-white transition-colors">
                          {tx.type === "swap" ? (
                            <ArrowLeftRight className="w-4 h-4" />
                          ) : tx.type === "payin_session" ? (
                            <CreditCard className="w-4 h-4" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
                        </div>
                        <span
                          className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-[#07090e] ${
                            isCompleted
                              ? "bg-emerald-400"
                              : isPending
                              ? "bg-amber-400 animate-pulse"
                              : "bg-rose-400"
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{tx.productLabel}</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-white/5 text-[#909097] border border-white/5">
                            {tx.chain ? tx.chain.toUpperCase() : "BASE"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#909097] font-mono truncate">
                          <span>{tx.apiKeyLabel}</span>
                          <span>·</span>
                          <span>{new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Amount + Status */}
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <div className="text-xs sm:text-sm font-bold text-white font-mono">{tx.amount}</div>
                      {tx.partnerFeeUsdEstimate > 0 ? (
                        <div className="text-[10px] font-mono text-emerald-400 font-medium">
                          +${tx.partnerFeeUsdEstimate.toFixed(3)} earned
                        </div>
                      ) : (
                        <div
                          className={`text-[10px] font-mono font-medium ${
                            isCompleted ? "text-emerald-400" : isPending ? "text-amber-400" : "text-rose-400"
                          }`}
                        >
                          {isCompleted ? "Settled" : isPending ? "Pending" : "Failed"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Simple Pagination */}
          {totalCount > limit && (
            <div className="flex items-center justify-between pt-2 text-xs font-mono text-[#909097]">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.ceil(totalCount / limit)}
              </span>
              <button
                disabled={page * limit >= totalCount}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Transaction Detail Drawer / Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#0e111a] border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{selectedTx.productLabel}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      selectedTx.status === "COMPLETED"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : selectedTx.status === "PENDING"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {selectedTx.rawStatus}
                  </span>
                </div>
                <p className="text-xs font-mono text-[#909097] mt-0.5">{selectedTx.id}</p>
              </div>

              <button
                onClick={() => setSelectedTx(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#909097] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Summary Box */}
            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#909097]">Gross Amount</span>
                <span className="text-white font-mono font-bold">{selectedTx.amount}</span>
              </div>

              {selectedTx.fiatAmount ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#909097]">Fiat Value</span>
                  <span className="text-white font-mono font-semibold">₹{selectedTx.fiatAmount} INR</span>
                </div>
              ) : null}

              {selectedTx.partnerFeeUsdEstimate > 0 ? (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                  <span className="text-emerald-400 font-semibold">Partner Fee Earned</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    +{selectedTx.partnerFeeAmount || `$${selectedTx.partnerFeeUsdEstimate.toFixed(3)}`}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Technical & Blockchain Details */}
            <div className="space-y-2.5 text-xs font-mono">
              <span className="text-[11px] font-bold text-[#909097] uppercase tracking-wider block">Technical Details</span>

              {/* Deposit Address */}
              {selectedTx.depositAddress && (
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="text-[10px] text-[#909097] block">Single-Use Deposit Address:</span>
                    <span className="text-[#c0c6de] truncate block select-all">{selectedTx.depositAddress}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(selectedTx.depositAddress!, "dep")}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#909097] hover:text-white transition-colors flex-shrink-0"
                  >
                    {copiedId === "dep" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {/* Recipient */}
              {selectedTx.recipient && (
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="text-[10px] text-[#909097] block">Destination / Recipient:</span>
                    <span className="text-[#c0c6de] truncate block select-all">{selectedTx.recipient}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(selectedTx.recipient!, "rec")}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#909097] hover:text-white transition-colors flex-shrink-0"
                  >
                    {copiedId === "rec" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {/* Transaction Hash */}
              {selectedTx.txHash && (
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="text-[10px] text-[#909097] block">Settlement Transaction Hash:</span>
                    <span className="text-[#c0c6de] truncate block">{selectedTx.txHash}</span>
                  </div>
                  {selectedTx.explorerUrl ? (
                    <a
                      href={selectedTx.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-400 transition-colors flex-shrink-0"
                      title="Open Explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : null}
                </div>
              )}

              {/* Attribution */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] text-[#909097] block">Attributed Key:</span>
                  <span className="text-white truncate block">{selectedTx.apiKeyLabel}</span>
                </div>
                <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] text-[#909097] block">Created At:</span>
                  <span className="text-white truncate block">{new Date(selectedTx.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setSelectedTx(null)}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold font-mono uppercase tracking-wider transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
