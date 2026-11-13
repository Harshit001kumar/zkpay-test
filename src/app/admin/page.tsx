"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Search,
  ExternalLink,
  Copy,
  Check,
  DollarSign,
  TrendingUp,
  Activity,
  Layers,
  Lock,
  ArrowLeft,
  Zap,
  CheckCircle2,
  AlertCircle,
  Filter,
  ChevronRight,
  SlidersHorizontal,
  Send,
  Wallet,
  Users,
  Fuel,
  Clock,
  ShieldAlert,
  X,
} from "lucide-react";

interface AdminStats {
  network: {
    chainId: number;
    name: string;
    explorer: string;
  };
  contracts: {
    usdc: string;
    treasury: string;
  };
  relayer?: {
    address: string;
    balanceEth: string;
    healthy: boolean;
    error?: string;
  };
  sweeper?: {
    configured: boolean;
    address: string | null;
    balanceEth: string;
    healthy: boolean;
    error?: string;
  };
  telemetry: {
    treasuryUsdcBalance: string;
    platformFeeBps: number;
    fixedFeeThresholdUsdc?: number;
    fixedFeeUsdc?: number;
  };
}

type AdminTab = "overview" | "payouts" | "tools";

export default function AdminPage() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();

  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Partner Payouts & Partner Analytics State
  const [adminPayouts, setAdminPayouts] = useState<any[]>([]);
  const [isLoadingAdminPayouts, setIsLoadingAdminPayouts] = useState(false);
  const [adminPayoutFilter, setAdminPayoutFilter] = useState<"ALL" | "PENDING" | "COMPLETED" | "REJECTED">("ALL");
  const [partnerAnalytics, setPartnerAnalytics] = useState<any | null>(null);
  const [isLoadingPartnerAnalytics, setIsLoadingPartnerAnalytics] = useState(false);
  const [partnerSubTab, setPartnerSubTab] = useState<"partners" | "revenue" | "payouts">("partners");
  const [selectedPartnerModal, setSelectedPartnerModal] = useState<any | null>(null);
  const [partnerModalTab, setPartnerModalTab] = useState<"swaps" | "credits" | "keys" | "payouts">("swaps");
  const [completeModalPayout, setCompleteModalPayout] = useState<any | null>(null);
  const [payoutTxHashInput, setPayoutTxHashInput] = useState<string>("");
  const [isCompletingPayout, setIsCompletingPayout] = useState(false);
  const [completePayoutError, setCompletePayoutError] = useState<string | null>(null);
  const [rejectModalPayout, setRejectModalPayout] = useState<any | null>(null);
  const [payoutRejectReasonInput, setPayoutRejectReasonInput] = useState<string>("");
  const [isRejectingPayout, setIsRejectingPayout] = useState(false);
  const [rejectPayoutError, setRejectPayoutError] = useState<string | null>(null);

  // Cross-Chain Deposit Lookup State (NEAR Intents)
  const [shiftIdInput, setShiftIdInput] = useState("");
  const [shiftData, setShiftData] = useState<any>(null);
  const [isSearchingShift, setIsSearchingShift] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);

  // Emergency Proxy Recovery Tool State
  const [proxyQueryInput, setProxyQueryInput] = useState("");
  const [proxyCustomTokenInput, setProxyCustomTokenInput] = useState("");
  const [isInspectingProxy, setIsInspectingProxy] = useState(false);
  const [proxyReport, setProxyReport] = useState<any | null>(null);
  const [proxyInspectError, setProxyInspectError] = useState<string | null>(null);

  // Recovery Execution State
  const [recoveryAction, setRecoveryAction] = useState<"refund" | "forward" | "custom">("refund");
  const [customRecipientInput, setCustomRecipientInput] = useState("");
  const [selectedAssetType, setSelectedAssetType] = useState<"native" | "token">("native");
  const [selectedTokenAddress, setSelectedTokenAddress] = useState("");
  const [customSweepAmount, setCustomSweepAmount] = useState("");
  const [isExecutingRecovery, setIsExecutingRecovery] = useState(false);
  const [recoverySuccessResult, setRecoverySuccessResult] = useState<any | null>(null);
  const [recoveryExecuteError, setRecoveryExecuteError] = useState<string | null>(null);

  // Batch Proxy Dust Recycler State
  const [isRecyclingDust, setIsRecyclingDust] = useState(false);
  const [recycleDustResult, setRecycleDustResult] = useState<any | null>(null);
  const [recycleDustChain, setRecycleDustChain] = useState<string>("polygon");

  // Recent Proxy Orders & RPC Providers
  const [recentProxyOrders, setRecentProxyOrders] = useState<any[]>([]);
  const [isLoadingRecentProxy, setIsLoadingRecentProxy] = useState(false);
  const [rpcProviders, setRpcProviders] = useState<any>({});

  const loadRecentProxyOrders = useCallback(async () => {
    setIsLoadingRecentProxy(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/admin/proxy-recover", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        if (data.orders) setRecentProxyOrders(data.orders);
        if (data.providers) setRpcProviders(data.providers);
      }
    } catch (e) {
      console.warn("Failed to load recent proxy orders:", e);
    } finally {
      setIsLoadingRecentProxy(false);
    }
  }, [getAccessToken]);

  const handleInspectProxy = async (targetQuery?: string) => {
    const q = (targetQuery || proxyQueryInput).trim();
    if (!q) return;

    setIsInspectingProxy(true);
    setProxyInspectError(null);
    setProxyReport(null);
    setRecoverySuccessResult(null);
    setRecoveryExecuteError(null);

    try {
      const token = await getAccessToken();
      const url = `/api/admin/proxy-recover?query=${encodeURIComponent(q)}${
        proxyCustomTokenInput.trim() ? `&customToken=${encodeURIComponent(proxyCustomTokenInput.trim())}` : ""
      }`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.providers) setRpcProviders(data.providers);
      if (res.ok && data.report) {
        setProxyReport(data.report);
        setCustomRecipientInput(
          recoveryAction === "forward"
            ? data.report.solverDepositAddress || ""
            : data.report.refundTo || ""
        );

        // Pre-select asset type based on detected balances
        const tokensWithBalance = (data.report.tokens || []).filter(
          (t: any) => BigInt(t.rawBalance || "0") > 0n
        );
        if (tokensWithBalance.length > 0) {
          setSelectedAssetType("token");
          setSelectedTokenAddress(tokensWithBalance[0].address);
        } else {
          setSelectedAssetType("native");
        }
      } else {
        setProxyInspectError(data.error || "No proxy order found for this query.");
      }
    } catch (err: any) {
      setProxyInspectError(err.message || "Failed to inspect proxy deposit");
    } finally {
      setIsInspectingProxy(false);
    }
  };

  const handleExecuteRecovery = async () => {
    if (!proxyReport) return;

    let dest = customRecipientInput.trim();
    if (recoveryAction === "refund") {
      dest = proxyReport.refundTo;
    } else if (recoveryAction === "forward") {
      dest = proxyReport.solverDepositAddress;
    }

    if (!dest) {
      setRecoveryExecuteError("Please provide a valid destination address.");
      return;
    }

    setIsExecutingRecovery(true);
    setRecoveryExecuteError(null);
    setRecoverySuccessResult(null);

    try {
      const token = await getAccessToken();
      const res = await fetch("/api/admin/proxy-recover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          depositAddress: proxyReport.proxyDepositAddress,
          action: recoveryAction,
          customRecipient: dest,
          tokenType: selectedAssetType,
          tokenAddress: selectedAssetType === "token" ? selectedTokenAddress : undefined,
          amount: customSweepAmount.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRecoverySuccessResult(data);
        handleInspectProxy(proxyReport.proxyDepositAddress);
      } else {
        setRecoveryExecuteError(data.error || "Recovery transfer failed.");
      }
    } catch (err: any) {
      setRecoveryExecuteError(err.message || "Failed to execute recovery transfer");
    } finally {
      setIsExecutingRecovery(false);
    }
  };

  const handleRecycleDust = async (chainToRecycle?: string) => {
    const targetChain = chainToRecycle || recycleDustChain;
    setIsRecyclingDust(true);
    setRecycleDustResult(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/admin/proxy-recover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "recycle-dust",
          chain: targetChain,
          limit: 50,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRecycleDustResult(data);
        loadRecentProxyOrders();
      } else {
        setRecycleDustResult({ success: false, error: data.error || data.message || "Failed to recycle dust" });
      }
    } catch (err: any) {
      setRecycleDustResult({ success: false, error: err.message || "Failed to recycle dust" });
    } finally {
      setIsRecyclingDust(false);
    }
  };


  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const verifyAdmin = useCallback(async () => {
    if (!ready) return;
    if (!authenticated) {
      setIsVerifying(false);
      setIsAuthorized(false);
      return;
    }

    setIsVerifying(true);
    setAuthError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setIsAuthorized(false);
        setAuthError("Failed to obtain Privy session token");
        setIsVerifying(false);
        return;
      }

      const res = await fetch("/api/admin/auth/verify", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (res.ok && data.authorized) {
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
        setAuthError(data.error || "Access Denied: Account is not on the administrator whitelist.");
      }
    } catch (err: any) {
      setIsAuthorized(false);
      setAuthError(err.message || "Authentication error");
    } finally {
      setIsVerifying(false);
    }
  }, [ready, authenticated, getAccessToken]);

  const loadAdminData = useCallback(async () => {
    if (!isAuthorized) return;
    setIsLoadingData(true);

    try {
      const token = await getAccessToken();
      if (!token) return;

      const statsRes = await fetch("/api/admin/stats", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (statsRes.ok) {
        const statsJson = await statsRes.json();
        setStats(statsJson);
      }
    } catch (err) {
      console.error("Failed to load admin data", err);
    } finally {
      setIsLoadingData(false);
    }
  }, [isAuthorized, getAccessToken]);

  useEffect(() => {
    verifyAdmin();
  }, [verifyAdmin]);

  useEffect(() => {
    if (isAuthorized) {
      loadAdminData();
    }
  }, [isAuthorized, loadAdminData]);

  useEffect(() => {
    if (isAuthorized && activeTab === "tools") {
      loadRecentProxyOrders();
    }
  }, [isAuthorized, activeTab, loadRecentProxyOrders]);

  const loadAdminPayouts = useCallback(async (statusOverride?: string) => {
    setIsLoadingAdminPayouts(true);
    try {
      const token = await getAccessToken();
      const statusParam = statusOverride || adminPayoutFilter;
      const res = await fetch(`/api/admin/payouts?status=${statusParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.success) {
        setAdminPayouts(data.payouts || []);
      }
    } catch (err) {
      console.warn("[Admin] loadAdminPayouts error:", err);
    } finally {
      setIsLoadingAdminPayouts(false);
    }
  }, [getAccessToken, adminPayoutFilter]);

  const loadAdminPartnersOverview = useCallback(async () => {
    setIsLoadingPartnerAnalytics(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/admin/partners", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.success) {
        setPartnerAnalytics(data);
      }
    } catch (err) {
      console.warn("[Admin] loadAdminPartnersOverview error:", err);
    } finally {
      setIsLoadingPartnerAnalytics(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isAuthorized && (activeTab === "payouts" || activeTab === "overview")) {
      loadAdminPayouts();
      loadAdminPartnersOverview();
    }
  }, [isAuthorized, activeTab, loadAdminPayouts, loadAdminPartnersOverview]);

  const handleCompletePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeModalPayout || !payoutTxHashInput.trim()) return;

    setIsCompletingPayout(true);
    setCompletePayoutError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/admin/payouts/${completeModalPayout.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ txHash: payoutTxHashInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to complete payout");
      }
      setCompleteModalPayout(null);
      setPayoutTxHashInput("");
      loadAdminPayouts();
      loadAdminPartnersOverview();
    } catch (err: any) {
      setCompletePayoutError(err.message || "Failed to complete payout");
    } finally {
      setIsCompletingPayout(false);
    }
  };

  const handleRejectPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalPayout) return;

    setIsRejectingPayout(true);
    setRejectPayoutError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/admin/payouts/${rejectModalPayout.id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: payoutRejectReasonInput.trim() || "Rejected by administrator" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to reject payout");
      }
      setRejectModalPayout(null);
      setPayoutRejectReasonInput("");
      loadAdminPayouts();
      loadAdminPartnersOverview();
    } catch (err: any) {
      setRejectPayoutError(err.message || "Failed to reject payout");
    } finally {
      setIsRejectingPayout(false);
    }
  };

  const handleLookupShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftIdInput.trim()) return;

    setIsSearchingShift(true);
    setShiftError(null);
    setShiftData(null);

    try {
      const res = await fetch(`/api/exchange/status?depositAddress=${encodeURIComponent(shiftIdInput.trim())}`);
      const data = await res.json();
      if (res.ok && data.status) {
        setShiftData(data);
      } else {
        setShiftError(data.error || "Deposit not found or invalid address");
      }
    } catch (err: any) {
      setShiftError(err.message || "Failed to query deposit status");
    } finally {
      setIsSearchingShift(false);
    }
  };


  // -------------------------------------------------------------
  // 1. LOADING STATE
  // -------------------------------------------------------------
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin motion-reduce:animate-none mb-4"></div>
        <p className="font-sans tabular-nums text-xs tracking-normal text-outline ">Verifying Admin Access…</p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. UNAUTHORIZED / ACCESS DENIED STATE
  // -------------------------------------------------------------
  if (!authenticated || !isAuthorized) {
    return (
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="w-full max-w-md bg-white/[0.03] border border-white/10 rounded-3xl p-8 flex flex-col items-center text-center relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center mb-5 text-error">
            <Lock className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-bold tracking-tight mb-2 text-on-surface">Admin Console Restricted</h1>
          <p className="text-xs text-outline mb-6 leading-relaxed">
            The ZkPay Administrator Console requires authorization. Please connect with an authorized administrator wallet.
          </p>

          {authError && (
            <div className="w-full p-3.5 rounded-xl bg-error-container/30 border border-error/20 text-error text-xs font-sans tabular-nums mb-5 text-left break-all">
              <span className="font-bold block  tracking-normal mb-1 text-[10px]">Access Notice</span>
              {authError}
            </div>
          )}

          {authenticated && user && (
            <div className="w-full p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-outline font-sans tabular-nums mb-5 text-left truncate">
              <p className="text-on-surface-variant font-bold mb-0.5">Connected Identity:</p>
              <p className="truncate">DID: {user.id}</p>
              {user.wallet?.address && <p className="truncate">Address: {user.wallet.address}</p>}
            </div>
          )}

          <div className="flex flex-col gap-2.5 w-full">
            {!authenticated ? (
              <button
                onClick={login}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-on-surface to-on-surface-variant hover:from-white hover:to-white text-surface-container-lowest font-bold text-xs tracking-normal transition-colors active:scale-[0.98] whitespace-nowrap"
              >
                Admin Wallet Sign In
              </button>
            ) : (
              <button
                onClick={logout}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-on-surface font-bold text-xs  tracking-normal hover:bg-white/10 transition-colors"
              >
                Switch Account
              </button>
            )}

            <Link
              href="/"
              className="py-2.5 text-xs text-outline hover:text-white flex items-center justify-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to App
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 3. AUTHORIZED ADMIN CONSOLE
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface font-sans pb-24 selection:bg-primary/20">
      <style dangerouslySetInnerHTML={{__html: `
        .obsidian-glass {
          background: rgba(20, 20, 24, 0.75);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.7);
        }
        .silver-text {
          background: linear-gradient(180deg, #FFFFFF 0%, #94A3B8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
      `}} />

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-surface-container-lowest/85  border-b border-white/10 px-4 sm:px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-outline hover:text-white transition-colors flex items-center gap-1 text-xs font-sans tabular-nums"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>App</span>
            </Link>
            <div className="h-3.5 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <h1 className="text-xs sm:text-sm font-bold tracking-normal text-white">
                Admin Console
              </h1>
            </div>
            <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10 ml-2">
              <span className="px-3 py-1 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/15 shadow-sm">
                Infrastructure & System
              </span>
              <Link
                href="/admin/transactions"
                className="px-3 py-1 rounded-lg text-xs font-medium text-outline hover:text-white transition-colors"
              >
                Transactions Ledger
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadAdminData}
              disabled={isLoadingData}
              title="Refresh Data"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-primary transition-colors disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-xl bg-error/10 hover:bg-error/20 border border-error/20 text-error text-[11px] font-sans tabular-nums font-bold  transition-colors"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 space-y-6">

        {/* Segmented Tab Bar (Mobile-First) */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-black/40 border border-white/10 max-w-xl mx-auto sm:mx-0">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-2 px-2.5 rounded-xl text-xs font-sans tabular-nums font-bold transition-colors ${
              activeTab === "overview"
                ? "bg-white/10 text-white shadow-sm border border-white/15"
                : "text-outline hover:text-on-surface"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("payouts")}
            className={`py-2 px-2.5 rounded-xl text-xs font-sans tabular-nums font-bold transition-colors relative ${
              activeTab === "payouts"
                ? "bg-white/10 text-white shadow-sm border border-white/15"
                : "text-outline hover:text-on-surface"
            }`}
          >
            <span>Partners</span>
            {adminPayouts.filter((p) => p.status === "PENDING").length > 0 ? (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-bold">
                {adminPayouts.filter((p) => p.status === "PENDING").length}
              </span>
            ) : partnerAnalytics?.summary?.totalPartners > 0 ? (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-success/20 text-success text-[9px] font-bold">
                {partnerAnalytics.summary.totalPartners}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setActiveTab("tools")}
            className={`py-2 px-2.5 rounded-xl text-xs font-sans tabular-nums font-bold transition-colors ${
              activeTab === "tools"
                ? "bg-white/10 text-white shadow-sm border border-white/15"
                : "text-outline hover:text-on-surface"
            }`}
          >
            Tools
          </button>
        </div>

        {/* ────────────── TAB 1: OVERVIEW ────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* System Transactions Quick-Action Banner */}
            <Link
              href="/admin/transactions"
              className="p-4 sm:p-5 rounded-2xl bg-surface-container-low border border-primary/25 hover:border-primary/50 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white tracking-tight">System Transactions Ledger</h4>
                    <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">Live explorer</span>
                  </div>
                  <p className="text-xs text-outline font-sans tabular-nums mt-0.5">
                    View total swap volume, in-app swaps, developer API transactions, and export CSV archives.
                  </p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-primary group-hover:translate-x-0.5 transition-transform shrink-0">
                <span>Open ledger</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </Link>

            {/* Infrastructure & Base Treasury Banners */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Base Treasury USDC Card */}
              <div className="p-4 rounded-2xl bg-surface border border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-success/10 border border-success/30 flex items-center justify-center text-success shrink-0">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-white">
                      Base Treasury USDC
                    </h4>
                    <p className="text-[11px] text-outline font-sans tabular-nums">
                      ${stats?.telemetry?.treasuryUsdcBalance || "0.00"} USDC on Base
                    </p>
                  </div>
                </div>
                {stats?.contracts?.treasury ? (
                  <a
                    href={`https://basescan.org/token/${stats.contracts.usdc}?a=${stats.contracts.treasury}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-full bg-success/20 text-success text-[10px] font-sans tabular-nums font-bold inline-flex items-center gap-1 shrink-0"
                  >
                    <span>Basescan</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-success/20 text-success text-[10px] font-sans tabular-nums font-bold shrink-0">
                    LIVE
                  </span>
                )}
              </div>

              {/* Proxy Forwarder Relayer Card */}
              <div className="p-4 rounded-2xl bg-surface border border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs sm:text-sm font-bold text-white">
                        Proxy Forwarder Relayer
                      </h4>
                      <span className="text-[10px] font-sans tabular-nums text-outline">
                        ({stats?.sweeper?.balanceEth || "0.0000"} ETH)
                      </span>
                    </div>
                    {stats?.sweeper?.address ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-sans tabular-nums text-outline truncate max-w-[140px] sm:max-w-[200px]">
                          {stats.sweeper.address}
                        </span>
                        <button
                          onClick={() => copyToClipboard(stats!.sweeper!.address!, "sweeper")}
                          className="text-primary hover:text-white transition-colors"
                          title="Copy Relayer Address"
                        >
                          {copiedKey === "sweeper" ? (
                            <Check className="w-3 h-3 text-success" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <a
                          href={`https://basescan.org/address/${stats.sweeper.address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-outline hover:text-white"
                          title="View on Basescan"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <p className="text-[11px] text-warning/80 font-sans tabular-nums">
                        SWEEPER_PRIVATE_KEY not configured
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-sans tabular-nums font-bold shrink-0 ${
                    stats?.sweeper?.configured
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-warning/20 text-warning border border-warning/30"
                  }`}
                >
                  {stats?.sweeper?.configured ? "RELAYER READY" : "SETUP KEY"}
                </span>
              </div>
            </div>

            {/* Real On-Chain Swap Revenue & Partner Profit Overview */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center text-success shrink-0">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-normal font-sans tabular-nums">
                      Real On-Chain Swap Revenue & Partner Profit
                    </h3>
                    <p className="text-[11px] text-outline font-sans tabular-nums">
                      Live multi-chain Treasury holdings, gross fees collected, 50/50 partner fee share, and ZkPay net profit
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("payouts")}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                >
                  <span>Open Partner & Revenue Console</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-sans tabular-nums">
                <div className="p-4 rounded-xl bg-success/10 border border-success/25 space-y-1">
                  <span className="text-[10px] font-bold text-success uppercase tracking-wider block">
                    ZkPay Net Swap Profit
                  </span>
                  <div className="text-2xl font-black text-white">
                    ${(partnerAnalytics?.summary?.zkpayNetProfitUsd || 0).toFixed(4)}
                  </div>
                  <span className="text-[10px] text-success/80 block">
                    Our 50% + Conditional $0.02 Fixed + 100% In-App
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[10px] font-bold text-outline uppercase tracking-wider block">
                    Gross Fees Collected
                  </span>
                  <div className="text-2xl font-black text-white">
                    ${(partnerAnalytics?.summary?.grossFeesCollectedUsd || 0).toFixed(4)}
                  </div>
                  <span className="text-[10px] text-outline block">
                    {partnerAnalytics?.summary?.settledSwapsCount || 0} settled swaps on-chain
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[10px] font-bold text-outline uppercase tracking-wider block">
                    Partner 50% Fee Share
                  </span>
                  <div className="text-2xl font-black text-primary">
                    ${(partnerAnalytics?.summary?.partnerFeeShareUsd || 0).toFixed(4)}
                  </div>
                  <span className="text-[10px] text-outline block">
                    {partnerAnalytics?.summary?.totalPartners || 0} active partners ({partnerAnalytics?.summary?.activeApiKeys || 0} keys)
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[10px] font-bold text-outline uppercase tracking-wider block">
                    Multi-Chain Treasury Wallet
                  </span>
                  <div className="text-2xl font-black text-white">
                    ${(partnerAnalytics?.onChainTreasury?.totalTreasuryHoldingsUsd || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-outline block">
                    Live on Base, Polygon, Arb, BSC & Sol
                  </span>
                </div>
              </div>
            </div>

            {/* Protocol Fee Model & Rules Telemetry */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums">
                  Monetization & Fee Architecture
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs font-sans tabular-nums">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-outline text-[10px]  font-bold block">
                    1. In-App Swap Fee
                  </span>
                  <p className="text-base font-bold text-white">2.00% (200 bps)</p>
                  <p className="text-[11px] text-outline">
                    Applied on cross-chain swaps via ZkPay Treasury
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-outline text-[10px]  font-bold block">
                    2. Partner API Fee Split
                  </span>
                  <p className="text-base font-bold text-white">50% / 50% Share</p>
                  <p className="text-[11px] text-outline">
                    Developers keep 50% of configured bps fees; Treasury retains 50%
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-outline text-[10px]  font-bold block">
                    3. EVM Conditional Fixed Fee
                  </span>
                  <p className="text-base font-bold text-white">$0.02 Flat Fee</p>
                  <p className="text-[11px] text-outline">
                    Applied on EVM proxy deposits only when ZkPay&apos;s bps share &lt; $0.02
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}


        {/* ────────────── TAB: PARTNERS, ON-CHAIN REVENUE & PAYOUTS ────────────── */}
        {activeTab === "payouts" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top Revenue & Partner Profit Summary Card */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center text-success shrink-0">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-normal font-sans tabular-nums flex items-center gap-2">
                      <span>Partners Progress & Real On-Chain Revenue</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/20 text-success font-sans tabular-nums">
                        50/50 Split + Conditional $0.02 Fixed
                      </span>
                    </h3>
                    <p className="text-xs text-outline font-sans tabular-nums mt-0.5">
                      Track every partner&apos;s swap volume, fee credits, and ZkPay&apos;s real on-chain profit across all networks.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    loadAdminPayouts();
                    loadAdminPartnersOverview();
                  }}
                  disabled={isLoadingAdminPayouts || isLoadingPartnerAnalytics}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      isLoadingAdminPayouts || isLoadingPartnerAnalytics ? "animate-spin" : ""
                    }`}
                  />
                  <span>Refresh Live Data</span>
                </button>
              </div>

              {/* 4 Hero Revenue & Partner KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 font-sans tabular-nums">
                {/* 1. ZkPay Net Profit */}
                <div className="p-4 rounded-2xl bg-success/10 border border-success/25 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-success uppercase tracking-wider">
                      ZkPay Net Swap Profit
                    </span>
                    <TrendingUp className="w-3.5 h-3.5 text-success" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white">
                    ${(partnerAnalytics?.summary?.zkpayNetProfitUsd || 0).toFixed(4)}
                  </div>
                  <p className="text-[11px] text-success/80">
                    Our 50% Partner Cut + 100% Conditional Fixed ($0.02) + 100% In-App Fees
                  </p>
                </div>

                {/* 2. Gross Fees Collected On-Chain */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-outline uppercase tracking-wider">
                      Gross Fees Collected
                    </span>
                    <DollarSign className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white">
                    ${(partnerAnalytics?.summary?.grossFeesCollectedUsd || 0).toFixed(4)}
                  </div>
                  <p className="text-[11px] text-outline">
                    {partnerAnalytics?.summary?.settledSwapsCount || 0} settled swaps ($
                    {(partnerAnalytics?.summary?.totalSettledVolumeUsd || 0).toFixed(2)} vol)
                  </p>
                </div>

                {/* 3. Partner 50% Fee Share */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-outline uppercase tracking-wider">
                      Partner 50% Fee Share
                    </span>
                    <Users className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-primary">
                    ${(partnerAnalytics?.summary?.partnerFeeShareUsd || 0).toFixed(4)}
                  </div>
                  <p className="text-[11px] text-outline">
                    Avail: ${(partnerAnalytics?.summary?.partnerBalancesTotal?.availableBalanceUsd || 0).toFixed(2)} • Paid: $
                    {(partnerAnalytics?.summary?.partnerBalancesTotal?.totalWithdrawnUsd || 0).toFixed(2)}
                  </p>
                </div>

                {/* 4. Live Multi-Chain Treasury Wallet Holdings */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-outline uppercase tracking-wider">
                      Live Treasury Balances
                    </span>
                    <Wallet className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white">
                    ${(partnerAnalytics?.onChainTreasury?.totalTreasuryHoldingsUsd || 0).toFixed(2)}
                  </div>
                  <p className="text-[11px] text-outline">
                    On-chain across Base, Polygon, Arb, BSC & Solana
                  </p>
                </div>
              </div>

              {/* Sub-Navigation Tabs (Partners Progress | On-Chain Revenue & Ledger | Payout Requests) */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPartnerSubTab("partners")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    partnerSubTab === "partners"
                      ? "bg-white text-black shadow-sm"
                      : "bg-black/40 text-outline border border-white/10 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>All Partners ({partnerAnalytics?.summary?.totalPartners || 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPartnerSubTab("revenue")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    partnerSubTab === "revenue"
                      ? "bg-white text-black shadow-sm"
                      : "bg-black/40 text-outline border border-white/10 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Real On-Chain Revenue & Treasury</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPartnerSubTab("payouts")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    partnerSubTab === "payouts"
                      ? "bg-white text-black shadow-sm"
                      : "bg-black/40 text-outline border border-white/10 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Payout Requests ({adminPayouts.length})</span>
                  {adminPayouts.filter((p) => p.status === "PENDING").length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                      {adminPayouts.filter((p) => p.status === "PENDING").length} Pending
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* ── SUB-TAB 1: ALL PARTNERS LEADERBOARD & PROGRESS ── */}
            {partnerSubTab === "partners" && (
              <div className="obsidian-glass rounded-2xl overflow-hidden border border-white/10">
                <div className="p-4 sm:p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white font-sans tabular-nums">
                      Partner Leaderboard & Fee Split Progress
                    </h4>
                    <p className="text-xs text-outline font-sans tabular-nums">
                      Click any partner to inspect their swaps, fee credits, API keys, and payout history.
                    </p>
                  </div>
                  <div className="text-xs text-outline font-sans tabular-nums">
                    Active API Keys:{" "}
                    <span className="text-white font-bold">
                      {partnerAnalytics?.summary?.activeApiKeys || 0}
                    </span>{" "}
                    • Partner Swaps:{" "}
                    <span className="text-white font-bold">
                      {partnerAnalytics?.summary?.settledPartnerSwapsCount || 0} settled /{" "}
                      {partnerAnalytics?.summary?.totalPartnerSwapsCount || 0} total
                    </span>
                  </div>
                </div>

                {isLoadingPartnerAnalytics && !partnerAnalytics ? (
                  <div className="py-16 text-center text-outline text-xs flex justify-center items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Loading partner analytics...</span>
                  </div>
                ) : !partnerAnalytics?.partners || partnerAnalytics.partners.length === 0 ? (
                  <div className="py-16 text-center text-outline text-xs">
                    No partners registered yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-sans tabular-nums">
                      <thead className="bg-white/5 text-outline text-[10px] uppercase tracking-wider border-b border-white/10">
                        <tr>
                          <th className="py-3 px-4">Partner Identity</th>
                          <th className="py-3 px-4">API Keys</th>
                          <th className="py-3 px-4">Swaps (Settled / Total)</th>
                          <th className="py-3 px-4">Settled Volume</th>
                          <th className="py-3 px-4">Gross Fee Collected</th>
                          <th className="py-3 px-4">Partner 50% Earned</th>
                          <th className="py-3 px-4 text-success">ZkPay Net Profit</th>
                          <th className="py-3 px-4">Partner Balance</th>
                          <th className="py-3 px-4 text-right">Portal View</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {partnerAnalytics.partners.map((pt: any) => (
                          <tr key={pt.userId} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3.5 px-4">
                              {pt.walletAddress ? (
                                <div className="font-mono text-white font-bold flex items-center gap-1.5">
                                  <span>
                                    {pt.walletAddress.slice(0, 6)}...{pt.walletAddress.slice(-4)}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(pt.walletAddress, `pt_${pt.userId}`)}
                                    className="text-outline hover:text-white"
                                  >
                                    {copiedKey === `pt_${pt.userId}` ? (
                                      <Check className="w-3 h-3 text-success" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <div className="text-white font-bold">Partner Account</div>
                              )}
                              <div className="text-[10px] text-outline font-mono truncate max-w-[160px]" title={pt.userId}>
                                {pt.userId}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white font-bold text-[11px]">
                                {pt.apiKeys?.filter((k: any) => k.status === "ACTIVE").length || 0} active
                              </span>
                              {pt.apiKeys?.[0]?.label && (
                                <div className="text-[10px] text-outline mt-0.5 truncate max-w-[110px]">
                                  {pt.apiKeys[0].label}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="font-bold text-white">
                                <span className="text-success">{pt.swaps.settled}</span>
                                <span className="text-outline"> / {pt.swaps.total}</span>
                              </div>
                              <div className="text-[10px] text-outline">
                                {pt.swaps.pending + pt.swaps.forwarded > 0
                                  ? `${pt.swaps.pending + pt.swaps.forwarded} active`
                                  : `${pt.swaps.expiredOrFailed} expired`}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 font-bold text-white">
                              ${(pt.swaps.settledVolumeUsd || 0).toFixed(2)}
                            </td>

                            <td className="py-3.5 px-4 font-bold text-white">
                              ${(pt.fees.grossFeesGeneratedUsd || 0).toFixed(4)}
                            </td>

                            <td className="py-3.5 px-4 font-bold text-primary">
                              +${(pt.fees.partnerShareEarnedUsd || 0).toFixed(4)}
                            </td>

                            <td className="py-3.5 px-4 font-bold text-success">
                              +${(pt.fees.zkpayProfitFromPartnerUsd || 0).toFixed(4)}
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="text-white font-bold">
                                ${(pt.balance.availableBalanceUsd || 0).toFixed(2)}{" "}
                                <span className="text-[10px] text-outline font-normal">avail</span>
                              </div>
                              {pt.balance.totalWithdrawnUsd > 0 && (
                                <div className="text-[10px] text-success">
                                  ${pt.balance.totalWithdrawnUsd.toFixed(2)} withdrawn
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPartnerModal(pt);
                                  setPartnerModalTab("swaps");
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold transition-colors"
                              >
                                Inspect
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── SUB-TAB 2: REAL ON-CHAIN REVENUE & TREASURY BREAKDOWN ── */}
            {partnerSubTab === "revenue" && (
              <div className="space-y-6">
                {/* 1. Live Multi-Chain Treasury Wallet Holdings */}
                <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
                    <div>
                      <h4 className="text-sm font-bold text-white font-sans tabular-nums">
                        Live On-Chain ZkPay Treasury Wallet Balances
                      </h4>
                      <p className="text-xs text-outline font-sans tabular-nums">
                        Real-time balances held in ZkPay Treasury addresses across EVM and Solana networks
                      </p>
                    </div>
                    <div className="text-xs font-sans tabular-nums text-right">
                      <span className="text-outline">Total On-Chain Holdings: </span>
                      <span className="text-success font-black text-base">
                        ${(partnerAnalytics?.onChainTreasury?.totalTreasuryHoldingsUsd || 0).toFixed(2)} USD
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-sans tabular-nums text-xs">
                    {(partnerAnalytics?.onChainTreasury?.holdings || []).map(
                      (h: any, idx: number) => (
                        <div
                          key={`${h.chain}_${h.symbol}_${idx}`}
                          className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded bg-white/10 text-white font-bold text-[10px] uppercase">
                              {h.chain} • {h.symbol}
                            </span>
                            <a
                              href={h.explorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-outline hover:text-white inline-flex items-center gap-1 text-[10px]"
                            >
                              <span>Explorer</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <div>
                            <div className="text-lg font-black text-white">
                              ${h.usdValue.toFixed(2)}{" "}
                              <span className="text-[11px] font-normal text-outline">USD</span>
                            </div>
                            <div className="text-[11px] text-outline font-mono">
                              {h.balanceFormatted} {h.symbol}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* 2. Fee & Profit Breakdown by Asset */}
                <div className="obsidian-glass rounded-2xl overflow-hidden border border-white/10">
                  <div className="p-4 sm:p-5 border-b border-white/10">
                    <h4 className="text-sm font-bold text-white font-sans tabular-nums">
                      Collected Swap Fees & Net Profit by Asset
                    </h4>
                    <p className="text-xs text-outline font-sans tabular-nums">
                      Cumulative fees collected across settled swaps, split between Partner 50% share and ZkPay net profit
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-sans tabular-nums">
                      <thead className="bg-white/5 text-outline text-[10px] uppercase tracking-wider border-b border-white/10">
                        <tr>
                          <th className="py-3 px-4">Asset</th>
                          <th className="py-3 px-4">Settled Swaps</th>
                          <th className="py-3 px-4">Gross Token Fee Collected</th>
                          <th className="py-3 px-4">Gross Fee (USD)</th>
                          <th className="py-3 px-4">Partner 50% Share (USD)</th>
                          <th className="py-3 px-4 text-success">ZkPay Net Profit (USD)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(partnerAnalytics?.summary?.feesByAsset || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-outline">
                              No settled swap fees recorded yet.
                            </td>
                          </tr>
                        ) : (
                          partnerAnalytics.summary.feesByAsset.map((a: any) => (
                            <tr key={a.symbol} className="hover:bg-white/[0.02]">
                              <td className="py-3 px-4 font-bold text-white">{a.symbol}</td>
                              <td className="py-3 px-4 text-outline">{a.settledCount}</td>
                              <td className="py-3 px-4 font-mono text-white">
                                {a.grossFeeToken} {a.symbol}
                              </td>
                              <td className="py-3 px-4 font-bold text-white">
                                ${a.grossFeeUsd.toFixed(4)}
                              </td>
                              <td className="py-3 px-4 font-bold text-primary">
                                ${a.partnerShareUsd.toFixed(4)}
                              </td>
                              <td className="py-3 px-4 font-bold text-success">
                                +${a.zkpayProfitUsd.toFixed(4)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Real-Time Settled Swap Fee Ledger */}
                <div className="obsidian-glass rounded-2xl overflow-hidden border border-white/10">
                  <div className="p-4 sm:p-5 border-b border-white/10">
                    <h4 className="text-sm font-bold text-white font-sans tabular-nums">
                      On-Chain Settled Swap Fee & Profit Ledger
                    </h4>
                    <p className="text-xs text-outline font-sans tabular-nums">
                      Swap-by-swap audit trail showing exact on-chain fee collected, partner share, and ZkPay net profit
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-sans tabular-nums">
                      <thead className="bg-white/5 text-outline text-[10px] uppercase tracking-wider border-b border-white/10">
                        <tr>
                          <th className="py-3 px-4">Swap / Time</th>
                          <th className="py-3 px-4">Source</th>
                          <th className="py-3 px-4">Pair & Amount</th>
                          <th className="py-3 px-4">Gross Fee Collected</th>
                          <th className="py-3 px-4">Partner Share</th>
                          <th className="py-3 px-4 text-success">ZkPay Net Profit</th>
                          <th className="py-3 px-4 text-right">On-Chain Fee Tx</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(partnerAnalytics?.recentFeeLedger || []).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-outline">
                              No settled swaps yet.
                            </td>
                          </tr>
                        ) : (
                          partnerAnalytics.recentFeeLedger.map((item: any) => (
                            <tr key={item.swapId} className="hover:bg-white/[0.02]">
                              <td className="py-3 px-4">
                                <div className="font-mono text-white text-[11px]">
                                  {item.swapId.slice(0, 12)}...
                                </div>
                                <div className="text-[10px] text-outline">
                                  {new Date(item.createdAt).toLocaleDateString()}{" "}
                                  {new Date(item.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    item.source === "Partner API"
                                      ? "bg-primary/20 text-primary border border-primary/30"
                                      : "bg-white/10 text-white"
                                  }`}
                                >
                                  {item.source}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-bold text-white">
                                  {item.amountFormatted} {item.fromAsset} → {item.toAsset}
                                </div>
                                <div className="text-[10px] text-outline uppercase">
                                  {item.chain} → {item.destinationChain} (${item.swapVolumeUsd.toFixed(2)})
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-bold text-white">
                                  ${item.grossFeeUsd.toFixed(4)}
                                </div>
                                <div className="text-[10px] text-outline font-mono">
                                  {item.grossFeeToken} {item.fromAsset}
                                </div>
                              </td>
                              <td className="py-3 px-4 font-bold text-primary">
                                ${item.partnerFeeUsd.toFixed(4)}
                              </td>
                              <td className="py-3 px-4 font-bold text-success">
                                +${item.zkpayProfitUsd.toFixed(4)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {item.explorerUrl && item.feeTxHash ? (
                                  <a
                                    href={item.explorerUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-success hover:underline font-mono text-[11px] font-bold"
                                  >
                                    <span>{item.feeTxHash.slice(0, 8)}...</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="text-outline text-[11px]">—</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── SUB-TAB 3: PARTNER PAYOUT REQUESTS ── */}
            {partnerSubTab === "payouts" && (
              <div className="space-y-4">
                {/* Status Filter Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {(["ALL", "PENDING", "COMPLETED", "REJECTED"] as const).map((st) => {
                    const count = st === "ALL" ? adminPayouts.length : adminPayouts.filter((p) => p.status === st).length;
                    return (
                      <button
                        key={st}
                        onClick={() => {
                          setAdminPayoutFilter(st);
                          loadAdminPayouts(st);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          adminPayoutFilter === st
                            ? "bg-white text-black shadow-sm"
                            : "bg-black/40 text-outline border border-white/10 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        {st} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Payouts Table / Cards */}
                <div className="obsidian-glass rounded-2xl overflow-hidden border border-white/10">
                  {isLoadingAdminPayouts ? (
                    <div className="py-16 text-center text-outline text-xs flex justify-center items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Loading payout requests...</span>
                    </div>
                  ) : adminPayouts.length === 0 ? (
                    <div className="py-16 text-center text-outline text-xs">
                      No payout requests found for the selected filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-sans tabular-nums">
                        <thead className="bg-white/5 text-outline text-[11px] uppercase tracking-wider border-b border-white/10">
                          <tr>
                            <th className="py-3 px-4">Ticket</th>
                            <th className="py-3 px-4">Partner</th>
                            <th className="py-3 px-4">Amount</th>
                            <th className="py-3 px-4">Payout Asset & Chain</th>
                            <th className="py-3 px-4">Destination Address</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {adminPayouts.map((p) => {
                            const isPending = p.status === "PENDING";
                            const isCompleted = p.status === "COMPLETED";
                            const isRejected = p.status === "REJECTED";

                            const c = (p.targetChain || "").toLowerCase();
                            let explorerUrl: string | null = null;
                            if (p.txHash) {
                              if (c.includes("poly") || c.includes("matic")) explorerUrl = `https://polygonscan.com/tx/${p.txHash}`;
                              else if (c.includes("base")) explorerUrl = `https://basescan.org/tx/${p.txHash}`;
                              else if (c.includes("sol")) explorerUrl = `https://solscan.io/tx/${p.txHash}`;
                              else if (c.includes("ltc") || c.includes("lite")) explorerUrl = `https://litecoinspace.org/tx/${p.txHash}`;
                              else explorerUrl = `https://basescan.org/tx/${p.txHash}`;
                            }

                            return (
                              <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                                {/* Ticket ID & Time */}
                                <td className="py-3.5 px-4 font-mono text-[11px]">
                                  <div className="text-white font-medium">{p.id.slice(0, 16)}...</div>
                                  <div className="text-[10px] text-outline">
                                    {new Date(p.createdAt).toLocaleDateString()} {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                </td>

                                {/* Partner ID */}
                                <td className="py-3.5 px-4 font-mono text-[11px] text-outline">
                                  <span title={p.partnerUserId}>{p.partnerUserId ? `${p.partnerUserId.slice(0, 12)}...` : "Unknown"}</span>
                                  {p.partnerWalletAddress && (
                                    <div className="text-[10px] text-primary">
                                      {p.partnerWalletAddress.slice(0, 6)}...{p.partnerWalletAddress.slice(-4)}
                                    </div>
                                  )}
                                </td>

                                {/* Amount USD */}
                                <td className="py-3.5 px-4 font-bold text-white text-sm">
                                  ${Number(p.amountUsd).toFixed(2)}
                                </td>

                                {/* Asset & Chain */}
                                <td className="py-3.5 px-4">
                                  <span className="font-semibold text-white">{p.targetAsset}</span>
                                  <span className="text-outline text-[11px] block">{p.targetChain}</span>
                                </td>

                                {/* Destination Address */}
                                <td className="py-3.5 px-4 font-mono text-[11px]">
                                  <div className="flex items-center gap-1.5 bg-black/40 border border-white/5 rounded-lg px-2 py-1 max-w-[200px]">
                                    <span className="truncate text-white">{p.destinationAddress}</span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(p.destinationAddress);
                                        setCopiedKey(p.id);
                                        setTimeout(() => setCopiedKey(null), 2000);
                                      }}
                                      className="text-outline hover:text-white shrink-0"
                                      title="Copy address"
                                    >
                                      {copiedKey === p.id ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  </div>
                                </td>

                                {/* Status */}
                                <td className="py-3.5 px-4">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                                      isCompleted
                                        ? "bg-success/20 text-success border border-success/30"
                                        : isRejected
                                        ? "bg-error/20 text-error border border-error/30"
                                        : "bg-warning/20 text-warning border border-warning/30"
                                    }`}
                                  >
                                    {isCompleted && <CheckCircle2 className="w-2.5 h-2.5" />}
                                    {isRejected && <AlertCircle className="w-2.5 h-2.5" />}
                                    {isPending && <Clock className="w-2.5 h-2.5" />}
                                    {p.status}
                                  </span>
                                  {p.adminNote && (
                                    <div className="text-[10px] text-error italic mt-0.5 max-w-[150px] truncate" title={p.adminNote}>
                                      {p.adminNote}
                                    </div>
                                  )}
                                </td>

                                {/* Actions */}
                                <td className="py-3.5 px-4 text-right space-x-2">
                                  {isPending ? (
                                    <>
                                      <button
                                        onClick={() => {
                                          setCompleteModalPayout(p);
                                          setPayoutTxHashInput("");
                                          setCompletePayoutError(null);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-success hover:bg-success/90 text-black text-xs font-bold transition-all shadow-sm"
                                      >
                                        Fulfill
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRejectModalPayout(p);
                                          setPayoutRejectReasonInput("");
                                          setRejectPayoutError(null);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-error/20 hover:bg-error/30 border border-error/30 text-error text-xs font-bold transition-all"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  ) : isCompleted && p.txHash ? (
                                    <a
                                      href={explorerUrl || "#"}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-success hover:underline text-xs font-bold font-mono"
                                    >
                                      <span>{p.txHash.slice(0, 8)}...</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="text-outline text-[11px]">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PARTNER DRILL-DOWN PORTAL MODAL */}
            {selectedPartnerModal && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-2xl bg-neutral-950 border border-white/15 rounded-2xl p-5 sm:p-6 shadow-2xl relative space-y-5 max-h-[88vh] flex flex-col">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                        <span>Partner Portal Inspector</span>
                        {selectedPartnerModal.walletAddress && (
                          <span className="text-xs font-mono text-primary">
                            {selectedPartnerModal.walletAddress.slice(0, 6)}...
                            {selectedPartnerModal.walletAddress.slice(-4)}
                          </span>
                        )}
                      </h3>
                      <p className="text-[11px] text-outline font-mono">
                        {selectedPartnerModal.userId}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedPartnerModal(null)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-outline hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Partner Balance & Profit Summary Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-sans tabular-nums">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-[10px] text-outline uppercase block">Available USD</span>
                      <span className="text-lg font-black text-white">
                        ${(selectedPartnerModal.balance?.availableBalanceUsd || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-[10px] text-outline uppercase block">Partner Earned</span>
                      <span className="text-lg font-black text-primary">
                        +${(selectedPartnerModal.fees?.partnerShareEarnedUsd || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-success/10 border border-success/25">
                      <span className="text-[10px] text-success uppercase block">ZkPay Profit</span>
                      <span className="text-lg font-black text-success">
                        +${(selectedPartnerModal.fees?.zkpayProfitFromPartnerUsd || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-[10px] text-outline uppercase block">Settled Swaps</span>
                      <span className="text-lg font-black text-white">
                        {selectedPartnerModal.swaps?.settled || 0}{" "}
                        <span className="text-xs font-normal text-outline">
                          / {selectedPartnerModal.swaps?.total || 0}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Modal Tabs */}
                  <div className="flex border-b border-white/10 text-xs font-medium">
                    {(
                      [
                        { id: "swaps", label: `Swaps (${selectedPartnerModal.recentSwaps?.length || 0})` },
                        { id: "credits", label: `Credits (${selectedPartnerModal.recentCredits?.length || 0})` },
                        { id: "keys", label: `Keys (${selectedPartnerModal.apiKeys?.length || 0})` },
                        { id: "payouts", label: `Payouts (${selectedPartnerModal.payouts?.length || 0})` },
                      ] as const
                    ).map((tb) => (
                      <button
                        key={tb.id}
                        onClick={() => setPartnerModalTab(tb.id)}
                        className={`flex-1 pb-2.5 text-center border-b-2 transition-colors ${
                          partnerModalTab === tb.id
                            ? "border-white text-white font-bold"
                            : "border-transparent text-outline hover:text-white"
                        }`}
                      >
                        {tb.label}
                      </button>
                    ))}
                  </div>

                  {/* Modal Tab Body */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs font-sans tabular-nums">
                    {partnerModalTab === "swaps" &&
                      ((selectedPartnerModal.recentSwaps || []).length === 0 ? (
                        <div className="py-10 text-center text-outline">No swaps for this partner.</div>
                      ) : (
                        selectedPartnerModal.recentSwaps.map((sw: any) => (
                          <div
                            key={sw.swapId}
                            className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3"
                          >
                            <div>
                              <div className="font-bold text-white flex items-center gap-2">
                                <span>
                                  {sw.amountFormatted} {sw.fromAsset} → {sw.toAsset}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    sw.status === "SETTLED"
                                      ? "bg-success/20 text-success"
                                      : sw.status === "EXPIRED" || sw.status === "FAILED"
                                      ? "bg-error/20 text-error"
                                      : "bg-warning/20 text-warning"
                                  }`}
                                >
                                  {sw.status}
                                </span>
                              </div>
                              <div className="text-[10px] text-outline font-mono mt-0.5">
                                {sw.swapId.slice(0, 14)}... • {sw.chain} → {sw.destinationChain}
                              </div>
                            </div>
                            <div className="text-right">
                              {sw.status === "SETTLED" ? (
                                <>
                                  <div className="text-primary font-bold">
                                    Partner: +${(sw.partnerFeeUsd || 0).toFixed(4)}
                                  </div>
                                  <div className="text-success text-[10px] font-bold">
                                    ZkPay: +${(sw.zkpayProfitUsd || 0).toFixed(4)}
                                  </div>
                                </>
                              ) : (
                                <div className="text-outline text-[10px]">
                                  {new Date(sw.createdAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ))}

                    {partnerModalTab === "credits" &&
                      ((selectedPartnerModal.recentCredits || []).length === 0 ? (
                        <div className="py-10 text-center text-outline">No fee credits yet.</div>
                      ) : (
                        selectedPartnerModal.recentCredits.map((c: any) => (
                          <div
                            key={c.id}
                            className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between"
                          >
                            <div>
                              <div className="text-success font-bold">
                                +${Number(c.feeUsd).toFixed(4)} USD{" "}
                                <span className="text-outline font-normal text-[11px]">
                                  ({c.humanTokenAmount} {c.fromAsset})
                                </span>
                              </div>
                              <div className="text-[10px] text-outline font-mono">
                                Swap {c.swapId.slice(0, 12)}... • 1 {c.fromAsset} = $
                                {Number(c.usdRate).toFixed(2)}
                              </div>
                            </div>
                            <div className="text-[10px] text-outline text-right">
                              {new Date(c.settledAt).toLocaleDateString()}
                            </div>
                          </div>
                        ))
                      ))}

                    {partnerModalTab === "keys" &&
                      ((selectedPartnerModal.apiKeys || []).length === 0 ? (
                        <div className="py-10 text-center text-outline">No API keys created.</div>
                      ) : (
                        selectedPartnerModal.apiKeys.map((k: any) => (
                          <div
                            key={k.id}
                            className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between"
                          >
                            <div>
                              <div className="text-white font-bold flex items-center gap-2">
                                <span>{k.label}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    k.status === "ACTIVE"
                                      ? "bg-success/20 text-success"
                                      : "bg-error/20 text-error"
                                  }`}
                                >
                                  {k.status}
                                </span>
                              </div>
                              <div className="text-[10px] text-outline font-mono mt-0.5">
                                {k.keyPrefix}••••{k.keyLast4}
                              </div>
                            </div>
                            <div className="text-[10px] text-outline text-right">
                              Created {new Date(k.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        ))
                      ))}

                    {partnerModalTab === "payouts" &&
                      ((selectedPartnerModal.payouts || []).length === 0 ? (
                        <div className="py-10 text-center text-outline">No payout requests yet.</div>
                      ) : (
                        selectedPartnerModal.payouts.map((p: any) => (
                          <div
                            key={p.id}
                            className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between"
                          >
                            <div>
                              <div className="text-white font-bold">
                                ${Number(p.amountUsd).toFixed(2)} USD → {p.targetAsset} ({p.targetChain})
                              </div>
                              <div className="text-[10px] text-outline font-mono truncate max-w-[240px]">
                                To: {p.destinationAddress}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.status === "COMPLETED"
                                  ? "bg-success/20 text-success"
                                  : p.status === "REJECTED"
                                  ? "bg-error/20 text-error"
                                  : "bg-warning/20 text-warning"
                              }`}
                            >
                              {p.status}
                            </span>
                          </div>
                        ))
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* FULFILL PAYOUT MODAL */}
            {completeModalPayout && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-neutral-950 border border-white/10 rounded-2xl p-6 shadow-2xl relative space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <span>Fulfill Partner Payout</span>
                    </h3>
                    <button
                      onClick={() => setCompleteModalPayout(null)}
                      className="text-outline hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="bg-white/5 rounded-xl p-3 text-xs space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-outline">Amount:</span>
                      <span className="text-white font-bold">${completeModalPayout.amountUsd.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-outline">Send As:</span>
                      <span className="text-white font-bold">{completeModalPayout.targetAsset} on {completeModalPayout.targetChain}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-outline">Recipient:</span>
                      <span className="text-white font-bold truncate max-w-[220px]" title={completeModalPayout.destinationAddress}>
                        {completeModalPayout.destinationAddress}
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleCompletePayout} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-outline uppercase tracking-wider block mb-1">
                        On-Chain Transaction Hash (TxHash)
                      </label>
                      <input
                        type="text"
                        required
                        value={payoutTxHashInput}
                        onChange={(e) => setPayoutTxHashInput(e.target.value)}
                        placeholder="Paste transaction hash (0x... or sol/ltc hash)"
                        className="w-full px-3 py-2.5 bg-black/60 border border-white/10 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-white transition-colors"
                      />
                    </div>

                    {completePayoutError && (
                      <div className="p-2.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs">
                        {completePayoutError}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setCompleteModalPayout(null)}
                        className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-outline text-xs font-bold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCompletingPayout || !payoutTxHashInput.trim()}
                        className="flex-1 py-2 rounded-xl bg-success hover:bg-success/90 text-black text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {isCompletingPayout && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>Confirm Fulfilled</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* REJECT PAYOUT MODAL */}
            {rejectModalPayout && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-neutral-950 border border-white/10 rounded-2xl p-6 shadow-2xl relative space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <h3 className="text-sm font-bold text-error flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>Reject Partner Payout</span>
                    </h3>
                    <button
                      onClick={() => setRejectModalPayout(null)}
                      className="text-outline hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-outline leading-relaxed">
                    Rejecting this ticket will automatically <span className="text-white font-bold">refund the ${rejectModalPayout.amountUsd.toFixed(2)} USD</span> back to the partner&apos;s available balance immediately.
                  </p>

                  <form onSubmit={handleRejectPayout} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-outline uppercase tracking-wider block mb-1">
                        Reason for Rejection
                      </label>
                      <input
                        type="text"
                        required
                        value={payoutRejectReasonInput}
                        onChange={(e) => setPayoutRejectReasonInput(e.target.value)}
                        placeholder="e.g. Invalid address format, Partner requested cancellation"
                        className="w-full px-3 py-2.5 bg-black/60 border border-white/10 rounded-xl text-white text-xs font-sans focus:outline-none focus:border-white transition-colors"
                      />
                    </div>

                    {rejectPayoutError && (
                      <div className="p-2.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs">
                        {rejectPayoutError}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setRejectModalPayout(null)}
                        className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-outline text-xs font-bold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isRejectingPayout}
                        className="flex-1 py-2 rounded-xl bg-error hover:bg-error/90 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {isRejectingPayout && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>Confirm Rejection & Refund</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ────────────── TAB 4: TOOLS & SWEEPER ────────────── */}
        {activeTab === "tools" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Tool 1: Automated Proxy Forwarder Relayer */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-normal font-sans tabular-nums">
                    Automated Proxy Forwarder Relayer
                  </h3>
                  <p className="text-xs text-outline font-sans tabular-nums mt-0.5">
                    Background EVM proxy sweeper routing user deposits through Treasury fee splits to NEAR Intents
                  </p>
                </div>
              </div>

              {/* Relayer Wallet Status */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs font-sans tabular-nums">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-outline text-[10px] font-bold block">Relayer Address</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white truncate">
                      {stats?.sweeper?.address || "Not Configured"}
                    </span>
                    {stats?.sweeper?.address && (
                      <button
                        onClick={() => copyToClipboard(stats!.sweeper!.address!, "tool_sweeper")}
                        className="text-outline hover:text-white"
                      >
                        {copiedKey === "tool_sweeper" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-outline text-[10px] font-bold block">Gas Tank Balance</span>
                  <span className="text-base font-bold text-white">
                    {stats?.sweeper?.balanceEth || "0.0000"} ETH
                  </span>
                  <span className="text-[10px] text-outline block">Base Mainnet</span>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-outline text-[10px] font-bold block">Operational Status</span>
                  <span className={`text-base font-bold ${stats?.sweeper?.healthy ? "text-success" : "text-warning"}`}>
                    {stats?.sweeper?.configured ? (stats?.sweeper?.healthy ? "Ready & Funded" : "Low Balance") : "Requires Key"}
                  </span>
                  <span className="text-[10px] text-outline block">
                    SWEEPER_PRIVATE_KEY in env
                  </span>
                </div>
              </div>
            </div>

            {/* Tool 2: Cross-Chain Solver Transaction Tracker */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums">
                    Cross-Chain Solver Order Tracker
                  </h3>
                  <p className="text-xs text-outline font-sans tabular-nums mt-0.5">
                    Query real-time deposit and settlement status on the cross-chain solver network
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  placeholder="Enter Deposit Address (e.g. 6vN24xV8... or 0x...)"
                  value={shiftIdInput}
                  onChange={(e) => setShiftIdInput(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-xs font-sans tabular-nums text-white placeholder-outline focus:outline-none focus:border-primary"
                />
                <button
                  onClick={handleLookupShift}
                  disabled={isSearchingShift || !shiftIdInput.trim()}
                  className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-sans tabular-nums text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
                >
                  <Search className={`w-3.5 h-3.5 ${isSearchingShift ? "animate-spin" : ""}`} />
                  <span>{isSearchingShift ? "Searching..." : "Track Status"}</span>
                </button>
              </div>

              {shiftError && (
                <div className="p-3.5 rounded-xl bg-error-container/30 border border-error/20 text-error text-xs font-sans tabular-nums">
                  {shiftError}
                </div>
              )}

              {shiftData && (() => {
                const depositAmt = shiftData.depositAmount ?? shiftData.depositedAmount;
                const settleAmt = shiftData.settleAmount ?? shiftData.settledAmount;
                const txHash = shiftData.txId ?? shiftData.destinationTxHash;
                const explorerUrl = shiftData.txExplorerUrl ?? shiftData.destinationExplorerUrl;
                return (
                  <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-xs font-sans tabular-nums space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/5">
                      <span className="text-outline">Status:</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/20 text-success">
                        {shiftData.status || shiftData.rawStatus || "UNKNOWN"}
                      </span>
                    </div>
                    {shiftData.rawStatus && shiftData.rawStatus !== shiftData.status && (
                      <div className="flex items-center justify-between">
                        <span className="text-outline">Raw Status:</span>
                        <span className="text-on-surface-variant font-mono">{shiftData.rawStatus}</span>
                      </div>
                    )}
                    {depositAmt && (
                      <div className="flex items-center justify-between">
                        <span className="text-outline">Deposited:</span>
                        <span className="text-white font-bold">{depositAmt}</span>
                      </div>
                    )}
                    {settleAmt && (
                      <div className="flex items-center justify-between">
                        <span className="text-outline">Settled:</span>
                        <span className="text-success font-bold">{settleAmt}</span>
                      </div>
                    )}
                    {txHash && (
                      <div className="flex items-center justify-between">
                        <span className="text-outline">Settlement TX:</span>
                        <a
                          href={
                            typeof explorerUrl === "string" && explorerUrl.startsWith("https://")
                              ? explorerUrl
                              : `https://basescan.org/tx/${encodeURIComponent(txHash)}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <span className="truncate max-w-[180px]">{txHash}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {shiftData.error && (
                      <div className="text-error text-[11px] pt-1 border-t border-white/5">
                        {shiftData.error}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Tool 3: Emergency Proxy Sweeper & Manual Recovery Console */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center text-warning shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums">
                      Emergency Proxy Sweeper & Manual Transfer Console
                    </h3>
                    <p className="text-xs text-outline font-sans tabular-nums mt-0.5">
                      Inspect on-chain balances across native gas and tokens, detect mismatched deposits (e.g. USDC sent on a USDT swap), and manually refund or sweep to ANY address.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={loadRecentProxyOrders}
                  disabled={isLoadingRecentProxy}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-sans tabular-nums text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 self-start sm:self-auto shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRecentProxy ? "animate-spin" : ""}`} />
                  <span>Refresh Orders</span>
                </button>
              </div>

              {/* Input Form for Querying */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    placeholder="Enter Proxy Deposit Address or Swap ID (e.g. 0x... or sol Base58 or swap_...)"
                    value={proxyQueryInput}
                    onChange={(e) => setProxyQueryInput(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-xs font-sans tabular-nums text-white placeholder-outline focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => handleInspectProxy()}
                    disabled={isInspectingProxy || !proxyQueryInput.trim()}
                    className="px-5 py-3 rounded-xl bg-warning/20 hover:bg-warning/30 border border-warning/30 text-warning font-sans tabular-nums text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Search className={`w-3.5 h-3.5 ${isInspectingProxy ? "animate-spin" : ""}`} />
                    <span>{isInspectingProxy ? "Scanning Chain..." : "Inspect Balances"}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Optional: Custom ERC-20 Token Contract Address (0x...)"
                    value={proxyCustomTokenInput}
                    onChange={(e) => setProxyCustomTokenInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-black/20 border border-white/5 text-[11px] font-sans tabular-nums text-on-surface-variant placeholder-outline/60 focus:outline-none focus:border-white/20"
                  />
                  <span className="text-[10px] text-outline font-sans tabular-nums shrink-0">For arbitrary custom tokens</span>
                </div>
              </div>

              {/* Quick Select from Recent Proxy Orders */}
              {recentProxyOrders.length > 0 && (
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-sans tabular-nums text-outline">
                    <span>Recent Proxy Orders ({recentProxyOrders.length}):</span>
                    <span>Click to load into inspector</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {recentProxyOrders.slice(0, 15).map((o) => (
                      <button
                        key={o.swapId}
                        onClick={() => {
                          setProxyQueryInput(o.proxyDepositAddress);
                          handleInspectProxy(o.proxyDepositAddress);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-black/40 hover:bg-white/10 border border-white/10 text-[10px] font-sans tabular-nums text-primary flex items-center gap-1.5 transition-colors text-left truncate max-w-[260px]"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          o.status === "FORWARDED" || o.status === "SETTLED" ? "bg-success" :
                          o.status === "EXPIRED" ? "bg-error" : "bg-warning"
                        }`} />
                        <span className="font-bold text-white ">{o.chain}</span>
                        <span className="text-outline">{o.fromAsset}</span>
                        <span className="truncate">{o.proxyDepositAddress.slice(0, 6)}…{o.proxyDepositAddress.slice(-4)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Inspection Error */}
              {proxyInspectError && (
                <div className="p-3.5 rounded-xl bg-error-container/30 border border-error/20 text-error text-xs font-sans tabular-nums flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-error" />
                  <span>{proxyInspectError}</span>
                </div>
              )}

              {/* Inspection Report & Manual Transfer Panel */}
              {proxyReport && (
                <div className="p-4 sm:p-5 rounded-xl bg-black/50 border border-white/15 space-y-4">
                  {/* Mismatched Token Alert Banner */}
                  {proxyReport.hasMismatchedTokens && (
                    <div className="p-3.5 rounded-xl bg-warning/15 border border-warning/30 text-warning text-xs font-sans tabular-nums space-y-1">
                      <div className="flex items-center gap-2 font-bold">
                        <AlertCircle className="w-4 h-4 text-warning shrink-0" />
                        <span>Mismatched Token Deposit Detected!</span>
                      </div>
                      <p className="text-[11px] text-warning/90 leading-relaxed">
                        {proxyReport.mismatchedWarning || "The user deposited an alternate token that was not requested in the swap quote. Funds are securely held in the proxy wallet."}
                      </p>
                      <p className="text-[10px] text-warning/80 font-bold">
                        Select the token below and click &quot;Refund to User&quot; or enter a custom address to return funds.
                      </p>
                    </div>
                  )}

                  {/* Order Overview Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-sans tabular-nums">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-0.5">
                      <span className="text-outline text-[10px] ">Chain / Asset</span>
                      <p className="text-white font-bold ">{proxyReport.chain} &bull; {proxyReport.fromAsset}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-0.5">
                      <span className="text-outline text-[10px] ">Expected Deposit</span>
                      <p className="text-white font-bold">{proxyReport.expectedAmount} {proxyReport.fromAsset}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-0.5">
                      <span className="text-outline text-[10px] ">Order Status</span>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold  ${
                        proxyReport.orderStatus === "FORWARDED" || proxyReport.orderStatus === "SETTLED" ? "bg-success/20 text-success" :
                        proxyReport.orderStatus === "EXPIRED" ? "bg-error/20 text-error" : "bg-warning/20 text-warning"
                      }`}>
                        {proxyReport.orderStatus}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-0.5">
                      <span className="text-outline text-[10px] ">Proxy Address</span>
                      <div className="flex items-center gap-1">
                        <span className="text-white truncate text-[11px]">{proxyReport.proxyDepositAddress}</span>
                        <button
                          onClick={() => copyToClipboard(proxyReport.proxyDepositAddress, "report_proxy")}
                          className="text-outline hover:text-white shrink-0"
                        >
                          {copiedKey === "report_proxy" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Registered Addresses */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-sans tabular-nums">
                    <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between">
                      <span className="text-outline text-[11px]">User Refund Address:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-success font-bold truncate max-w-[170px] sm:max-w-[200px] text-[11px]">{proxyReport.refundTo}</span>
                        <button
                          onClick={() => copyToClipboard(proxyReport.refundTo, "report_refund")}
                          className="text-outline hover:text-white"
                        >
                          {copiedKey === "report_refund" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between">
                      <span className="text-outline text-[11px]">Solver Address:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-primary font-bold truncate max-w-[170px] sm:max-w-[200px] text-[11px]">{proxyReport.solverDepositAddress}</span>
                        <button
                          onClick={() => copyToClipboard(proxyReport.solverDepositAddress, "report_solver")}
                          className="text-outline hover:text-white"
                        >
                          {copiedKey === "report_solver" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Live On-Chain Balances Detected */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-white  font-sans tabular-nums tracking-normal block">
                      Live On-Chain Balances on Proxy Address
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 font-sans tabular-nums text-xs">
                      {/* Native Gas Token Balance */}
                      <div className={`p-3 rounded-xl border ${
                        selectedAssetType === "native" ? "bg-warning/10 border-warning/30" : "bg-black/30 border-white/10"
                      } space-y-1.5`}>
                        <div className="flex items-center justify-between">
                          <span className="text-outline text-[10px]  font-bold">
                            {proxyReport.nativeBalance.symbol} (Native Gas)
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            proxyReport.nativeBalance.hasGas ? "bg-success/20 text-success" : "bg-warning/20 text-warning"
                          }`}>
                            {proxyReport.nativeBalance.hasGas ? "Sufficient Gas" : "Gas Low / 0"}
                          </span>
                        </div>
                        <p className="text-base font-bold text-white">
                          {proxyReport.nativeBalance.balanceFormatted} {proxyReport.nativeBalance.symbol}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAssetType("native");
                            setSelectedTokenAddress("");
                          }}
                          className={`w-full py-1.5 rounded-lg text-[10px] font-bold  transition-colors ${
                            selectedAssetType === "native"
                              ? "bg-warning text-black"
                              : "bg-white/10 hover:bg-white/20 text-white"
                          }`}
                        >
                          {selectedAssetType === "native" ? "Selected for Sweep" : "Select Native"}
                        </button>
                      </div>

                      {/* Token Balances */}
                      {(proxyReport.tokens || []).map((t: any) => {
                        const hasBal = BigInt(t.rawBalance || "0") > 0n;
                        const isSelected = selectedAssetType === "token" && selectedTokenAddress.toLowerCase() === t.address.toLowerCase();

                        return (
                          <div
                            key={t.address}
                            className={`p-3 rounded-xl border ${
                              isSelected
                                ? "bg-primary/15 border-primary/30"
                                : hasBal
                                ? "bg-success/15/20 border-success/30"
                                : "bg-black/30 border-white/5 opacity-60"
                            } space-y-1.5`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-outline text-[10px]  font-bold truncate max-w-[110px]">
                                {t.symbol}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold  ${
                                t.isExpected ? "bg-primary/20 text-primary" : "bg-warning/20 text-warning"
                              }`}>
                                {t.isExpected ? "Expected" : "Alternate Token"}
                              </span>
                            </div>
                            <p className={`text-base font-bold ${hasBal ? "text-success" : "text-outline"}`}>
                              {t.balanceFormatted} {t.symbol}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAssetType("token");
                                setSelectedTokenAddress(t.address);
                              }}
                              className={`w-full py-1.5 rounded-lg text-[10px] font-bold  transition-colors ${
                                isSelected
                                  ? "bg-primary text-white"
                                  : "bg-white/10 hover:bg-white/20 text-white"
                              }`}
                            >
                              {isSelected ? "Selected for Sweep" : "Select Token"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Manual Transfer Configuration Box */}
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3 font-sans tabular-nums text-xs">
                    <span className="text-xs font-bold text-white  tracking-normal block">
                      Manual Transfer & Recovery Configuration
                    </span>

                    {/* Action Selector */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-outline  font-bold block">Destination Preset</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRecoveryAction("refund");
                            setCustomRecipientInput(proxyReport.refundTo);
                          }}
                          className={`py-2 px-3 rounded-xl border text-left flex items-center justify-between transition-colors ${
                            recoveryAction === "refund"
                              ? "bg-success/20 border-success/40 text-success font-bold"
                              : "bg-black/30 border-white/10 text-outline hover:text-white"
                          }`}
                        >
                          <span>1. Refund to User</span>
                          {recoveryAction === "refund" && <Check className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRecoveryAction("forward");
                            setCustomRecipientInput(proxyReport.solverDepositAddress);
                          }}
                          className={`py-2 px-3 rounded-xl border text-left flex items-center justify-between transition-colors ${
                            recoveryAction === "forward"
                              ? "bg-primary/20 border-primary/40 text-primary font-bold"
                              : "bg-black/30 border-white/10 text-outline hover:text-white"
                          }`}
                        >
                          <span>2. Forward to Solver</span>
                          {recoveryAction === "forward" && <Check className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRecoveryAction("custom");
                            setCustomRecipientInput("");
                          }}
                          className={`py-2 px-3 rounded-xl border text-left flex items-center justify-between transition-colors ${
                            recoveryAction === "custom"
                              ? "bg-primary/20 border-primary/40 text-primary font-bold"
                              : "bg-black/30 border-white/10 text-outline hover:text-white"
                          }`}
                        >
                          <span>3. Custom Address</span>
                          {recoveryAction === "custom" && <Check className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Recipient Address Field */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-outline  font-bold block">
                        Target Destination Recipient Address
                      </span>
                      <input
                        type="text"
                        placeholder="Enter destination recipient address (0x... or Solana Base58)"
                        value={customRecipientInput}
                        onChange={(e) => {
                          setCustomRecipientInput(e.target.value);
                          if (recoveryAction !== "custom") setRecoveryAction("custom");
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs font-sans tabular-nums text-white focus:outline-none focus:border-primary"
                      />
                    </div>

                    {/* Token / Asset Selection summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <span className="text-[10px] text-outline  font-bold block">
                          Asset Selected to Transfer
                        </span>
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-white font-bold flex items-center justify-between">
                          <span>
                            {selectedAssetType === "native"
                              ? `${proxyReport.nativeBalance.symbol} (Native Gas)`
                              : (proxyReport.tokens.find((t: any) => t.address.toLowerCase() === selectedTokenAddress.toLowerCase())?.symbol || "Custom ERC-20")}
                          </span>
                          <span className="text-[10px] font-normal text-outline font-sans tabular-nums">
                            {selectedAssetType === "native" ? "Native Layer" : "Token Contract"}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-outline  font-bold block">
                          Amount to Transfer (Leave blank for 100% full balance)
                        </span>
                        <input
                          type="text"
                          placeholder="e.g. 50.0 or leave empty for MAX"
                          value={customSweepAmount}
                          onChange={(e) => setCustomSweepAmount(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs font-sans tabular-nums text-white focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    {/* Execution Error Banner */}
                    {recoveryExecuteError && (
                      <div className="p-3 rounded-xl bg-error-container/30 border border-error/20 text-error text-xs font-sans tabular-nums flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-error" />
                        <span>{recoveryExecuteError}</span>
                      </div>
                    )}

                    {/* Success Banner */}
                    {recoverySuccessResult && (
                      <div className="p-4 rounded-xl bg-success/15/30 border border-success/30 text-success text-xs font-sans tabular-nums space-y-2">
                        <div className="flex items-center gap-2 font-bold text-sm">
                          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                          <span>Recovery Transfer Executed Successfully!</span>
                        </div>
                        <p>{recoverySuccessResult.message}</p>
                        {recoverySuccessResult.txHash && (
                          <div className="flex items-center gap-1.5 pt-1">
                            <span className="text-outline">Transaction:</span>
                            <a
                              href={
                                typeof recoverySuccessResult.explorerUrl === "string" &&
                                recoverySuccessResult.explorerUrl.startsWith("https://")
                                  ? recoverySuccessResult.explorerUrl
                                  : `https://basescan.org/tx/${encodeURIComponent(recoverySuccessResult.txHash)}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-white underline inline-flex items-center gap-1 font-bold"
                            >
                              <span className="truncate max-w-[200px]">{recoverySuccessResult.txHash}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Execute CTA */}
                    <button
                      type="button"
                      onClick={handleExecuteRecovery}
                      disabled={isExecutingRecovery || !customRecipientInput.trim()}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-warning via-primary to-primary hover:from-warning hover:to-primary text-white font-sans tabular-nums text-xs font-bold  tracking-normal transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-primary/10"
                    >
                      <Zap className={`w-4 h-4 ${isExecutingRecovery ? "animate-spin" : ""}`} />
                      <span>{isExecutingRecovery ? "Executing On-Chain Transfer..." : `Broadcast Transfer to ${recoveryAction === "refund" ? "User Refund Address" : recoveryAction === "forward" ? "Solver Address" : "Custom Address"}`}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tool 4: Batch Proxy Gas Dust Recycler */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center text-success shrink-0">
                    <Fuel className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums">
                      Batch Proxy Gas Dust Recycler
                    </h3>
                    <p className="text-xs text-outline font-sans tabular-nums mt-0.5">
                      Recycle leftover native gas (POL, BNB, ETH) from past or completed proxy deposit wallets back to the relayer gas tank with exact 21k-gas zero-dust transfers.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRecycleDust()}
                  disabled={isRecyclingDust}
                  className="px-4 py-2.5 rounded-xl bg-success hover:bg-success/90 text-black font-sans tabular-nums text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 shrink-0 shadow-lg shadow-success/15"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRecyclingDust ? "animate-spin" : ""}`} />
                  <span>{isRecyclingDust ? "Recycling Gas Dust..." : "Recycle Stranded Dust to Relayer"}</span>
                </button>
              </div>

              {/* Chain Selection Selector */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-sans tabular-nums">
                <div className="flex items-center gap-2">
                  <span className="text-outline text-[11px]  font-bold">Select Chain:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: "polygon", label: "Polygon (POL)" },
                      { id: "bsc", label: "BSC (BNB)" },
                      { id: "base", label: "Base (ETH)" },
                      { id: "arbitrum", label: "Arbitrum (ETH)" },
                      { id: "ethereum", label: "Ethereum (ETH)" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setRecycleDustChain(c.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          recycleDustChain === c.id
                            ? "bg-success text-black shadow-md shadow-success/20"
                            : "bg-white/[0.04] text-outline hover:text-white hover:bg-white/10 border border-white/5"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <span className="text-[11px] text-outline">
                  Scans last 50 proxy orders &bull; 0 wei dust left behind
                </span>
              </div>

              {/* Result Feedback Banner */}
              {recycleDustResult && (
                <div
                  className={`p-4 rounded-xl text-xs font-sans tabular-nums space-y-3 ${
                    recycleDustResult.success
                      ? "bg-success/15 border border-success/30 text-success"
                      : "bg-error-container/30 border border-error/30 text-error"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {recycleDustResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-error shrink-0" />
                    )}
                    <span>
                      {recycleDustResult.success
                        ? `Recycled ${recycleDustResult.totalSweptFormatted} to Relayer!`
                        : `Dust Recycling Failed: ${recycleDustResult.error || "Unknown error"}`}
                    </span>
                  </div>

                  {recycleDustResult.success && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-success/90">
                        Processed wallets: <span className="font-bold text-white">{recycleDustResult.sweptCount} drained</span> &bull;{" "}
                        <span className="text-outline">{recycleDustResult.skippedCount} skipped (already 0 / below fee threshold)</span>
                      </p>

                      {recycleDustResult.details && recycleDustResult.details.length > 0 && (
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 pr-1">
                          {recycleDustResult.details.map((d: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-2 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between text-[11px]"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-white font-bold">{d.amount}</span>
                                <span className="text-outline">from</span>
                                <span className="text-primary truncate max-w-[140px] sm:max-w-[200px]">
                                  {d.address}
                                </span>
                              </div>
                              {d.txHash && (
                                <a
                                  href={
                                    recycleDustChain === "polygon"
                                      ? `https://polygonscan.com/tx/${d.txHash}`
                                      : recycleDustChain === "bsc"
                                      ? `https://bscscan.com/tx/${d.txHash}`
                                      : recycleDustChain === "base"
                                      ? `https://basescan.org/tx/${d.txHash}`
                                      : recycleDustChain === "arbitrum"
                                      ? `https://arbiscan.io/tx/${d.txHash}`
                                      : `https://etherscan.io/tx/${d.txHash}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-success hover:underline flex items-center gap-1 font-bold shrink-0"
                                >
                                  <span>TX</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
