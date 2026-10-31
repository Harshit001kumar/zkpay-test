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
        innerClassName="p-6 sm:p-9 relative overflow-hidden bg-gradient-to-br from-surface-container-low via-surface-container to-surface"
      >
        {/* Top Telemetry Bar */}
        <DepthLayer z={16} className="flex flex-wrap items-center justify-between gap-3 mb-7">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/30 text-xs text-secondary font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              {isSmartWallet ? "ERC-4337 gasless vault" : "Non-custodial vault"}
            </span>

            {address && (
              <button
                type="button"
                onClick={handleCopyAddress}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface/80 hover:bg-surface-container border border-primary/25 font-mono text-xs text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer whitespace-nowrap"
                title="Copy Base USDC deposit address"
              >
                <span className="tabular-nums">{shortAddr}</span>
                {copiedAddr ? (
                  <Check className="w-3 h-3 text-secondary" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsSelectorOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/30 text-xs font-medium text-on-surface transition-colors cursor-pointer whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5 text-secondary" />
            <span>
              Active rail: {currencyMeta.code} ({currencyMeta.symbol}) / {currencyMeta.rail}
            </span>
          </button>
        </DepthLayer>

        {/* Primary 3D Balance Readout */}
        <DepthLayer z={28} className="my-2">
          <span className="block text-xs font-medium text-on-surface-variant mb-2">
            Available liquidity (Base USDC)
          </span>
          <div className="flex items-baseline flex-wrap gap-x-2">
            <span className="font-mono text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tighter text-on-surface tabular-nums leading-none">
              ${wholePart}
            </span>
            <span className="font-mono text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight text-on-surface-variant tabular-nums leading-none">
              {decimalPart}
            </span>
            <span className="ml-2 px-2.5 py-1 rounded-lg bg-primary/15 border border-primary/35 text-xs font-bold text-primary">
              USDC
            </span>
          </div>
        </DepthLayer>

        {/* Bottom Vault Telemetry Strip */}
        <DepthLayer
          z={18}
          className="mt-8 pt-5 border-t border-primary/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-4 text-xs text-on-surface-variant">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium">
                ECIES secp256k1 encrypted
              </span>
            </div>
            <span className="text-on-surface/15">|</span>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-secondary" />
              <span className="text-xs font-medium text-secondary">
                Monthly cashback active
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (address) router.push(`/wallet/${address}`);
              else router.push("/wallet");
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-secondary transition-colors self-start sm:self-auto cursor-pointer whitespace-nowrap"
          >
            <span>Open Base wallet telemetry</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </DepthLayer>
      </Tilt3DMonolith>

      {/* SECTION 2: 3D HARDWARE TRIGGER DECK (4 CORE ACTIONS) */}
      <section aria-label="Primary Settlement Actions">
        <div className="flex items-center justify-between mb-3.5 px-1">
          <span className="text-xs font-medium text-on-surface-variant">
            Execution console · {currencyMeta.rail} &amp; cross-chain
          </span>
          <span className="text-xs font-semibold text-secondary">
            Zero gas fees
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {/* Primary Trigger 1: Scan & Pay */}
          <button
            type="button"
            onClick={() => setActiveModal("scan")}
            className="group text-left rounded-2xl bg-gradient-to-br from-surface-container to-surface-container-low p-5 border border-secondary/45 hover:border-secondary transition-colors duration-200 shadow-elevated active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-6 whitespace-nowrap"
          >
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-secondary text-on-secondary flex items-center justify-center shadow-dock-label group-hover:scale-105 transition-transform">
                <QrCode className="w-5 h-5 stroke-[2.2]" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-secondary/15 border border-secondary/35 text-[11px] font-bold text-secondary">
                Instant
              </span>
            </div>
            <div>
              <span className="block font-bold text-base sm:text-lg text-on-surface tracking-tight">
                Scan &amp; Pay
              </span>
              <span className="block text-xs text-on-surface-variant mt-1">
                {currencyMeta.code} QR / {currencyMeta.rail}
              </span>
            </div>
          </button>

          {/* Trigger 2: Cash Out */}
          <button
            type="button"
            onClick={() => setActiveModal("cashout")}
            className="group text-left rounded-2xl bg-surface-container-low hover:bg-surface-container p-5 border border-primary/20 hover:border-primary/50 transition-colors duration-200 shadow-elevated active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-6 whitespace-nowrap"
          >
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-surface-container border border-primary/30 text-primary flex items-center justify-center group-hover:border-primary transition-colors">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-on-surface-variant">
                Off-ramp
              </span>
            </div>
            <div>
              <span className="block font-bold text-base sm:text-lg text-on-surface tracking-tight">
                Cash Out
              </span>
              <span className="block text-xs text-on-surface-variant mt-1">
                USDC to {currencyMeta.code} bank
              </span>
            </div>
          </button>

          {/* Trigger 3: Deposit */}
          <button
            type="button"
            onClick={() => setActiveModal("deposit")}
            className="group text-left rounded-2xl bg-surface-container-low hover:bg-surface-container p-5 border border-primary/20 hover:border-primary/50 transition-colors duration-200 shadow-elevated active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-6 whitespace-nowrap"
          >
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-surface-container border border-secondary/30 text-secondary flex items-center justify-center group-hover:border-secondary transition-colors">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-on-surface-variant">
                NEAR 1Click
              </span>
            </div>
            <div>
              <span className="block font-bold text-base sm:text-lg text-on-surface tracking-tight">
                Deposit
              </span>
              <span className="block text-xs text-on-surface-variant mt-1">
                15+ chains to Base
              </span>
            </div>
          </button>

          {/* Trigger 4: Pay Link */}
          <button
            type="button"
            onClick={() => router.push("/create-link")}
            className="group text-left rounded-2xl bg-surface-container-low hover:bg-surface-container p-5 border border-primary/20 hover:border-primary/50 transition-colors duration-200 shadow-elevated active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-6 whitespace-nowrap"
          >
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-surface-container border border-primary/30 text-primary flex items-center justify-center group-hover:border-primary transition-colors">
                <Link2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-on-surface-variant">
                Merchant
              </span>
            </div>
            <div>
              <span className="block font-bold text-base sm:text-lg text-on-surface tracking-tight">
                Pay Link
              </span>
              <span className="block text-xs text-on-surface-variant mt-1">
                Shareable checkout
              </span>
            </div>
          </button>
        </div>
      </section>

      {/* SECTION 3: CRYPTOGRAPHIC SETTLEMENT LEDGER */}
      <section aria-label="Recent Settlement Activity" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              Settlement Ledger
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Verified on-chain archive
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Functional Filter Pill Bar */}
            <div className="p-1 rounded-full bg-surface-container-low border border-primary/25 flex items-center gap-1">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "payment", label: "Payments" },
                  { id: "cashout", label: "Cashouts" },
                ] as { id: HistoryFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    historyFilter === tab.id
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-full bg-surface-container-low hover:bg-surface-container border border-primary/25 text-xs font-semibold text-secondary flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              title="Download CSV Audit Log"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>

        {/* Ledger Enclosure */}
        <div className="rounded-2xl bg-surface-container-low border border-primary/20 shadow-elevated overflow-hidden">
          <PaymentHistory filter={historyFilter} />
        </div>
      </section>
    </div>
  );
}
