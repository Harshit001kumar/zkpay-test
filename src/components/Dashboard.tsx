"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { base } from "viem/chains";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { floorTo2Decimals } from "@/lib/format";
import { getTransactions, TransactionRecord, timeAgo } from "@/lib/history";
import { POPULAR_PAIRS, type PopularPair, chainVisual } from "@/lib/chainVisuals";
import { CryptoIcon } from "@/components/ui/CryptoIcon";
import { SwapHeroStage } from "@/components/ui/SwapHeroStage";
import PaymentHistory from "./PaymentHistory";
import {
  ArrowRight,
  ArrowUpRight,
  Copy,
  Check,
  Zap,
  Globe2,
  Send,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Timer,
  ChevronRight,
  Activity,
} from "lucide-react";

interface DashboardProps {
  onSelectTab?: (tab: "swap" | "activity" | "partner" | "account") => void;
}

const SOLVER_CHAINS = [
  { id: "sol", symbol: "SOL", color: "#14F195", speed: "0.4s", type: "SVM" },
  { id: "base", symbol: "BASE", color: "#2970FF", speed: "1.2s", type: "EVM" },
  { id: "arb", symbol: "ARB", color: "#28A0F0", speed: "0.8s", type: "EVM" },
  { id: "pol", symbol: "POL", color: "#8247E5", speed: "2.0s", type: "EVM" },
  { id: "bsc", symbol: "BNB", color: "#F3BA2F", speed: "3.0s", type: "EVM" },
  { id: "tron", symbol: "TRX", color: "#FF0013", speed: "2.5s", type: "TRC20" },
  { id: "eth", symbol: "ETH", color: "#627EEA", speed: "12s", type: "EVM" },
  { id: "ltc", symbol: "LTC", color: "#345D9D", speed: "2.5m", type: "UTXO" },
  { id: "btc", symbol: "BTC", color: "#F7931A", speed: "10m", type: "UTXO" },
];

