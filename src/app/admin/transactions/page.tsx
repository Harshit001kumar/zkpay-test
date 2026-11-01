"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Download,
  Search,
  ExternalLink,
  Copy,
  Check,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Layers,
  X,
  Repeat,
  DollarSign,
  Sparkles,
  Code2,
  QrCode,
  Smartphone,
} from "lucide-react";
import {
  AdminSystemTransaction,
  AdminSystemMetrics,
  AdminTxChannel,
  AdminTxCategory,
  AdminTxStatus,
} from "@/lib/server/adminLedger";

export default function AdminTransactionsPage() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();

  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data states
  const [metrics, setMetrics] = useState<AdminSystemMetrics | null>(null);
  const [transactions, setTransactions] = useState<AdminSystemTransaction[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Filter states
  const [timeRange, setTimeRange] = useState<"all" | "24h" | "7d" | "30d">("all");
  const [channelFilter, setChannelFilter] = useState<"all" | AdminTxChannel>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | AdminTxCategory>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AdminTxStatus>("all");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  // Interactive / UI states
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<AdminSystemTransaction | null>(null);

  // Verify Admin Auth
  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setIsVerifying(false);
      setIsAuthorized(false);
      return;
    }

    let active = true;
    (async () => {
      setIsVerifying(true);
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/admin/auth/verify", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (active) {
          if (res.ok && data.authorized) {
            setIsAuthorized(true);
            setAuthError(null);
          } else {
            setIsAuthorized(false);
            setAuthError(data.error || "Access Denied: Admin privileges required.");
          }
        }
      } catch (err: any) {
        if (active) {
          setIsAuthorized(false);
          setAuthError(err?.message || "Failed to verify admin status");
        }
      } finally {
        if (active) setIsVerifying(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [ready, authenticated, getAccessToken]);

  // Load Transactions & Metrics
  const loadTransactions = useCallback(async () => {
    if (!isAuthorized) return;
    setIsLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
        timeRange,
        channel: channelFilter,
        category: categoryFilter,
        status: statusFilter,
        chain: chainFilter,
      });
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }

      const res = await fetch(`/api/admin/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMetrics(data.metrics);
        setTransactions(data.transactions || []);
        if (data.pagination) setPagination(data.pagination);
      }
    } catch (err) {
      console.warn("[AdminTransactions] Fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthorized, getAccessToken, page, timeRange, channelFilter, categoryFilter, statusFilter, chainFilter, searchQuery]);

  useEffect(() => {
    if (isAuthorized) {
      loadTransactions();
    }
  }, [isAuthorized, loadTransactions]);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // CSV Export handler
  const handleExportCsv = async () => {
    if (!isAuthorized) return;
    setIsExporting(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({
        timeRange,
        channel: channelFilter,
        category: categoryFilter,
        status: statusFilter,
        chain: chainFilter,
        export: "csv",
      });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/admin/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("CSV export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zkpay-system-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Failed to export CSV: " + (err?.message || err));
    } finally {
      setIsExporting(false);
    }
  };

  // Render Loading
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin motion-reduce:animate-none mb-4" />
        <p className="font-sans tabular-nums text-xs tracking-normal text-outline">
          Authenticating enclave credentials…
        </p>
      </div>
    );
  }

  // Render Unauthorized
  if (!authenticated || !isAuthorized) {
    return (
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="w-full max-w-md bg-surface-container border border-outline-variant/30 rounded-3xl p-8 flex flex-col items-center text-center relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center mb-5 text-error">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2 tracking-tight">Admin authentication required</h2>
          <p className="text-outline text-xs mb-6 leading-relaxed">
            {authError || "Connect an authorized cryptographic admin wallet key to access the ZkPay system transaction archives."}
          </p>
          {!authenticated ? (
            <button
              onClick={login}
              className="w-full py-3 px-4 rounded-xl bg-primary text-black font-bold text-xs hover:brightness-110 active:scale-95 transition-transform cursor-pointer"
            >
              Sign in with Privy
            </button>
          ) : (
            <button
              onClick={logout}
              className="w-full py-3 px-4 rounded-xl bg-surface-container-high text-white font-bold text-xs hover:bg-surface-container-highest transition-colors cursor-pointer"
            >
              Switch account
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface font-sans pb-24 selection:bg-primary/20">
      {/* Sticky Top Command Bar */}
      <header className="sticky top-0 z-40 bg-surface-container-lowest/95 border-b border-white/10 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Brand Identity + Navigation Switcher */}
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/"
              className="text-outline hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">App</span>
            </Link>
            <div className="h-4 w-px bg-white/10 shrink-0" />

            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
              <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white whitespace-nowrap">
                Transactions Ledger
              </h1>
            </div>

            {/* Sub-navigation tabs between /admin and /admin/transactions */}
            <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-white/10 ml-2">
              <Link
                href="/admin"
                className="px-3 py-1 rounded-lg text-xs font-medium text-outline hover:text-white transition-colors"
              >
                Infrastructure & System
              </Link>
              <span className="px-3 py-1 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/15">
                Transactions Ledger
              </span>
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Time Window Pills */}
            <div className="hidden lg:flex items-center p-0.5 rounded-xl bg-surface-container-low border border-white/10 text-[11px] font-bold">
              {(["all", "30d", "7d", "24h"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTimeRange(t);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    timeRange === t ? "bg-primary text-black" : "text-outline hover:text-white"
                  }`}
                >
                  {t === "all" ? "All" : t}
                </button>
              ))}
            </div>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCsv}
              disabled={isExporting}
              title="Export Filtered CSV"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-white/10 text-xs font-medium text-white transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            {/* Refresh */}
            <button
              onClick={loadTransactions}
              disabled={isLoading}
              title="Refresh Data"
              className="p-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-white/10 text-primary transition-colors disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            </button>

            {/* Exit */}
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-xl bg-error/10 hover:bg-error/20 border border-error/20 text-error text-[11px] font-bold transition-colors cursor-pointer"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Mobile Sub-Navigation Pill */}
        <div className="flex md:hidden items-center justify-between p-1 rounded-2xl bg-surface-container-low border border-white/10 text-xs font-medium">
          <Link
            href="/admin"
            className="flex-1 py-1.5 text-center text-outline hover:text-white transition-colors"
          >
            Infrastructure
          </Link>
          <span className="flex-1 py-1.5 text-center rounded-xl bg-white/10 text-white font-bold border border-white/15">
            Transactions
          </span>
        </div>

        {/* ── KPI METRICS CARDS (4 MONOLITHS) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Volume */}
          <div className="p-5 rounded-2xl bg-surface-container-low border border-white/10 relative overflow-hidden group">
            <div className="flex items-center justify-between text-outline text-xs mb-2">
              <span className="font-medium tracking-tight">Total processed volume</span>
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight tabular-nums">
              ${(metrics?.totalVolumeUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-outline">
              <span>Payments: ${(metrics?.volumeByCategory?.paymentsUsd ?? 0).toLocaleString()}</span>
              <span>Swaps: ${(metrics?.volumeByCategory?.swapsUsd ?? 0).toLocaleString()}</span>
            </div>
          </div>

          {/* Card 2: Total Transactions */}
          <div className="p-5 rounded-2xl bg-surface-container-low border border-white/10 relative overflow-hidden group">
            <div className="flex items-center justify-between text-outline text-xs mb-2">
              <span className="font-medium tracking-tight">Total transactions</span>
              <Activity className="w-4 h-4 text-secondary" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight tabular-nums">
              {(metrics?.totalTransactions ?? 0).toLocaleString()}
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-outline">
              <span className="inline-flex items-center gap-1">
                <Smartphone className="w-3 h-3 text-secondary" /> App: {metrics?.countsByChannel?.appCount ?? 0}
              </span>
              <span className="inline-flex items-center gap-1">
                <Code2 className="w-3 h-3 text-primary" /> API: {metrics?.countsByChannel?.apiCount ?? 0}
              </span>
            </div>
          </div>

          {/* Card 3: Settlement Rate */}
          <div className="p-5 rounded-2xl bg-surface-container-low border border-white/10 relative overflow-hidden group">
            <div className="flex items-center justify-between text-outline text-xs mb-2">
              <span className="font-medium tracking-tight">Settlement success</span>
              <ShieldCheck className="w-4 h-4 text-success" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight tabular-nums flex items-baseline gap-2">
              <span>{metrics?.successRate ?? 100}%</span>
              <span className="text-xs text-success font-medium">completed</span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px]">
              <span className="text-warning">Pending: {metrics?.pendingTransactions ?? 0}</span>
              <span className="text-error">Failed/Exp: {(metrics?.failedTransactions ?? 0) + (metrics?.refundedTransactions ?? 0)}</span>
            </div>
          </div>

          {/* Card 4: Platform Revenue / Fees */}
          <div className="p-5 rounded-2xl bg-surface-container-low border border-white/10 relative overflow-hidden group">
            <div className="flex items-center justify-between text-outline text-xs mb-2">
              <span className="font-medium tracking-tight">Treasury revenue</span>
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight tabular-nums">
              ${(metrics?.totalFeesUsd ?? 0).toFixed(2)}
              <span className="text-xs text-outline font-normal ml-1.5">USDC</span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-outline">
              <span>Active chains: {Object.keys(metrics?.chainBreakdown || {}).length}</span>
              <span className="text-primary font-medium">100% On-chain</span>
            </div>
          </div>
        </div>

        {/* ── FILTER & SEARCH CONTROL DECK ── */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface-container-low border border-white/10 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
            {/* Search Input */}
            <div className="lg:col-span-5 relative">
              <Search className="w-4 h-4 text-outline absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search tx hash, order ID, UPI ID, address..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-9 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-white placeholder:text-outline focus:outline-none focus:border-primary/50 transition-colors"
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

            {/* Channel Filter (App vs API) */}
            <div className="lg:col-span-3 flex items-center p-1 rounded-xl bg-surface-container-lowest border border-white/10">
              {(["all", "app", "api"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setChannelFilter(c);
                    setPage(1);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-center ${
                    channelFilter === c
                      ? "bg-white/15 text-white"
                      : "text-outline hover:text-white"
                  }`}
                >
                  {c === "all" ? "All Channels" : c === "app" ? "In-App" : "Developer API"}
                </button>
              ))}
            </div>

            {/* Category Filter (Payments vs Swaps) */}
            <div className="lg:col-span-4 flex items-center p-1 rounded-xl bg-surface-container-lowest border border-white/10">
              {(["all", "payment", "swap"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setCategoryFilter(cat);
                    setPage(1);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-center ${
                    categoryFilter === cat
                      ? "bg-white/15 text-white"
                      : "text-outline hover:text-white"
                  }`}
                >
                  {cat === "all" ? "All Types" : cat === "payment" ? "Payments" : "Swaps"}
                </button>
              ))}
            </div>
          </div>

          {/* Secondary Filter Dropdowns & Status Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Chain Dropdown */}
              <select
                value={chainFilter}
                onChange={(e) => {
                  setChainFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-primary/50 cursor-pointer"
              >
                <option value="all">All chains and corridors</option>
                <option value="base">Base L2</option>
                <option value="sol">Solana</option>
                <option value="polygon">Polygon</option>
                <option value="arb">Arbitrum</option>
                <option value="bsc">BNB Chain</option>
                <option value="ltc">Litecoin</option>
              </select>

              {/* Status Dropdown */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setPage(1);
                }}
                className="px-3 py-1.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-primary/50 cursor-pointer"
              >
                <option value="all">All statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending action</option>
                <option value="REFUNDED">Refunded</option>
                <option value="FAILED">Failed</option>
                <option value="EXPIRED">Expired</option>
              </select>

              {(channelFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all" || chainFilter !== "all" || searchQuery) && (
                <button
                  onClick={() => {
                    setChannelFilter("all");
                    setCategoryFilter("all");
                    setStatusFilter("all");
                    setChainFilter("all");
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="text-xs text-primary hover:underline px-2 cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>

            <div className="text-xs text-outline font-medium">
              Showing <span className="text-white font-bold">{transactions.length}</span> of{" "}
              <span className="text-white font-bold">{pagination.total}</span> records
            </div>
          </div>
        </div>

        {/* ── UNIFIED TRANSACTIONS LIST / TABLE ── */}
        <div className="rounded-2xl bg-surface-container-low border border-white/10 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
              <p className="text-xs text-outline">Loading transactions ledger…</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Layers className="w-8 h-8 text-outline mx-auto mb-2 opacity-50" />
              <h3 className="text-sm font-bold text-white">No transactions found</h3>
              <p className="text-xs text-outline max-w-sm mx-auto">
                No system transactions matched your current filters. Try adjusting the search query or status criteria.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-container border-b border-white/10 text-outline text-[11px] font-semibold">
                    <tr>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Category and channel</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Route and asset</th>
                      <th className="py-3 px-4">Counterparty</th>
                      <th className="py-3 px-4">Tx hash</th>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-sans tabular-nums">
                    {transactions.map((tx) => {
                      const isCompleted = tx.status === "COMPLETED";
                      const isPending = tx.status === "PENDING";
                      const isRefunded = tx.status === "REFUNDED";

                      return (
                        <tr
                          key={tx.id}
                          onClick={() => setSelectedTx(tx)}
                          className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                        >
                          {/* Status */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                isCompleted
                                  ? "bg-success/15 text-success border border-success/30"
                                  : isPending
                                  ? "bg-warning/15 text-warning border border-warning/30"
                                  : isRefunded
                                  ? "bg-primary/15 text-primary border border-primary/30"
                                  : "bg-error/15 text-error border border-error/30"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isCompleted ? "bg-success" : isPending ? "bg-warning" : isRefunded ? "bg-primary" : "bg-error"
                                }`}
                              />
                              {tx.status}
                            </span>
                          </td>

                          {/* Category & Channel */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="font-bold text-white tracking-tight">{tx.title}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                                    tx.channel === "api"
                                      ? "bg-primary/20 text-primary border border-primary/30"
                                      : "bg-secondary/20 text-secondary border border-secondary/30"
                                  }`}
                                >
                                  {tx.channel === "api" ? "API" : tx.channel === "checkout" ? "Checkout" : "App"}
                                </span>
                                {tx.apiKeyLabel && (
                                  <span className="text-[10px] text-outline truncate max-w-[120px]">
                                    {tx.apiKeyLabel}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Amount */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="font-extrabold text-white text-sm">
                                {tx.amountHuman}
                              </span>
                              <span className="text-[10px] text-outline">
                                ≈ ${tx.amountUsdEstimate.toFixed(2)} USD
                              </span>
                            </div>
                          </td>

                          {/* Route / Asset */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-surface-container border border-white/10 text-[11px] font-semibold text-white">
                                {tx.chain}
                              </span>
                              <span className="text-outline text-xs">→</span>
                              <span className="px-2 py-0.5 rounded bg-surface-container border border-white/10 text-[11px] font-semibold text-white">
                                {tx.destinationChain}
                              </span>
                            </div>
                          </td>

                          {/* Counterparty / Recipient */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-xs text-white">
                                {tx.recipient ? (
                                  <span className="font-mono">
                                    {tx.recipient.length > 20
                                      ? `${tx.recipient.slice(0, 6)}…${tx.recipient.slice(-4)}`
                                      : tx.recipient}
                                  </span>
                                ) : (
                                  <span className="text-outline italic">Direct solver</span>
                                )}
                              </span>
                              {tx.fiatAmount && (
                                <span className="text-[10px] text-primary">
                                  ₹{tx.fiatAmount.toLocaleString()} INR
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Tx Hash */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {tx.txHash ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] text-outline">
                                  {tx.txHash.slice(0, 6)}…{tx.txHash.slice(-4)}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(tx.txHash!, tx.id);
                                  }}
                                  className="p-1 hover:text-white transition-colors"
                                  title="Copy Hash"
                                >
                                  {copiedHash === tx.id ? (
                                    <Check className="w-3 h-3 text-success" />
                                  ) : (
                                    <Copy className="w-3 h-3 text-outline" />
                                  )}
                                </button>
                                {tx.explorerUrl && (
                                  <a
                                    href={tx.explorerUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1 text-primary hover:text-white transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-outline text-[11px] italic">Unrecorded</span>
                            )}
                          </td>

                          {/* Time */}
                          <td className="py-3 px-4 whitespace-nowrap text-outline text-[11px]">
                            {new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            <span className="block text-[10px] text-outline/70">
                              {new Date(tx.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-lg bg-surface-container group-hover:bg-primary group-hover:text-black transition-colors text-[11px] font-bold">
                              Inspect
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Stream View */}
              <div className="md:hidden divide-y divide-white/5">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="p-4 active:bg-white/[0.03] transition-colors cursor-pointer space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            tx.status === "COMPLETED"
                              ? "bg-success"
                              : tx.status === "PENDING"
                              ? "bg-warning"
                              : "bg-error"
                          }`}
                        />
                        <span className="text-xs font-bold text-white tracking-tight">{tx.title}</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-container text-outline">
                        {tx.channel}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <span className="text-base font-extrabold text-white">
                        {tx.amountHuman}
                      </span>
                      <span className="text-xs text-outline">
                        ≈ ${tx.amountUsdEstimate.toFixed(2)} USD
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-outline pt-1 border-t border-white/5">
                      <span>{tx.chain} → {tx.destinationChain}</span>
                      <span>{new Date(tx.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── PAGINATION CONTROLS ── */}
          <div className="p-4 bg-surface-container-lowest border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-outline">
              Page <span className="text-white font-bold">{pagination.page}</span> of{" "}
              <span className="text-white font-bold">{pagination.totalPages}</span>
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1 || isLoading}
                className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-white/10 text-xs text-white disabled:opacity-40 transition-colors cursor-pointer"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages || isLoading}
                className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-white/10 text-xs text-white disabled:opacity-40 transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── TRANSACTION INSPECTOR DRAWER / MODAL ── */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-2xl bg-surface-container border border-outline-variant/30 rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  {selectedTx.category === "payment" ? <QrCode className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">{selectedTx.title}</h3>
                  <span className="text-[11px] text-outline">ID: <span className="font-mono">{selectedTx.id}</span></span>
                </div>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-outline hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-surface-container-low border border-white/10">
                <span className="text-[11px] text-outline font-medium">Status</span>
                <span className="block text-xs font-bold text-success mt-0.5">{selectedTx.status}</span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-white/10">
                <span className="text-[11px] text-outline font-medium">Channel</span>
                <span className="block text-xs font-bold text-white mt-0.5">{selectedTx.channel}</span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-white/10">
                <span className="text-[11px] text-outline font-medium">USD valuation</span>
                <span className="block text-xs font-bold text-white mt-0.5">${selectedTx.amountUsdEstimate.toFixed(2)}</span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-white/10">
                <span className="text-[11px] text-outline font-medium">Platform fee</span>
                <span className="block text-xs font-bold text-primary mt-0.5">${selectedTx.zkpayFeeUsdEstimate.toFixed(2)}</span>
              </div>
            </div>

            {/* Route & Counterparties */}
            <div className="p-4 rounded-xl bg-surface-container-low border border-white/10 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-outline">Origin to destination:</span>
                <span className="font-semibold text-white">{selectedTx.chain} → {selectedTx.destinationChain}</span>
              </div>
              {selectedTx.depositAddress && (
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <span className="text-outline">Deposit or proxy address:</span>
                  <div className="flex items-center gap-1 font-mono text-white">
                    <span>{selectedTx.depositAddress.slice(0, 10)}…{selectedTx.depositAddress.slice(-8)}</span>
                    <button
                      onClick={() => handleCopy(selectedTx.depositAddress!, "depositAddr")}
                      className="text-outline hover:text-white"
                    >
                      {copiedHash === "depositAddr" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}
              {selectedTx.recipient && (
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <span className="text-outline">Recipient or UPI:</span>
                  <span className="font-mono text-primary font-medium">{selectedTx.recipient}</span>
                </div>
              )}
              {selectedTx.apiKeyLabel && (
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <span className="text-outline">API client:</span>
                  <span className="text-white font-medium">{selectedTx.apiKeyLabel}</span>
                </div>
              )}
              {selectedTx.txHash && (
                <div className="flex items-center justify-between">
                  <span className="text-outline">Transaction hash:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-white">{selectedTx.txHash.slice(0, 8)}…{selectedTx.txHash.slice(-6)}</span>
                    <button
                      onClick={() => handleCopy(selectedTx.txHash!, "txHashModal")}
                      className="text-outline hover:text-white"
                    >
                      {copiedHash === "txHashModal" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    </button>
                    {selectedTx.explorerUrl && (
                      <a
                        href={selectedTx.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Raw JSON viewer */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-outline">Raw telemetry data</span>
              <pre className="p-3 bg-surface-container-lowest border border-white/10 rounded-xl text-[10px] font-mono text-outline overflow-x-auto max-h-40">
                {JSON.stringify(selectedTx, null, 2)}
              </pre>
            </div>

            <button
              onClick={() => setSelectedTx(null)}
              className="w-full py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Close telemetry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
