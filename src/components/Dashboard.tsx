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
import { CURRENCY_CONFIGS, SupportedCurrency } from "@/lib/types";
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
  Plus,
} from "lucide-react";
import { Tilt3DMonolith, DepthLayer } from "@/components/ui/Tilt3DMonolith";
import PaymentHistory from "./PaymentHistory";
import ScanAndPayFlow from "./ScanAndPayFlow";
import CashoutFlow from "./CashoutFlow";
import DepositFlow from "./DepositFlow";

type ActiveModal = null | "scan" | "cashout" | "deposit";
type HistoryFilter = "all" | "payment" | "cashout";

const QUICK_CORRIDORS: SupportedCurrency[] = ["INR", "BRL", "USD"];

export default function Dashboard() {
  const router = useRouter();
  const { address, isSmartWallet } = useActiveAccount();
  const { currency, currencyMeta, setCurrency, setIsSelectorOpen } = useCurrency();
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
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Syncing";

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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT COLUMN (7 COLS): LIQUIDITY VAULT & INSTANT EXECUTION CONSOLE */}
      <div className="lg:col-span-7 space-y-5">
        {/* PRIMARY VAULT & SCAN-AND-PAY COMMAND DECK */}
        <Tilt3DMonolith
          maxTilt={5}
          className="w-full"
          innerClassName="p-5 sm:p-7 relative overflow-hidden bg-gradient-to-br from-surface-container-low via-surface-container to-surface"
        >
          {/* Row 1: Vault Status + Inline Corridor Switcher */}
          <DepthLayer z={14} className="flex flex-wrap items-center justify-between gap-2.5 pb-5 border-b border-outline-variant/15">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/10 border border-secondary/30 text-xs text-secondary font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                {isSmartWallet ? "Gasless smart vault" : "Self-custodial vault"}
              </span>

              {address && (
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface/80 hover:bg-surface-container-high border border-outline-variant/20 font-mono text-xs text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer whitespace-nowrap"
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

            {/* 1-Tap Corridor Switcher Strip */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-surface/80 border border-outline-variant/15">
              {QUICK_CORRIDORS.map((code) => {
                const meta = CURRENCY_CONFIGS[code];
                const isSelected = currency === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setCurrency(code)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? "bg-primary text-on-primary"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {meta.code} / {meta.rail}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsSelectorOpen(true)}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                title="View corridor settings"
              >
                <Globe className="w-3.5 h-3.5" />
              </button>
            </div>
          </DepthLayer>

          {/* Row 2: Primary Liquidity Readout */}
          <DepthLayer z={24} className="py-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="block text-xs font-medium text-on-surface-variant mb-2">
                Available Base liquidity
              </span>
              <div className="flex items-baseline flex-wrap gap-x-1.5">
                <span className="font-mono text-5xl sm:text-6xl font-extrabold tracking-tighter text-on-surface tabular-nums leading-none">
                  ${wholePart}
                </span>
                <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-on-surface-variant tabular-nums leading-none">
                  {decimalPart}
                </span>
                <span className="ml-2 px-2.5 py-0.5 rounded-md bg-primary/15 border border-primary/30 text-xs font-bold text-primary">
                  USDC
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-1">
              <span className="text-[11px] text-on-surface-variant">
                Active payout corridor
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface bg-surface/70 border border-outline-variant/15 px-3 py-1.5 rounded-xl">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                <span>
                  {currencyMeta.name} ({currencyMeta.symbol}) via {currencyMeta.rail}
                </span>
              </span>
            </div>
          </DepthLayer>

          {/* Row 3: Primary Action Dock (Hero Scan & Pay + Deposit) */}
          <DepthLayer z={20} className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveModal("scan")}
              className="sm:col-span-8 group h-14 px-5 rounded-2xl bg-secondary hover:bg-secondary-container text-on-secondary font-bold transition-colors shadow-dock-label active:scale-[0.99] cursor-pointer flex items-center justify-between gap-3 whitespace-nowrap"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-surface/15 flex items-center justify-center">
                  <QrCode className="w-5 h-5 stroke-[2.3]" />
                </div>
                <div className="text-left">
                  <span className="block text-sm sm:text-base font-extrabold tracking-tight leading-tight">
                    Scan &amp; Pay {currencyMeta.rail}
                  </span>
                  <span className="block text-[11px] font-semibold opacity-80">
                    Instant {currencyMeta.code} merchant settlement
                  </span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveModal("deposit")}
              className="sm:col-span-4 h-14 px-4 rounded-2xl bg-surface/90 hover:bg-surface-container-high border border-outline-variant/25 hover:border-primary/50 text-on-surface font-semibold transition-colors active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4 text-secondary" />
              <span className="text-sm font-bold">Add Funds</span>
            </button>
          </DepthLayer>

          {/* Row 4: Quick-Send Preset Strip */}
          <DepthLayer z={16} className="mt-5 pt-4 border-t border-outline-variant/15 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <span className="text-xs font-medium text-on-surface-variant shrink-0">
              Quick send ({currencyMeta.code}):
            </span>
            <div className="flex items-center gap-1.5">
              {currencyMeta.presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setActiveModal("scan")}
                  className="px-3 py-1 rounded-lg bg-surface/70 hover:bg-primary/15 border border-outline-variant/15 hover:border-primary/40 font-mono text-xs font-semibold text-on-surface hover:text-primary transition-colors cursor-pointer whitespace-nowrap tabular-nums"
                >
                  {currencyMeta.symbol}
                  {preset.toLocaleString()}
                </button>
              ))}
            </div>
          </DepthLayer>
        </Tilt3DMonolith>

        {/* SECONDARY MONEY MOVEMENT STRIP (3 ASYMMETRIC TILES) */}
        <section aria-label="Secondary Settlement Operations" className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Action 1: Cash Out to Bank */}
          <button
            type="button"
            onClick={() => setActiveModal("cashout")}
            className="group text-left rounded-2xl bg-surface-container-low hover:bg-surface-container p-4 sm:p-5 border border-outline-variant/15 hover:border-primary/40 transition-colors shadow-card active:scale-[0.98] cursor-pointer flex items-start justify-between gap-3 whitespace-nowrap"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <div>
                <span className="block font-bold text-sm sm:text-base text-on-surface tracking-tight">
                  Cash Out
                </span>
                <span className="block text-xs text-on-surface-variant mt-0.5">
                  USDC to {currencyMeta.code} bank
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-surface-container border border-outline-variant/15 text-[11px] font-medium text-on-surface-variant">
              Off-ramp
            </span>
          </button>

          {/* Action 2: Cross-Chain Bridge */}
          <button
            type="button"
            onClick={() => setActiveModal("deposit")}
            className="group text-left rounded-2xl bg-surface-container-low hover:bg-surface-container p-4 sm:p-5 border border-outline-variant/15 hover:border-secondary/40 transition-colors shadow-card active:scale-[0.98] cursor-pointer flex items-start justify-between gap-3 whitespace-nowrap"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/10 border border-secondary/25 text-secondary flex items-center justify-center group-hover:bg-secondary group-hover:text-on-secondary transition-colors">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
              <div>
                <span className="block font-bold text-sm sm:text-base text-on-surface tracking-tight">
                  Bridge &amp; Deposit
                </span>
                <span className="block text-xs text-on-surface-variant mt-0.5">
                  15+ chains to Base
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-surface-container border border-outline-variant/15 text-[11px] font-medium text-on-surface-variant">
              1Click
            </span>
          </button>

          {/* Action 3: Merchant Pay Link */}
          <button
            type="button"
            onClick={() => router.push("/create-link")}
            className="group text-left rounded-2xl bg-surface-container-low hover:bg-surface-container p-4 sm:p-5 border border-outline-variant/15 hover:border-primary/40 transition-colors shadow-card active:scale-[0.98] cursor-pointer flex items-start justify-between gap-3 whitespace-nowrap"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <span className="block font-bold text-sm sm:text-base text-on-surface tracking-tight">
                  Pay Link
                </span>
                <span className="block text-xs text-on-surface-variant mt-0.5">
                  Shareable checkout
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-surface-container border border-outline-variant/15 text-[11px] font-medium text-on-surface-variant">
              Invoice
            </span>
          </button>
        </section>

        {/* ARCHITECTURAL ENCLAVE TELEMETRY BAR */}
        <div className="rounded-2xl bg-surface-container-low/70 border border-outline-variant/15 px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium">ECIES secp256k1 encrypted</span>
            </div>
            <span className="text-outline-variant/40">/</span>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-secondary" />
              <span className="font-medium text-secondary">Zero gas fees</span>
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
        </div>
      </div>

      {/* RIGHT COLUMN (5 COLS): STICKY LIVE SETTLEMENT LEDGER */}
      <section
        aria-label="Recent Settlement Activity"
        className="lg:col-span-5 lg:sticky lg:top-24 rounded-3xl bg-surface-container-low border border-outline-variant/15 shadow-elevated overflow-hidden"
      >
        {/* Ledger Header */}
        <div className="p-5 sm:p-6 border-b border-outline-variant/15 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-on-surface">
                Settlement Ledger
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Verified on-chain archive
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-container border border-outline-variant/20 text-xs font-semibold text-secondary flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              title="Download CSV Audit Log"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Segmented Filter Track */}
          <div className="grid grid-cols-3 p-1 rounded-xl bg-surface border border-outline-variant/15 gap-1">
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
                className={`py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  historyFilter === tab.id
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ledger Feed Body */}
        <div className="max-h-[520px] overflow-y-auto">
          <PaymentHistory filter={historyFilter} />
        </div>
      </section>
    </div>
  );
}