export default function Dashboard({ onSelectTab }: DashboardProps) {
  const { address } = useActiveAccount();
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedDep, setCopiedDep] = useState(false);
  const [apiBalance, setApiBalance] = useState<number | null>(null);
  const [activePair, setActivePair] = useState<PopularPair | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  // Active in-flight order tracker
  const [activeTx, setActiveTx] = useState<TransactionRecord | null>(null);

  useEffect(() => {
    const checkActive = () => {
      const txs = getTransactions();
      const inFlight = txs.find((t) => t.status !== "settled" && t.status !== "failed");
      setActiveTx(inFlight || null);
    };
    checkActive();
    const interval = setInterval(checkActive, 3500);
    return () => clearInterval(interval);
  }, []);

  const { data: rawBal } = useReadContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: base.id,
    query: {
      enabled: !!address,
      refetchInterval: 6000,
    },
  });

  useEffect(() => {
    if (!address) return;
    let active = true;
    const fetchBal = async () => {
      try {
        const res = await fetch(`/api/wallet/balance?address=${encodeURIComponent(address)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.success && typeof data.balanceUsdc === "number") {
          setApiBalance(data.balanceUsdc);
        }
      } catch {}
    };
    fetchBal();
    const timer = setInterval(fetchBal, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [address]);

  const wagmiBal = rawBal !== undefined ? floorTo2Decimals(rawBal as bigint) : 0;
  const formattedBal = Math.max(wagmiBal, apiBalance ?? 0);
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
  const walletUrl = address ? `/wallet/${address}` : "/wallet";

  const handleCopyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const handleCopyDeposit = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedDep(true);
    setTimeout(() => setCopiedDep(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full pb-12 animate-fade-in-up">
      {/* ─── Top Telemetry Banner ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-5 sm:py-3 rounded-2xl bg-surface-container-low/80 backdrop-blur-xl border border-outline-variant text-xs">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-secondary motion-safe:animate-pulse" />
          <span className="font-semibold text-on-surface">DeFi Swap Terminal</span>
          <span className="text-on-surface-variant hidden md:inline">· 9 Curated Blockchains</span>
        </div>

        <div className="flex items-center gap-3 text-on-surface-variant overflow-x-auto no-scrollbar">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span>Solana ~400ms</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span>Base ~1.2s</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5 text-secondary" />
            <span className="text-on-surface font-medium">Non-Custodial</span>
          </span>
        </div>
      </div>

      {/* ─── 3D Quick-Route Rails (Interactive Prefills) ─── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 text-xs text-on-surface-variant">
          <span className="font-semibold text-on-surface flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-secondary" />
            <span>Quick Swap Routes</span>
          </span>
          <span>Click to load pair</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
          {POPULAR_PAIRS.map((p) => {
            const [fromSym, fromChain] = p.from.split(":");
            const [toSym, toChain] = p.to.split(":");
            const isSelected = activePair?.label === p.label;

            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setActivePair({ ...p })}
                className={`h-11 pl-2 pr-3.5 rounded-full border flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all duration-200 active:scale-95 ${
                  isSelected
                    ? "bg-secondary/15 border-secondary text-on-surface shadow-sm"
                    : "bg-surface-container-low/90 border-outline-variant hover:border-secondary/40 text-on-surface hover:bg-surface-container"
                }`}
              >
                <div className="flex items-center -space-x-1.5">
                  <CryptoIcon symbol={fromSym} chain={fromChain} size="sm" />
                  <CryptoIcon symbol={toSym} chain={toChain} size="sm" />
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold">
                  <span>{fromSym}</span>
                  <ArrowRight className="w-3 h-3 text-secondary" />
                  <span>{toSym}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Main 2-Column Responsive Workspace ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: 3D Perspective Swap Stage */}
        <div className="lg:col-span-7 space-y-6 max-w-xl w-full mx-auto lg:max-w-none">
          <SwapHeroStage
            pair={activePair}
            onSwapCreated={() => setHistoryKey((k) => k + 1)}
          />

          {/* Mini Recent Swaps Ledger */}
          <section aria-labelledby="recent-swaps-title" className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 id="recent-swaps-title" className="text-sm font-semibold text-on-surface flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <span>Recent Activity</span>
              </h2>
              {onSelectTab && (
                <button
                  type="button"
                  onClick={() => onSelectTab("activity")}
                  className="text-xs font-semibold text-secondary hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>View All</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <PaymentHistory key={historyKey} />
          </section>
        </div>

        {/* Right Column: 3D Companion Monoliths */}
        <div className="lg:col-span-5 space-y-6 max-w-xl w-full mx-auto lg:max-w-none">
          {/* 1. Active In-Flight Order Radar HUD (Lights up when a swap is processing) */}
          {activeTx && (
            <div className="rounded-[2rem] p-1.5 bg-gradient-to-b from-secondary/30 via-secondary/10 to-transparent border border-secondary/40 shadow-elevated animate-fade-in-up">
              <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary motion-safe:animate-ping" />
                    <span className="text-xs font-bold text-secondary uppercase tracking-wider">
                      Active Swap In Progress
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant font-mono">
                    {timeAgo(activeTx.timestamp)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center -space-x-1.5">
                      <CryptoIcon symbol={activeTx.fromAsset || "SOL"} chain={activeTx.fromChain} size="sm" />
                      <CryptoIcon symbol={activeTx.toAsset || "USDC"} chain={activeTx.toChain} size="sm" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-on-surface block">
                        {activeTx.fromAsset} → {activeTx.toAsset}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">
                        {activeTx.amountIn} {activeTx.fromAsset}
                      </span>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full bg-secondary/15 text-secondary border border-secondary/30 text-[10px] font-bold">
                    Settling
                  </span>
                </div>

                {activeTx.depositAddress && (
                  <div className="space-y-1 text-xs">
                    <span className="text-[10px] text-on-surface-variant block">Deposit Address</span>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 rounded-lg bg-surface font-mono text-[11px] text-on-surface truncate">
                        {activeTx.depositAddress}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyDeposit(activeTx.depositAddress!)}
                        className="h-8 px-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs text-on-surface inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedDep ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. Connected Wallet & Liquidity Monolith */}
          <div className="rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
            <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-5 sm:p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <CryptoIcon symbol="BASE" size="sm" />
                  <span className="text-xs font-semibold text-on-surface">Base Account</span>
                </div>
                {address && (
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="h-7 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                    aria-label="Copy wallet address"
                  >
                    <span className="font-mono text-[11px]">{shortAddr}</span>
                    {copiedAddr ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              {/* Balance Display */}
              <div className="space-y-1">
                <span className="text-[11px] text-on-surface-variant block">Available Base Balance</span>
                <div className="font-mono text-3xl sm:text-4xl font-bold text-on-surface tracking-tight tabular-nums flex items-baseline gap-2">
                  <span>${formattedBal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-sm font-normal text-on-surface-variant">USDC</span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link
                  href={walletUrl}
                  className="h-10 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-semibold text-on-surface inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-secondary" />
                  <span>Deposit</span>
                </Link>

                <Link
                  href={walletUrl}
                  className="h-10 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-semibold text-on-surface inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5 text-primary" />
                  <span>Send</span>
                </Link>
              </div>
            </div>
          </div>

          {/* 3. 9-Chain Solver Connectivity Radar */}
          <div className="rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
            <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <Globe2 className="w-4 h-4 text-secondary" />
                  <span className="text-xs font-semibold text-on-surface">Solver Network</span>
                </div>
                <span className="text-[11px] text-secondary font-medium">9 / 9 Active</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {SOLVER_CHAINS.map((c) => (
                  <div
                    key={c.id}
                    className="p-2.5 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CryptoIcon symbol={c.symbol} chain={c.id} size="xs" />
                      <span className="font-semibold text-on-surface text-[11px] truncate">{c.symbol}</span>
                    </div>
                    <span className="font-mono text-[10px] text-on-surface-variant">{c.speed}</span>
                  </div>
                ))}
              </div>

              <div className="pt-1 flex items-center justify-between text-[11px] text-on-surface-variant">
                <span>Zero destination gas required</span>
                <span className="text-primary font-medium">FLEX_INPUT enabled</span>
              </div>
            </div>
          </div>

          {/* 4. Partner 50/50 Revenue Teaser */}
          {onSelectTab && (
            <button
              type="button"
              onClick={() => onSelectTab("partner")}
              className="w-full text-left group block rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated hover:border-secondary/40 transition-colors cursor-pointer"
            >
              <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-5 sm:p-6 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[11px] text-secondary font-semibold block">Partner Monetization</span>
                    <h3 className="text-sm font-bold text-on-surface">Developer API &amp; 50/50 Revenue</h3>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      Manage API keys and withdraw accumulated USD fees.
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-surface-container group-hover:bg-secondary group-hover:text-on-secondary text-on-surface-variant flex items-center justify-center transition-colors shrink-0">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
