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
  Users,
  Trash2,
  Fuel,
} from "lucide-react";
import { formatUpiName } from "@/lib/p2pkit";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { encodeFunctionData, parseUnits } from "viem";
import {
  getAdminPaymentOverview,
  executeManualRefundAction,
  retryHandshakeAction,
  forceCancelOrderAction,
  AdminPaymentOverview,
} from "@/lib/server/adminPaymentActions";

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
  sweeper?: {
    configured: boolean;
    address: string | null;
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

type AdminTab = "overview" | "orders" | "payments" | "rewards" | "tools";

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

  // Payments & Fund Recovery Console State
  const [paymentData, setPaymentData] = useState<AdminPaymentOverview | null>(null);
  const [isLoadingPaymentData, setIsLoadingPaymentData] = useState(false);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("ALL");
  const [manualRefundSession, setManualRefundSession] = useState<any | null>(null);
  const [manualRefundRecipient, setManualRefundRecipient] = useState<string>("");
  const [manualRefundAmount, setManualRefundAmount] = useState<string>("");
  const [isExecutingAdminAction, setIsExecutingAdminAction] = useState(false);
  const [adminActionResult, setAdminActionResult] = useState<{ success: boolean; message: string; txHash?: string } | null>(null);

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

  // Cross-Chain Deposit Lookup State (NEAR Intents)
  const [shiftIdInput, setShiftIdInput] = useState("");
  const [shiftData, setShiftData] = useState<any>(null);
  const [isSearchingShift, setIsSearchingShift] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);

  // Sweeper State
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<any>(null);

  const handleSweepAll = async () => {
    setIsSweeping(true);
    setSweepResult(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/admin/sweeper", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setSweepResult(data);
      loadAdminData();
    } catch (err: any) {
      setSweepResult({ success: false, error: err.message });
    } finally {
      setIsSweeping(false);
    }
  };

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

  const handleResetCycle = async () => {
    if (!window.confirm("Are you sure you want to reset and clear all phantom/test reward entries for this cycle?")) {
      return;
    }
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/admin/rewards", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "reset-cycle",
          cycle: rewardsData?.cycle,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Cycle rewards successfully reset.");
        loadAdminData();
      } else {
        alert(data.error || "Failed to reset cycle");
      }
    } catch (err: any) {
      alert(err.message || "Failed to reset cycle");
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
      const token = await getAccessToken();
      let lastTxHash = "";
      const disbursedAddresses: string[] = [];

      for (let i = 0; i < eligible.length; i++) {
        const u = eligible[i];
        setDisburseProgress(`Sending ${i + 1}/${eligible.length}: $${u.totalDueUsdc.toFixed(2)} USDC to ${u.userAddress.slice(0, 6)}...${u.userAddress.slice(-4)}`);

        const amountWei = parseUnits(u.totalDueUsdc.toFixed(6), 6);
        const data = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [u.userAddress as any, amountWei],
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

        // Immediately record each completed transfer on backend to prevent double-payout if a subsequent tx fails
        if (token) {
          await fetch("/api/admin/rewards", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "mark-paid",
              cycle: rewardsData.cycle,
              userAddresses: [u.userAddress],
              payoutTxHash: lastTxHash,
            }),
          }).catch((e) => console.warn("Incremental mark-paid warning:", e));
        }
      }

      setDisburseProgress("Confirming payout records on backend...");
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
      loadAdminData();
    } finally {
      setIsDisbursing(false);
    }
  };

  useEffect(() => {
    verifyAdmin();
  }, [verifyAdmin]);

  const loadPayments = useCallback(async () => {
    setIsLoadingPaymentData(true);
    try {
      const token = await getAccessToken();
      const res = await getAdminPaymentOverview(token);
      if (res.success) {
        setPaymentData(res);
      }
    } catch (err: any) {
      console.warn("[Admin] loadPayments warning:", err);
    } finally {
      setIsLoadingPaymentData(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isAuthorized) {
      loadAdminData();
    }
  }, [isAuthorized, loadAdminData]);

  useEffect(() => {
    if (isAuthorized && activeTab === "payments") {
      loadPayments();
    }
  }, [isAuthorized, activeTab, loadPayments]);

  useEffect(() => {
    if (isAuthorized && activeTab === "tools") {
      loadRecentProxyOrders();
    }
  }, [isAuthorized, activeTab, loadRecentProxyOrders]);

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
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
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
              <h1 className="text-xs sm:text-sm font-bold tracking-normal  text-white">
                Admin Console
              </h1>
            </div>
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
        <div className="grid grid-cols-5 p-1 rounded-2xl bg-black/40 border border-white/10 max-w-2xl mx-auto sm:mx-0">
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
            onClick={() => setActiveTab("orders")}
            className={`py-2 px-2.5 rounded-xl text-xs font-sans tabular-nums font-bold transition-colors relative ${
              activeTab === "orders"
                ? "bg-white/10 text-white shadow-sm border border-white/15"
                : "text-outline hover:text-on-surface"
            }`}
          >
            <span>Orders</span>
            {orders.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-success/20 text-success text-[9px]">
                {orders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`py-2 px-2.5 rounded-xl text-xs font-sans tabular-nums font-bold transition-colors relative ${
              activeTab === "payments"
                ? "bg-white/10 text-white shadow-sm border border-white/15"
                : "text-outline hover:text-on-surface"
            }`}
          >
            <span>Payments</span>
            {paymentData?.stats?.storedRefundsCount ? (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-warning/20 text-warning text-[9px] font-bold">
                {paymentData.stats.storedRefundsCount}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setActiveTab("rewards")}
            className={`py-2 px-2.5 rounded-xl text-xs font-sans tabular-nums font-bold transition-colors relative ${
              activeTab === "rewards"
                ? "bg-white/10 text-white shadow-sm border border-white/15"
                : "text-outline hover:text-on-surface"
            }`}
          >
            <span>Rewards</span>
            {rewardsData?.eligibleUserCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[9px]">
                {rewardsData.eligibleUserCount}
              </span>
            )}
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
            
            {/* Infrastructure & Gas Sponsorship Banners */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Pimlico Paymaster Banner */}
              <div className="p-4 rounded-2xl bg-success/15/30 border border-success/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-success/10 border border-success/30 flex items-center justify-center text-success shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-success">
                      Pimlico ERC-4337 Gas Sponsorship
                    </h4>
                    <p className="text-[11px] text-success/80 font-sans tabular-nums">
                      100% of UserOps sponsored on Base Mainnet
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-success/20 text-success text-[10px] font-sans tabular-nums font-bold shrink-0">
                  ACTIVE
                </span>
              </div>

              {/* Sweeper Wallet Card */}
              <div className="p-4 rounded-2xl bg-surface border border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs sm:text-sm font-bold text-white">
                        Deposit Sweeper Wallet
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
                          title="Copy Sweeper Address"
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
                  {stats?.sweeper?.configured ? "SWEEPER READY" : "SETUP KEY"}
                </span>
              </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              
              {/* Card 1: Treasury Revenue */}
              <div className="obsidian-glass rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold  tracking-normal text-outline font-sans tabular-nums">
                    Treasury Revenue (USDC)
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center text-success">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <h3 className="text-3xl font-black text-white tracking-tight">
                    ${stats?.telemetry?.treasuryUsdcBalance || "0.00"}
                  </h3>
                  <p className="text-[11px] font-sans tabular-nums text-outline mt-1">
                    Collected 1% Platform Take-Rate
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-sans tabular-nums">
                  <span className="text-success font-bold">1% Auto-Directed</span>
                  {stats?.contracts?.treasury && (
                    <a
                      href={`https://basescan.org/token/${stats.contracts.usdc}?a=${stats.contracts.treasury}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
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
                  <span className="text-[10px] font-bold  tracking-normal text-outline font-sans tabular-nums">
                    Live P2P Market Rate
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <h3 className="text-3xl font-black text-white tracking-tight">
                    ₹{stats?.telemetry?.inrPerUsdcRate || "0.00"}
                  </h3>
                  <p className="text-[11px] font-sans tabular-nums text-outline mt-1">
                    INR per USDC (P2P Oracle Feed)
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-sans tabular-nums">
                  <span className="text-success">● Live Subgraph Feed</span>
                  <span className="text-outline">INR</span>
                </div>
              </div>

              {/* Card 3: Protocol Escrow Liquidity */}
              <div className="obsidian-glass rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold  tracking-normal text-outline font-sans tabular-nums">
                    Diamond Escrow Liquidity
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <h3 className="text-3xl font-black text-white tracking-tight">
                    ${stats?.telemetry?.diamondUsdcLiquidity || "0.00"}
                  </h3>
                  <p className="text-[11px] font-sans tabular-nums text-outline mt-1">
                    Locked USDC in Diamond Core
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-sans tabular-nums">
                  <span className="text-primary">Base Mainnet</span>
                  <span className="text-primary font-bold">P2P v4</span>
                </div>
              </div>

              {/* Card 4: Earn Yield Vault */}
              <div className="obsidian-glass rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold  tracking-normal text-outline font-sans tabular-nums">
                    Base USDC Earn Vault
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <h3 className="text-3xl font-black text-white tracking-tight">
                    {stats?.earnVault?.apy || "5.51"}% <span className="text-sm font-normal text-outline">APY</span>
                  </h3>
                  <p className="text-[11px] font-sans tabular-nums text-outline mt-1">
                    Steakhouse / Morpho Blue Vault
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-sans tabular-nums">
                  <span className="text-primary font-bold">Auto-Compounding</span>
                  <span className="text-outline">DeFi Yield</span>
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
                    1. Platform Convenience Fee
                  </span>
                  <p className="text-base font-bold text-white">1.00% (100 bps)</p>
                  <p className="text-[11px] text-outline">
                    Sent to ZkPay Treasury on every Scan & Pay and Cashout order
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-outline text-[10px]  font-bold block">
                    2. Protocol Small-Order Fee
                  </span>
                  <p className="text-base font-bold text-white">$0.10 USDC</p>
                  <p className="text-[11px] text-outline">
                    Enforced by Diamond for orders ≤ $10 USDC. (Free for orders &gt; $10)
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-outline text-[10px]  font-bold block">
                    3. No-KYC Transaction Ceiling
                  </span>
                  <p className="text-base font-bold text-white">100 USDC / Order</p>
                  <p className="text-[11px] text-outline">
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
                  <Search className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by Order ID, Address, UPI ID, Hash..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs font-sans tabular-nums text-white placeholder:text-outline/60 focus:border-primary outline-none transition-colors"
                  />
                </div>

                {/* Type Filter Chips */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setTypeFilter("all")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-sans tabular-nums font-bold transition-colors shrink-0 ${
                      typeFilter === "all" ? "bg-white/15 text-white border border-white/20" : "bg-white/5 text-outline hover:text-white"
                    }`}
                  >
                    All Types
                  </button>
                  <button
                    onClick={() => setTypeFilter("pay")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-sans tabular-nums font-bold transition-colors shrink-0 ${
                      typeFilter === "pay" ? "bg-success/20 text-success border border-success/30" : "bg-white/5 text-outline hover:text-white"
                    }`}
                  >
                    Scan & Pay
                  </button>
                  <button
                    onClick={() => setTypeFilter("cashout")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-sans tabular-nums font-bold transition-colors shrink-0 ${
                      typeFilter === "cashout" ? "bg-primary/20 text-primary border border-primary/30" : "bg-white/5 text-outline hover:text-white"
                    }`}
                  >
                    Cashout
                  </button>
                </div>
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-sans tabular-nums">
                <span className="text-outline text-[10px]  font-bold mr-1 shrink-0">Status:</span>
                {["ALL", "SETTLED", "ACCEPTED", "PENDING", "CANCELLED", "DISPUTED"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors shrink-0 ${
                      statusFilter === status
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-outline hover:text-white"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Results Count */}
            <div className="flex items-center justify-between text-xs font-sans tabular-nums text-outline px-1">
              <span>Showing {filteredOrders.length} orders</span>
              {isLoadingData && <span className="animate-pulse text-primary">Updating live feed…</span>}
            </div>

            {/* Empty State */}
            {filteredOrders.length === 0 && (
              <div className="obsidian-glass rounded-2xl p-12 text-center text-xs font-sans tabular-nums text-outline">
                {isLoadingData ? "Streaming protocol orders..." : "No orders matching current filter criteria."}
              </div>
            )}

            {/* Mobile Cards View (< md) */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {filteredOrders.map((order) => {
                const isPay = order.orderType.includes("PAY");
                const merchantName = order.recipient?.includes("@") ? formatUpiName(order.recipient) : null;

                return (
                  <div key={order.id} className="obsidian-glass rounded-2xl p-4 space-y-3 font-sans tabular-nums text-xs">
                    {/* Card Top: Order ID + Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-white/10 font-bold text-white">
                          #{order.id}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isPay ? "bg-success/15 text-success border border-success/25" : "bg-primary/15 text-primary border border-primary/25"
                        }`}>
                          {isPay ? "Scan & Pay" : "Cashout"}
                        </span>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        order.status === "SETTLED"
                          ? "bg-success/20 text-success"
                          : order.status === "ACCEPTED"
                          ? "bg-primary/20 text-primary"
                          : order.status === "CANCELLED"
                          ? "bg-error/20 text-error"
                          : "bg-white/10 text-outline"
                      }`}>
                        {order.status}
                      </span>
                    </div>

                    {/* Card Body: Amounts */}
                    <div className="flex items-baseline justify-between pt-1 border-t border-white/5">
                      <div>
                        <span className="text-xl font-bold text-white">{order.fiatAmount}</span>
                        <span className="text-[11px] text-outline ml-2">({order.usdcAmount})</span>
                      </div>
                      <span className="text-[10px] text-outline">
                        {new Date(order.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {/* Card Details: Recipient & Merchant Name */}
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] space-y-1">
                      {merchantName && (
                        <div className="flex justify-between text-white font-bold">
                          <span className="text-outline">Recipient:</span>
                          <span className="truncate max-w-[180px]">{merchantName}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-outline">
                        <span>UPI VPA:</span>
                        <span className="text-white truncate max-w-[180px]">{order.recipient || "—"}</span>
                      </div>
                      <div className="flex justify-between text-outline">
                        <span>User:</span>
                        <span className="text-primary truncate max-w-[180px]">{order.user ? `${order.user.slice(0, 8)}...${order.user.slice(-6)}` : "—"}</span>
                      </div>
                    </div>

                    {/* Card Footer: Basescan Link */}
                    {order.txHash && (
                      <div className="pt-2 flex justify-end">
                        <a
                          href={`https://basescan.org/tx/${order.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-primary hover:text-white inline-flex items-center gap-1 font-bold"
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
              <table className="w-full text-left text-xs font-sans tabular-nums">
                <thead>
                  <tr className="border-b border-white/10 text-[10px]  font-bold text-outline tracking-normal">
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
                            isPay ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                          }`}>
                            {isPay ? "Scan & Pay" : "Cashout"}
                          </span>
                        </td>
                        <td className="py-3.5 font-bold text-success">{order.fiatAmount}</td>
                        <td className="py-3.5 font-bold text-white">{order.usdcAmount}</td>
                        <td className="py-3.5 truncate max-w-[160px]" title={order.recipient}>
                          <span className="font-bold text-white block">{merchantName || "—"}</span>
                          <span className="text-outline text-[10px]">{order.recipient || "—"}</span>
                        </td>
                        <td className="py-3.5 text-outline truncate max-w-[120px]">
                          {order.user ? `${order.user.slice(0, 6)}...${order.user.slice(-4)}` : "—"}
                        </td>
                        <td className="py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            order.status === "SETTLED"
                              ? "bg-success/15 text-success border border-success/25"
                              : order.status === "ACCEPTED"
                              ? "bg-primary/15 text-primary border border-primary/25"
                              : order.status === "CANCELLED"
                              ? "bg-error/15 text-error border border-error/25"
                              : "bg-white/5 text-outline border border-white/10"
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
                              className="text-primary hover:text-white inline-flex items-center gap-1 font-bold"
                            >
                              <span>Basescan</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-outline">None</span>
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
                <Server className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums">
                  Base Mainnet Contract Registry
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-sans tabular-nums">
                
                {/* Diamond */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-outline text-[10px]  font-bold block mb-1">
                      P2P Diamond Core
                    </span>
                    <p className="text-white break-all text-[11px]">{stats?.contracts?.diamond || "0x..."}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => stats?.contracts?.diamond && copyToClipboard(stats.contracts.diamond, "diamond")}
                      className="text-primary hover:text-white inline-flex items-center gap-1"
                    >
                      {copiedKey === "diamond" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "diamond" ? "Copied" : "Copy"}</span>
                    </button>
                    {stats?.contracts?.diamond && (
                      <a
                        href={`https://basescan.org/address/${stats.contracts.diamond}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-outline hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* USDC */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-outline text-[10px]  font-bold block mb-1">
                      Native USDC (Base)
                    </span>
                    <p className="text-white break-all text-[11px]">{stats?.contracts?.usdc || "0x..."}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => stats?.contracts?.usdc && copyToClipboard(stats.contracts.usdc, "usdc")}
                      className="text-primary hover:text-white inline-flex items-center gap-1"
                    >
                      {copiedKey === "usdc" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "usdc" ? "Copied" : "Copy"}</span>
                    </button>
                    {stats?.contracts?.usdc && (
                      <a
                        href={`https://basescan.org/token/${stats.contracts.usdc}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-outline hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Treasury */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-outline text-[10px]  font-bold block mb-1">
                      ZkPay Treasury
                    </span>
                    <p className="text-white break-all text-[11px]">{stats?.contracts?.treasury || "0x..."}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => stats?.contracts?.treasury && copyToClipboard(stats.contracts.treasury, "treasury")}
                      className="text-primary hover:text-white inline-flex items-center gap-1"
                    >
                      {copiedKey === "treasury" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "treasury" ? "Copied" : "Copy"}</span>
                    </button>
                    {stats?.contracts?.treasury && (
                      <a
                        href={`https://basescan.org/address/${stats.contracts.treasury}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-outline hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Earn Vault */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="text-outline text-[10px]  font-bold block mb-1">
                      Steakhouse Morpho Vault
                    </span>
                    <p className="text-white break-all text-[11px]">
                      {stats?.contracts?.vault || stats?.earnVault?.address || "Configured"}
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => (stats?.contracts?.vault || stats?.earnVault?.address) && copyToClipboard((stats.contracts.vault || stats.earnVault?.address)!, "vault")}
                      disabled={!stats?.contracts?.vault && !stats?.earnVault?.address}
                      className="text-primary hover:text-white inline-flex items-center gap-1 disabled:opacity-40"
                    >
                      {copiedKey === "vault" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "vault" ? "Copied" : "Copy"}</span>
                    </button>
                    {(stats?.contracts?.vault || stats?.earnVault?.address) && (
                      <a
                        href={`https://basescan.org/address/${stats.contracts.vault || stats.earnVault?.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-outline hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Cross-Chain Deposit Lookup (NEAR Intents) */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                <Server className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums">
                  Cross-Chain Deposit Inspector
                </h3>
              </div>

              <form onSubmit={handleLookupShift} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter deposit address (e.g. 0x76b4c...)"
                  value={shiftIdInput}
                  onChange={(e) => setShiftIdInput(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-sans tabular-nums text-white placeholder:text-outline/60 focus:border-primary outline-none"
                />
                <button
                  type="submit"
                  disabled={isSearchingShift || !shiftIdInput.trim()}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-sans tabular-nums font-bold transition-colors disabled:opacity-40"
                >
                  {isSearchingShift ? "Querying..." : "Query"}
                </button>
              </form>

              {shiftError && (
                <div className="p-3 rounded-xl bg-error-container/30 border border-error/20 text-error text-xs font-sans tabular-nums">
                  {shiftError}
                </div>
              )}

              {shiftData && (
                <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-xs font-sans tabular-nums space-y-2">
                  <div className="flex justify-between">
                    <span className="text-outline">Status:</span>
                    <span className="font-bold text-success ">{shiftData.status}</span>
                  </div>
                  {shiftData.depositAmount && (
                    <div className="flex justify-between">
                      <span className="text-outline">Deposit Amount:</span>
                      <span className="text-white">{shiftData.depositAmount} {shiftData.depositCoin}</span>
                    </div>
                  )}
                  {shiftData.settleAmount && (
                    <div className="flex justify-between">
                      <span className="text-outline">Settled Amount:</span>
                      <span className="text-success font-bold">{shiftData.settleAmount} USDC</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("tools");
                      setProxyQueryInput(shiftIdInput.trim());
                      handleInspectProxy(shiftIdInput.trim());
                    }}
                    className="w-full mt-2 py-2 px-3 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary font-sans tabular-nums text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Emergency Recovery</span>
                  </button>
                </div>
              )}
            </div>

            {/* PayLinks & Active Sessions Telemetry */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums pb-3 border-b border-white/10">
                PayLinks & Active Pay-In Telemetry
              </h3>

              <div className="grid grid-cols-3 gap-3 text-center font-sans tabular-nums">
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] font-bold text-outline  block mb-1">Total PayLinks</span>
                  <span className="text-2xl font-black text-white">{stats?.paylinksSummary?.total || 0}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] font-bold text-outline  block mb-1">Settled</span>
                  <span className="text-2xl font-black text-success">{stats?.paylinksSummary?.paid || 0}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] font-bold text-outline  block mb-1">Active Sessions</span>
                  <span className="text-2xl font-black text-primary">{stats?.payinSessionsSummary?.activeCount || 0}</span>
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
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white font-sans tabular-nums tracking-tight flex items-center gap-2">
                    <span>Monthly Cashback & Referral Disbursal</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/20 text-success font-sans tabular-nums">
                      Scan & Pay Only
                    </span>
                  </h2>
                  <p className="text-xs text-outline font-sans tabular-nums">
                    Cycle: <span className="text-white font-bold">{rewardsData?.cycle || rewardsCycle || "Current"}</span> • Funded from 1% Scan & Pay Platform Fees
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetCycle}
                  disabled={isLoadingData}
                  title="Clear phantom/test records for this cycle"
                  className="px-3.5 py-2 rounded-xl bg-error/10 hover:bg-error/20 border border-error/20 text-xs font-sans tabular-nums text-error flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset Cycle</span>
                </button>

                <button
                  onClick={loadAdminData}
                  disabled={isLoadingData}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-sans tabular-nums text-primary flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Metrics Overview Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-sans tabular-nums">
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1">
                <span className="text-[10px] font-bold text-outline  tracking-normal block">Scan & Pay Volume</span>
                <span className="text-xl sm:text-2xl font-black text-white">${rewardsData?.totalCycleVolume?.toFixed(2) || "0.00"}</span>
                <span className="text-[10px] text-outline block">Base Network</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1">
                <span className="text-[10px] font-bold text-outline  tracking-normal block">1% Fees Logged</span>
                <span className="text-xl sm:text-2xl font-black text-primary">${rewardsData?.totalPlatformFees?.toFixed(2) || "0.00"}</span>
                <span className="text-[10px] text-outline block">Volume Take-Rate</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/40 border border-primary/20 bg-primary-container/20 space-y-1">
                <span className="text-[10px] font-bold text-primary  tracking-normal block">Pending Disbursal</span>
                <span className="text-xl sm:text-2xl font-black text-primary">${rewardsData?.totalPendingPayout?.toFixed(2) || "0.00"}</span>
                <span className="text-[10px] text-primary/70 block">{rewardsData?.eligibleUserCount || 0} Eligible Wallets</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/40 border border-success/20 bg-success/15/20 space-y-1">
                <span className="text-[10px] font-bold text-success  tracking-normal block">Net Profit Retained</span>
                <span className="text-xl sm:text-2xl font-black text-success">${rewardsData?.netTreasuryProfitRetained?.toFixed(2) || "0.00"}</span>
                <span className="text-[10px] text-success/70 block">≥60% Guaranteed Margin</span>
              </div>
            </div>

            {/* Disbursal Action Banner */}
            <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-primary-container/40 via-black/50 to-primary-container/40 border border-primary/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white font-sans tabular-nums  tracking-normal flex items-center gap-2">
                    <Send className="w-4 h-4 text-primary" />
                    <span>Month-End Disbursal Action</span>
                  </h3>
                  <p className="text-xs text-outline font-sans tabular-nums mt-1">
                    Signing will disburse <strong className="text-white">${rewardsData?.totalPendingPayout?.toFixed(2) || "0.00"} USDC</strong> to{" "}
                    <strong className="text-white">{rewardsData?.eligibleUserCount || 0} approved users</strong> directly from your connected admin wallet.
                  </p>
                </div>

                <button
                  onClick={handleDisburseRewards}
                  disabled={isDisbursing || !rewardsData?.eligibleUserCount || rewardsData.eligibleUserCount === 0}
                  className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary text-white font-bold text-xs font-sans tabular-nums  tracking-normal transition-colors shadow-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                >
                  <Wallet className="w-4 h-4" />
                  <span>
                    {isDisbursing ? "Disbursing..." : `Sign & Disburse ($${rewardsData?.totalPendingPayout?.toFixed(2) || "0.00"})`}
                  </span>
                </button>
              </div>

              {/* Disbursal Feedback Messages */}
              {disburseProgress && (
                <div className="p-3.5 rounded-xl bg-primary-container/60 border border-primary/40 text-xs font-sans tabular-nums text-primary flex items-center gap-2 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{disburseProgress}</span>
                </div>
              )}

              {disburseTxHash && (
                <div className="p-3.5 rounded-xl bg-success/15/60 border border-success/40 text-xs font-sans tabular-nums text-success flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
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
                <div className="p-3.5 rounded-xl bg-error-container/60 border border-error/40 text-xs font-sans tabular-nums text-error">
                  {disburseError}
                </div>
              )}
            </div>

            {/* Eligible Users Table */}
            <div className="obsidian-glass rounded-2xl overflow-hidden border border-white/10">
              <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums">
                    User Reward Ledger ({rewardsData?.users?.length || 0})
                  </h3>
                </div>
                <span className="text-xs text-outline font-sans tabular-nums">
                  Toggle to exclude or add back users before signing
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans tabular-nums">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-outline">
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
                            u.excluded ? "opacity-40 bg-error-container/10" : ""
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-sans tabular-nums">
                                {u.userAddress.slice(0, 6)}…{u.userAddress.slice(-4)}
                              </span>
                              <button
                                onClick={() => copyToClipboard(u.userAddress, `user_${idx}`)}
                                className="text-outline hover:text-white"
                                title="Copy"
                              >
                                {copiedKey === `user_${idx}` ? (
                                  <Check className="w-3 h-3 text-success" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              <a
                                href={`https://basescan.org/address/${u.userAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-outline hover:text-white"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-outline">{u.scanCount} txs</td>
                          <td className="py-3 px-4 text-white">${u.cashbackUsdc.toFixed(2)}</td>
                          <td className="py-3 px-4 text-white">${u.referralUsdc.toFixed(2)}</td>
                          <td className="py-3 px-4 text-success font-bold">
                            ${u.totalDueUsdc.toFixed(2)} USDC
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                u.status === "PAID"
                                  ? "bg-success/20 text-success"
                                  : u.excluded
                                  ? "bg-error/20 text-error"
                                  : "bg-warning/20 text-warning"
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {u.status !== "PAID" ? (
                              <button
                                onClick={() => handleToggleExclusion(u.userAddress, u.excluded)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                  u.excluded
                                    ? "bg-success/20 hover:bg-success/30 text-success border border-success/30"
                                    : "bg-error/20 hover:bg-error/30 text-error border border-error/30"
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
                              <span className="text-[11px] text-success font-bold flex items-center justify-end gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Disbursed
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-outline">
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

        {/* ────────────── TAB 3: PAYMENTS & FUND RECOVERY ────────────── */}
        {activeTab === "payments" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header & Quick Refresh */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums">
                      Payment API Sessions & Fund Recovery
                    </h3>
                    <p className="text-xs text-outline font-sans tabular-nums mt-0.5">
                      On-chain P2P session tracker, tipping router, and manual refund console (Server-Action Secured)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={loadPayments}
                  disabled={isLoadingPaymentData}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-sans tabular-nums text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPaymentData ? "animate-spin" : ""}`} />
                  <span>{isLoadingPaymentData ? "Refreshing..." : "Refresh Sessions"}</span>
                </button>
              </div>

              {/* Action Result Notification Banner */}
              {adminActionResult && (
                <div
                  className={`p-4 rounded-xl border text-xs font-sans tabular-nums flex items-start gap-2.5 ${
                    adminActionResult.success
                      ? "bg-success/15/40 border-success/30 text-success"
                      : "bg-error-container/40 border-error/30 text-error"
                  }`}
                >
                  {adminActionResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 flex-1">
                    <p>{adminActionResult.message}</p>
                    {adminActionResult.txHash && (
                      <a
                        href={`https://basescan.org/tx/${adminActionResult.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-white underline inline-flex items-center gap-1 font-bold"
                      >
                        <span>View on Basescan: {adminActionResult.txHash.slice(0, 16)}…</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdminActionResult(null)}
                    className="text-outline hover:text-white text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Wallet Telemetry Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs font-sans tabular-nums">
                {/* Card 1: Treasury */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-outline">
                    <span className="text-[10px]  font-bold">Treasury Balance</span>
                    <DollarSign className="w-3.5 h-3.5 text-success" />
                  </div>
                  <div className="text-lg font-bold text-white font-sans tabular-nums">
                    ${paymentData?.wallets?.treasuryBalanceUsdc || "0.00"} <span className="text-xs text-outline">USDC</span>
                  </div>
                  <p className="text-[10px] text-outline truncate">1% fees + tips + penalties</p>
                </div>

                {/* Card 2: Refund Wallet */}
                <div className={`p-4 rounded-xl border space-y-1 transition-colors ${
                  (paymentData?.stats?.storedRefundsCount || 0) > 0
                    ? "bg-warning/15/20 border-warning/30 text-warning"
                    : "bg-white/[0.03] border-white/10"
                }`}>
                  <div className="flex items-center justify-between text-outline">
                    <span className="text-[10px]  font-bold">ZkPay Refund Wallet</span>
                    <ShieldAlert className="w-3.5 h-3.5 text-warning" />
                  </div>
                  <div className="text-lg font-bold text-white font-sans tabular-nums">
                    ${paymentData?.wallets?.refundWalletBalanceUsdc || "0.00"} <span className="text-xs text-outline">USDC</span>
                  </div>
                  <p className="text-[10px] text-warning font-bold">
                    {paymentData?.stats?.storedRefundsCount || 0} Unclaimed Refunds
                  </p>
                </div>

                {/* Card 3: Relayer Gas */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-outline">
                    <span className="text-[10px]  font-bold">Relayer Gas Tank</span>
                    <Zap className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="text-lg font-bold text-white font-sans tabular-nums">
                    {paymentData?.relayer?.balanceEth || "0.0000"} <span className="text-xs text-outline">ETH</span>
                  </div>
                  <p className="text-[10px] text-success">
                    {paymentData?.relayer?.healthy ? "✓ Healthy Gas Buffer" : "⚠ Low Gas Level"}
                  </p>
                </div>

                {/* Card 4: Session Metrics */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-outline">
                    <span className="text-[10px]  font-bold">Session Overview</span>
                    <Activity className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="text-lg font-bold text-white font-sans tabular-nums">
                    {paymentData?.stats?.totalSessions || 0} <span className="text-xs text-outline">Total</span>
                  </div>
                  <p className="text-[10px] text-outline">
                    {paymentData?.stats?.settledSessions || 0} Settled • {paymentData?.stats?.activeSessions || 0} Active
                  </p>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-sans tabular-nums scrollbar-none">
                {["ALL", "AWAITING_PAYMENT", "ORDER_PLACED", "AWAITING_FIAT_PAYMENT", "SETTLED", "STORED_IN_REFUND_WALLET", "REFUNDED_TO_USER", "FAILED_AND_REFUNDED", "CANCELLED_AND_REFUNDED", "REJECTED_UNDER_MINIMUM"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setPaymentStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold  transition-colors whitespace-nowrap ${
                      paymentStatusFilter === st
                        ? "bg-white/15 border-white/30 text-white"
                        : "bg-white/[0.02] border-white/5 text-outline hover:text-white"
                    }`}
                  >
                    {st.replace(/_/g, " ")}
                  </button>
                ))}
              </div>

              {/* Sessions Table */}
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-xs font-sans tabular-nums">
                  <thead className="bg-white/5 border-b border-white/10 text-outline  text-[10px]">
                    <tr>
                      <th className="py-3 px-3.5">Session / Date</th>
                      <th className="py-3 px-3.5">Recipient UPI</th>
                      <th className="py-3 px-3.5">USDC Exp / Recv</th>
                      <th className="py-3 px-3.5">Tip</th>
                      <th className="py-3 px-3.5">Fiat Delivered</th>
                      <th className="py-3 px-3.5">Status</th>
                      <th className="py-3 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {paymentData?.sessions && paymentData.sessions.length > 0 ? (
                      paymentData.sessions
                        .filter((s) => paymentStatusFilter === "ALL" || s.status === paymentStatusFilter)
                        .map((s) => (
                          <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3 px-3.5">
                              <div className="font-bold text-white truncate max-w-[130px]">{s.id}</div>
                              <div className="text-[10px] text-outline">
                                {new Date(s.createdAt).toLocaleDateString()} {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </td>
                            <td className="py-3 px-3.5">
                              <span className="text-white font-bold">{s.recipientUpi}</span>
                              {s.p2pOrderId && (
                                <div className="text-[10px] text-primary">Order #{s.p2pOrderId}</div>
                              )}
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="text-white font-bold">${s.receivedUsdc || "0.00"} <span className="text-outline font-normal text-[10px]">/ ${s.expectedUsdc}</span></div>
                              {s.gasFeeUsdc && (
                                <div className="text-[9px] text-warning">
                                  Gas Paid: ${s.gasFeeUsdc} USDC
                                </div>
                              )}
                              {s.refundAddress && (
                                <div className="text-[9px] text-outline truncate max-w-[110px]" title={s.refundAddress}>
                                  Refund: {s.refundAddress.slice(0, 6)}…
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3.5">
                              {s.tipUsdc ? (
                                <span className="text-success font-bold">+${s.tipUsdc}</span>
                              ) : (
                                <span className="text-outline">-</span>
                              )}
                            </td>
                            <td className="py-3 px-3.5">
                              <span className="text-success font-bold">
                                ₹ {s.amountINR ? s.amountINR.toLocaleString("en-IN") : "0"}
                              </span>
                            </td>
                            <td className="py-3 px-3.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold  inline-block ${
                                  s.status === "SETTLED"
                                    ? "bg-success/20 text-success border border-success/30"
                                    : s.status === "ORDER_PLACED" || s.status === "DELIVERING_HANDSHAKE"
                                    ? "bg-primary/20 text-primary border border-primary/30"
                                    : s.status === "STORED_IN_REFUND_WALLET"
                                    ? "bg-warning/20 text-warning border border-warning/30 animate-pulse"
                                    : s.status === "REFUNDED_TO_USER"
                                    ? "bg-primary/20 text-primary border border-primary/30"
                                    : s.status === "FAILED_AND_REFUNDED" || s.status === "CANCELLED_AND_REFUNDED"
                                    ? "bg-error/20 text-error border border-error/30"
                                    : s.status === "REJECTED_UNDER_MINIMUM"
                                    ? "bg-error/20 text-error border border-error/30"
                                    : "bg-white/10 text-white border border-white/20"
                                }`}
                              >
                                {s.status.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-right space-x-1.5 whitespace-nowrap">
                              {s.status === "STORED_IN_REFUND_WALLET" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setManualRefundSession(s);
                                    setManualRefundRecipient(s.refundAddress || "");
                                    setManualRefundAmount(s.receivedUsdc || s.expectedUsdc);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-warning/20 hover:bg-warning/30 border border-warning/30 text-warning text-[10px] font-bold  transition-colors"
                                >
                                  Refund User
                                </button>
                              )}
                              {s.status === "ORDER_PLACED" && (
                                <button
                                  type="button"
                                  disabled={isExecutingAdminAction}
                                  onClick={async () => {
                                    setIsExecutingAdminAction(true);
                                    const token = await getAccessToken();
                                    const res = await retryHandshakeAction(s.id, token);
                                    setAdminActionResult(res);
                                    setIsExecutingAdminAction(false);
                                    loadPayments();
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-[10px] font-bold  transition-colors"
                                >
                                  Retry Handshake
                                </button>
                              )}
                              {s.status !== "SETTLED" && s.status !== "REFUNDED_TO_USER" && s.p2pOrderId && (
                                <button
                                  type="button"
                                  disabled={isExecutingAdminAction}
                                  onClick={async () => {
                                    if (!confirm(`Cancel order #${s.p2pOrderId} on Diamond and refund?`)) return;
                                    setIsExecutingAdminAction(true);
                                    const token = await getAccessToken();
                                    const res = await forceCancelOrderAction(s.id, token);
                                    setAdminActionResult(res);
                                    setIsExecutingAdminAction(false);
                                    loadPayments();
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-error/20 hover:bg-error/30 border border-error/30 text-error text-[10px] font-bold  transition-colors"
                                >
                                  Cancel & Refund
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-outline">
                          No payment sessions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Manual Refund Modal */}
            {manualRefundSession && (
              <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                <div className="w-full max-w-lg bg-surface border border-white/15 rounded-3xl p-6 space-y-5 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-warning/20 border border-warning/30 flex items-center justify-center text-warning">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <h4 className="text-sm font-bold text-white font-sans tabular-nums  tracking-normal">
                        Dispatch Manual User Refund
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setManualRefundSession(null)}
                      className="text-outline hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-3 text-xs font-sans tabular-nums">
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-1">
                      <div className="text-outline text-[10px]">Session Details</div>
                      <div className="text-white font-bold">{manualRefundSession.id} • {manualRefundSession.recipientUpi}</div>
                      <div className="text-outline text-[10px]">Original INR: ₹{manualRefundSession.amountINR}</div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px]  font-bold text-outline">
                        Destination 0x EVM Address (Recipient)
                      </label>
                      <input
                        type="text"
                        placeholder="0x..."
                        value={manualRefundRecipient}
                        onChange={(e) => setManualRefundRecipient(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white font-sans tabular-nums text-xs focus:outline-none focus:border-warning"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px]  font-bold text-outline">
                        Refund Amount (USDC)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 5.50"
                        value={manualRefundAmount}
                        onChange={(e) => setManualRefundAmount(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white font-sans tabular-nums text-xs focus:outline-none focus:border-warning"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setManualRefundSession(null)}
                      className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-outline font-sans tabular-nums text-xs font-bold  transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isExecutingAdminAction || !manualRefundRecipient.trim() || !manualRefundAmount.trim()}
                      onClick={async () => {
                        setIsExecutingAdminAction(true);
                        const token = await getAccessToken();
                        const res = await executeManualRefundAction({
                          sessionId: manualRefundSession.id,
                          destinationAddress: manualRefundRecipient.trim(),
                          amountUsdc: manualRefundAmount.trim(),
                          accessToken: token,
                        });
                        setAdminActionResult(res);
                        setIsExecutingAdminAction(false);
                        setManualRefundSession(null);
                        loadPayments();
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-warning hover:bg-warning text-black font-sans tabular-nums text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-warning/20 whitespace-nowrap"
                    >
                      {isExecutingAdminAction && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isExecutingAdminAction ? "Sending…" : "Confirm Refund"}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ────────────── TAB 4: TOOLS & SWEEPER ────────────── */}
        {activeTab === "tools" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Tool 1: Gasless Pay-In Sweeper Control */}
            <div className="obsidian-glass rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white  tracking-normal font-sans tabular-nums">
                      Pay-In Deposit Sweeper
                    </h3>
                    <p className="text-xs text-outline font-sans tabular-nums mt-0.5">
                      Pure EIP-3009 Gasless Relay: Sweeps USDC directly to Treasury (0 ETH sent to deposit address)
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSweepAll}
                  disabled={isSweeping || !stats?.sweeper?.configured}
                  className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary text-white font-sans tabular-nums text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSweeping ? "animate-spin" : ""}`} />
                  <span>{isSweeping ? "Sweeping Deposits..." : "Sweep All Settled Deposits"}</span>
                </button>
              </div>

              {/* Sweeper Wallet Status */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs font-sans tabular-nums">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-outline text-[10px]  font-bold block">Sweeper Address</span>
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
                  <span className="text-outline text-[10px]  font-bold block">Gas Tank Balance</span>
                  <span className="text-base font-bold text-white">
                    {stats?.sweeper?.balanceEth || "0.0000"} ETH
                  </span>
                  <span className="text-[10px] text-outline block">Base Mainnet</span>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-outline text-[10px]  font-bold block">Operational Status</span>
                  <span className={`text-base font-bold ${stats?.sweeper?.healthy ? "text-success" : "text-warning"}`}>
                    {stats?.sweeper?.configured ? (stats?.sweeper?.healthy ? "Ready & Funded" : "Low Balance") : "Requires Key"}
                  </span>
                  <span className="text-[10px] text-outline block">
                    SWEEPER_PRIVATE_KEY in env
                  </span>
                </div>
              </div>

              {/* Sweep Result Feedback */}
              {sweepResult && (
                <div className={`p-4 rounded-xl text-xs font-sans tabular-nums ${
                  sweepResult.success
                    ? "bg-success/15/30 border border-success/30 text-success"
                    : "bg-error-container/30 border border-error/30 text-error"
                }`}>
                  <p className="font-bold mb-1">
                    {sweepResult.success
                      ? `Successfully swept ${sweepResult.sweptCount || (sweepResult.result?.success ? 1 : 0)} deposit(s)!`
                      : `Sweep Failed: ${sweepResult.error || "Unknown error"}`}
                  </p>
                  {sweepResult.result?.txHash && (
                    <a
                      href={`https://basescan.org/tx/${sweepResult.result.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-white underline inline-flex items-center gap-1 mt-1"
                    >
                      <span>View Transaction on Basescan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
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

              {shiftData && (
                <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-xs font-sans tabular-nums space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <span className="text-outline">Status:</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold  bg-success/20 text-success">
                      {shiftData.status || shiftData.rawStatus || "UNKNOWN"}
                    </span>
                  </div>
                  {shiftData.depositedAmount && (
                    <div className="flex items-center justify-between">
                      <span className="text-outline">Deposited:</span>
                      <span className="text-white font-bold">{shiftData.depositedAmount}</span>
                    </div>
                  )}
                  {shiftData.settledAmount && (
                    <div className="flex items-center justify-between">
                      <span className="text-outline">Settled:</span>
                      <span className="text-success font-bold">{shiftData.settledAmount}</span>
                    </div>
                  )}
                  {shiftData.destinationTxHash && (
                    <div className="flex items-center justify-between">
                      <span className="text-outline">Base TX:</span>
                      <a
                        href={
                          typeof shiftData.destinationExplorerUrl === "string" &&
                          shiftData.destinationExplorerUrl.startsWith("https://")
                            ? shiftData.destinationExplorerUrl
                            : `https://basescan.org/tx/${encodeURIComponent(shiftData.destinationTxHash)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        <span className="truncate max-w-[180px]">{shiftData.destinationTxHash}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}
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
                  className="px-4 py-2.5 rounded-xl bg-success hover:bg-success text-white font-sans tabular-nums text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 shrink-0 shadow-lg shadow-success/15"
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
                  Scans recent proxy orders &bull; 0 wei dust left behind
                </span>
              </div>

              {/* Result Feedback Banner */}
              {recycleDustResult && (
                <div
                  className={`p-4 rounded-xl text-xs font-sans tabular-nums space-y-3 ${
                    recycleDustResult.success
                      ? "bg-success/15/30 border border-success/30 text-success"
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
