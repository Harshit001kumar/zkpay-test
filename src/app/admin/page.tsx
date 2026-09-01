"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState, useEffect, useCallback } from "react";
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
  Fuel,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

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

export default function AdminPage() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();

  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
        setAuthError(data.error || "Access Denied: You are not on the administrator whitelist.");
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

      // 2. Fetch Orders
      const ordersRes = await fetch(
        `/api/admin/orders?limit=30${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`,
        { headers: reqHeaders }
      );
      if (ordersRes.ok) {
        const ordersJson = await ordersRes.json();
        setOrders(ordersJson.orders || []);
      }
    } catch (err) {
      console.error("Failed to load admin data", err);
    } finally {
      setIsLoadingData(false);
    }
  }, [isAuthorized, getAccessToken, searchQuery]);

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

  // -------------------------------------------------------------
  // 1. LOADING STATE
  // -------------------------------------------------------------
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-[#020408] text-[#e5e2e3] flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-mono text-sm tracking-widest text-[#909097] uppercase">Verifying Admin Credentials...</p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. UNAUTHORIZED / ACCESS DENIED STATE
  // -------------------------------------------------------------
  if (!authenticated || !isAuthorized) {
    return (
      <div className="min-h-screen bg-[#020408] text-[#e5e2e3] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/5 blur-[140px] rounded-full pointer-events-none"></div>

        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 text-[#ffb4ab]">
            <Lock className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight mb-2 text-[#e5e2e3]">Restricted Area</h1>
          <p className="text-sm text-[#909097] mb-6 leading-relaxed">
            The ZkPay Administrator Console is restricted to authorized cryptographic keys and whitelisted Privy accounts.
          </p>

          {authError && (
            <div className="w-full p-4 rounded-xl bg-red-950/30 border border-red-500/20 text-[#ffb4ab] text-xs font-mono mb-6 text-left break-all">
              <span className="font-bold block uppercase tracking-wider mb-1">Security Guard</span>
              {authError}
            </div>
          )}

          {authenticated && user && (
            <div className="w-full p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-[#909097] font-mono mb-6 text-left">
              <p className="text-[#c6c6cd] font-bold mb-1">Authenticated Identity:</p>
              <p className="truncate">DID: {user.id}</p>
              {user.wallet?.address && <p className="truncate">Wallet: {user.wallet.address}</p>}
            </div>
          )}

          <div className="flex flex-col gap-3 w-full">
            {!authenticated ? (
              <button
                onClick={login}
                className="w-full py-4 rounded-xl bg-[#e5e2e3] text-black font-bold text-xs uppercase tracking-widest hover:bg-white transition-all active:scale-[0.98]"
              >
                Sign In with Admin Wallet
              </button>
            ) : (
              <button
                onClick={logout}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-[#e5e2e3] font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                Disconnect & Switch Account
              </button>
            )}

            <Link
              href="/"
              className="py-3 text-xs text-[#909097] hover:text-[#e5e2e3] flex items-center justify-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Return to App
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
    <div className="min-h-screen bg-[#020408] text-[#e5e2e3] font-sans pb-24">
      {/* Top Admin Navigation */}
      <header className="sticky top-0 z-50 bg-[#020408]/80 backdrop-blur-xl border-b border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[#909097] hover:text-white transition-colors flex items-center gap-1.5 text-xs">
              <ArrowLeft className="w-4 h-4" /> App
            </Link>
            <div className="h-4 w-[1px] bg-white/10"></div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <h1 className="text-sm font-bold tracking-[0.2em] uppercase text-[#e5e2e3]">
                ZkPay Admin Console
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-[#c6c6cd]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{user?.wallet?.address ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` : user?.id?.slice(0, 15)}</span>
            </div>

            <button
              onClick={loadAdminData}
              disabled={isLoadingData}
              aria-label="Refresh Data"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[#c0c6de] transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingData ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={logout}
              className="text-xs text-[#ffb4ab] hover:opacity-80 transition-opacity font-bold uppercase tracking-wider"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8 flex flex-col gap-8">
        {/* Gas Relayer Alert Banner if low or not configured */}
        {stats?.relayer && !stats.relayer.healthy && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-amber-200">Gas Tank Alert</h4>
                <p className="text-xs text-amber-300/80">
                  {stats.relayer.error || "Gas relayer has 0 ETH. Please send ~$3-$5 of ETH on Base to your relayer address."}
                </p>
              </div>
            </div>
            {stats.relayer.address && stats.relayer.address.startsWith("0x") && (
              <button
                onClick={() => copyToClipboard(stats.relayer!.address, "relayer-alert")}
                className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all shrink-0"
              >
                {copiedKey === "relayer-alert" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy Relayer Address</span>
              </button>
            )}
          </div>
        )}

        {/* KPI Bento Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Treasury Balance */}
          <div className="bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-2xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 text-emerald-400/20 group-hover:text-emerald-400/40 transition-colors">
              <DollarSign className="w-10 h-10" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#909097] mb-1">
                Treasury Fees (1% Revenue)
              </p>
              <h2 className="text-3xl font-extrabold text-[#e5e2e3] tracking-tight">
                ${stats?.telemetry?.treasuryUsdcBalance || "0.00"} <span className="text-sm font-normal text-[#909097]">USDC</span>
              </h2>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-[#909097]">
              <span>Base Mainnet</span>
              {stats?.contracts?.treasury && (
                <a
                  href={`https://basescan.org/token/${stats.contracts.usdc}?a=${stats.contracts.treasury}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#c0c6de] hover:underline flex items-center gap-1"
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* Gas Relayer Tank */}
          <div className="bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-2xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 text-cyan-400/20 group-hover:text-cyan-400/40 transition-colors">
              <Fuel className="w-10 h-10" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#909097] mb-1">
                Gas Relayer Tank
              </p>
              <h2 className="text-3xl font-extrabold text-[#e5e2e3] tracking-tight">
                {parseFloat(stats?.relayer?.balanceEth || "0").toFixed(4)} <span className="text-sm font-normal text-[#909097]">ETH</span>
              </h2>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono">
              <span className={stats?.relayer?.healthy ? "text-emerald-400" : "text-amber-400"}>
                {stats?.relayer?.healthy ? "● ACTIVE (SPONSORING)" : "● REFILL NEEDED"}
              </span>
              {stats?.relayer?.address && stats.relayer.address.startsWith("0x") && (
                <button
                  onClick={() => copyToClipboard(stats.relayer!.address, "relayer-tank")}
                  className="text-[#c0c6de] hover:underline flex items-center gap-1"
                >
                  {copiedKey === "relayer-tank" ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          </div>

          {/* Live P2P FX Rate */}
          <div className="bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-2xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 text-[#c0c6de]/20 group-hover:text-[#c0c6de]/40 transition-colors">
              <TrendingUp className="w-10 h-10" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#909097] mb-1">
                P2P Market Rate
              </p>
              <h2 className="text-3xl font-extrabold text-[#e5e2e3] tracking-tight">
                ₹ {stats?.telemetry?.inrPerUsdcRate || "0.00"} <span className="text-sm font-normal text-[#909097]">/ USDC</span>
              </h2>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-[#909097]">
              <span>Goldsky Subgraph Feed</span>
              <span className="text-emerald-400 font-mono text-[11px]">ACTIVE</span>
            </div>
          </div>

          {/* Protocol Liquidity */}
          <div className="bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-2xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 text-purple-400/20 group-hover:text-purple-400/40 transition-colors">
              <Layers className="w-10 h-10" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#909097] mb-1">
                Diamond Escrow Liquidity
              </p>
              <h2 className="text-3xl font-extrabold text-[#e5e2e3] tracking-tight">
                ${stats?.telemetry?.diamondUsdcLiquidity || "0.00"} <span className="text-sm font-normal text-[#909097]">USDC</span>
              </h2>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-[#909097]">
              <span>P2P Protocol Diamond</span>
              <span className="text-[#c0c6de] font-mono text-[11px]">v4 Core</span>
            </div>
          </div>
        </section>

        {/* Two-Column Section: Gas Relayer Inspector & Contract Registry */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gas Relayer Management & SideShift Inspector */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            {/* Relayer Controller Card */}
            <div className="bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <Fuel className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-[#e5e2e3]">Gas Tank Manager</h3>
              </div>
              <p className="text-xs text-[#909097] mb-4">
                Sponsors Base network gas for 1-click Smart Account payments.
              </p>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs font-mono space-y-2 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-[#909097]">Status:</span>
                  <span className={`font-bold ${stats?.relayer?.healthy ? "text-emerald-400" : "text-amber-400"}`}>
                    {stats?.relayer?.healthy ? "HEALTHY" : "OFFLINE / EMPTY"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#909097]">Balance:</span>
                  <span className="font-bold text-[#e5e2e3]">{stats?.relayer?.balanceEth || "0"} ETH</span>
                </div>
                <div>
                  <span className="text-[#909097] block mb-1">Relayer Address:</span>
                  <div className="flex items-center justify-between bg-black/40 p-2 rounded-lg text-[11px]">
                    <span className="truncate max-w-[200px] text-[#c0c6de]">{stats?.relayer?.address || "None"}</span>
                    {stats?.relayer?.address && (
                      <button
                        onClick={() => copyToClipboard(stats.relayer!.address, "relayer-addr")}
                        className="text-xs text-white hover:text-[#c0c6de] ml-2"
                      >
                        {copiedKey === "relayer-addr" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[#909097] leading-relaxed">
                💡 <strong className="text-white">Tip:</strong> Send $3 of ETH on Base to your relayer address to sponsor ~3,000 user transactions.
              </div>
            </div>

            {/* SideShift Deposit Lookup */}
            <div className="bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-5 h-5 text-[#c0c6de]" />
                <h3 className="text-base font-bold text-[#e5e2e3]">Cross-Chain Shift Inspector</h3>
              </div>

              <form onSubmit={handleLookupShift} className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Shift ID (e.g. 64a8f...)"
                  value={shiftIdInput}
                  onChange={(e) => setShiftIdInput(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-[#e5e2e3] outline-none focus:border-[#c0c6de]"
                />
                <button
                  type="submit"
                  disabled={isSearchingShift || !shiftIdInput.trim()}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-[#e5e2e3] rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                >
                  {isSearchingShift ? "..." : "Query"}
                </button>
              </form>

              {shiftError && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/20 text-[#ffb4ab] text-xs font-mono mb-2">
                  {shiftError}
                </div>
              )}

              {shiftData && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs font-mono space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#909097]">Status:</span>
                    <span className="font-bold text-emerald-400 uppercase">{shiftData.status}</span>
                  </div>
                  {shiftData.depositAmount && (
                    <div className="flex justify-between">
                      <span className="text-[#909097]">Deposit:</span>
                      <span>{shiftData.depositAmount}</span>
                    </div>
                  )}
                  {shiftData.settleAmount && (
                    <div className="flex justify-between">
                      <span className="text-[#909097]">Settled:</span>
                      <span>{shiftData.settleAmount}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* System Contract Registry */}
          <div className="lg:col-span-2 bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-[#c0c6de]" />
                <h3 className="text-base font-bold text-[#e5e2e3]">System Contract Registry (Base Mainnet)</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                {/* Diamond */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-[#909097] block text-[10px] uppercase font-bold mb-1">P2P Diamond Core</span>
                    <p className="text-[#e5e2e3] break-all">{stats?.contracts?.diamond || "0x..."}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/5">
                    <button
                      onClick={() => stats?.contracts?.diamond && copyToClipboard(stats.contracts.diamond, "diamond")}
                      className="text-[#c0c6de] hover:text-white flex items-center gap-1"
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
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* USDC */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-[#909097] block text-[10px] uppercase font-bold mb-1">Native USDC</span>
                    <p className="text-[#e5e2e3] break-all">{stats?.contracts?.usdc || "0x..."}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/5">
                    <button
                      onClick={() => stats?.contracts?.usdc && copyToClipboard(stats.contracts.usdc, "usdc")}
                      className="text-[#c0c6de] hover:text-white flex items-center gap-1"
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
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Treasury */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-[#909097] block text-[10px] uppercase font-bold mb-1">ZkPay Treasury</span>
                    <p className="text-[#e5e2e3] break-all">{stats?.contracts?.treasury || "0x..."}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/5">
                    <button
                      onClick={() => stats?.contracts?.treasury && copyToClipboard(stats.contracts.treasury, "treasury")}
                      className="text-[#c0c6de] hover:text-white flex items-center gap-1"
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
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Paylinks Metrics Ribbon */}
            <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-white/5 rounded-xl">
                <span className="text-[10px] font-bold text-[#909097] uppercase block">Total PayLinks</span>
                <span className="text-xl font-bold text-[#e5e2e3]">{stats?.paylinksSummary?.total || 0}</span>
              </div>
              <div className="p-3 bg-white/5 rounded-xl">
                <span className="text-[10px] font-bold text-[#909097] uppercase block">Settled PayLinks</span>
                <span className="text-xl font-bold text-emerald-400">{stats?.paylinksSummary?.paid || 0}</span>
              </div>
              <div className="p-3 bg-white/5 rounded-xl">
                <span className="text-[10px] font-bold text-[#909097] uppercase block">Active Sessions</span>
                <span className="text-xl font-bold text-cyan-400">{stats?.payinSessionsSummary?.activeCount || 0}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Live Orders Stream */}
        <section className="bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-[#e5e2e3]">Live P2P Protocol Orders</h3>
            </div>

            <div className="w-full sm:w-72 relative">
              <Search className="w-4 h-4 text-[#909097] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search orders, wallets, hashes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-[#e5e2e3] placeholder:text-[#909097] outline-none focus:border-[#c0c6de] transition-colors"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase font-bold text-[#909097] tracking-wider">
                  <th className="pb-3 pl-2">Type</th>
                  <th className="pb-3">Order ID</th>
                  <th className="pb-3">User</th>
                  <th className="pb-3">Recipient</th>
                  <th className="pb-3">USDC</th>
                  <th className="pb-3">Fiat Payout</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#909097] text-xs">
                      {isLoadingData ? "Streaming live protocol orders..." : "No recent orders found matching criteria."}
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pl-2 font-bold text-[#c0c6de]">{order.orderType}</td>
                      <td className="py-3">#{order.id}</td>
                      <td className="py-3 text-[#909097] truncate max-w-[120px]">
                        {order.user ? `${order.user.slice(0, 6)}...${order.user.slice(-4)}` : "—"}
                      </td>
                      <td className="py-3 text-[#909097] truncate max-w-[120px]">
                        {order.recipient ? `${order.recipient.slice(0, 6)}...${order.recipient.slice(-4)}` : "—"}
                      </td>
                      <td className="py-3 font-bold text-[#e5e2e3]">{order.usdcAmount}</td>
                      <td className="py-3 text-emerald-400 font-bold">{order.fiatAmount}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            order.status === "SETTLED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : order.status === "ACCEPTED"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : order.status === "DISPUTED"
                              ? "bg-red-500/10 text-[#ffb4ab] border border-red-500/20"
                              : "bg-white/5 text-[#909097] border border-white/10"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 pr-2 text-right">
                        {order.txHash ? (
                          <a
                            href={`https://basescan.org/tx/${order.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#c0c6de] hover:text-white inline-flex items-center gap-1"
                          >
                            <span>Basescan</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[#909097]">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
