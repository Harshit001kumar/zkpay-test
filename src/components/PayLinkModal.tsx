"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link as LinkIcon,
  Copy,
  Check,
  Share2,
  X,
  Loader2,
  ExternalLink,
  QrCode,
  Sparkles,
} from "lucide-react";

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
          title: title || "Payment",
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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              onClose();
              resetForm();
            }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md rounded-3xl bg-[#121216] border border-white/10 p-6 shadow-2xl z-10 overflow-hidden"
          >
            {/* Ambient background glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-[80px] pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                  <LinkIcon className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Create Pay Link</h3>
                  <p className="text-[11px] text-gray-500">Receive crypto directly as UPI INR</p>
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  resetForm();
                }}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content: Form vs Result */}
            {!generatedLink ? (
              <form onSubmit={handleCreate} className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-1">
                    Purpose / Title (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Freelance Web Design Invoice #42"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>

                {/* Amount in INR */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-1">
                    Amount (₹ INR) <span className="text-purple-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">
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
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm font-semibold placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Limit: Up to ₹8,500 (~100 USDC) with zero KYC.
                  </p>
                </div>

                {/* Recipient UPI ID */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-1">
                    Your UPI ID (For Settlement) <span className="text-purple-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. yourname@okaxis"
                    value={recipientUpi}
                    onChange={(e) => setRecipientUpi(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    {error}
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-bold shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating Link...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generate Pay Link</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Success Result View */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
                  <p className="text-xs text-gray-400 mb-1">Shareable Payment Link</p>
                  <p className="text-lg font-bold text-white mb-2">{generatedLink.amountINR}</p>
                  <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400 font-mono mb-3">
                    <span>≈ {generatedLink.estimatedUsdc}</span>
                  </div>

                  {/* QR Code */}
                  <div className="flex justify-center mb-3">
                    <div className="p-2.5 bg-white rounded-xl">
                      <img
                        src={generatedLink.qrCodeUrl}
                        alt="QR Code"
                        className="w-36 h-36"
                      />
                    </div>
                  </div>

                  {/* Link Box */}
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-purple-300 break-all text-left">
                    <span className="truncate flex-1">{generatedLink.payUrl}</span>
                    <button
                      onClick={() => copyToClipboard(generatedLink.payUrl)}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white shrink-0 transition-colors"
                      title="Copy URL"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => copyToClipboard(generatedLink.payUrl)}
                    className="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copied ? "Copied!" : "Copy Link"}</span>
                  </button>

                  <button
                    onClick={() => shareWhatsApp(generatedLink.payUrl, generatedLink.amountINR)}
                    className="py-2.5 rounded-xl bg-emerald-600/30 border border-emerald-500/30 hover:bg-emerald-600/40 text-emerald-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share WhatsApp</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <a
                    href={generatedLink.payUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 rounded-xl bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/30 text-purple-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Preview Pay Page</span>
                  </a>
                  <button
                    onClick={resetForm}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-xs font-medium transition-colors"
                  >
                    Create Another
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
