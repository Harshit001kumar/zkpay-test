"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
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
  Server,
  Zap,
  CheckCircle2,
  AlertCircle,
  Filter,
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  SlidersHorizontal,
  Gift,
  UserMinus,
  UserCheck,
  Send,
  Wallet,
  Calendar,
  Sparkles,
} from "lucide-react";
import { formatUpiName } from "@/lib/p2pkit";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { encodeFunctionData, parseUnits } from "viem";

interface AdminStats {
  network: {
    chainId: number;
    name: string;
    explorer: string;
  };
  contracts: {
    diamond: string;
    usdc: string;
    treasury: string;
    vault?: string | null;
  };
  gasSponsorship?: {
    provider: string;
    mode: string;
    network: string;
    healthy: boolean;
    policy: string;
  };
  earnVault?: {
    configured: boolean;
    vaultId: string | null;
    address: string | null;
    name: string;
    provider: string;
    apy: string;
    tvlUsd: number | null;
    healthy: boolean;
  };
  relayer?: {
    address: string;
    balanceEth: string;
    healthy: boolean;
    error?: string;
  };
  paylinksSummary?: {
    total: number;
    paid: number;
    active: number;
  };
  payinSessionsSummary?: {
    activeCount: number;
  };
  telemetry: {
    treasuryUsdcBalance: string;
    diamondUsdcLiquidity: string;
    inrPerUsdcRate: string;
    platformFeeBps: number;
    fixedFeeThresholdUsdc?: number;
    fixedFeeUsdc?: number;
    noKycLimitUsdc: number;
  };
}

interface OrderItem {
  id: string;
  orderType: string;
  user: string;
  recipient: string;
  currency: string;
  usdcAmount: string;
  fiatAmount: string;
  status: string;
  txHash: string;
  timestamp: number;
}

type AdminTab = "overview" | "orders" | "rewards" | "tools";

