"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useReadContract } from "wagmi";
import { base } from "viem/chains";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { floorTo2Decimals } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { getTransactions } from "@/lib/history";
import {
  QrCode,
  ArrowUpRight,
  ArrowDownLeft,
  Link2,
  Shield,
  Copy,
  Check,
  Download,
  Globe,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Tilt3DMonolith, DepthLayer } from "@/components/ui/Tilt3DMonolith";
import PaymentHistory from "./PaymentHistory";
import ScanAndPayFlow from "./ScanAndPayFlow";
import CashoutFlow from "./CashoutFlow";
import DepositFlow from "./DepositFlow";

type ActiveModal = null | "scan" | "cashout" | "deposit";
type HistoryFilter = "all" | "payment" | "cashout";

export default function Dashboard() {
  const router = useRouter();
  const { address, isSmartWallet } = useActiveAccount();
  const { currencyMeta, setIsSelectorOpen } = useCurrency();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [copiedAddr, setCopiedAddr] = useState(false);

  const { data: rawBal } = useReadContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: base.id,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  const formattedBal = rawBal !== undefined ? floorTo2Decimals(rawBal as bigint) : 0;
  const wholePart = Math.floor(formattedBal).toLocaleString();
  const decimalPart = (formattedBal % 1).toFixed(2).substring(1);
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Syncing";

  const handleCopyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const handleExportCsv = () => {
    const txs = getTransactions();
    if (txs.length === 0) return;

    const headers = ["Hash", "Type", "Title", "AmountFiat", "AmountUSDC", "FeeUSDC", "Recipient", "OrderId", "Status", "Timestamp"];
    const rows = txs.map((t) => [
      t.hash,
      t.type,
      `"${(t.title || "").replace(/"/g, '""')}"`,
      t.amountINR,
      t.amountUSDC,
      t.fee,
      `"${(t.recipient || "").replace(/"/g, '""')}"`,
      t.orderId || "",
      t.status || "settled",
      new Date(t.timestamp).toISOString(),
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `zkpay-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (activeModal === "scan") {
    return <ScanAndPayFlow onBack={() => setActiveModal(null)} />;
  }
  if (activeModal === "cashout") {
    return <CashoutFlow onBack={() => setActiveModal(null)} />;
  }
  if (activeModal === "deposit") {
    return <DepositFlow onBack={() => setActiveModal(null)} />;
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* SECTION 1: 3D PORTFOLIO VAULT MONOLITH */}
      <Tilt3DMonolith
        maxTilt={8}
        className="w-full"
        innerClassName="p-6 sm:p-9 relative overflow-hidden bg-gradient-to-br from-[#16171b]/95 via-[#131315]/95 to-[#0e0e0f]/95"
      >
        {/* Subtle Machined Grid Backdrop */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(rgba(192,198,222,0.5) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        {/* Top Telemetry Bar */}
        <DepthLayer z={16} className="flex flex-wrap items-center justify-between gap-3 mb-7">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#34d399]/10 border border-[#34d399]/25 font-mono text-[10px] uppercase tracking-[0.15em] text-[#34d399] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
              {isSmartWallet ? "ERC-4337 GASLESS VAULT" : "NON-CUSTODIAL VAULT"}
            </span>

            {address && (
              <button
                type="button"
                onClick={handleCopyAddress}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#09090b]/80 hover:bg-white/[0.06] border border-white/[0.08] font-mono text-[10px] text-[#8d90a1] hover:text-white transition-colors cursor-pointer"
                title="Copy Base USDC deposit address"
              >
                <span className="tabular-nums">{shortAddr}</span>
                {copiedAddr ? (
                  <Check className="w-3 h-3 text-[#34d399]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsSelectorOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] font-mono text-[10px] uppercase tracking-[0.14em] text-[#c0c6de] transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-[#34d399]" />
            <span>
              ACTIVE RAIL: {currencyMeta.code} ({currencyMeta.symbol}) / {currencyMeta.rail}
            </span>
          </button>
        </DepthLayer>

        {/* Primary 3D Balance Readout */}
        <DepthLayer z={28} className="my-2">
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8d90a1] mb-2">
            AVAILABLE LIQUIDITY (BASE USDC)
          </span>
          <div className="flex items-baseline flex-wrap gap-x-2">
            <span className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tighter text-white tabular-nums leading-none">
              ${wholePart}
            </span>
            <span className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#8d90a1] tabular-nums leading-none">
              {decimalPart}
            </span>
            <span className="ml-2 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] font-mono text-xs font-bold text-[#c0c6de] uppercase tracking-[0.14em]">
              USDC
            </span>
          </div>
        </DepthLayer>

        {/* Bottom Vault Telemetry Strip */}
        <DepthLayer
          z={18}
          className="mt-8 pt-5 border-t border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-4 text-xs text-[#8d90a1]">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#c0c6de]" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                ECIES SECP256K1 ENCRYPTED
              </span>
            </div>
            <span className="text-white/15">|</span>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#34d399]" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#34d399]">
                MONTHLY CASHBACK ACTIVE
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (address) router.push(`/wallet/${address}`);
              else router.push("/wallet");
            }}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#c0c6de] hover:text-white transition-colors self-start sm:self-auto cursor-pointer"
          >
            <span>OPEN BASE WALLET TELEMETRY</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </DepthLayer>
      </Tilt3DMonolith>

      {/* SECTION 2: 3D HARDWARE TRIGGER DECK (4 CORE ACTIONS) */}
      <section aria-label="Primary Settlement Actions">
        <div className="flex items-center justify-between mb-3.5 px-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8d90a1]">
            EXECUTION CONSOLE // {currencyMeta.rail.toUpperCase()} &amp; CROSS-CHAIN
          </span>
          <span className="font-mono text-[10px] text-[#34d399] uppercase tracking-[0.14em]">
            ZERO GAS FEES
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {/* Primary Trigger 1: Scan & Pay */}
          <button
            type="button"
            onClick={() => setActiveModal("scan")}
            className="group text-left p-1.5 rounded-[24px] bg-gradient-to-b from-[#c0c6de]/20 to-white/[0.03] border border-[#c0c6de]/35 hover:border-[#c0c6de]/70 transition-all duration-300 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.85)] active:scale-[0.98] cursor-pointer"
          >
            <div className="h-full rounded-[18px] bg-gradient-to-br from-[#1b1d24] to-[#131315] p-5 border border-white/[0.1] shadow-[inset_0_1px_1px_rgba(255,255,255,0.16)] flex flex-col justify-between gap-6">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-b from-[#d8def8] to-[#9fa6c3] text-[#0e0e0f] flex items-center justify-center shadow-[0_8px_20px_rgba(192,198,222,0.3)] group-hover:scale-105 transition-transform">
                  <QrCode className="w-5 h-5 stroke-[2.2]" />
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[#34d399]/15 border border-[#34d399]/30 font-mono text-[9px] font-bold text-[#34d399] uppercase tracking-[0.12em]">
                  INSTANT
                </span>
              </div>
              <div>
                <span className="block font-bold text-base sm:text-lg text-white tracking-tight">
                  Scan &amp; Pay
                </span>
                <span className="block font-mono text-[10px] text-[#8d90a1] uppercase tracking-[0.12em] mt-1">
                  {currencyMeta.code} QR / {currencyMeta.rail}
                </span>
              </div>
            </div>
          </button>

          {/* Trigger 2: Cash Out */}
          <button
            type="button"
            onClick={() => setActiveModal("cashout")}
            className="group text-left p-1.5 rounded-[24px] bg-white/[0.025] border border-white/[0.08] hover:border-white/[0.2] transition-all duration-300 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.85)] active:scale-[0.98] cursor-pointer"
          >
            <div className="h-full rounded-[18px] bg-[#131315] p-5 border border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] flex flex-col justify-between gap-6 group-hover:bg-[#17181c] transition-colors">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-2xl bg-[#09090b] border border-white/[0.1] text-[#c0c6de] flex items-center justify-center group-hover:border-[#c0c6de]/40 transition-colors">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <span className="font-mono text-[9px] text-[#8d90a1] uppercase tracking-[0.14em]">
                  OFF-RAMP
                </span>
              </div>
              <div>
                <span className="block font-bold text-base sm:text-lg text-white tracking-tight">
                  Cash Out
                </span>
                <span className="block font-mono text-[10px] text-[#8d90a1] uppercase tracking-[0.12em] mt-1">
                  USDC TO {currencyMeta.code} BANK
                </span>
              </div>
            </div>
          </button>

          {/* Trigger 3: Deposit */}
          <button
            type="button"
            onClick={() => setActiveModal("deposit")}
            className="group text-left p-1.5 rounded-[24px] bg-white/[0.025] border border-white/[0.08] hover:border-white/[0.2] transition-all duration-300 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.85)] active:scale-[0.98] cursor-pointer"
          >
            <div className="h-full rounded-[18px] bg-[#131315] p-5 border border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] flex flex-col justify-between gap-6 group-hover:bg-[#17181c] transition-colors">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-2xl bg-[#09090b] border border-white/[0.1] text-[#34d399] flex items-center justify-center group-hover:border-[#34d399]/40 transition-colors">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <span className="font-mono text-[9px] text-[#8d90a1] uppercase tracking-[0.14em]">
                  NEAR 1CLICK
                </span>
              </div>
              <div>
                <span className="block font-bold text-base sm:text-lg text-white tracking-tight">
                  Deposit
                </span>
                <span className="block font-mono text-[10px] text-[#8d90a1] uppercase tracking-[0.12em] mt-1">
                  15+ CHAINS TO BASE
                </span>
              </div>
            </div>
          </button>

          {/* Trigger 4: Pay Link */}
          <button
            type="button"
            onClick={() => router.push("/create-link")}
            className="group text-left p-1.5 rounded-[24px] bg-white/[0.025] border border-white/[0.08] hover:border-white/[0.2] transition-all duration-300 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.85)] active:scale-[0.98] cursor-pointer"
          >
            <div className="h-full rounded-[18px] bg-[#131315] p-5 border border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] flex flex-col justify-between gap-6 group-hover:bg-[#17181c] transition-colors">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-2xl bg-[#09090b] border border-white/[0.1] text-[#c0c6de] flex items-center justify-center group-hover:border-[#c0c6de]/40 transition-colors">
                  <Link2 className="w-5 h-5" />
                </div>
                <span className="font-mono text-[9px] text-[#8d90a1] uppercase tracking-[0.14em]">
                  MERCHANT
                </span>
              </div>
              <div>
                <span className="block font-bold text-base sm:text-lg text-white tracking-tight">
                  Pay Link
                </span>
                <span className="block font-mono text-[10px] text-[#8d90a1] uppercase tracking-[0.12em] mt-1">
                  SHAREABLE CHECKOUT
                </span>
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* SECTION 3: CRYPTOGRAPHIC SETTLEMENT LEDGER */}
      <section aria-label="Recent Settlement Activity" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8d90a1] block">
              VERIFIED ON-CHAIN ARCHIVE
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-0.5">
              Settlement Ledger
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Functional Filter Pill Bar */}
            <div className="p-1 rounded-full bg-[#131315] border border-white/[0.08] flex items-center gap-1">
              {(
                [
                  { id: "all", label: "ALL" },
                  { id: "payment", label: "PAYMENTS" },
                  { id: "cashout", label: "CASHOUTS" },
                ] as { id: HistoryFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.14em] font-bold transition-colors cursor-pointer ${
                    historyFilter === tab.id
                      ? "bg-[#c0c6de] text-[#0e0e0f]"
                      : "text-[#8d90a1] hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-full bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] font-mono text-[10px] uppercase tracking-[0.14em] text-[#c0c6de] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download CSV Audit Log"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">EXPORT CSV</span>
            </button>
          </div>
        </div>

        {/* Double-Bezel Ledger Enclosure */}
        <div className="p-1.5 rounded-[28px] bg-white/[0.02] border border-white/[0.07] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.85)]">
          <div className="rounded-[22px] bg-[#131315]/95 border border-white/[0.06] overflow-hidden">
            <PaymentHistory filter={historyFilter} />
          </div>
        </div>
      </section>
    </div>
  );
}
