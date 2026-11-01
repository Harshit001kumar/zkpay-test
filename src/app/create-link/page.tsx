"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  Link2,
  ArrowLeft,
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

export default function CreateLinkPage() {
  const router = useRouter();
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

  const [myLinks, setMyLinks] = useState<any[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedEscrow, setCopiedEscrow] = useState(false);

  useEffect(() => {
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
  }, [currency]);

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
      console.warn("[CreateLinkPage] loadMyLinks error:", err);
    } finally {
      setIsLoadingLinks(false);
    }
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    if (mainTab === "history") {
      loadMyLinks();
    }
  }, [mainTab, loadMyLinks]);

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

  const handleCancelLink = async (id: string) => {
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
      ? `You have a claimable payout of ${amt} on ZkPay. Open link to claim: ${url} (PIN: ${pinCode})`
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
    <div className="min-h-[100dvh] bg-surface text-on-surface font-sans flex flex-col">
      {/* Sticky Non-Overlapping Top Bar */}
      <header className="sticky top-0 z-40 w-full bg-surface/90 border-b border-outline-variant/15 backdrop-blur-xl">
        <div className="max-w-xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:text-on-surface transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Vault</span>
          </button>

          <div className="flex items-center gap-2 text-xs font-semibold text-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>Pay Link Engine</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 sm:px-6 pt-6 pb-20">
        <div className="rounded-3xl bg-surface-container-low border border-outline-variant/15 shadow-elevated p-5 sm:p-7 space-y-6">
          {/* Card Header + View Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-outline-variant/15">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-on-surface tracking-tight">
                  Pay Link Checkout
                </h1>
                <p className="text-xs text-on-surface-variant">
                  Shareable invoices &amp; PIN-secured escrow links
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-outline-variant/15 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setMainTab("create")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  mainTab === "create"
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Create link
              </button>
              {authenticated && (
                <button
                  type="button"
                  onClick={() => setMainTab("history")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    mainTab === "history"
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span>My links</span>
                  {myLinks.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-surface/30 font-mono text-[10px] tabular-nums">
                      {myLinks.length}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {mainTab === "history" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-on-surface-variant">
                  Your created links
                </span>
                <button
                  type="button"
                  onClick={loadMyLinks}
                  className="text-primary hover:text-on-surface text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLinks ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {isLoadingLinks ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-xs text-on-surface-variant">
                  <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                  <span>Loading your links…</span>
                </div>
              ) : myLinks.length === 0 ? (
                <div className="py-12 px-4 text-center text-xs text-on-surface-variant border border-dashed border-outline-variant/25 rounded-2xl">
                  No links created yet. Switch to &quot;Create link&quot; to generate your first invoice or escrow payout.
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto space-y-2.5 pr-1">
                  {myLinks.map((l) => (
                    <div
                      key={l.id}
                      className="p-4 rounded-2xl bg-surface border border-outline-variant/15 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/25 text-[10px] font-semibold">
                            {l.mode === "disburse" ? "Claimable" : "Invoice"}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                              l.status === "PAID"
                                ? "bg-secondary/15 text-secondary"
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
                        <p className="font-bold text-sm text-on-surface truncate">
                          {l.title}
                        </p>
                        <p className="font-mono text-xs text-primary tabular-nums">
                          ₹{l.amountINR}{" "}
                          <span className="text-on-surface-variant">
                            ({l.estimatedUsdc})
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(l.payUrl, l.id)}
                          title="Copy URL"
                          className="p-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer"
                        >
                          {copiedId === l.id ? (
                            <Check className="w-3.5 h-3.5 text-secondary" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <a
                          href={l.payUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open Checkout"
                          className="p-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {l.status === "ACTIVE" && (
                          <button
                            type="button"
                            onClick={() => handleCancelLink(l.id)}
                            title="Deactivate Link"
                            className="p-2 rounded-xl bg-error/10 hover:bg-error/20 text-error transition-colors cursor-pointer"
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
          ) : !generatedLink ? (
            <form onSubmit={handleCreate} className="space-y-5">
              {/* Mode Selector */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-surface border border-outline-variant/15 gap-1">
                <button
                  type="button"
                  onClick={() => setMode("request")}
                  className={`py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    mode === "request"
                      ? "bg-secondary text-on-secondary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  Request invoice
                </button>
                <button
                  type="button"
                  onClick={() => setMode("disburse")}
                  className={`py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    mode === "disburse"
                      ? "bg-secondary text-on-secondary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  Send claimable link
                </button>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs font-semibold text-on-surface-variant block mb-1.5">
                  {mode === "disburse" ? "Payout title or note" : "Invoice or product title"}
                </label>
                <input
                  type="text"
                  placeholder={
                    mode === "disburse"
                      ? "e.g. Bounty, Team Payout, Gift"
                      : "e.g. Consulting, Invoice #104"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant">
                    Amount in INR (₹)
                  </label>
                  {estimatedUsdcPreview > 0 && (
                    <span className="font-mono tabular-nums text-xs text-primary font-bold">
                      ≈ ${estimatedUsdcPreview.toFixed(2)} USDC
                    </span>
                  )}
                </div>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-mono font-bold text-lg">
                    ₹
                  </span>
                  <input
                    type="number"
                    placeholder="500"
                    value={amountINR}
                    onChange={(e) => setAmountINR(e.target.value)}
                    required
                    min="10"
                    max="8500"
                    className="w-full pl-9 pr-4 py-3 rounded-xl bg-surface border border-outline-variant/20 text-on-surface font-mono text-base font-bold placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors tabular-nums"
                  />
                </div>

                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  {[100, 250, 500, 1000, 2000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmountINR(String(preset))}
                      className={`px-3 py-1 rounded-lg font-mono text-xs tabular-nums font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        amountINR === String(preset)
                          ? "bg-primary text-on-primary"
                          : "bg-surface hover:bg-surface-container text-on-surface-variant border border-outline-variant/15"
                      }`}
                    >
                      ₹{preset.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode-Specific Field */}
              {mode === "request" ? (
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant block mb-1.5">
                    Your settlement UPI ID
                  </label>
                  <input
                    type="text"
                    placeholder="merchant@okaxis"
                    value={recipientUpi}
                    onChange={(e) => setRecipientUpi(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-surface border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
                  />
                  <p className="text-xs text-on-surface-variant mt-1.5">
                    Incoming Base USDC is automatically converted to INR and settled to this UPI ID.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-on-surface-variant">
                      4-digit security PIN
                    </label>
                    <span className="text-xs text-warning font-medium flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Required by recipient to claim
                    </span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="4829"
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    required
                    className="w-full px-4 py-3 rounded-xl bg-surface border border-outline-variant/20 text-on-surface font-mono text-base font-bold tabular-nums text-center placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
                  />
                  <p className="text-xs text-on-surface-variant mt-1.5">
                    Protected by salted cryptographic hash. Share this PIN privately with the recipient.
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3.5 rounded-xl bg-error/10 border border-error/30 text-xs text-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || (mode === "disburse" && pin.length !== 4)}
                className="w-full h-12 rounded-2xl bg-secondary hover:bg-secondary-container text-on-secondary font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-on-secondary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    <span>
                      {mode === "disburse"
                        ? "Generate claimable link"
                        : "Generate pay link"}
                    </span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Success View */
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-surface border border-outline-variant/15 text-center space-y-4">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/30 text-xs font-semibold text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                  <span>
                    {generatedLink.mode === "disburse"
                      ? "Claimable escrow link ready"
                      : "Active pay link ready"}
                  </span>
                </div>

                <div>
                  <div className="font-mono text-3xl font-extrabold text-on-surface tracking-tight tabular-nums">
                    {generatedLink.amountINR}
                  </div>
                  <p className="font-mono text-xs text-primary tabular-nums mt-1">
                    ≈ {generatedLink.estimatedUsdc} on Base Mainnet
                  </p>
                </div>

                {generatedLink.pin && (
                  <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 text-left flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-semibold text-warning block">
                        Security claim PIN
                      </span>
                      <span className="font-mono text-lg font-bold text-on-surface tabular-nums">
                        {generatedLink.pin}
                      </span>
                    </div>
                    <span className="text-xs text-warning/90 max-w-[180px] text-right">
                      Share this 4-digit code privately with the recipient
                    </span>
                  </div>
                )}

                {generatedLink.escrowAddress && (
                  <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 text-left space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-on-surface-variant font-medium">
                        Escrow deposit address
                      </span>
                      <button
                        type="button"
                        onClick={() => copyEscrow(generatedLink.escrowAddress!)}
                        className="text-primary hover:text-on-surface flex items-center gap-1 text-xs font-semibold cursor-pointer"
                      >
                        {copiedEscrow ? (
                          <Check className="w-3.5 h-3.5 text-secondary" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedEscrow ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                    <p className="font-mono text-xs text-on-surface truncate tabular-nums">
                      {generatedLink.escrowAddress}
                    </p>

                    {authenticated && (
                      <button
                        type="button"
                        onClick={handleFundEscrow}
                        disabled={isFunding || fundSuccess}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                          fundSuccess
                            ? "bg-secondary/15 text-secondary border border-secondary/30"
                            : "bg-primary text-on-primary hover:bg-primary/90"
                        }`}
                      >
                        {isFunding ? (
                          <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                        ) : fundSuccess ? (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            <span>Escrow pre-funded</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 fill-current" />
                            <span>1-click pre-fund {generatedLink.estimatedUsdc}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-2xl">
                    <img
                      src={generatedLink.qrCodeUrl}
                      alt="Pay Link QR Code"
                      className="w-36 h-36"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/15 text-xs text-left">
                  <span className="font-mono truncate flex-1 text-xs text-primary">
                    {generatedLink.payUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedLink.payUrl)}
                    className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface shrink-0 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-secondary" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    shareWhatsApp(
                      generatedLink.payUrl,
                      generatedLink.amountINR,
                      generatedLink.pin
                    )
                  }
                  className="py-3 px-4 rounded-xl bg-secondary/15 hover:bg-secondary/25 border border-secondary/30 text-secondary font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Share via WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadQR(generatedLink.qrCodeUrl, generatedLink.linkId)
                  }
                  className="py-3 px-4 rounded-xl bg-surface hover:bg-surface-container border border-outline-variant/20 text-on-surface font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Download QR</span>
                </button>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="w-full py-2.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              >
                + Create another link
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
