"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { ShinyText } from "@/components/ui/ShinyText";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import {
  Link2,
  X,
  Zap,
  Copy,
  Check,
  MessageCircle,
  Download,
  Lock,
  ShieldCheck,
  ExternalLink,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { parseUnits, encodeFunctionData } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { useCurrency } from "@/context/CurrencyContext";

interface PayLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_AMOUNTS = [500, 1000, 2500, 5000];

export default function PayLinkModal({ isOpen, onClose }: PayLinkModalProps) {
  const { authenticated, getAccessToken } = usePrivy();
  const { address: activeAddress, smartClient, primaryWallet } = useActiveAccount();
  const { currency, currencyMeta } = useCurrency();

  const PRESET_AMOUNTS = currencyMeta.presets || [100, 250, 500, 1000];

  const [mainTab, setMainTab] = useState<"create" | "history">("create");
  const [mode, setMode] = useState<"request" | "disburse">("request");
  const [title, setTitle] = useState("");
  const [amountINR, setAmountINR] = useState("");
  const [recipientUpi, setRecipientUpi] = useState("");
  const [pin, setPin] = useState("");
  const [type, setType] = useState<"one_time" | "reusable">("one_time");

  const [isLoading, setIsLoading] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [fundSuccess, setFundSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<number>(87.5);
  const [generatedLink, setGeneratedLink] = useState<{
    linkId: string;
    mode: "request" | "disburse";
    payUrl: string;
    qrCodeUrl: string;
    amountINR: string;
    estimatedUsdc: string;
    escrowAddress?: string;
    creatorSecret?: string;
    pin?: string;
  } | null>(null);

  // My Links List State
  const [myLinks, setMyLinks] = useState<any[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedEscrow, setCopiedEscrow] = useState(false);

  // Fetch live rate for client preview
  useEffect(() => {
    if (!isOpen) return;
    const fetchRate = async () => {
      try {
        const res = await fetch(`/api/v1/rates?currency=${currency}`);
        const data = await res.json();
        const rateKey = `USDC_${currency}`;
        if (data.rates?.[rateKey]?.sell) {
          setRate(data.rates[rateKey].sell);
        }
      } catch {}
    };
    fetchRate();
  }, [isOpen, currency]);

  // Load merchant's created links
  const loadMyLinks = useCallback(async () => {
    if (!authenticated || !getAccessToken) return;
    setIsLoadingLinks(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/paylinks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.links)) {
        setMyLinks(data.links);
      }
    } catch (err) {
      console.warn("[PayLinkModal] loadMyLinks error:", err);
    } finally {
      setIsLoadingLinks(false);
    }
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    if (isOpen && mainTab === "history") {
      loadMyLinks();
    }
  }, [isOpen, mainTab, loadMyLinks]);

  const numAmount = parseFloat(amountINR) || 0;
  const estimatedUsdcPreview = numAmount > 0 ? (numAmount / rate) * 1.01 : 0;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountINR || Number(amountINR) <= 0) {
      setError(`Please enter a valid amount in ${currencyMeta.code}.`);
      return;
    }

    if (mode === "request") {
      if (!recipientUpi || !recipientUpi.includes("@")) {
        setError("Please enter a valid UPI ID (e.g. name@okaxis).");
        return;
      }
    } else {
      if (!pin || !/^\d{4}$/.test(pin.trim())) {
        setError("Please enter a valid 4-digit numeric PIN.");
        return;
      }
    }

    try {
      setIsLoading(true);
      setError(null);

      let token: string | null = null;
      if (authenticated && getAccessToken) {
        try {
          token = await getAccessToken();
        } catch {}
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const payload: any = {
        mode,
        title: title || (mode === "disburse" ? "Claimable Payout" : "Payment Invoice"),
        amountINR: Number(amountINR),
        type: mode === "disburse" ? "one_time" : type,
      };

      if (mode === "request") {
        payload.recipientUpi = recipientUpi.trim();
      } else {
        payload.pin = pin.trim();
        if (activeAddress) {
          payload.creatorRefundAddress = activeAddress;
        }
      }

      const res = await fetch("/api/v1/paylinks", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create payment link");
      }

      setGeneratedLink({
        ...data,
        pin: mode === "disburse" ? pin.trim() : undefined,
      });
      loadMyLinks();
    } catch (err: any) {
      setError(err.message || "Failed to create pay link");
    } finally {
      setIsLoading(false);
    }
  };

  // 1-Click Escrow Pre-Funding
  const handleFundEscrow = async () => {
    if (!generatedLink?.escrowAddress) return;
    try {
      setIsFunding(true);
      setError(null);

      const targetUsdc = parseFloat(generatedLink.estimatedUsdc.replace(/[^0-9.]/g, "")) || 0;
      const targetWei = parseUnits(targetUsdc.toFixed(6), 6);

      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [generatedLink.escrowAddress as `0x${string}`, targetWei],
      });

      if (smartClient) {
        await smartClient.sendTransaction({
          calls: [
            {
              to: CONTRACTS.USDC as `0x${string}`,
              data: transferData,
              value: 0n,
            },
          ],
        });
      } else if (primaryWallet) {
        const provider = await primaryWallet.getEthereumProvider();
        await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: activeAddress,
              to: CONTRACTS.USDC,
              data: transferData,
            },
          ],
        });
      } else {
        throw new Error("No connected wallet available to fund escrow.");
      }

      setFundSuccess(true);
    } catch (fErr: any) {
      setError(fErr?.message || "Failed to fund escrow wallet.");
    } finally {
      setIsFunding(false);
    }
  };

  // Cancel link
  const handleCancelLink = async (id: string) => {
    if (!confirm("Are you sure you want to deactivate this payment link?")) return;
    try {
      let token: string | null = null;
      if (authenticated && getAccessToken) {
        token = await getAccessToken();
      }
      const res = await fetch(`/api/v1/paylinks?id=${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        loadMyLinks();
      }
    } catch {}
  };

  const copyToClipboard = (text: string, id?: string) => {
    navigator.clipboard.writeText(text);
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyEscrow = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEscrow(true);
    setTimeout(() => setCopiedEscrow(false), 2000);
  };

  const shareWhatsApp = (url: string, amt: string, pinCode?: string) => {
    const text = pinCode
      ? `You have a claimable payout of ${amt} on ZkPay! Open link to claim: ${url} (PIN: ${pinCode})`
      : `Pay ${amt} with Crypto on Base Mainnet: ${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const downloadQR = async (qrUrl: string, linkId: string) => {
    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zkpay-${linkId}-qr.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      window.open(qrUrl, "_blank");
    }
  };

  const resetForm = () => {
    setTitle("");
    setAmountINR("");
    setRecipientUpi("");
    setPin("");
    setGeneratedLink(null);
    setFundSuccess(false);
    setError(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              onClose();
              resetForm();
            }}
            className="absolute inset-0 bg-surface-container-lowest/80 "
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="relative w-full max-w-lg z-10"
          >
            <SpotlightCard className="p-6 md:p-8 border border-white/20 bg-surface/95">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/15 flex items-center justify-center text-primary">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <div>
                    <ShinyText
                      text="PAY LINK ENGINE"
                      className="font-label-caps text-[10px] tracking-normal font-bold block"
                    />
                    <p className="text-xs text-on-surface-variant">Invoices & Escrow Disbursements</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    resetForm();
                  }}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-on-surface-variant hover:text-white flex items-center justify-center transition-colors active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Top Sub-Navigation: Create vs My Links */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setMainTab("create")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-label-caps tracking-normal font-bold transition-colors ${
                    mainTab === "create" ? "bg-white/15 text-white" : "text-on-surface-variant hover:text-white"
                  }`}
                >
                  CREATE LINK
                </button>
                {authenticated && (
                  <button
                    type="button"
                    onClick={() => setMainTab("history")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-label-caps tracking-normal font-bold transition-colors flex items-center gap-1.5 ${
                      mainTab === "history" ? "bg-white/15 text-white" : "text-on-surface-variant hover:text-white"
                    }`}
                  >
                    <span>MY LINKS</span>
                    {myLinks.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[10px] font-sans tabular-nums">
                        {myLinks.length}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* View 1: History / My Links */}
              {mainTab === "history" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-label-caps text-[10px] text-on-surface-variant tracking-normal font-bold">
                      YOUR CREATED LINKS
                    </span>
                    <button
                      type="button"
                      onClick={loadMyLinks}
                      className="text-primary hover:text-white text-xs flex items-center gap-1 font-sans tabular-nums"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingLinks ? "animate-spin" : ""}`} />
                      <span>Refresh</span>
                    </button>
                  </div>

                  {isLoadingLinks ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-xs text-outline">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span>Loading your links…</span>
                    </div>
                  ) : myLinks.length === 0 ? (
                    <div className="py-12 text-center text-xs text-outline border border-dashed border-white/10 rounded-xl">
                      No links created yet. Click &quot;Create Link&quot; to generate your first invoice or escrow payout.
                    </div>
                  ) : (
                    <div className="max-h-[360px] overflow-y-auto space-y-2.5 pr-1">
                      {myLinks.map((l) => (
                        <div
                          key={l.id}
                          className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-sans tabular-nums font-bold  ${
                                  l.mode === "disburse"
                                    ? "bg-primary/15 text-primary border border-primary/30"
                                    : "bg-primary/15 text-primary border border-primary/30"
                                }`}
                              >
                                {l.mode === "disburse" ? "Claimable" : "Invoice"}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-sans tabular-nums font-semibold  ${
                                  l.status === "PAID"
                                    ? "bg-success/15 text-success"
                                    : l.status === "PIN_LOCKED"
                                    ? "bg-error/15 text-error"
                                    : l.status === "ACTIVE"
                                    ? "bg-primary/15 text-primary"
                                    : "bg-warning/15 text-warning"
                                }`}
                              >
                                {l.status}
                              </span>
                            </div>
                            <p className="font-semibold text-on-surface truncate">{l.title}</p>
                            <p className="font-sans tabular-nums text-[11px] text-primary">
                              ₹{l.amountINR} <span className="text-outline">({l.estimatedUsdc})</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(l.payUrl, l.id)}
                              title="Copy URL"
                              className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-on-surface transition-colors"
                            >
                              {copiedId === l.id ? (
                                <Check className="w-3.5 h-3.5 text-success" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <a
                              href={l.payUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Open Checkout"
                              className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-on-surface transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            {l.status === "ACTIVE" && (
                              <button
                                type="button"
                                onClick={() => handleCancelLink(l.id)}
                                title="Deactivate Link"
                                className="p-2 rounded-lg bg-error/10 hover:bg-error/25 text-error transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* View 2: Create Link View */
                <div>
                  {!generatedLink ? (
                    <form onSubmit={handleCreate} className="space-y-4">
                      {/* Mode Selector Tabs */}
                      <div className="grid grid-cols-2 p-1 rounded-xl bg-white/[0.04] border border-white/10 mb-2">
                        <button
                          type="button"
                          onClick={() => setMode("request")}
                          className={`py-2 rounded-lg text-xs font-label-caps tracking-normal font-bold transition-colors ${
                            mode === "request" ? "bg-on-surface text-surface shadow-md" : "text-on-surface-variant hover:text-white"
                          }`}
                        >
                          REQUEST INVOICE
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode("disburse")}
                          className={`py-2 rounded-lg text-xs font-label-caps tracking-normal font-bold transition-colors ${
                            mode === "disburse" ? "bg-on-surface text-surface shadow-md" : "text-on-surface-variant hover:text-white"
                          }`}
                        >
                          SEND CLAIMABLE LINK
                        </button>
                      </div>

                      {/* Title */}
                      <div>
                        <label className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold block mb-1.5">
                          {mode === "disburse" ? "PAYOUT TITLE / REASON" : "INVOICE / PRODUCT TITLE"}
                        </label>
                        <input
                          type="text"
                          placeholder={mode === "disburse" ? "e.g. Bounty, Team Payout, Gift" : "e.g. Consulting, Invoice #104"}
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/15 text-on-surface text-sm placeholder-outline focus:outline-none focus:border-primary transition-colors"
                        />
                      </div>

                      {/* Amount in INR */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">
                            AMOUNT IN {currencyMeta.code} ({currencyMeta.symbol})
                          </label>
                          {estimatedUsdcPreview > 0 && (
                            <span className="font-sans tabular-nums text-xs text-primary font-semibold">
                              ≈ {estimatedUsdcPreview.toFixed(2)} USDC
                            </span>
                          )}
                        </div>

                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold text-lg">
                            {currencyMeta.symbol}
                          </span>
                          <input
                            type="number"
                            placeholder="500"
                            value={amountINR}
                            onChange={(e) => setAmountINR(e.target.value)}
                            required
                            min="10"
                            max="8500"
                            className="w-full pl-9 pr-4 py-3 rounded-xl bg-white/[0.03] border border-white/15 text-on-surface text-base font-semibold placeholder-outline focus:outline-none focus:border-primary transition-colors tracking-tight"
                          />
                        </div>

                        {/* Quick Preset Pills */}
                        <div className="flex items-center gap-2 mt-2">
                          {PRESET_AMOUNTS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setAmountINR(String(preset))}
                              className={`px-3 py-1 rounded-lg text-xs font-sans tabular-nums font-medium transition-colors ${
                                amountINR === String(preset)
                                  ? "bg-primary text-surface font-bold shadow-md"
                                  : "bg-white/5 hover:bg-white/10 text-on-surface-variant border border-white/10"
                              }`}
                            >
                              ₹{preset.toLocaleString("en-IN")}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Mode-Specific Fields */}
                      {mode === "request" ? (
                        <div>
                          <label className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold block mb-1.5">
                            YOUR SETTLEMENT UPI ID
                          </label>
                          <input
                            type="text"
                            placeholder="merchant@okaxis"
                            value={recipientUpi}
                            onChange={(e) => setRecipientUpi(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/15 text-on-surface text-sm font-sans tabular-nums placeholder-outline focus:outline-none focus:border-primary transition-colors"
                          />
                          <p className="font-label-caps text-[9px] text-outline tracking-normal mt-1">
                            Crypto will be auto-swapped to INR and delivered directly to this UPI.
                          </p>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">
                              4-DIGIT SECURITY PIN
                            </label>
                            <span className="text-[10px] text-warning font-sans tabular-nums flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Receiver must enter this
                            </span>
                          </div>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={4}
                            placeholder="e.g. 4829"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            required
                            className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/15 text-on-surface text-base font-sans tabular-nums tracking-normal text-center placeholder-outline focus:outline-none focus:border-primary transition-colors"
                          />
                          <p className="font-label-caps text-[9px] text-outline tracking-normal mt-1">
                            Protected by salted cryptographic hash. Share this PIN privately with the recipient.
                          </p>
                        </div>
                      )}

                      {error && (
                        <div className="p-3 rounded-xl bg-error-container/40 border border-error/30 text-xs text-error">
                          {error}
                        </div>
                      )}

                      {/* Generate Button */}
                      <ShimmerButton
                        type="submit"
                        disabled={isLoading || (mode === "disburse" && pin.length !== 4)}
                        className="w-full mt-2"
                      >
                        {isLoading ? (
                          <div className="w-5 h-5 border-2 border-surface border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Zap className="w-4 h-4 fill-current" />
                            <span>{mode === "disburse" ? "GENERATE CLAIMABLE LINK" : "GENERATE PAY LINK"}</span>
                          </>
                        )}
                      </ShimmerButton>
                    </form>
                  ) : (
                    /* ─── Success Result View ─── */
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="space-y-5"
                    >
                      <div className="p-5 rounded-xl bg-white/[0.03] border border-white/15 text-center relative overflow-hidden">
                        <div className="flex items-center justify-center gap-1.5 mb-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                          <span className="font-label-caps text-[9px] text-primary tracking-normal font-bold">
                            {generatedLink.mode === "disburse" ? "CLAIMABLE ESCROW LINK CREATED" : "ACTIVE PAY LINK"}
                          </span>
                        </div>

                        <div className="text-3xl font-extrabold text-on-surface tracking-tighter mb-1">
                          {generatedLink.amountINR}
                        </div>
                        <p className="text-xs text-primary font-sans tabular-nums mb-4">
                          ≈ {generatedLink.estimatedUsdc} on Base Mainnet
                        </p>

                        {/* PIN Alert Card for Disburse Mode */}
                        {generatedLink.pin && (
                          <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 mb-4 text-left flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-label-caps text-warning tracking-normal font-bold block">
                                SECURITY CLAIM PIN
                              </span>
                              <span className="font-sans tabular-nums text-lg font-bold text-white tracking-normal">
                                {generatedLink.pin}
                              </span>
                            </div>
                            <span className="text-[10px] text-warning/80 max-w-[160px] text-right font-sans tabular-nums">
                              Share this 4-digit code privately with claimant!
                            </span>
                          </div>
                        )}

                        {/* 1-Click Funding Card if Disburse Mode */}
                        {generatedLink.escrowAddress && (
                          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 mb-4 text-left space-y-2">
                            <div className="flex items-center justify-between text-xs font-sans tabular-nums">
                              <span className="text-outline">Escrow Deposit Address</span>
                              <button
                                type="button"
                                onClick={() => copyEscrow(generatedLink.escrowAddress!)}
                                className="text-primary hover:text-white flex items-center gap-1 text-[11px]"
                              >
                                <span className="material-symbols-outlined text-xs">
                                  {copiedEscrow ? "check" : "content_copy"}
                                </span>
                                <span>{copiedEscrow ? "Copied" : "Copy"}</span>
                              </button>
                            </div>
                            <p className="font-sans tabular-nums text-[11px] text-on-surface truncate">
                              {generatedLink.escrowAddress}
                            </p>

                            {authenticated && (
                              <button
                                type="button"
                                onClick={handleFundEscrow}
                                disabled={isFunding || fundSuccess}
                                className={`w-full py-2.5 rounded-lg text-xs font-sans tabular-nums font-bold transition-colors flex items-center justify-center gap-1.5 ${
                                  fundSuccess
                                    ? "bg-success/20 text-success border border-success/30"
                                    : "bg-primary hover:bg-white text-surface shadow-md"
                                }`}
                              >
                                {isFunding ? (
                                  <div className="w-4 h-4 border-2 border-surface border-t-transparent rounded-full animate-spin" />
                                ) : fundSuccess ? (
                                  <>
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>Escrow Pre-Funded Successfully!</span>
                                  </>
                                ) : (
                                  <>
                                    <Zap className="w-3.5 h-3.5 fill-current" />
                                    <span>1-Click Pre-Fund {generatedLink.estimatedUsdc}</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}

                        {/* QR Code */}
                        <div className="flex justify-center mb-3">
                          <div className="p-2.5 bg-white rounded-xl shadow-xl">
                            <img
                              src={generatedLink.qrCodeUrl}
                              alt="QR Code"
                              className="w-32 h-32"
                            />
                          </div>
                        </div>

                        {/* Link Box */}
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-black/50 border border-white/10 text-xs font-sans tabular-nums text-primary text-left">
                          <span className="truncate flex-1 text-[11px]">{generatedLink.payUrl}</span>
                          <button
                            onClick={() => copyToClipboard(generatedLink.payUrl)}
                            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-on-surface shrink-0 transition-colors flex items-center gap-1.5 font-sans text-xs"
                          >
                            {copied ? (
                              <Check className="w-3.5 h-3.5 text-success" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copied ? "Copied" : "Copy"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => shareWhatsApp(generatedLink.payUrl, generatedLink.amountINR, generatedLink.pin)}
                          className="py-3 px-4 rounded-xl bg-success/15 hover:bg-success/25 border border-success/30 text-success font-bold text-xs tracking-normal font-label-caps  transition-colors flex items-center justify-center gap-2 active:scale-95"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>WHATSAPP</span>
                        </button>

                        <button
                          onClick={() => downloadQR(generatedLink.qrCodeUrl, generatedLink.linkId)}
                          className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-on-surface font-bold text-xs tracking-normal font-label-caps  transition-colors flex items-center justify-center gap-2 active:scale-95"
                        >
                          <Download className="w-4 h-4" />
                          <span>SAVE QR</span>
                        </button>
                      </div>

                      <button
                        onClick={resetForm}
                        className="w-full py-2.5 text-xs font-label-caps text-on-surface-variant hover:text-on-surface tracking-normal  transition-colors"
                      >
                        + CREATE ANOTHER LINK
                      </button>
                    </motion.div>
                  )}
                </div>
              )}
            </SpotlightCard>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
