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
  Key,
  Code2,
  ArrowUpRight,
  Copy,
  Check,
  Coins,
  Terminal,
  Sparkles,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import SwapWidget from "./SwapWidget";
import PaymentHistory from "./PaymentHistory";

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

  const handleCopyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT / MAIN COLUMN (7 COLS): INSTANT CROSS-CHAIN SWAP WIDGET */}
      <div className="lg:col-span-7 space-y-6">
        <SwapWidget onSwapCreated={() => setHistoryRefreshKey((k) => k + 1)} />

        {/* Recent Swaps History */}
        <div className="rounded-3xl bg-surface-container border border-outline-variant/20 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-on-surface">Recent Cross-Chain Swaps</h2>
              <p className="text-xs text-on-surface-variant">Live execution & settlement tracker</p>
            </div>
          </div>
          <PaymentHistory key={historyRefreshKey} />
        </div>
      </div>

      {/* RIGHT COLUMN (5 COLS): DEVELOPER API HUB & WALLET TELEMETRY */}
      <div className="lg:col-span-5 space-y-5">
        {/* Developer Swap API & 50/50 Revenue Card */}
        <div className="rounded-3xl bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-low border border-secondary/30 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/15 border border-secondary/30 text-[11px] font-bold text-secondary">
              <Terminal className="w-3.5 h-3.5" />
              Developer B2B Swap Engine
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">50/50 Rev Share</span>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-on-surface">
              Power Swaps in Your Bot or App
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Integrate instant cross-chain swaps across 9 blockchains into your Telegram bot, Discord bot, or Web3 frontend with a single REST API. Earn 50% of every swap fee in USD.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="p-2.5 rounded-2xl bg-surface/60 border border-outline-variant/15">
              <span className="text-[10px] text-on-surface-variant block">Chains</span>
              <span className="font-mono text-sm font-extrabold text-on-surface">9 Networks</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-surface/60 border border-outline-variant/15">
              <span className="text-[10px] text-on-surface-variant block">Partner Split</span>
              <span className="font-mono text-sm font-extrabold text-secondary">50% USD</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-surface/60 border border-outline-variant/15">
              <span className="text-[10px] text-on-surface-variant block">Min Payout</span>
              <span className="font-mono text-sm font-extrabold text-on-surface">$1.00</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <Link
              href="/partner"
              className="py-2.5 px-4 rounded-xl bg-secondary text-on-secondary font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Partner Portal & Keys</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>

            <Link
              href="/docs"
              className="py-2.5 px-4 rounded-xl bg-surface-container-high hover:bg-surface border border-outline-variant/25 text-on-surface font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Code2 className="w-3.5 h-3.5 text-secondary" />
              <span>API Docs & Snippets</span>
            </Link>
          </div>
        </div>

        {/* Connected Base Wallet Card */}
        <div className="rounded-3xl bg-surface-container border border-outline-variant/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-secondary" />
              <span className="text-xs font-bold text-on-surface">Connected Base Wallet</span>
            </div>
            {address && (
              <button
                type="button"
                onClick={handleCopyAddress}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-low border border-outline-variant/20 font-mono text-[11px] text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <span>{shortAddr}</span>
                {copiedAddr ? <Check className="w-3 h-3 text-secondary" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div>
              <span className="text-[11px] text-on-surface-variant block">Base USDC Balance</span>
              <span className="font-mono text-2xl font-extrabold text-on-surface tabular-nums">
                ${formattedBal.toFixed(2)} <span className="text-xs font-semibold text-on-surface-variant">USDC</span>
              </span>
            </div>
            <Link
              href="/wallet"
              className="px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/20 text-xs font-semibold text-on-surface inline-flex items-center gap-1 transition-colors"
            >
              <span>Manage Wallet</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
