"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { base } from "viem/chains";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { floorTo2Decimals } from "@/lib/format";
import {
  ArrowUpRight,
  Copy,
  Check,
  ChevronRight,
  ShieldCheck,
  Wallet,
  ExternalLink,
  Zap,
  Globe2,
  Send,
  Plus,
} from "lucide-react";
import SwapWidget from "./SwapWidget";
import PaymentHistory from "./PaymentHistory";
import { SwapHeroStage } from "@/components/ui/SwapHeroStage";

const SOLVER_CHAINS = [
  { id: "sol", symbol: "SOL", color: "#14F195", speed: "0.4s" },
  { id: "base", symbol: "BASE", color: "#2970FF", speed: "1.2s" },
  { id: "arb", symbol: "ARB", color: "#28A0F0", speed: "0.8s" },
  { id: "pol", symbol: "POL", color: "#8247E5", speed: "2.0s" },
  { id: "bsc", symbol: "BNB", color: "#F3BA2F", speed: "3.0s" },
  { id: "tron", symbol: "TRX", color: "#FF0013", speed: "2.5s" },
  { id: "eth", symbol: "ETH", color: "#627EEA", speed: "12s" },
  { id: "ltc", symbol: "LTC", color: "#345D9D", speed: "2.5m" },
  { id: "btc", symbol: "BTC", color: "#F7931A", speed: "10m" },
];

export default function Dashboard() {
  const { address } = useActiveAccount();
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [apiBalance, setApiBalance] = useState<number | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
      {/* ─── Main Column: 3D Swap Stage + Recent Swaps (Mobile First) ─── */}
      <div className="lg:col-span-7 space-y-6 max-w-xl w-full mx-auto lg:max-w-none">
        {/* Floating 3D Machined Swap Stage */}
        <SwapHeroStage />

        {/* Recent Swaps Ledger */}
        <section aria-labelledby="recent-swaps-title" className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 id="recent-swaps-title" className="text-sm font-semibold text-on-surface">
              Recent Activity
            </h2>
            <span className="text-[11px] text-on-surface-variant">Live block confirmation</span>
          </div>
          <PaymentHistory key={historyRefreshKey} />
        </section>
      </div>

      {/* ─── Side Column: Hardware Vault & Network Telemetry ─── */}
      <div className="lg:col-span-5 space-y-6 max-w-xl w-full mx-auto lg:max-w-none">
        {/* 1. Hardware Liquidity Vault Card */}
        <div className="rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
          <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-5 sm:p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary motion-safe:animate-pulse" />
                <span className="text-xs font-semibold text-on-surface">Base USDC Vault</span>
              </div>
              {address && (
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="h-7 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Copy wallet address"
                >
                  <span className="font-mono text-[11px]">{shortAddr}</span>
                  {copiedAddr ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Balance Display */}
            <div className="space-y-1">
              <span className="text-[11px] text-on-surface-variant block">Available Balance</span>
              <div className="font-mono text-3xl sm:text-4xl font-bold text-on-surface tracking-tight tabular-nums">
                ${formattedBal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-sm font-normal text-on-surface-variant ml-2">USDC</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Link
                href={walletUrl}
                className="h-10 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-semibold text-on-surface inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                <Plus className="w-3.5 h-3.5 text-secondary" />
                <span>Deposit</span>
              </Link>

              <Link
                href={walletUrl}
                className="h-10 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-semibold text-on-surface inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                <Send className="w-3.5 h-3.5 text-primary" />
                <span>Send</span>
              </Link>
            </div>
          </div>
        </div>

        {/* 2. 9-Chain Solver Connectivity Grid */}
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
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="font-semibold text-on-surface text-[11px]">{c.symbol}</span>
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

        {/* 3. Partner Monetization Card */}
        <Link
          href="/partner"
          className="group block rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated hover:border-secondary/40 transition-colors focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
        >
          <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-5 sm:p-6 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-secondary font-semibold block">Partner Monetization</span>
                <h3 className="text-sm font-bold text-on-surface">Monetize swaps in your bot or app</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Earn 50% of every custom fee directly in USD upon solver settlement.
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-surface-container group-hover:bg-secondary group-hover:text-on-secondary text-on-surface-variant flex items-center justify-center transition-colors shrink-0">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-center gap-4 pt-3 border-t border-outline-variant text-[11px] text-on-surface-variant">
              <span><span className="font-mono text-on-surface font-semibold">50%</span> Net split</span>
              <span><span className="font-mono text-on-surface font-semibold">$1.00</span> Min payout</span>
              <span><span className="text-on-surface font-semibold">Instant</span> USDC</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
