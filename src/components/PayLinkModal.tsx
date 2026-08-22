"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { ShinyText } from "@/components/ui/ShinyText";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

interface PayLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_AMOUNTS = [500, 1000, 2500, 5000];

export default function PayLinkModal({ isOpen, onClose }: PayLinkModalProps) {
  const [title, setTitle] = useState("");
  const [amountINR, setAmountINR] = useState("");
  const [recipientUpi, setRecipientUpi] = useState("");
  const [type, setType] = useState<"one_time" | "reusable">("one_time");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<number>(87.5);
  const [generatedLink, setGeneratedLink] = useState<{
    linkId: string;
    payUrl: string;
    qrCodeUrl: string;
    amountINR: string;
    estimatedUsdc: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);

  // Fetch live rate for dynamic client-side preview
  useEffect(() => {
    if (!isOpen) return;
    const fetchRate = async () => {
      try {
        const res = await fetch("/api/v1/rates?currency=INR");
        const data = await res.json();
        if (data.rates?.USDC_INR?.sell) {
          setRate(data.rates.USDC_INR.sell);
        }
      } catch {}
    };
    fetchRate();
  }, [isOpen]);

  const numAmount = parseFloat(amountINR) || 0;
  const estimatedUsdcPreview = numAmount > 0 ? (numAmount / rate) * 1.01 : 0;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountINR || Number(amountINR) <= 0) {
      setError("Please enter a valid amount in INR.");
      return;
    }
    if (!recipientUpi || !recipientUpi.includes("@")) {
      setError("Please enter a valid UPI ID (e.g. name@okaxis).");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch("/api/v1/paylinks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "Payment Invoice",
          amountINR: Number(amountINR),
          recipientUpi: recipientUpi.trim(),
          type,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create payment link");
      }

      setGeneratedLink(data);
    } catch (err: any) {
      setError(err.message || "Failed to create pay link");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = (url: string, amt: string) => {
    const text = `Pay ${amt} with Crypto on Base Mainnet: ${url}`;
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
    setGeneratedLink(null);
    setError(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Obsidian Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              onClose();
              resetForm();
            }}
            className="absolute inset-0 bg-[#0e0e0f]/85 backdrop-blur-[60px]"
          />

          {/* Obsidian Spotlight Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="relative w-full max-w-lg z-10"
          >
            <SpotlightCard className="p-6 md:p-8 border border-white/20 shadow-[0_30px_80px_rgba(0,0,0,0.9)]">
              {/* Header */}
              <div className="flex items-center justify-between pb-5 mb-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/15 flex items-center justify-center text-[#c0c6de]">
                    <span className="material-symbols-outlined text-lg">link</span>
                  </div>
                  <div>
                    <ShinyText
                      text="CREATE PAY LINK"
                      className="font-label-caps text-[10px] tracking-[0.25em] font-bold block"
                    />
                    <p className="text-xs text-[#c6c6cd]">Crypto to UPI Instant Settlement</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    resetForm();
                  }}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-[#c6c6cd] hover:text-white flex items-center justify-center transition-colors active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>

              {/* Content: Form vs Result View */}
              {!generatedLink ? (
                <form onSubmit={handleCreate} className="space-y-5">
                  {/* Title */}
                  <div>
                    <label className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-2">
                      INVOICE / PRODUCT TITLE
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Design Consulting, Invoice #104"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/15 text-[#e5e2e3] text-sm placeholder-[#909097] focus:outline-none focus:border-[#c0c6de] transition-colors"
                    />
                  </div>

                  {/* Amount in INR */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">
                        AMOUNT IN INR (₹)
                      </label>
                      {estimatedUsdcPreview > 0 && (
                        <span className="font-mono text-xs text-[#c0c6de] font-semibold">
                          ≈ {estimatedUsdcPreview.toFixed(2)} USDC
                        </span>
                      )}
                    </div>

                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c0c6de] font-bold text-lg">
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
                        className="w-full pl-9 pr-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/15 text-[#e5e2e3] text-base font-semibold placeholder-[#909097] focus:outline-none focus:border-[#c0c6de] transition-colors tracking-tight"
                      />
                    </div>

                    {/* Quick Preset Amount Pills */}
                    <div className="flex items-center gap-2 mt-2.5">
                      {PRESET_AMOUNTS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAmountINR(String(preset))}
                          className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                            amountINR === String(preset)
                              ? "bg-[#c0c6de] text-[#131315] font-bold shadow-md"
                              : "bg-white/5 hover:bg-white/10 text-[#c6c6cd] border border-white/10"
                          }`}
                        >
                          ₹{preset.toLocaleString("en-IN")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Recipient UPI ID */}
                  <div>
                    <label className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-2">
                      YOUR SETTLEMENT UPI ID
                    </label>
                    <input
                      type="text"
                      placeholder="merchant@okaxis"
                      value={recipientUpi}
                      onChange={(e) => setRecipientUpi(e.target.value)}
                      required
                      className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/15 text-[#e5e2e3] text-sm font-mono placeholder-[#909097] focus:outline-none focus:border-[#c0c6de] transition-colors"
                    />
                    <p className="font-label-caps text-[9px] text-[#909097] tracking-[0.15em] mt-1.5">
                      Crypto will be auto-swapped to INR and delivered directly to this UPI.
                    </p>
                  </div>

                  {error && (
                    <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-[#ffb4ab]">
                      {error}
                    </div>
                  )}

                  {/* Generate Button */}
                  <ShimmerButton
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-[#131315] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">bolt</span>
                        <span>GENERATE PAY LINK</span>
                      </>
                    )}
                  </ShimmerButton>
                </form>
              ) : (
                /* ─── Success Result View ─── */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  {/* Amount Summary Card */}
                  <div className="p-6 rounded-xl bg-white/[0.03] border border-white/15 text-center relative overflow-hidden">
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-label-caps text-[9px] text-[#c0c6de] tracking-[0.25em] font-bold">
                        ACTIVE PAY LINK
                      </span>
                    </div>

                    <div className="text-4xl font-extrabold text-[#e5e2e3] tracking-tighter mb-1">
                      {generatedLink.amountINR}
                    </div>
                    <p className="text-xs text-[#c0c6de] font-mono mb-5">
                      ≈ {generatedLink.estimatedUsdc} on Base Mainnet
                    </p>

                    {/* QR Code */}
                    <div className="flex justify-center mb-4">
                      <div className="p-3 bg-white rounded-2xl shadow-2xl">
                        <img
                          src={generatedLink.qrCodeUrl}
                          alt="QR Code"
                          className="w-36 h-36"
                        />
                      </div>
                    </div>

                    {/* Link Box with Quick Copy */}
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-[#c0c6de] text-left">
                      <span className="truncate flex-1 text-[11px]">{generatedLink.payUrl}</span>
                      <button
                        onClick={() => copyToClipboard(generatedLink.payUrl)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[#e5e2e3] shrink-0 transition-colors flex items-center gap-1 font-sans text-xs"
                      >
                        <span className="material-symbols-outlined text-sm">
                          {copied ? "check" : "content_copy"}
                        </span>
                        <span>{copied ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Multi-Action Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => shareWhatsApp(generatedLink.payUrl, generatedLink.amountINR)}
                      className="py-3.5 px-4 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#25D366] font-bold text-xs tracking-[0.15em] font-label-caps uppercase transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      <span className="material-symbols-outlined text-base">chat</span>
                      <span>WHATSAPP</span>
                    </button>

                    <button
                      onClick={() => downloadQR(generatedLink.qrCodeUrl, generatedLink.linkId)}
                      className="py-3.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-[#e5e2e3] font-bold text-xs tracking-[0.15em] font-label-caps uppercase transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      <span className="material-symbols-outlined text-base">download</span>
                      <span>SAVE QR</span>
                    </button>
                  </div>

                  <button
                    onClick={resetForm}
                    className="w-full py-3 text-xs font-label-caps text-[#c6c6cd] hover:text-[#e5e2e3] tracking-[0.2em] uppercase transition-colors"
                  >
                    + CREATE ANOTHER LINK
                  </button>
                </motion.div>
              )}
            </SpotlightCard>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
