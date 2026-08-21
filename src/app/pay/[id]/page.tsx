"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, parseUnits } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import { CONTRACTS, CHAIN } from "@/lib/constants";
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
  redirectUrl?: string;
  webhookUrl?: string;
  p2pOrderId?: string;
}

type PayStep = "loading" | "details" | "qr" | "processing" | "success" | "error" | "expired";

export default function PayPage() {
  const params = useParams();
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

      setTxHash(feeTxHash as string);
      setStep("success");
    } catch (err: any) {
      console.error("[PayPage] Payment error:", err);
      setError(err.message || "Payment failed");
      setStep("details");
    }
  };

  return (
    <div className="min-h-screen bg-[#131315] text-[#e5e2e3] flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <header className="max-w-[480px] w-full mx-auto flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-[#e5e2e3]">
            <span className="text-[#c0c6de]">Zk</span>Pay
          </h1>
          <div className="h-4 w-px bg-white/15 mx-1" />
          <span className="font-label-caps text-[9px] text-[#c0c6de] tracking-[0.25em] font-bold uppercase">
            CHECKOUT
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-label-caps text-[#c6c6cd] tracking-[0.15em]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#c0c6de] animate-pulse" />
          <span>{CHAIN.name}</span>
        </div>
      </header>

      {/* Main Glass Card */}
      <main className="max-w-[480px] w-full mx-auto my-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white/5 backdrop-blur-[40px] border border-white/15 rounded-xl p-6 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative overflow-hidden"
        >
          <div className="relative z-10">
            <AnimatePresence mode="wait">
              {/* ─── Loading State ─── */}
              {step === "loading" && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-4 py-16"
                >
                  <div className="w-8 h-8 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin" />
                  <p className="font-label-caps text-[10px] text-[#c6c6cd] tracking-[0.25em]">
                    FETCHING INVOICE...
                  </p>
                </motion.div>
              )}

              {/* ─── Payment Details View ─── */}
              {step === "details" && linkData && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  {/* Category / Label */}
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-label-caps text-[#c0c6de] text-[10px] tracking-[0.25em] font-bold">
                      INVOICE DETAILS
                    </span>
                    <span className="font-label-caps text-[9px] text-[#c6c6cd]/60 tracking-[0.2em]">
                      # {linkData.linkId}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="text-xl font-semibold text-[#e5e2e3] tracking-tight mb-1">
                    {linkData.title}
                  </h2>
                  <p className="text-xs text-[#c6c6cd]/70 mb-6 font-mono">
                    Payee: {linkData.recipientUpi}
                  </p>

                  {/* Amount Display */}
                  <div className="p-5 rounded-xl bg-white/[0.03] border border-white/10 mb-6">
                    <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-2">
                      AMOUNT TO PAY
                    </span>
                    <div className="text-4xl md:text-5xl font-medium tracking-tighter text-[#e5e2e3] mb-3">
                      {linkData.amountINR}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                      <span className="text-[#c0c6de] font-medium font-mono">
                        ≈ {linkData.estimatedUsdc}
                      </span>
                      <span className="text-[#909097] text-[11px]">
                        Rate: ₹{linkData.rate}/USDC
                      </span>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-[#ffb4ab] mb-4">
                      {error}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-3">
                    {/* 1-Click Pay with Wallet */}
                    <button
                      onClick={authenticated ? handleWalletPay : () => login()}
                      className="w-full py-4 rounded-xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.25em] font-label-caps uppercase transition-all shadow-lg hover:shadow-white/10 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">account_balance_wallet</span>
                      <span>{authenticated ? "PAY WITH CONNECTED WALLET" : "CONNECT WALLET & PAY"}</span>
                    </button>

                    {/* Pay via Direct Transfer / QR */}
                    <button
                      onClick={() => setStep("qr")}
                      className="w-full py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-[#e5e2e3] font-bold text-xs tracking-[0.25em] font-label-caps uppercase transition-all flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">qr_code_2</span>
                      <span>PAY VIA QR / TRANSFER</span>
                    </button>
                  </div>

                  {/* Trust Footer */}
                  <div className="flex items-center justify-center gap-2 mt-8 pt-4 border-t border-white/10">
                    <span className="material-symbols-outlined text-sm text-[#c0c6de]">verified_user</span>
                    <span className="font-label-caps text-[9px] text-[#909097] tracking-[0.25em]">
                      SECURED BY ZKPAY ON BASE
                    </span>
                  </div>
                </motion.div>
              )}

              {/* ─── QR / Transfer View ─── */}
              {step === "qr" && linkData && (
                <motion.div
                  key="qr"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <button
                    onClick={() => setStep("details")}
                    className="flex items-center gap-2 text-xs font-label-caps text-[#c6c6cd] hover:text-[#e5e2e3] tracking-[0.2em] mb-6 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>BACK TO INVOICE</span>
                  </button>

                  <div className="text-center mb-6">
                    <span className="font-label-caps text-[#c0c6de] text-[10px] tracking-[0.25em] font-bold block mb-1">
                      SCAN & TRANSFER
                    </span>
                    <p className="text-xs text-[#c6c6cd]">
                      Send <strong className="text-[#e5e2e3]">{linkData.estimatedUsdc}</strong> on Base Mainnet
                    </p>
                  </div>

                  {/* QR Container */}
                  <div className="flex justify-center mb-6">
                    <div className="p-4 bg-white rounded-xl shadow-2xl">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(linkData.payUrl)}`}
                        alt="Payment QR"
                        className="w-48 h-48"
                      />
                    </div>
                  </div>

                  {/* Metadata Specs */}
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2 text-xs font-mono mb-6">
                    <div className="flex justify-between">
                      <span className="text-[#909097]">Network</span>
                      <span className="text-[#e5e2e3]">Base Mainnet (8453)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#909097]">Asset</span>
                      <span className="text-[#e5e2e3]">USDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#909097]">Amount</span>
                      <span className="text-[#c0c6de] font-bold">{linkData.estimatedUsdc}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => copyToClipboard(linkData.payUrl)}
                    className="w-full py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-[#e5e2e3] font-bold text-xs tracking-[0.2em] font-label-caps uppercase transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">content_copy</span>
                    <span>{copied ? "COPIED TO CLIPBOARD" : "COPY PAYMENT LINK"}</span>
                  </button>
                </motion.div>
              )}

              {/* ─── Processing State ─── */}
              {step === "processing" && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-4 py-16 text-center"
                >
                  <div className="w-10 h-10 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin" />
                  <div>
                    <p className="font-label-caps text-xs text-[#e5e2e3] tracking-[0.25em] font-bold mb-1">
                      CONFIRMING ON BASE
                    </p>
                    <p className="text-xs text-[#909097]">
                      Please confirm the transaction in your wallet
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ─── Success Receipt ─── */}
              {step === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-6"
                >
                  <div className="w-16 h-16 rounded-full bg-[#c0c6de]/10 border border-[#c0c6de]/30 flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-3xl text-[#c0c6de]">check_circle</span>
                  </div>

                  <span className="font-label-caps text-[10px] text-[#c0c6de] tracking-[0.25em] font-bold block mb-1">
                    TRANSACTION SETTLED
                  </span>
                  <h3 className="text-2xl font-bold text-[#e5e2e3] mb-2">
                    Payment Successful
                  </h3>
                  <p className="text-xs text-[#909097] mb-6">
                    {linkData?.amountINR} delivered to {linkData?.recipientUpi} via UPI
                  </p>

                  {txHash && (
                    <a
                      href={`https://basescan.org/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-[#c0c6de] hover:text-white transition-colors mb-6"
                    >
                      <span>View on Basescan</span>
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </a>
                  )}

                  {linkData?.redirectUrl && (
                    <a
                      href={linkData.redirectUrl}
                      className="block w-full py-4 rounded-xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.25em] font-label-caps uppercase transition-all"
                    >
                      RETURN TO MERCHANT
                    </a>
                  )}
                </motion.div>
              )}

              {/* ─── Error State ─── */}
              {step === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-10"
                >
                  <div className="w-16 h-16 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-3xl text-[#ffb4ab]">error</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#e5e2e3] mb-2">
                    Payment Error
                  </h3>
                  <p className="text-xs text-[#c6c6cd] max-w-xs mx-auto">
                    {error || "We could not locate this payment invoice."}
                  </p>
                </motion.div>
              )}

              {/* ─── Expired State ─── */}
              {step === "expired" && (
                <motion.div
                  key="expired"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-10"
                >
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/15 flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-3xl text-[#c6c6cd]">schedule</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#e5e2e3] mb-2">
                    Invoice Expired
                  </h3>
                  <p className="text-xs text-[#909097] max-w-xs mx-auto">
                    This one-time payment link has expired. Please request a new invoice.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="max-w-[480px] w-full mx-auto py-4 text-center">
        <p className="font-label-caps text-[9px] text-[#909097] tracking-[0.25em]">
          POWERED BY <span className="text-[#c0c6de]">ZKPAY</span> • LUXURY EDITORIAL CRYPTO
        </p>
      </footer>
    </div>
  );
}
