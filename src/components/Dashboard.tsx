"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { base } from "viem/chains";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { floorTo2Decimals } from "@/lib/format";
import { ArrowUpRight, Copy, Check, ChevronRight } from "lucide-react";
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
      {/* Main column: swap + history (mobile order: swap → history → side cards) */}
      <div className="lg:col-span-7 space-y-4 lg:space-y-6 max-w-xl w-full mx-auto lg:max-w-none">
        <SwapWidget onSwapCreated={() => setHistoryRefreshKey((k) => k + 1)} />

        <section aria-labelledby="recent-swaps" className="space-y-3">
          <h2 id="recent-swaps" className="px-1 text-sm font-semibold text-on-surface">
            Recent swaps
          </h2>
          <PaymentHistory key={historyRefreshKey} />
        </section>
      </div>

      {/* Side column */}
      <div className="lg:col-span-5 space-y-4 max-w-xl w-full mx-auto lg:max-w-none">
        {/* Wallet */}
        <div className="rounded-2xl bg-surface-container border border-outline-variant p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-on-surface-variant">Base USDC balance</span>
            {address && (
              <button
                type="button"
                onClick={handleCopyAddress}
                className="h-8 -my-1 px-2 rounded-lg inline-flex items-center gap-1.5 font-mono text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
                aria-label="Copy wallet address"
              >
                <span>{shortAddr}</span>
                {copiedAddr ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          <div className="flex items-end justify-between gap-3 mt-2">
            <span className="font-mono text-2xl font-semibold text-on-surface tabular-nums">
              ${formattedBal.toFixed(2)}
            </span>
            <Link
              href="/wallet"
              className="h-10 px-3 rounded-xl inline-flex items-center gap-1 text-sm font-medium text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span>Wallet</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Developer API — quiet, single CTA */}
        <Link
          href="/partner"
          className="group block rounded-2xl bg-surface-container border border-outline-variant p-4 sm:p-5 hover:border-outline transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-on-surface">Build with the Swap API</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Add cross-chain swaps to your bot or app and keep 50% of every fee, paid in USD.
              </p>
            </div>
            <ArrowUpRight className="w-5 h-5 shrink-0 text-on-surface-variant group-hover:text-secondary transition-colors" />
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-outline-variant text-xs text-on-surface-variant">
            <span><span className="font-mono text-on-surface">9</span> chains</span>
            <span><span className="font-mono text-on-surface">50%</span> rev share</span>
            <span><span className="font-mono text-on-surface">$1</span> min payout</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
