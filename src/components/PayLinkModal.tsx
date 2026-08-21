"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PayLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PayLinkModal({ isOpen, onClose }: PayLinkModalProps) {
  const [title, setTitle] = useState("");
  const [amountINR, setAmountINR] = useState("");
  const [recipientUpi, setRecipientUpi] = useState("");
  const [type, setType] = useState<"one_time" | "reusable">("one_time");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<{
    linkId: string;
    payUrl: string;
    qrCodeUrl: string;
    amountINR: string;
    estimatedUsdc: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);

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
            className="absolute inset-0 bg-[#0e0e0f]/80 backdrop-blur-[60px]"
          />

          {/* Obsidian Glass Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className="relative w-full max-w-md rounded-xl bg-white/5 backdrop-blur-[40px] border border-white/15 p-6 md:p-8 shadow-[0_30px_60px_rgba(0,0,0,0.9)] z-10 overflow-hidden text-[#e5e2e3]"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-6 mb-6 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-xl text-[#c0c6de]">link</span>
                <div>
                  <span className="font-label-caps text-[10px] text-[#c0c6de] tracking-[0.25em] font-bold block">
                    CREATE PAY LINK
                  </span>
                  <p className="text-xs text-[#c6c6cd]">Crypto to UPI Settlement</p>
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  resetForm();
                }}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-[#c6c6cd] hover:text-white flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Content: Form vs Success Link View */}
            {!generatedLink ? (
              <form onSubmit={handleCreate} className="space-y-5">
                {/* Title */}
                <div>
                  <label className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-2">
                    INVOICE TITLE (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Freelance Web Development"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/15 text-[#e5e2e3] text-sm placeholder-[#909097] focus:outline-none focus:border-[#c0c6de] transition-colors font-body-md"
                  />
                </div>

                {/* Amount in INR */}
                <div>
                  <label className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-2">
                    AMOUNT IN INR (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c0c6de] font-bold text-sm">
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
                      className="w-full pl-8 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/15 text-[#e5e2e3] text-sm font-semibold placeholder-[#909097] focus:outline-none focus:border-[#c0c6de] transition-colors"
                    />
                  </div>
                  <p className="font-label-caps text-[9px] text-[#909097] tracking-[0.15em] mt-1.5">
                    Limit: Up to ₹8,500 (~100 USDC) with zero KYC.
                  </p>
                </div>

                {/* Recipient UPI ID */}
                <div>
                  <label className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-2">
                    YOUR UPI ID (DELIVERY DESTINATION)
                  </label>
                  <input
                    type="text"
                    placeholder="yourname@okaxis"
                    value={recipientUpi}
                    onChange={(e) => setRecipientUpi(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/15 text-[#e5e2e3] text-sm font-mono placeholder-[#909097] focus:outline-none focus:border-[#c0c6de] transition-colors"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-[#ffb4ab]">
                    {error}
                  </div>
                )}

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 rounded-xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.25em] font-label-caps uppercase transition-all shadow-lg hover:shadow-white/10 flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-[#131315] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">bolt</span>
                      <span>GENERATE SHAREABLE LINK</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Success Result View */
              <div className="space-y-5">
                <div className="p-5 rounded-xl bg-white/[0.03] border border-white/10 text-center">
                  <span className="font-label-caps text-[9px] text-[#c0c6de] tracking-[0.25em] font-bold block mb-1">
                    READY TO SHARE
                  </span>
                  <div className="text-3xl font-medium text-[#e5e2e3] tracking-tight mb-1">
                    {generatedLink.amountINR}
                  </div>
                  <p className="text-xs text-[#c0c6de] font-mono mb-4">
                    ≈ {generatedLink.estimatedUsdc} on Base Mainnet
                  </p>

                  {/* QR Code */}
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-white rounded-xl shadow-lg">
                      <img
                        src={generatedLink.qrCodeUrl}
                        alt="QR Code"
                        className="w-36 h-36"
                      />
                    </div>
                  </div>

                  {/* Link Box */}
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-[#c0c6de] text-left">
                    <span className="truncate flex-1">{generatedLink.payUrl}</span>
                    <button
                      onClick={() => copyToClipboard(generatedLink.payUrl)}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[#e5e2e3] shrink-0 transition-colors"
                      title="Copy URL"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {copied ? "check" : "content_copy"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => copyToClipboard(generatedLink.payUrl)}
                    className="py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-[#e5e2e3] text-xs font-bold font-label-caps tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {copied ? "check" : "content_copy"}
                    </span>
                    <span>{copied ? "COPIED" : "COPY LINK"}</span>
                  </button>

                  <button
                    onClick={() => shareWhatsApp(generatedLink.payUrl, generatedLink.amountINR)}
                    className="py-3.5 rounded-xl bg-[#c0c6de]/10 hover:bg-[#c0c6de]/20 border border-[#c0c6de]/30 text-[#c0c6de] text-xs font-bold font-label-caps tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">share</span>
                    <span>WHATSAPP</span>
                  </button>
                </div>

                <div className="flex gap-3">
                  <a
                    href={generatedLink.payUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3.5 rounded-xl bg-[#e5e2e3] hover:bg-white text-[#131315] text-xs font-bold font-label-caps tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition-colors text-center"
                  >
                    <span>PREVIEW INVOICE</span>
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </a>
                  <button
                    onClick={resetForm}
                    className="px-4 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-[#c6c6cd] text-xs font-label-caps tracking-[0.15em] transition-colors"
                  >
                    RESET
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