export default function AdminPage() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();

  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Rewards State
  const [rewardsData, setRewardsData] = useState<any>(null);
  const [rewardsCycle, setRewardsCycle] = useState<string>("");
  const [isDisbursing, setIsDisbursing] = useState(false);
  const [disburseProgress, setDisburseProgress] = useState<string | null>(null);
  const [disburseTxHash, setDisburseTxHash] = useState<string | null>(null);
  const [disburseError, setDisburseError] = useState<string | null>(null);

  // Orders Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "pay" | "cashout">("all");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // SideShift Lookup State
  const [shiftIdInput, setShiftIdInput] = useState("");
  const [shiftData, setShiftData] = useState<any>(null);
  const [isSearchingShift, setIsSearchingShift] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);

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

      const reqHeaders = {
        Authorization: `Bearer ${token}`,
      };

      // 1. Fetch Stats
      const statsRes = await fetch("/api/admin/stats", {
        headers: reqHeaders,
      });
      if (statsRes.ok) {
        const statsJson = await statsRes.json();
        setStats(statsJson);
      }

      // 2. Fetch Orders with server filtering
      const ordersRes = await fetch(
        `/api/admin/orders?limit=40&type=${typeFilter}&status=${statusFilter}${
          searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""
        }`,
        { headers: reqHeaders }
      );
      if (ordersRes.ok) {
        const ordersJson = await ordersRes.json();
        setOrders(ordersJson.orders || []);
      }

      // 3. Fetch Monthly Rewards
      const rewardsUrl = `/api/admin/rewards${rewardsCycle ? `?cycle=${encodeURIComponent(rewardsCycle)}` : ""}`;
      const rewardsRes = await fetch(rewardsUrl, { headers: reqHeaders });
      if (rewardsRes.ok) {
        const rewardsJson = await rewardsRes.json();
        if (rewardsJson.success) {
          setRewardsData(rewardsJson.data);
          if (!rewardsCycle && rewardsJson.data.cycle) {
            setRewardsCycle(rewardsJson.data.cycle);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load admin data", err);
    } finally {
      setIsLoadingData(false);
    }
  }, [isAuthorized, getAccessToken, searchQuery, typeFilter, statusFilter, rewardsCycle]);

  // Handler for Admin excluding or adding back a user from monthly payout list
  const handleToggleExclusion = async (userAddress: string, currentlyExcluded: boolean) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/admin/rewards", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "toggle-exclusion",
          cycle: rewardsData?.cycle,
          userAddress,
          excluded: !currentlyExcluded,
        }),
      });
      const data = await res.json();
      if (data.success) {
        loadAdminData();
      } else {
        alert(data.error || "Failed to toggle user exclusion");
      }
    } catch (err: any) {
      alert(err.message || "Failed to toggle user exclusion");
    }
  };

  // Handler for Admin signing batch payout transaction
  const handleDisburseRewards = async () => {
    if (!rewardsData || !rewardsData.users) return;
    const eligible = rewardsData.users.filter(
      (u: any) => !u.excluded && u.status === "PENDING" && u.totalDueUsdc > 0
    );

    if (eligible.length === 0) {
      alert("No eligible users pending disbursal in this cycle.");
      return;
    }

    const totalUsdc = eligible.reduce((acc: number, u: any) => acc + u.totalDueUsdc, 0);
    const confirmed = window.confirm(
      `Disburse $${totalUsdc.toFixed(2)} USDC to ${eligible.length} users using your connected admin wallet?`
    );
    if (!confirmed) return;

    const activeWallet = wallets?.[0] || user?.wallet;
    if (!activeWallet) {
      alert("No wallet connected. Please ensure your admin wallet is connected.");
      return;
    }

    setIsDisbursing(true);
    setDisburseError(null);
    setDisburseTxHash(null);
    setDisburseProgress(`Preparing batch disbursal to ${eligible.length} users...`);

    try {
      const provider = await (activeWallet as any).getEthereumProvider();
      const adminAddress = (activeWallet as any).address;
      let lastTxHash = "";
      const disbursedAddresses: string[] = [];

      for (let i = 0; i < eligible.length; i++) {
        const u = eligible[i];
        setDisburseProgress(`Sending ${i + 1}/${eligible.length}: $${u.totalDueUsdc.toFixed(2)} USDC to ${u.userAddress.slice(0, 6)}...${u.userAddress.slice(-4)}`);

        const amountWei = parseUnits(u.totalDueUsdc.toFixed(6), 6);
        const data = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [u.userAddress as `0x${string}`, amountWei],
        });

        const txHash = await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: adminAddress,
            to: CONTRACTS.USDC,
            data,
          }],
        });

        lastTxHash = txHash as string;
        disbursedAddresses.push(u.userAddress);
      }

      setDisburseProgress("Confirming payout records on backend...");
      const token = await getAccessToken();
      const recordRes = await fetch("/api/admin/rewards", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "mark-paid",
          cycle: rewardsData.cycle,
          userAddresses: disbursedAddresses,
          payoutTxHash: lastTxHash,
        }),
      });

      const recordJson = await recordRes.json();
      if (!recordJson.success) {
        console.warn("Backend mark-paid warning:", recordJson.error);
      }

      setDisburseTxHash(lastTxHash);
      setDisburseProgress(null);
      loadAdminData();
    } catch (err: any) {
      console.error("[Admin Payout] Failed:", err);
      setDisburseError(err.message || "Payout transaction failed or was rejected.");
    } finally {
      setIsDisbursing(false);
    }
  };

  useEffect(() => {
    verifyAdmin();
  }, [verifyAdmin]);

  useEffect(() => {
    if (isAuthorized) {
      loadAdminData();
    }
  }, [isAuthorized, loadAdminData]);

  const handleLookupShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftIdInput.trim()) return;

    setIsSearchingShift(true);
    setShiftError(null);
    setShiftData(null);

    try {
      const res = await fetch(`/api/exchange/status?id=${encodeURIComponent(shiftIdInput.trim())}`);
      const data = await res.json();
      if (res.ok && data.status) {
        setShiftData(data);
      } else {
        setShiftError(data.error || "Shift not found or invalid ID");
      }
    } catch (err: any) {
      setShiftError(err.message || "Failed to query exchange status");
    } finally {
      setIsSearchingShift(false);
    }
  };

  // Filtered orders list (with instant local filter support)
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchQuery ||
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.user?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.recipient?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.txHash?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType =
        typeFilter === "all" ||
        (typeFilter === "pay" && order.orderType.includes("PAY")) ||
        (typeFilter === "cashout" && order.orderType.includes("SELL"));

      const matchesStatus =
        statusFilter === "ALL" || order.status.toUpperCase() === statusFilter.toUpperCase();

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [orders, searchQuery, typeFilter, statusFilter]);

  // -------------------------------------------------------------
  // 1. LOADING STATE
  // -------------------------------------------------------------
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-[#0e0e11] text-[#e5e2e3] flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-mono text-xs tracking-widest text-[#909097] uppercase">Verifying Admin Access...</p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. UNAUTHORIZED / ACCESS DENIED STATE
  // -------------------------------------------------------------
  if (!authenticated || !isAuthorized) {
    return (
      <div className="min-h-screen bg-[#0e0e11] text-[#e5e2e3] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5 text-[#ffb4ab]">
            <Lock className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-bold tracking-tight mb-2 text-[#e5e2e3]">Admin Console Restricted</h1>
          <p className="text-xs text-[#909097] mb-6 leading-relaxed">
            The ZkPay Administrator Console requires authorization. Please connect with an authorized administrator wallet.
          </p>

          {authError && (
            <div className="w-full p-3.5 rounded-xl bg-red-950/30 border border-red-500/20 text-[#ffb4ab] text-xs font-mono mb-5 text-left break-all">
              <span className="font-bold block uppercase tracking-wider mb-1 text-[10px]">Access Notice</span>
              {authError}
            </div>
          )}

          {authenticated && user && (
            <div className="w-full p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-[#909097] font-mono mb-5 text-left truncate">
              <p className="text-[#c6c6cd] font-bold mb-0.5">Connected Identity:</p>
              <p className="truncate">DID: {user.id}</p>
              {user.wallet?.address && <p className="truncate">Address: {user.wallet.address}</p>}
            </div>
          )}

          <div className="flex flex-col gap-2.5 w-full">
            {!authenticated ? (
              <button
                onClick={login}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#e5e2e6] to-[#d8d4dc] hover:from-white hover:to-white text-[#0e0e0f] font-bold text-xs uppercase tracking-widest transition-all active:scale-[0.98]"
              >
                Sign In with Admin Wallet
              </button>
            ) : (
              <button
                onClick={logout}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-[#e5e2e3] font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                Switch Account
              </button>
            )}

            <Link
              href="/"
              className="py-2.5 text-xs text-[#909097] hover:text-white flex items-center justify-center gap-1 transition-colors"
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
    <div className="min-h-screen bg-[#0e0e11] text-[#e5e2e3] font-sans pb-24 selection:bg-[#c0c6de]/20">
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
      <header className="sticky top-0 z-40 bg-[#0e0e11]/85 backdrop-blur-2xl border-b border-white/10 px-4 sm:px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-[#909097] hover:text-white transition-colors flex items-center gap-1 text-xs font-mono"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>App</span>
            </Link>
            <div className="h-3.5 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h1 className="text-xs sm:text-sm font-bold tracking-[0.2em] uppercase text-white">
                Admin Console
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadAdminData}
              disabled={isLoadingData}
              title="Refresh Data"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[#c0c6de] transition-all disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-[#ffb4ab] text-[11px] font-mono font-bold uppercase transition-all"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 space-y-6">

        {/* Segmented Tab Bar (Mobile-First) */}
        <div className="grid grid-cols-4 p-1 rounded-2xl bg-black/40 border border-white/10 max-w-xl mx-auto sm:mx-0">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-2 px-3 rounded-xl text-xs font-mono font-bold transition-all ${
              activeTab === "overview"
                ? "bg-white/10 text-white shadow-sm border border-white/15"
                : "text-[#909097] hover:text-[#e5e2e3]"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`py-2 px-3 rounded-xl text-xs font-mono font-bold transition-all relative ${
              activeTab === "orders"
                ? "bg-white/10 text-white shadow-sm border border-white/15"
                : "text-[#909097] hover:text-[#e5e2e3]"
            }`}
          >
            <span>Orders</span>
            {orders.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px]">
                {orders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("rewards")}
            className={`py-2 px-3 rounded-xl text-xs font-mono font-bold transition-all relative ${
              activeTab === "rewards"
                ? "bg-white/10 text-white shadow-sm border border-white/15"
                : "text-[#909097] hover:text-[#e5e2e3]"
            }`}
          >
            <span>Rewards</span>
            {rewardsData?.eligibleUserCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 text-[9px]">
                {rewardsData.eligibleUserCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("tools")}
            className={`py-2 px-3 rounded-xl text-xs font-mono font-bold transition-all ${
              activeTab === "tools"
                ? "bg-white/10 text-white shadow-sm border border-white/15"
                : "text-[#909097] hover:text-[#e5e2e3]"
            }`}
          >
            Tools
          </button>
        </div>

        {/* ────────────── TAB 1: OVERVIEW ────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            
            {/* Paymaster Gas Sponsorship Pill Banner */}
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-emerald-300">
                    Pimlico ERC-4337 Gas Sponsorship
                  </h4>
                  <p className="text-[11px] text-emerald-400/80 font-mono">
                    100% of UserOps sponsored on Base Mainnet (Chain ID 8453)
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold shrink-0">
                ACTIVE
              </span>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              
              {/* Card 1: Treasury Revenue */}
              <div className="obsidian-glass rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#909097] font-mono">
                    Treasury Revenue (USDC)
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <h3 className="text-3xl font-black text-white tracking-tight">
                    ${stats?.telemetry?.treasuryUsdcBalance || "0.00"}
                  </h3>
                  <p className="text-[11px] font-mono text-[#909097] mt-1">
                    Collected 1% Platform Take-Rate
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-emerald-400 font-bold">1% Auto-Directed</span>
                  {stats?.contracts?.treasury && (
                    <a
                      href={`https://basescan.org/token/${stats.contracts.usdc}?a=${stats.contracts.treasury}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#c0c6de] hover:underline inline-flex items-center gap-1"
                    >
                      <span>Basescan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Card 2: P2P Live Rate */}
              <div className="obsidian-glass rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#909097] font-mono">
                    Live P2P Market Rate
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-[#c0c6de]/10 border border-[#c0c6de]/20 flex items-center justify-center text-[#c0c6de]">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <h3 className="text-3xl font-black text-white tracking-tight">
                    ₹{stats?.telemetry?.inrPerUsdcRate || "0.00"}
                  </h3>
                  <p className="text-[11px] font-mono text-[#909097] mt-1">
                    INR per USDC (P2P Oracle Feed)
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-emerald-400">● Live Subgraph Feed</span>
                  <span className="text-[#909097]">INR</span>
                </div>
              </div>

              {/* Card 3: Protocol Escrow Liquidity */}
              <div className="obsidian-glass rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#909097] font-mono">
                    Diamond Escrow Liquidity
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <h3 className="text-3xl font-black text-white tracking-tight">
                    ${stats?.telemetry?.diamondUsdcLiquidity || "0.00"}
                  </h3>
                  <p className="text-[11px] font-mono text-[#909097] mt-1">
                    Locked USDC in Diamond Core
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#c0c6de]">Base Mainnet</span>
                  <span className="text-purple-400 font-bold">P2P v4</span>
                </div>
              </div>

              {/* Card 4: Earn Yield Vault */}
              <div className="obsidian-glass rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#909097] font-mono">
                    Base USDC Earn Vault
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <h3 className="text-3xl font-black text-white tracking-tight">
                    {stats?.earnVault?.apy || "8.40"}% <span className="text-sm font-normal text-[#909097]">APY</span>
                  </h3>
                  <p className="text-[11px] font-mono text-[#909097] mt-1">
                    Moonwell / MetaMorpho Vault
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-cyan-400 font-bold">Auto-Compounding</span>
                  <span className="text-[#909097]">DeFi Yield</span>
                </div>
              </div>

            </div>

            {/* Protocol Fee Model & Rules Telemetry */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                <SlidersHorizontal className="w-4 h-4 text-[#c0c6de]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Monetization & Fee Architecture
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs font-mono">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[#909097] text-[10px] uppercase font-bold block">
                    1. Platform Convenience Fee
                  </span>
                  <p className="text-base font-bold text-white">1.00% (100 bps)</p>
                  <p className="text-[11px] text-[#909097]">
                    Sent to ZkPay Treasury on every Scan & Pay and Cashout order
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[#909097] text-[10px] uppercase font-bold block">
                    2. Protocol Small-Order Fee
                  </span>
                  <p className="text-base font-bold text-white">$0.10 USDC</p>
                  <p className="text-[11px] text-[#909097]">
                    Enforced by Diamond for orders ≤ $10 USDC. (Free for orders &gt; $10)
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[#909097] text-[10px] uppercase font-bold block">
                    3. No-KYC Transaction Ceiling
                  </span>
                  <p className="text-base font-bold text-white">100 USDC / Order</p>
                  <p className="text-[11px] text-[#909097]">
                    Zero verification baseline floor for INR UPI settlements
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ────────────── TAB 2: LIVE ORDERS ────────────── */}
        {activeTab === "orders" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            
            {/* Filter & Search Bar */}
            <div className="obsidian-glass rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                {/* Search Input */}
                <div className="relative w-full sm:flex-1">
                  <Search className="w-4 h-4 text-[#909097] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by Order ID, Address, UPI ID, Hash..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs font-mono text-white placeholder:text-[#909097]/60 focus:border-[#c0c6de] outline-none transition-colors"
                  />
                </div>

                {/* Type Filter Chips */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setTypeFilter("all")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shrink-0 ${
                      typeFilter === "all" ? "bg-white/15 text-white border border-white/20" : "bg-white/5 text-[#909097] hover:text-white"
                    }`}
                  >
                    All Types
                  </button>
                  <button
                    onClick={() => setTypeFilter("pay")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shrink-0 ${
                      typeFilter === "pay" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-white/5 text-[#909097] hover:text-white"
                    }`}
                  >
                    Scan & Pay
                  </button>
                  <button
                    onClick={() => setTypeFilter("cashout")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shrink-0 ${
                      typeFilter === "cashout" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "bg-white/5 text-[#909097] hover:text-white"
                    }`}
                  >
                    Cashout
                  </button>
                </div>
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-mono">
                <span className="text-[#909097] text-[10px] uppercase font-bold mr-1 shrink-0">Status:</span>
                {["ALL", "SETTLED", "ACCEPTED", "PENDING", "CANCELLED", "DISPUTED"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                      statusFilter === status
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-[#909097] hover:text-white"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Results Count */}
            <div className="flex items-center justify-between text-xs font-mono text-[#909097] px-1">
              <span>Showing {filteredOrders.length} orders</span>
              {isLoadingData && <span className="animate-pulse text-[#c0c6de]">Updating live feed...</span>}
            </div>

            {/* Empty State */}
            {filteredOrders.length === 0 && (
              <div className="obsidian-glass rounded-2xl p-12 text-center text-xs font-mono text-[#909097]">
                {isLoadingData ? "Streaming protocol orders..." : "No orders matching current filter criteria."}
              </div>
            )}

            {/* Mobile Cards View (< md) */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {filteredOrders.map((order) => {
                const isPay = order.orderType.includes("PAY");
                const merchantName = order.recipient?.includes("@") ? formatUpiName(order.recipient) : null;

                return (
                  <div key={order.id} className="obsidian-glass rounded-2xl p-4 space-y-3 font-mono text-xs">
                    {/* Card Top: Order ID + Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-white/10 font-bold text-white">
                          #{order.id}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isPay ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25"
                        }`}>
                          {isPay ? "Scan & Pay" : "Cashout"}
                        </span>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        order.status === "SETTLED"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : order.status === "ACCEPTED"
                          ? "bg-blue-500/20 text-blue-300"
                          : order.status === "CANCELLED"
                          ? "bg-red-500/20 text-[#ffb4ab]"
                          : "bg-white/10 text-[#909097]"
                      }`}>
                        {order.status}
                      </span>
                    </div>

                    {/* Card Body: Amounts */}
                    <div className="flex items-baseline justify-between pt-1 border-t border-white/5">
                      <div>
                        <span className="text-xl font-bold text-white">{order.fiatAmount}</span>
                        <span className="text-[11px] text-[#909097] ml-2">({order.usdcAmount})</span>
                      </div>
                      <span className="text-[10px] text-[#909097]">
                        {new Date(order.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {/* Card Details: Recipient & Merchant Name */}
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] space-y-1">
                      {merchantName && (
                        <div className="flex justify-between text-white font-bold">
                          <span className="text-[#909097]">Recipient:</span>
                          <span className="truncate max-w-[180px]">{merchantName}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[#909097]">
                        <span>UPI VPA:</span>
                        <span className="text-white truncate max-w-[180px]">{order.recipient || "—"}</span>
                      </div>
                      <div className="flex justify-between text-[#909097]">
                        <span>User:</span>
                        <span className="text-[#c0c6de] truncate max-w-[180px]">{order.user ? `${order.user.slice(0, 8)}...${order.user.slice(-6)}` : "—"}</span>
                      </div>
                    </div>

                    {/* Card Footer: Basescan Link */}
                    {order.txHash && (
                      <div className="pt-2 flex justify-end">
                        <a
                          href={`https://basescan.org/tx/${order.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[#c0c6de] hover:text-white inline-flex items-center gap-1 font-bold"
                        >
                          <span>Basescan Tx</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (hidden on mobile, visible on md+) */}
            <div className="hidden md:block obsidian-glass rounded-2xl p-5 overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase font-bold text-[#909097] tracking-wider">
                    <th className="pb-3 pl-2">Order</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Fiat Payout</th>
                    <th className="pb-3">USDC</th>
                    <th className="pb-3">Recipient / Merchant</th>
                    <th className="pb-3">User Address</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 pr-2 text-right">Explorer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredOrders.map((order) => {
                    const isPay = order.orderType.includes("PAY");
                    const merchantName = order.recipient?.includes("@") ? formatUpiName(order.recipient) : null;

                    return (
                      <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 pl-2 font-bold text-white">#{order.id}</td>
                        <td className="py-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isPay ? "bg-emerald-500/10 text-emerald-400" : "bg-cyan-500/10 text-cyan-400"
                          }`}>
                            {isPay ? "Scan & Pay" : "Cashout"}
                          </span>
                        </td>
                        <td className="py-3.5 font-bold text-emerald-400">{order.fiatAmount}</td>
                        <td className="py-3.5 font-bold text-white">{order.usdcAmount}</td>
                        <td className="py-3.5 truncate max-w-[160px]" title={order.recipient}>
                          <span className="font-bold text-white block">{merchantName || "—"}</span>
                          <span className="text-[#909097] text-[10px]">{order.recipient || "—"}</span>
                        </td>
                        <td className="py-3.5 text-[#909097] truncate max-w-[120px]">
                          {order.user ? `${order.user.slice(0, 6)}...${order.user.slice(-4)}` : "—"}
                        </td>
                        <td className="py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            order.status === "SETTLED"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                              : order.status === "ACCEPTED"
                              ? "bg-blue-500/15 text-blue-400 border border-blue-500/25"
                              : order.status === "CANCELLED"
                              ? "bg-red-500/15 text-[#ffb4ab] border border-red-500/25"
                              : "bg-white/5 text-[#909097] border border-white/10"
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3.5 pr-2 text-right">
                          {order.txHash ? (
                            <a
                              href={`https://basescan.org/tx/${order.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#c0c6de] hover:text-white inline-flex items-center gap-1 font-bold"
                            >
                              <span>Basescan</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[#909097]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* ────────────── TAB 3: SYSTEM & TOOLS ────────────── */}
        {activeTab === "tools" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            
            {/* System Contracts Registry */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                <Server className="w-4 h-4 text-[#c0c6de]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Base Mainnet Contract Registry
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                
                {/* Diamond */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-[#909097] text-[10px] uppercase font-bold block mb-1">
                      P2P Diamond Core
                    </span>
                    <p className="text-white break-all text-[11px]">{stats?.contracts?.diamond || "0x..."}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => stats?.contracts?.diamond && copyToClipboard(stats.contracts.diamond, "diamond")}
                      className="text-[#c0c6de] hover:text-white inline-flex items-center gap-1"
                    >
                      {copiedKey === "diamond" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "diamond" ? "Copied" : "Copy"}</span>
                    </button>
                    {stats?.contracts?.diamond && (
                      <a
                        href={`https://basescan.org/address/${stats.contracts.diamond}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#909097] hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* USDC */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-[#909097] text-[10px] uppercase font-bold block mb-1">
                      Native USDC (Base)
                    </span>
                    <p className="text-white break-all text-[11px]">{stats?.contracts?.usdc || "0x..."}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => stats?.contracts?.usdc && copyToClipboard(stats.contracts.usdc, "usdc")}
                      className="text-[#c0c6de] hover:text-white inline-flex items-center gap-1"
                    >
                      {copiedKey === "usdc" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "usdc" ? "Copied" : "Copy"}</span>
                    </button>
                    {stats?.contracts?.usdc && (
                      <a
                        href={`https://basescan.org/token/${stats.contracts.usdc}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#909097] hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Treasury */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-[#909097] text-[10px] uppercase font-bold block mb-1">
                      ZkPay Treasury
                    </span>
                    <p className="text-white break-all text-[11px]">{stats?.contracts?.treasury || "0x..."}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => stats?.contracts?.treasury && copyToClipboard(stats.contracts.treasury, "treasury")}
                      className="text-[#c0c6de] hover:text-white inline-flex items-center gap-1"
                    >
                      {copiedKey === "treasury" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "treasury" ? "Copied" : "Copy"}</span>
                    </button>
                    {stats?.contracts?.treasury && (
                      <a
                        href={`https://basescan.org/address/${stats.contracts.treasury}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#909097] hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Earn Vault */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-[#909097] text-[10px] uppercase font-bold block mb-1">
                      Moonwell Yield Vault
                    </span>
                    <p className="text-white break-all text-[11px]">
                      {stats?.contracts?.vault || stats?.earnVault?.address || "Configured"}
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => (stats?.contracts?.vault || stats?.earnVault?.address) && copyToClipboard((stats.contracts.vault || stats.earnVault?.address)!, "vault")}
                      disabled={!stats?.contracts?.vault && !stats?.earnVault?.address}
                      className="text-[#c0c6de] hover:text-white inline-flex items-center gap-1 disabled:opacity-40"
                    >
                      {copiedKey === "vault" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "vault" ? "Copied" : "Copy"}</span>
                    </button>
                    {(stats?.contracts?.vault || stats?.earnVault?.address) && (
                      <a
                        href={`https://basescan.org/address/${stats.contracts.vault || stats.earnVault?.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#909097] hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* SideShift Deposit Lookup Tool */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                <Server className="w-4 h-4 text-[#c0c6de]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Cross-Chain Shift Inspector
                </h3>
              </div>

              <form onSubmit={handleLookupShift} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter SideShift Shift ID (e.g. 64a8f...)"
                  value={shiftIdInput}
                  onChange={(e) => setShiftIdInput(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-[#909097]/60 focus:border-[#c0c6de] outline-none"
                />
                <button
                  type="submit"
                  disabled={isSearchingShift || !shiftIdInput.trim()}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-mono font-bold transition-all disabled:opacity-40"
                >
                  {isSearchingShift ? "Querying..." : "Query"}
                </button>
              </form>

              {shiftError && (
                <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-[#ffb4ab] text-xs font-mono">
                  {shiftError}
                </div>
              )}

              {shiftData && (
                <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-xs font-mono space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#909097]">Status:</span>
                    <span className="font-bold text-emerald-400 uppercase">{shiftData.status}</span>
                  </div>
                  {shiftData.depositAmount && (
                    <div className="flex justify-between">
                      <span className="text-[#909097]">Deposit Amount:</span>
                      <span className="text-white">{shiftData.depositAmount} {shiftData.depositCoin}</span>
                    </div>
                  )}
                  {shiftData.settleAmount && (
                    <div className="flex justify-between">
                      <span className="text-[#909097]">Settled Amount:</span>
                      <span className="text-emerald-400 font-bold">{shiftData.settleAmount} USDC</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* PayLinks & Active Sessions Telemetry */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono pb-3 border-b border-white/10">
                PayLinks & Active Pay-In Telemetry
              </h3>

              <div className="grid grid-cols-3 gap-3 text-center font-mono">
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] font-bold text-[#909097] uppercase block mb-1">Total PayLinks</span>
                  <span className="text-2xl font-black text-white">{stats?.paylinksSummary?.total || 0}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] font-bold text-[#909097] uppercase block mb-1">Settled</span>
                  <span className="text-2xl font-black text-emerald-400">{stats?.paylinksSummary?.paid || 0}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] font-bold text-[#909097] uppercase block mb-1">Active Sessions</span>
                  <span className="text-2xl font-black text-cyan-400">{stats?.payinSessionsSummary?.activeCount || 0}</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ────────────── TAB 4: MONTHLY REWARDS & CASHBACK ────────────── */}
        {activeTab === "rewards" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header & Controls */}
            <div className="p-5 rounded-2xl bg-black/40 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white font-mono tracking-tight flex items-center gap-2">
                    <span>Monthly Cashback & Referral Disbursal</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                      Scan & Pay Only
                    </span>
                  </h2>
                  <p className="text-xs text-[#909097] font-mono">
                    Cycle: <span className="text-white font-bold">{rewardsData?.cycle || rewardsCycle || "Current"}</span> • Funded from 1% Scan & Pay Platform Fees
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadAdminData}
                  disabled={isLoadingData}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-[#c0c6de] flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Metrics Overview Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1">
                <span className="text-[10px] font-bold text-[#909097] uppercase tracking-wider block">Scan & Pay Volume</span>
                <span className="text-xl sm:text-2xl font-black text-white">${rewardsData?.totalCycleVolume?.toFixed(2) || "0.00"}</span>
                <span className="text-[10px] text-[#909097] block">Base Network</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1">
                <span className="text-[10px] font-bold text-[#909097] uppercase tracking-wider block">1% Fees Collected</span>
                <span className="text-xl sm:text-2xl font-black text-cyan-400">${rewardsData?.totalPlatformFees?.toFixed(2) || "0.00"}</span>
                <span className="text-[10px] text-[#909097] block">In Treasury</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/40 border border-purple-500/20 bg-purple-950/20 space-y-1">
                <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider block">Pending Disbursal</span>
                <span className="text-xl sm:text-2xl font-black text-purple-300">${rewardsData?.totalPendingPayout?.toFixed(2) || "0.00"}</span>
                <span className="text-[10px] text-purple-400/70 block">{rewardsData?.eligibleUserCount || 0} Eligible Wallets</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/40 border border-emerald-500/20 bg-emerald-950/20 space-y-1">
                <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Net Profit Retained</span>
                <span className="text-xl sm:text-2xl font-black text-emerald-400">${rewardsData?.netTreasuryProfitRetained?.toFixed(2) || "0.00"}</span>
                <span className="text-[10px] text-emerald-400/70 block">≥60% Guaranteed Margin</span>
              </div>
            </div>

            {/* Disbursal Action Banner */}
            <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-purple-950/40 via-black/50 to-purple-950/40 border border-purple-500/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                    <Send className="w-4 h-4 text-purple-400" />
                    <span>Month-End Disbursal Action</span>
                  </h3>
                  <p className="text-xs text-[#909097] font-mono mt-1">
                    Signing will disburse <strong className="text-white">${rewardsData?.totalPendingPayout?.toFixed(2) || "0.00"} USDC</strong> to{" "}
                    <strong className="text-white">{rewardsData?.eligibleUserCount || 0} approved users</strong> directly from your connected admin wallet.
                  </p>
                </div>

                <button
                  onClick={handleDisburseRewards}
                  disabled={isDisbursing || !rewardsData?.eligibleUserCount || rewardsData.eligibleUserCount === 0}
                  className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-bold text-xs font-mono uppercase tracking-wider transition-all shadow-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                >
                  <Wallet className="w-4 h-4" />
                  <span>
                    {isDisbursing ? "Disbursing..." : `Sign & Disburse ($${rewardsData?.totalPendingPayout?.toFixed(2) || "0.00"})`}
                  </span>
                </button>
              </div>

              {/* Disbursal Feedback Messages */}
              {disburseProgress && (
                <div className="p-3.5 rounded-xl bg-purple-950/60 border border-purple-500/40 text-xs font-mono text-purple-200 flex items-center gap-2 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{disburseProgress}</span>
                </div>
              )}

              {disburseTxHash && (
                <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Payout successful! Transaction recorded on Base.</span>
                  </span>
                  <a
                    href={`https://basescan.org/tx/${disburseTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-white flex items-center gap-1 font-bold"
                  >
                    <span>View Basescan</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {disburseError && (
                <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-xs font-mono text-[#ffb4ab]">
                  {disburseError}
                </div>
              )}
            </div>

            {/* Eligible Users Table */}
            <div className="obsidian-glass rounded-2xl overflow-hidden border border-white/10">
              <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#c0c6de]" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    User Reward Ledger ({rewardsData?.users?.length || 0})
                  </h3>
                </div>
                <span className="text-xs text-[#909097] font-mono">
                  Toggle to exclude or add back users before signing
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-[#909097]">
                      <th className="py-3 px-4">User Address</th>
                      <th className="py-3 px-4">Scan Orders</th>
                      <th className="py-3 px-4">Cashback</th>
                      <th className="py-3 px-4">Referrals</th>
                      <th className="py-3 px-4 font-bold text-white">Total Due</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rewardsData?.users && rewardsData.users.length > 0 ? (
                      rewardsData.users.map((u: any, idx: number) => (
                        <tr
                          key={idx}
                          className={`hover:bg-white/[0.02] transition-colors ${
                            u.excluded ? "opacity-40 bg-red-950/10" : ""
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-mono">
                                {u.userAddress.slice(0, 6)}...{u.userAddress.slice(-4)}
                              </span>
                              <button
                                onClick={() => copyToClipboard(u.userAddress, `user_${idx}`)}
                                className="text-[#909097] hover:text-white"
                                title="Copy"
                              >
                                {copiedKey === `user_${idx}` ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              <a
                                href={`https://basescan.org/address/${u.userAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#909097] hover:text-white"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-[#909097]">{u.scanCount} txs</td>
                          <td className="py-3 px-4 text-white">${u.cashbackUsdc.toFixed(2)}</td>
                          <td className="py-3 px-4 text-white">${u.referralUsdc.toFixed(2)}</td>
                          <td className="py-3 px-4 text-emerald-400 font-bold">
                            ${u.totalDueUsdc.toFixed(2)} USDC
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                u.status === "PAID"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : u.excluded
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-yellow-500/20 text-yellow-300"
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {u.status !== "PAID" ? (
                              <button
                                onClick={() => handleToggleExclusion(u.userAddress, u.excluded)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                  u.excluded
                                    ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                                    : "bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30"
                                }`}
                              >
                                {u.excluded ? (
                                  <span className="flex items-center gap-1">
                                    <UserCheck className="w-3 h-3" /> Add Back
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <UserMinus className="w-3 h-3" /> Exclude
                                  </span>
                                )}
                              </button>
                            ) : (
                              <span className="text-[11px] text-emerald-400 font-bold flex items-center justify-end gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Disbursed
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-[#909097]">
                          No user rewards recorded for this cycle yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
