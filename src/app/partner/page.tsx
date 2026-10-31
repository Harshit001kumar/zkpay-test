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
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
            <LayoutDashboard className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xs font-sans tabular-nums text-outline tracking-normal ">Loading Partner Portal…</span>
        </div>
      </div>
    );
  }

  // Unauthenticated splash
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col justify-between p-6">
        <div className="max-w-md mx-auto w-full pt-12 space-y-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-success/20 to-primary/10 border border-white/10 flex items-center justify-center shadow-card">
            <LayoutDashboard className="w-8 h-8 text-success" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-sans tabular-nums text-primary">
              <Sparkles className="w-3.5 h-3.5 text-success" />
              <span>Partner Ecosystem</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Partner & API Portal</h1>
            <p className="text-sm text-outline leading-relaxed">
              Track cross-chain swaps, checkout sessions, and pay links generated under your project API keys with real-time revenue analytics.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-left pt-4">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
              <span className="text-[11px] font-sans tabular-nums text-success font-bold  tracking-normal block">50/50 Fee Split</span>
              <p className="text-xs text-outline">Instant upfront fee routing with $0 minimum payout threshold.</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
              <span className="text-[11px] font-sans tabular-nums text-primary font-bold  tracking-normal block">Omnichain</span>
              <p className="text-xs text-outline">Track swaps across Base, Arbitrum, Polygon, BSC, Solana, and more.</p>
            </div>
          </div>

          <button
            onClick={login}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-white to-primary hover:from-white hover:to-white text-surface-container-lowest font-bold text-sm tracking-wide transition-colors shadow-card active:scale-[0.98] cursor-pointer"
          >
            Connect Wallet / Log In
          </button>
        </div>

        <div className="max-w-md mx-auto w-full text-center pb-6">
          <Link href="/" className="text-xs text-outline hover:text-white transition-colors inline-flex items-center gap-1.5 font-sans tabular-nums">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to ZkPay</span>
          </Link>
        </div>
      </div>
    );
  }

  const activeKeyObj = apiKeys.find((k) => k.id === selectedApiKey);

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface font-sans pb-28">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-surface-container-lowest/80  border-b border-white/5 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center transition-colors text-primary hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">Partner Dashboard</span>
                <span className="px-2 py-0.5 rounded-full bg-success/10 border border-success/20 text-success text-[10px] font-sans tabular-nums font-bold">
                  LIVE
                </span>
              </div>
              <p className="text-[11px] text-outline font-sans tabular-nums truncate max-w-[200px] sm:max-w-xs">
                {user?.wallet?.address ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` : "Connected"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center transition-colors text-primary hover:text-white disabled:opacity-50 cursor-pointer"
              title="Refresh Transactions"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-success" : ""}`} />
            </button>
            <Link
              href="/docs"
              className="hidden sm:inline-flex px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-primary hover:text-white font-sans tabular-nums transition-colors"
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
              className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between gap-2.5 text-xs font-sans tabular-nums transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-success" />
                <span className="text-white font-semibold">
                  {selectedApiKey === "all" ? "All API Keys (Combined)" : (activeKeyObj?.label || activeKeyObj?.maskedKey || selectedApiKey)}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-outline" />
            </button>

            {apiKeyDropdownOpen && (
              <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-surface-container-low border border-white/10 z-40 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => {
                    setSelectedApiKey("all");
                    setApiKeyDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-sans tabular-nums transition-colors flex items-center justify-between ${
                    selectedApiKey === "all" ? "bg-white/10 text-white font-bold" : "text-primary hover:bg-white/5"
                  }`}
                >
                  <span>All API Keys</span>
                  <span className="text-[10px] text-outline">{apiKeys.length} keys</span>
                </button>

                {apiKeys.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => {
                      setSelectedApiKey(k.id);
                      setApiKeyDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-sans tabular-nums transition-colors flex items-center justify-between ${
                      selectedApiKey === k.id ? "bg-white/10 text-white font-bold" : "text-primary hover:bg-white/5"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="text-white font-medium truncate">{k.label}</div>
                      <div className="text-[10px] text-outline">{k.maskedKey}</div>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20">
                      {k.status}
                    </span>
                  </button>
                ))}

                <div className="border-t border-white/5 pt-1 mt-1">
                  <Link
                    href="/"
                    className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-sans tabular-nums text-primary hover:bg-primary/10 transition-colors flex items-center gap-1.5"
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
                className={`px-3 py-1.5 rounded-lg text-xs font-sans tabular-nums  tracking-normal transition-colors cursor-pointer ${
                  timeRange === r
                    ? "bg-white/10 text-white font-bold shadow-sm"
                    : "text-outline hover:text-primary"
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
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10  space-y-1">
            <div className="flex items-center justify-between text-outline">
              <span className="text-[11px] font-sans tabular-nums font-bold  tracking-normal">Total Volume</span>
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {isLoadingOverview ? (
                <div className="h-7 w-24 bg-white/5 rounded animate-pulse"></div>
              ) : (
                `$${(metrics?.totalVolumeUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </div>
            <p className="text-[10px] text-outline font-sans tabular-nums">USD processed</p>
          </div>

          {/* Total Transactions */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10  space-y-1">
            <div className="flex items-center justify-between text-outline">
              <span className="text-[11px] font-sans tabular-nums font-bold  tracking-normal">Transactions</span>
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-baseline gap-2">
              {isLoadingOverview ? (
                <div className="h-7 w-16 bg-white/5 rounded animate-pulse"></div>
              ) : (
                <>
                  <span>{metrics?.totalTransactions || 0}</span>
                  <span className="text-[11px] font-sans tabular-nums px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20 font-medium">
                    {metrics?.successRate || 100}% ok
                  </span>
                </>
              )}
            </div>
            <p className="text-[10px] text-outline font-sans tabular-nums">
              {metrics?.successfulTransactions || 0} settled · {metrics?.pendingTransactions || 0} pending
            </p>
          </div>

          {/* Estimated Partner Earnings */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-success/10 to-transparent border border-success/20  space-y-1">
            <div className="flex items-center justify-between text-success">
              <span className="text-[11px] font-sans tabular-nums font-bold  tracking-normal">Partner Earnings</span>
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-success tracking-tight">
              {isLoadingOverview ? (
                <div className="h-7 w-20 bg-success/10 rounded animate-pulse"></div>
              ) : (
                `+$${(metrics?.estimatedPartnerEarningsUsd || 0).toFixed(2)}`
              )}
            </div>
            <p className="text-[10px] text-success/80 font-sans tabular-nums">Instant upfront fee routing</p>
          </div>

          {/* Active API Keys */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10  space-y-1">
            <div className="flex items-center justify-between text-outline">
              <span className="text-[11px] font-sans tabular-nums font-bold  tracking-normal">Active Keys</span>
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {isLoadingOverview ? (
                <div className="h-7 w-12 bg-white/5 rounded animate-pulse"></div>
              ) : (
                metrics?.activeKeysCount ?? apiKeys.length
              )}
            </div>
            <p className="text-[10px] text-outline font-sans tabular-nums">Across Swaps & Pay</p>
          </div>
        </div>

        {/* Ledger Section Header & Filter Controls */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums">Transaction Ledger</h2>
            <span className="text-xs text-outline font-sans tabular-nums">{totalCount} recorded</span>
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
                className={`px-3 py-1.5 rounded-xl text-xs font-sans tabular-nums whitespace-nowrap transition-colors cursor-pointer ${
                  productFilter === tab.id
                    ? "bg-white text-surface-container-lowest font-bold shadow-md"
                    : "bg-white/[0.04] text-primary hover:bg-white/[0.08] border border-white/5"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Status Bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-outline absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Tx ID, Hash, UPI, or Key..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-outline focus:outline-none focus:border-white/30 font-sans tabular-nums transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-white"
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
                  className={`px-2.5 py-1 rounded-lg text-xs font-sans tabular-nums transition-colors cursor-pointer ${
                    statusFilter === s.id
                      ? "bg-white/10 text-white font-bold"
                      : "text-outline hover:text-primary"
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
                <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-outline">
                  <Terminal className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">No transactions found</p>
                  <p className="text-xs text-outline max-w-sm mx-auto">
                    Transactions generated by your API keys or checkout sessions will show up here automatically in real time.
                  </p>
                </div>
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-sans tabular-nums text-primary transition-colors"
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
                    className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    {/* Left Icon + Type */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-primary group-hover:text-white transition-colors">
                          {tx.type === "swap" ? (
                            <ArrowLeftRight className="w-4 h-4" />
                          ) : tx.type === "payin_session" ? (
                            <CreditCard className="w-4 h-4" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
                        </div>
                        <span
                          className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-surface-container-lowest ${
                            isCompleted
                              ? "bg-success"
                              : isPending
                              ? "bg-warning animate-pulse"
                              : "bg-error"
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{tx.productLabel}</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-sans tabular-nums bg-white/5 text-outline border border-white/5">
                            {tx.chain ? tx.chain.toUpperCase() : "BASE"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-outline font-sans tabular-nums truncate">
                          <span>{tx.apiKeyLabel}</span>
                          <span>·</span>
                          <span>{new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Amount + Status */}
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <div className="text-xs sm:text-sm font-bold text-white font-sans tabular-nums">{tx.amount}</div>
                      {tx.partnerFeeUsdEstimate > 0 ? (
                        <div className="text-[10px] font-sans tabular-nums text-success font-medium">
                          +${tx.partnerFeeUsdEstimate.toFixed(3)} earned
                        </div>
                      ) : (
                        <div
                          className={`text-[10px] font-sans tabular-nums font-medium ${
                            isCompleted ? "text-success" : isPending ? "text-warning" : "text-error"
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
            <div className="flex items-center justify-between pt-2 text-xs font-sans tabular-nums text-outline">
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
        <div className="fixed inset-0 z-50 bg-black/70  flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-surface-container-low border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{selectedTx.productLabel}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-sans tabular-nums font-bold ${
                      selectedTx.status === "COMPLETED"
                        ? "bg-success/10 text-success border border-success/20"
                        : selectedTx.status === "PENDING"
                        ? "bg-warning/10 text-warning border border-warning/20"
                        : "bg-error/10 text-error border border-error/20"
                    }`}
                  >
                    {selectedTx.rawStatus}
                  </span>
                </div>
                <p className="text-xs font-sans tabular-nums text-outline mt-0.5">{selectedTx.id}</p>
              </div>

              <button
                onClick={() => setSelectedTx(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-outline hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Summary Box */}
            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-outline">Gross Amount</span>
                <span className="text-white font-sans tabular-nums font-bold">{selectedTx.amount}</span>
              </div>

              {selectedTx.fiatAmount ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-outline">Fiat Value</span>
                  <span className="text-white font-sans tabular-nums font-semibold">₹{selectedTx.fiatAmount} INR</span>
                </div>
              ) : null}

              {selectedTx.partnerFeeUsdEstimate > 0 ? (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                  <span className="text-success font-semibold">Partner Fee Earned</span>
                  <span className="text-success font-sans tabular-nums font-bold">
                    +{selectedTx.partnerFeeAmount || `$${selectedTx.partnerFeeUsdEstimate.toFixed(3)}`}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Technical & Blockchain Details */}
            <div className="space-y-2.5 text-xs font-sans tabular-nums">
              <span className="text-[11px] font-bold text-outline  tracking-normal block">Technical Details</span>

              {/* Deposit Address */}
              {selectedTx.depositAddress && (
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="text-[10px] text-outline block">Single-Use Deposit Address:</span>
                    <span className="text-primary truncate block select-all">{selectedTx.depositAddress}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(selectedTx.depositAddress!, "dep")}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-outline hover:text-white transition-colors flex-shrink-0"
                  >
                    {copiedId === "dep" ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {/* Recipient */}
              {selectedTx.recipient && (
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="text-[10px] text-outline block">Destination / Recipient:</span>
                    <span className="text-primary truncate block select-all">{selectedTx.recipient}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(selectedTx.recipient!, "rec")}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-outline hover:text-white transition-colors flex-shrink-0"
                  >
                    {copiedId === "rec" ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {/* Transaction Hash */}
              {selectedTx.txHash && (
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="text-[10px] text-outline block">Settlement Transaction Hash:</span>
                    <span className="text-primary truncate block">{selectedTx.txHash}</span>
                  </div>
                  {selectedTx.explorerUrl ? (
                    <a
                      href={selectedTx.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-primary transition-colors flex-shrink-0"
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
                  <span className="text-[10px] text-outline block">Attributed Key:</span>
                  <span className="text-white truncate block">{selectedTx.apiKeyLabel}</span>
                </div>
                <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] text-outline block">Created At:</span>
                  <span className="text-white truncate block">{new Date(selectedTx.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setSelectedTx(null)}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold font-sans tabular-nums  tracking-normal transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
