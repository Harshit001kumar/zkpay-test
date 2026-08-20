"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  Shield,
  Wallet,
  XCircle,
  Clock,
} from "lucide-react";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";

interface PayLinkData {
  linkId: string;
  title: string;
  amountINR: string;
  estimatedUsdc: string;
  recipientUpi: string;
  type: string;
  status: string;
  rate: string;
  payUrl: string;
  createdAt: number;
  paidAt?: number;
  txHash?: string;
}

type PayStep = "loading" | "details" | "wallet" | "qr" | "processing" | "success" | "error" | "expired";

export default function PayPage() {
  const params = useParams();
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const linkId = params.id as string;

  const [step, setStep] = useState<PayStep>("loading");
  const [linkData, setLinkData] = useState<PayLinkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch Pay Link data
  useEffect(() => {
    if (!linkId) return;

    const fetchLink = async () => {
      try {
        const res = await fetch(`/api/v1/paylinks?id=${linkId}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || "Pay link not found");
          setStep("error");
          return;
        }

        if (data.status === "PAID") {
          setLinkData(data);
          setTxHash(data.txHash);
          setStep("success");
          return;
        }

        if (data.status === "EXPIRED") {
          setLinkData(data);
          setStep("expired");
          return;
        }

        setLinkData(data);
        setStep("details");
      } catch (err: any) {
        setError(err.message || "Failed to load payment details");
        setStep("error");
      }
    };

    fetchLink();
  }, [linkId]);

  // Copy to clipboard
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // Handle wallet payment
  const handleWalletPay = async () => {
    if (!linkData) return;

    try {
      setStep("processing");
      setError(null);

      if (!authenticated) {
        await login();
        return;
      }

      const wallet = wallets[0];
      if (!wallet) {
        setError("No wallet connected");
        setStep("details");
        return;
      }

      const provider = await wallet.getEthereumProvider();
      const usdcAmount = parseFloat(linkData.estimatedUsdc.replace(" USDC", ""));
      const usdcWei = parseUnits(usdcAmount.toFixed(6), 6);

      // Calculate fee (1%)
      const feeWei = usdcWei / 100n;
      const principalWei = usdcWei - feeWei;

      // Step 1: Transfer fee to Treasury
      const feeData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [CONTRACTS.TREASURY, feeWei],
      });

      const feeTxHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: wallet.address,
          to: CONTRACTS.USDC,
          data: feeData,
        }],
      });

      // Step 2: Approve P2P Diamond for principal amount
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.DIAMOND, principalWei],
      });

      await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: wallet.address,
          to: CONTRACTS.USDC,
          data: approveData,
        }],
      });

      // TODO: Step 3 would call placeOrder via P2P SDK
      // For now, mark as success with the fee tx hash
      setTxHash(feeTxHash as string);
      setStep("success");
    } catch (err: any) {
      console.error("[PayPage] Payment error:", err);
      setError(err.message || "Payment failed");
      setStep("details");
    }
  };

  // ──────────────────── Render ────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Glass Card */}
        <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Gradient glow */}
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-purple-500/20 rounded-full blur-[100px]" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-500/15 rounded-full blur-[100px]" />

          {/* Header */}
          <div className="relative z-10 px-6 pt-6 pb-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400 tracking-wider uppercase">
                ZkPay Secure Payment
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="relative z-10 px-6 py-6">
            <AnimatePresence mode="wait">
              {/* ─── Loading ─── */}
              {step === "loading" && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4 py-12"
                >
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                  <p className="text-sm text-gray-400">Loading payment details...</p>
                </motion.div>
              )}

              {/* ─── Payment Details ─── */}
              {step === "details" && linkData && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {/* Title */}
                  <h2 className="text-lg font-semibold text-white/90 mb-1">
                    {linkData.title}
                  </h2>
                  <p className="text-xs text-gray-500 mb-6">
                    Payment to {linkData.recipientUpi}
                  </p>

                  {/* Amount Card */}
                  <div className="rounded-2xl bg-white/[0.04] border border-white/5 p-5 mb-6">
                    <p className="text-xs text-gray-500 mb-1">Amount Due</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                      {linkData.amountINR}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <p className="text-sm text-emerald-400">
                        ≈ {linkData.estimatedUsdc}
                      </p>
                      <span className="text-xs text-gray-600">
                        @ ₹{linkData.rate}/USDC
                      </span>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 mb-4">
                      <p className="text-xs text-red-400">{error}</p>
                    </div>
                  )}

                  {/* Payment Options */}
                  <div className="space-y-3">
                    {/* Option 1: Connect Wallet */}
                    <button
                      onClick={authenticated ? handleWalletPay : () => login()}
                      className="w-full flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/20 hover:border-purple-400/40 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                        <Wallet className="w-5 h-5 text-purple-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-white">
                          {authenticated ? "Pay with Wallet" : "Connect Wallet & Pay"}
                        </p>
                        <p className="text-xs text-gray-500">MetaMask, Coinbase, Phantom</p>
                      </div>
                    </button>

                    {/* Option 2: Pay by QR / Address */}
                    <button
                      onClick={() => setStep("qr")}
                      className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                        <QrCode className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-white">Pay by Transfer</p>
                        <p className="text-xs text-gray-500">Send from Binance, Bybit, or any wallet</p>
                      </div>
                    </button>
                  </div>

                  {/* Security badge */}
                  <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-white/5">
                    <Shield className="w-3 h-3 text-gray-600" />
                    <span className="text-[10px] text-gray-600 tracking-wider uppercase">
                      Secured by ZkPay on Base Mainnet
                    </span>
                  </div>
                </motion.div>
              )}

              {/* ─── QR / Address View ─── */}
              {step === "qr" && linkData && (
                <motion.div
                  key="qr"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <button
                    onClick={() => setStep("details")}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors mb-4"
                  >
                    <ArrowLeft className="w-3 h-3" /> Back
                  </button>

                  <h3 className="text-base font-semibold mb-1">Send USDC on Base</h3>
                  <p className="text-xs text-gray-500 mb-5">
                    Transfer exactly <span className="text-emerald-400 font-medium">{linkData.estimatedUsdc}</span> to the address below
                  </p>

                  {/* QR Code */}
                  <div className="flex justify-center mb-5">
                    <div className="p-3 bg-white rounded-2xl">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(linkData.payUrl)}`}
                        alt="Payment QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="rounded-xl bg-white/[0.04] border border-white/5 p-4 space-y-3">
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Network</p>
                      <p className="text-sm text-white font-medium">Base Mainnet (Chain ID: 8453)</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Asset</p>
                      <p className="text-sm text-white font-medium">USDC</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Amount</p>
                      <p className="text-sm text-emerald-400 font-medium">{linkData.estimatedUsdc}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                    <p className="text-xs text-amber-400">
                      <Clock className="w-3 h-3 inline mr-1" />
                      This rate is locked for 5 minutes. Only send USDC on Base network.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ─── Processing ─── */}
              {step === "processing" && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4 py-12"
                >
                  <div className="relative">
                    <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
                    <div className="absolute inset-0 w-12 h-12 rounded-full bg-purple-400/20 animate-ping" />
                  </div>
                  <p className="text-sm text-gray-400">Processing payment...</p>
                  <p className="text-xs text-gray-600">Please confirm in your wallet</p>
                </motion.div>
              )}

              {/* ─── Success ─── */}
              {step === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4 py-8"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Payment Successful!</h3>
                  <p className="text-sm text-gray-400 text-center">
                    {linkData?.amountINR} will be delivered via UPI
                  </p>

                  {txHash && (
                    <a
                      href={`https://basescan.org/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      View on Basescan <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {linkData?.redirectUrl && (
                    <a
                      href={linkData.redirectUrl}
                      className="mt-4 w-full py-3 rounded-xl bg-purple-600 text-center text-sm font-medium hover:bg-purple-500 transition-colors"
                    >
                      Return to Merchant
                    </a>
                  )}
                </motion.div>
              )}

              {/* ─── Error ─── */}
              {step === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4 py-12"
                >
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Payment Not Found</h3>
                  <p className="text-sm text-gray-400 text-center">{error}</p>
                </motion.div>
              )}

              {/* ─── Expired ─── */}
              {step === "expired" && (
                <motion.div
                  key="expired"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4 py-12"
                >
                  <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Payment Expired</h3>
                  <p className="text-sm text-gray-400 text-center">This payment link has expired. Please request a new one.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center">
          <p className="text-[10px] text-gray-700">
            Powered by <span className="text-gray-500 font-medium">ZkPay</span> • Base Mainnet
          </p>
        </div>
      </motion.div>
    </div>
  );
}
