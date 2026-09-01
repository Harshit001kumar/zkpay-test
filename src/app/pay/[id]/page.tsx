"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { encodeFunctionData, parseUnits } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import { CONTRACTS, CHAIN } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { saveTransaction } from "@/lib/history";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { ShinyText } from "@/components/ui/ShinyText";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import { useGasRelay } from "@/hooks/useGasRelay";

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
  const { client: smartClient } = useSmartWallets();
  const { ensureGas } = useGasRelay();
  const linkId = params.id as string;

  const [step, setStep] = useState<PayStep>("loading");
  const [linkData, setLinkData] = useState<PayLinkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"wallet" | "qr">("wallet");

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

  // Handle wallet payment on Base
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

      // Step 2: Approve P2P Diamond for principal amount
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.DIAMOND, principalWei],
      });

      let txH = "";

      if (smartClient) {
        await ensureGas(smartClient?.account?.address || wallet.address);
        txH = await smartClient.sendTransaction({
          calls: [
            {
              to: CONTRACTS.USDC as `0x${string}`,
              data: feeData,
              value: 0n,
            },
            {
              to: CONTRACTS.USDC as `0x${string}`,
              data: approveData,
              value: 0n,
            },
          ],
        });
      } else {
        const provider = await wallet.getEthereumProvider();
        const feeTxHash = await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: wallet.address,
            to: CONTRACTS.USDC,
            data: feeData,
          }],
        });

        await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: wallet.address,
            to: CONTRACTS.USDC,
            data: approveData,
          }],
        });
        txH = (feeTxHash as string) || "";
      }

      setTxHash(txH);

      // Record transaction in user history
      const parsedInr = parseFloat(linkData.amountINR.replace(/[^0-9.]/g, "")) || 0;
      saveTransaction({
        hash: txH,
        type: "payment",
        title: linkData.title || `Payment to ${linkData.recipientUpi}`,
        amountINR: parsedInr,
        amountUSDC: usdcAmount,
        fee: usdcAmount * 0.01,
        recipient: linkData.recipientUpi,
        network: "Base Mainnet",
        timestamp: Date.now(),
      });

      // Update backend pay link status & trigger webhook
      try {
        await fetch("/api/v1/paylinks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: linkData.linkId,
            status: "PAID",
            txHash: txH,
          }),
        });
      } catch (patchErr) {
        console.warn("[PayPage] Failed to update backend status:", patchErr);
      }

      setStep("success");
    } catch (err: any) {
      console.error("[PayPage] Payment error:", err);
      setError(err.message || "Payment failed");
      setStep("details");
    }
  };

  return (
    <div className="min-h-screen bg-[#131315] text-[#e5e2e3] font-body-md flex flex-col justify-between p-4 md:p-8 relative overflow-hidden selection:bg-[#c0c6de]/30">
      {/* ReactBits Ambient Glow Orbs */}
      <div className="fixed -top-40 -right-40 w-96 h-96 bg-[#c0c6de]/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed -bottom-40 -left-40 w-96 h-96 bg-[#b9c7e0]/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header */}
      <header className="max-w-[520px] w-full mx-auto flex items-center justify-between py-4 relative z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/15 flex items-center justify-center font-bold text-sm text-[#e5e2e3]">
            Zk
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-[#e5e2e3] leading-none">
              ZkPay <span className="text-[#c0c6de] font-normal">Checkout</span>
            </h1>
            <span className="font-label-caps text-[8px] text-[#c6c6cd]/60 tracking-[0.25em] font-bold uppercase">
              DECENTRALIZED SETTLEMENT
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-label-caps text-[#c6c6cd] tracking-[0.15em]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{CHAIN.name} Mainnet</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[520px] w-full mx-auto my-auto relative z-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, type: "spring", damping: 25 }}
        >
          <SpotlightCard className="p-6 md:p-8 border border-white/20 shadow-[0_30px_90px_rgba(0,0,0,0.9)]">
            <AnimatePresence mode="wait">
              {/* ─── 1. Loading State ─── */}
              {step === "loading" && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-4 py-20"
                >
                  <div className="w-10 h-10 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin" />
                  <p className="font-label-caps text-[10px] text-[#c6c6cd] tracking-[0.25em]">
                    CONNECTING TO BASE NETWORK...
                  </p>
                </motion.div>
              )}

              {/* ─── 2. Invoice Details View ─── */}
              {step === "details" && linkData && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {/* Category Header */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-label-caps text-[#c0c6de] text-[10px] tracking-[0.25em] font-bold">
                      OFFICIAL INVOICE
                    </span>
                    <span className="font-mono text-xs text-[#c6c6cd]/60 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                      {linkData.linkId}
                    </span>
                  </div>

                  {/* Invoice Title & Payee */}
                  <h2 className="text-2xl font-bold text-[#e5e2e3] tracking-tight mb-1">
                    {linkData.title}
                  </h2>
                  <p className="text-xs text-[#c6c6cd]/80 mb-6 font-mono">
                    Recipient: <span className="text-[#e5e2e3] font-semibold">{linkData.recipientUpi}</span>
                  </p>

                  {/* Dual Mode Switcher Tabs */}
                  <div className="grid grid-cols-2 p-1 rounded-xl bg-white/[0.04] border border-white/10 mb-6">
                    <button
                      onClick={() => setActiveTab("wallet")}
                      className={`relative py-2.5 rounded-lg text-xs font-label-caps tracking-[0.15em] font-bold transition-all ${
                        activeTab === "wallet" ? "text-[#131315]" : "text-[#c6c6cd] hover:text-white"
                      }`}
                    >
                      {activeTab === "wallet" && (
                        <motion.div
                          layoutId="activeCheckoutTab"
                          className="absolute inset-0 rounded-lg bg-[#e5e2e3] shadow-md"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center justify-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                        1-CLICK WALLET
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveTab("qr")}
                      className={`relative py-2.5 rounded-lg text-xs font-label-caps tracking-[0.15em] font-bold transition-all ${
                        activeTab === "qr" ? "text-[#131315]" : "text-[#c6c6cd] hover:text-white"
                      }`}
                    >
                      {activeTab === "qr" && (
                        <motion.div
                          layoutId="activeCheckoutTab"
                          className="absolute inset-0 rounded-lg bg-[#e5e2e3] shadow-md"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center justify-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">qr_code_2</span>
                        QR / TRANSFER
                      </span>
                    </button>
                  </div>

                  {/* Tab 1: 1-Click Wallet Checkout */}
                  {activeTab === "wallet" ? (
                    <div className="space-y-6">
                      {/* Amount Hero Card */}
                      <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/15">
                        <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-2">
                          PAYABLE FIAT TOTAL
                        </span>
                        <div className="text-4xl md:text-5xl font-extrabold tracking-tighter text-[#e5e2e3] mb-3">
                          {linkData.amountINR}
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                          <span className="text-[#c0c6de] font-mono font-bold">
                            ≈ {linkData.estimatedUsdc}
                          </span>
                          <span className="text-[#909097] text-[11px] font-mono">
                            Rate: ₹{linkData.rate}/USDC
                          </span>
                        </div>
                      </div>

                      {error && (
                        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-[#ffb4ab]">
                          {error}
                        </div>
                      )}

                      <ShimmerButton
                        onClick={authenticated ? handleWalletPay : () => login()}
                        className="w-full py-4 text-xs"
                      >
                        <span className="material-symbols-outlined text-base">bolt</span>
                        <span>{authenticated ? "PAY NOW WITH CONNECTED WALLET" : "CONNECT WALLET & PAY"}</span>
                      </ShimmerButton>
                    </div>
                  ) : (
                    /* Tab 2: Direct QR / Transfer */
                    <div className="space-y-6 text-center">
                      <div className="flex justify-center">
                        <div className="p-3 bg-white rounded-2xl shadow-2xl">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(linkData.payUrl)}`}
                            alt="Payment QR"
                            className="w-44 h-44"
                          />
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2 text-xs font-mono text-left">
                        <div className="flex justify-between">
                          <span className="text-[#909097]">Amount</span>
                          <span className="text-[#e5e2e3] font-bold">{linkData.estimatedUsdc}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#909097]">Network</span>
                          <span className="text-[#c0c6de]">Base Mainnet (8453)</span>
                        </div>
                      </div>

                      <button
                        onClick={() => copyToClipboard(linkData.payUrl)}
                        className="w-full py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-[#e5e2e3] font-bold text-xs tracking-[0.2em] font-label-caps uppercase transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">
                          {copied ? "check" : "content_copy"}
                        </span>
                        <span>{copied ? "COPIED PAYMENT LINK" : "COPY PAYMENT LINK"}</span>
                      </button>
                    </div>
                  )}

                  {/* Trust Footer */}
                  <div className="flex items-center justify-center gap-2 mt-8 pt-4 border-t border-white/10">
                    <span className="material-symbols-outlined text-sm text-[#c0c6de]">verified_user</span>
                    <span className="font-label-caps text-[9px] text-[#909097] tracking-[0.25em]">
                      SECURED BY ZKPAY • BASE MAINNET ESCROW
                    </span>
                  </div>
                </motion.div>
              )}

              {/* ─── 3. Processing State ─── */}
              {step === "processing" && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-5 py-20 text-center"
                >
                  <div className="w-12 h-12 border-3 border-[#c0c6de] border-t-transparent rounded-full animate-spin" />
                  <div>
                    <ShinyText
                      text="CONFIRMING ON BASE MAINNET"
                      className="font-label-caps text-xs tracking-[0.25em] font-bold mb-1.5 block"
                    />
                    <p className="text-xs text-[#909097]">
                      Please confirm the transaction signature in your wallet...
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ─── 4. Success Receipt ─── */}
              {step === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-6"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 text-emerald-400">
                    <span className="material-symbols-outlined text-3xl">check_circle</span>
                  </div>

                  <span className="font-label-caps text-[10px] text-emerald-400 tracking-[0.25em] font-bold block mb-1">
                    TRANSACTION SETTLED
                  </span>
                  <h3 className="text-3xl font-extrabold text-[#e5e2e3] tracking-tight mb-2">
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
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-xs font-mono text-[#c0c6de] hover:text-white transition-colors mb-6"
                    >
                      <span>View on Basescan</span>
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </a>
                  )}

                  {linkData?.redirectUrl && (
                    <a
                      href={linkData.redirectUrl}
                      className="block w-full py-4 rounded-xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.25em] font-label-caps uppercase transition-all shadow-lg"
                    >
                      RETURN TO MERCHANT
                    </a>
                  )}
                </motion.div>
              )}

              {/* ─── 5. Error State ─── */}
              {step === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <div className="w-16 h-16 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-[#ffb4ab]">
                    <span className="material-symbols-outlined text-3xl">error</span>
                  </div>
                  <h3 className="text-xl font-bold text-[#e5e2e3] mb-2">
                    Payment Error
                  </h3>
                  <p className="text-xs text-[#c6c6cd] max-w-xs mx-auto">
                    {error || "We could not locate this payment invoice."}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </SpotlightCard>
        </motion.div>
      </main>

      {/* Bottom Sticky Legal / Info */}
      <footer className="max-w-[520px] w-full mx-auto text-center py-4 relative z-20">
        <p className="text-[10px] text-[#909097] font-mono">
          Powered by ZkPay Engine • Zero-Knowledge Crypto-to-Fiat Protocol
        </p>
      </footer>
    </div>
  );
}
