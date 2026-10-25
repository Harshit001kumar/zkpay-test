"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import { base } from "viem/chains";
import { useReadContract } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { CONTRACTS, CHAIN } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { saveTransaction } from "@/lib/history";
import {
  parseP2PError,
  prepareOfframpOrder,
  getOfframpPrice,
  parseOrderIdFromReceipt,
  sendPayoutAddress,
  getOrderStatus,
  getPublicClient,
} from "@/lib/p2pkit";
import { floorTo2Decimals, truncateTo2Decimals } from "@/lib/format";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { ShinyText } from "@/components/ui/ShinyText";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

interface PayLinkData {
  linkId: string;
  mode?: "request" | "disburse";
  title: string;
  amountINR: string;
  amountINRRaw?: number;
  estimatedUsdc: string;
  recipientUpi?: string;
  type: string;
  status: string;
  rate: string;
  payUrl: string;
  qrCodeUrl?: string;
  createdAt: number;
  paidAt?: number;
  txHash?: string;
  redirectUrl?: string;
  webhookUrl?: string;
  p2pOrderId?: string;
  creatorWalletAddress?: string;
  escrowAddress?: string;
  hasPin?: boolean;
  failedAttemptsRemaining?: number;
  claimantUpi?: string;
  claimedAt?: number;
}

type PayStep =
  | "loading"
  | "details"
  | "claim"
  | "processing"
  | "success"
  | "error"
  | "expired"
  | "locked";

export default function PayPage() {
  const params = useParams();
  const { ready, authenticated, login, address: activeAddress, smartClient, primaryWallet, isSmartWallet } = useActiveAccount();

  const linkId = params.id as string;

  const [step, setStep] = useState<PayStep>("loading");
  const [linkData, setLinkData] = useState<PayLinkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"wallet" | "qr">("wallet");

  // Claim Mode State (mode === "disburse")
  const [claimPin, setClaimPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [claimUpi, setClaimUpi] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimAttemptsRemaining, setClaimAttemptsRemaining] = useState<number>(5);

  // Direct QR Crypto Deposit State (mode === "request" Tab 2)
  const [ephemeralDepositAddress, setEphemeralDepositAddress] = useState<string | null>(null);
  const [ephemeralSessionId, setEphemeralSessionId] = useState<string | null>(null);
  const [isCreatingDeposit, setIsCreatingDeposit] = useState(false);
  const [customRefundAddress, setCustomRefundAddress] = useState("");
  const [depositResult, setDepositResult] = useState<any | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Read live USDC balance of the active wallet on Base
  const { data: rawBal, refetch: refetchBal } = useReadContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [activeAddress ?? "0x0000000000000000000000000000000000000000"],
    chainId: base.id,
    query: {
      enabled: authenticated && !!activeAddress,
      refetchInterval: 5000,
    },
  });

  const availableUsdc = rawBal !== undefined ? floorTo2Decimals(rawBal as bigint) : 0;
  const usdcAmount = linkData ? parseFloat(linkData.estimatedUsdc.replace(/[^0-9.]/g, "")) || 0 : 0;
  const isBalanceSufficient = availableUsdc >= usdcAmount;

  // Fetch Pay Link Data
  const fetchLink = useCallback(async () => {
    if (!linkId) return;
    try {
      const res = await fetch(`/api/v1/paylinks?id=${linkId}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Pay link not found");
        setStep("error");
        return;
      }

      setLinkData(data);
      if (data.failedAttemptsRemaining !== undefined) {
        setClaimAttemptsRemaining(data.failedAttemptsRemaining);
      }

      // Check Status
      if (data.status === "PIN_LOCKED" || (data.failedAttemptsRemaining !== undefined && data.failedAttemptsRemaining <= 0)) {
        setStep("locked");
        return;
      }

      if (data.status === "PAID" && data.type !== "reusable") {
        setTxHash(data.txHash || null);
        setStep("success");
        return;
      }

      if (data.status === "EXPIRED" || data.status === "CANCELLED" || data.status === "REFUNDED") {
        setStep("expired");
        return;
      }

      if (data.mode === "disburse") {
        setStep("claim");
      } else {
        setStep("details");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load payment details");
      setStep("error");
    }
  }, [linkId]);

  useEffect(() => {
    fetchLink();
  }, [fetchLink]);

  // Clean up polling timer
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // ────────────────── Tab 2: Initialize Real Crypto QR Deposit Address ──────────────────
  const initCryptoDeposit = async () => {
    if (ephemeralDepositAddress || isCreatingDeposit || !linkData) return;
    setIsCreatingDeposit(true);
    try {
      const inrRaw = linkData.amountINRRaw || Number(linkData.amountINR.replace(/[^0-9.]/g, ""));
      const targetRefund = customRefundAddress.trim() || activeAddress || undefined;

      const res = await fetch("/api/v1/payin-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId: linkData.id || id,
          recipientUpi: linkData.recipientUpi,
          amountINR: inrRaw,
          webhookUrl: linkData.webhookUrl,
          refundAddress: targetRefund,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.payinAddress) {
        setEphemeralDepositAddress(data.payinAddress);
        setEphemeralSessionId(data.sessionId);

        // Start background polling for on-chain deposit detection
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(async () => {
          try {
            const tokenParam = data.clientSecret ? `&token=${encodeURIComponent(data.clientSecret)}` : "";
            const checkRes = await fetch(`/api/v1/payin-sessions?id=${encodeURIComponent(data.sessionId)}${tokenParam}`);
            const checkData = await checkRes.json();
            if (checkData.success) {
              if (
                checkData.status === "REFUNDED_TO_USER" ||
                checkData.status === "STORED_IN_REFUND_WALLET" ||
                checkData.status === "REJECTED_UNDER_MINIMUM"
              ) {
                if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                setDepositResult(checkData);
                setStep("error");
              } else if (checkData.status === "SETTLED" || checkData.status === "ORDER_PLACED") {
                if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                setDepositResult(checkData);
                setTxHash(checkData.txHash || checkData.completedTxHash || null);
                setStep("success");
              }
            }
          } catch {}
        }, 3500);
      }
    } catch (err) {
      console.warn("[PayPage] Failed to init ephemeral crypto deposit:", err);
    } finally {
      setIsCreatingDeposit(false);
    }
  };

  // ────────────────── Mode 1: 1-Click Connected Wallet Payment ──────────────────
  const handleWalletPay = async () => {
    if (!linkData) return;

    try {
      setStep("processing");
      setError(null);

      if (!authenticated) {
        await login();
        setStep("details");
        return;
      }

      if (!activeAddress) {
        setError("Initializing wallet account... Please try again in a moment.");
        setStep("details");
        return;
      }

      const targetUsdc = parseFloat(linkData.estimatedUsdc.replace(/[^0-9.]/g, "")) || 0;
      if (targetUsdc <= 0) {
        setError("Invalid payment amount.");
        setStep("details");
        return;
      }

      const usdcWei = parseUnits(targetUsdc.toFixed(6), 6);

      // Pre-flight balance validation
      if (rawBal !== undefined && (rawBal as bigint) < usdcWei) {
        const balFmt = truncateTo2Decimals(rawBal as bigint);
        setError(
          `Insufficient USDC balance on Base. Your wallet (${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}) has $${balFmt} USDC, but this invoice requires $${targetUsdc.toFixed(2)} USDC. Please fund your wallet to continue.`
        );
        setStep("details");
        return;
      }

      // Calculate fee (1%) and principal (99%)
      const feeWei = usdcWei / 100n;
      const principalWei = usdcWei - feeWei;

      const feeData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [CONTRACTS.TREASURY, feeWei],
      });

      const hasDirectMerchantWallet =
        linkData.creatorWalletAddress &&
        linkData.creatorWalletAddress.startsWith("0x") &&
        linkData.creatorWalletAddress.toLowerCase() !== activeAddress.toLowerCase();

      let txH = "";
      let parsedOrderId: bigint | null = null;
      const calls: { to: `0x${string}`; data: `0x${string}`; value: bigint }[] = [];

      // 1. Fee goes to ZkPay Treasury
      calls.push({
        to: CONTRACTS.USDC as `0x${string}`,
        data: feeData,
        value: 0n,
      });

      if (hasDirectMerchantWallet) {
        calls.push({
          to: CONTRACTS.USDC as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [linkData.creatorWalletAddress as `0x${string}`, principalWei],
          }),
          value: 0n,
        });
      } else {
        const priceCfg = await getOfframpPrice("INR");
        const liveSellPrice = priceCfg?.sellPrice || parseUnits(linkData.rate || "90", 6);

        const orderCall = await prepareOfframpOrder({
          userAddress: activeAddress,
          currency: "INR",
          usdcAmount: principalWei,
          sellPrice: liveSellPrice,
        });

        // Approve Diamond for principal
        calls.push({
          to: CONTRACTS.USDC as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "approve",
            args: [CONTRACTS.DIAMOND, principalWei],
          }),
          value: 0n,
        });

        // Place order call into Diamond escrow
        calls.push({
          to: orderCall.to as `0x${string}`,
          data: orderCall.data as `0x${string}`,
          value: 0n,
        });
      }

      if (smartClient) {
        txH = await smartClient.sendTransaction({ calls });
      } else if (primaryWallet) {
        const provider = await primaryWallet.getEthereumProvider();
        for (let i = 0; i < calls.length; i++) {
          const call = calls[i];
          const hash = await provider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: activeAddress,
                to: call.to,
                data: call.data,
              },
            ],
          });
          txH = (hash as string) || "";
        }
      } else {
        throw new Error("No wallet connected to execute transaction.");
      }

      setTxHash(txH);

      // Parse orderId from receipt if P2P order
      if (!hasDirectMerchantWallet) {
        try {
          const client = getPublicClient();
          const receipt = await client.waitForTransactionReceipt({ hash: txH as `0x${string}` });
          parsedOrderId = await parseOrderIdFromReceipt(receipt, activeAddress);
          if (parsedOrderId) {
            (async () => {
              try {
                for (let i = 0; i < 40; i++) {
                  const currentOrder = await getOrderStatus(parsedOrderId!);
                  if (currentOrder.status === "accepted" && currentOrder.pubkey) {
                    if (smartClient) {
                      await sendPayoutAddress(smartClient as any, {
                        orderId: parsedOrderId!,
                        paymentAddress: linkData.recipientUpi || "",
                        merchantPublicKey: currentOrder.pubkey,
                      });
                    }
                    break;
                  }
                  if (currentOrder.status === "completed") break;
                  await new Promise((r) => setTimeout(r, 3000));
                }
              } catch (deliverErr) {
                console.warn("[PayPage] UPI payout delivery warning:", deliverErr);
              }
            })();
          }
        } catch (receiptErr) {
          console.warn("[PayPage] Receipt parse error:", receiptErr);
        }
      }

      // Record transaction in history
      const parsedInr = parseFloat(linkData.amountINR.replace(/[^0-9.]/g, "")) || 0;
      saveTransaction({
        hash: txH,
        type: "payment",
        title: linkData.title || `Payment to ${linkData.recipientUpi}`,
        amountINR: parsedInr,
        amountUSDC: targetUsdc,
        fee: targetUsdc * 0.01,
        recipient: linkData.recipientUpi || "Merchant",
        orderId: parsedOrderId ? parsedOrderId.toString() : undefined,
        network: "Base Mainnet",
        timestamp: Date.now(),
      });

      // Confirm settlement with PATCH
      try {
        await fetch("/api/v1/paylinks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: linkId,
            status: "PAID",
            txHash: txH,
            p2pOrderId: parsedOrderId ? parsedOrderId.toString() : undefined,
          }),
        });
      } catch (confirmErr) {
        console.warn("[PayPage] Auto-confirm warning:", confirmErr);
      }

      refetchBal?.();
      setStep("success");
    } catch (err: any) {
      console.error("[PayPage] Payment error:", err);
      const parsed = await parseP2PError(err);
      setError(parsed.message || "Payment failed");
      setStep("details");
    }
  };

  // ────────────────── Mode 2: Claimable Escrow Disbursement (PIN + UPI) ──────────────────
  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimPin || !/^\d{4}$/.test(claimPin.trim())) {
      setError("Please enter a valid 4-digit numeric PIN.");
      return;
    }

    const cleanUpi = claimUpi.trim().toLowerCase();
    if (!cleanUpi || !cleanUpi.includes("@")) {
      setError("Please enter a valid recipient UPI ID (e.g. name@okaxis).");
      return;
    }

    try {
      setIsClaiming(true);
      setError(null);

      const res = await fetch("/api/v1/paylinks/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          pin: claimPin.trim(),
          recipientUpi: cleanUpi,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.failedAttemptsRemaining !== undefined) {
          setClaimAttemptsRemaining(data.failedAttemptsRemaining);
        }
        if (data.status === "PIN_LOCKED" || (data.failedAttemptsRemaining !== undefined && data.failedAttemptsRemaining <= 0)) {
          setStep("locked");
          return;
        }
        throw new Error(data.error || "Failed to claim payment. Please check your PIN.");
      }

      setTxHash(data.txHash || null);
      setLinkData((prev) => prev ? { ...prev, claimantUpi: cleanUpi, status: "PAID" } : null);
      setStep("success");
    } catch (claimErr: any) {
      setError(claimErr.message || "Failed to claim payment.");
    } finally {
      setIsClaiming(false);
    }
  };

  // EIP-681 Base USDC URI for Mobile Wallets (Metamask / Phantom / Coinbase)
  const usdcTargetAmount = linkData ? parseFloat(linkData.estimatedUsdc.replace(/[^0-9.]/g, "")) || 0 : 0;
  const usdcWeiUnits = parseUnits(usdcTargetAmount.toFixed(6), 6).toString();
  const eip681DepositUri = ephemeralDepositAddress
    ? `ethereum:${CONTRACTS.USDC}@8453/transfer?address=${ephemeralDepositAddress}&uint256=${usdcWeiUnits}`
    : "";

  return (
    <div className="min-h-screen bg-[#131315] text-[#e5e2e3] font-body-md flex flex-col justify-between p-4 md:p-8 relative overflow-hidden selection:bg-[#c0c6de]/30">
      {/* Ambient Radial Mesh */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(192,198,222,0.05),transparent_50%),radial-gradient(circle_at_bottom_left,rgba(185,199,224,0.05),transparent_50%)]" />

      {/* Top Header */}
      <header className="max-w-[520px] w-full mx-auto flex items-center justify-between py-4 relative z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/15 flex items-center justify-center font-bold text-sm text-[#e5e2e3]">
            Zk
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-[#e5e2e3] leading-none">
              ZkPay <span className="text-[#c0c6de] font-normal">{linkData?.mode === "disburse" ? "Payout" : "Checkout"}</span>
            </h1>
            <span className="font-label-caps text-[8px] text-[#c6c6cd]/60 tracking-[0.25em] font-bold uppercase">
              {linkData?.mode === "disburse" ? "PIN-SECURED ESCROW" : "DECENTRALIZED SETTLEMENT"}
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
          <SpotlightCard className="p-6 md:p-8 border border-white/20 shadow-2xl bg-[#141417]/95">
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
                    VERIFYING BASE ESCROW...
                  </p>
                </motion.div>
              )}

              {/* ─── 2. Invoice Checkout Mode (mode === "request") ─── */}
              {step === "details" && linkData && linkData.mode !== "disburse" && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-label-caps text-[#c0c6de] text-[10px] tracking-[0.25em] font-bold">
                      {linkData.type === "reusable" ? "REUSABLE INVOICE" : "OFFICIAL INVOICE"}
                    </span>
                    <span className="font-mono text-xs text-[#c6c6cd]/60 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                      {linkData.linkId}
                    </span>
                  </div>

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
                      onClick={() => {
                        setActiveTab("qr");
                        initCryptoDeposit();
                      }}
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

                  {activeTab === "wallet" ? (
                    /* Tab 1: 1-Click Connected Wallet */
                    <div className="space-y-6">
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

                      {authenticated && (
                        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isBalanceSufficient ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
                            <span className="text-[#909097]">Wallet:</span>
                            <span className="font-mono text-white font-medium">
                              {activeAddress ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : "Connecting..."}
                            </span>
                            {isSmartWallet && (
                              <span className="text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1 py-0.5 rounded">
                                Smart
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-mono text-xs font-semibold ${isBalanceSufficient ? "text-emerald-400" : "text-amber-400"}`}>
                              ${availableUsdc.toFixed(2)} USDC
                            </span>
                          </div>
                        </div>
                      )}

                      {error && (
                        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-[#ffb4ab] flex items-start gap-2">
                          <span className="material-symbols-outlined text-sm text-red-400 shrink-0 mt-0.5">error</span>
                          <span className="leading-relaxed">{error}</span>
                        </div>
                      )}

                      <ShimmerButton
                        onClick={authenticated ? handleWalletPay : () => login()}
                        disabled={authenticated && (!isBalanceSufficient || availableUsdc < usdcAmount)}
                        className={`w-full py-4 text-xs ${
                          authenticated && (!isBalanceSufficient || availableUsdc < usdcAmount) ? "opacity-60 cursor-not-allowed" : ""
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">
                          {!authenticated ? "login" : !isBalanceSufficient ? "account_balance_wallet" : "bolt"}
                        </span>
                        <span>
                          {!authenticated
                            ? "CONNECT WALLET & PAY"
                            : !isBalanceSufficient
                            ? `INSUFFICIENT USDC ($${availableUsdc.toFixed(2)} / $${usdcAmount.toFixed(2)})`
                            : `PAY $${usdcAmount.toFixed(2)} USDC NOW`}
                        </span>
                      </ShimmerButton>
                    </div>
                  ) : (
                    /* Tab 2: Real Crypto QR / Transfer */
                    <div className="space-y-6 text-center">
                      <div className="flex justify-center">
                        <div className="p-3 bg-white rounded-2xl shadow-2xl relative">
                          {isCreatingDeposit ? (
                            <div className="w-44 h-44 flex flex-col items-center justify-center gap-2">
                              <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                              <span className="text-[10px] text-slate-600 font-mono">Generating Address...</span>
                            </div>
                          ) : (
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                                eip681DepositUri || ephemeralDepositAddress || linkData.payUrl
                              )}`}
                              alt="Payment Deposit QR"
                              className="w-44 h-44"
                            />
                          )}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2.5 text-xs font-mono text-left">
                        <div className="flex justify-between">
                          <span className="text-[#909097]">Send Exact</span>
                          <span className="text-[#e5e2e3] font-bold">{linkData.estimatedUsdc}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#909097]">Network</span>
                          <span className="text-[#c0c6de]">Base Mainnet (USDC)</span>
                        </div>
                        <div className="flex justify-between text-[11px] pt-1 border-t border-white/5">
                          <span className="text-[#909097]">Tolerance Buffer</span>
                          <span className="text-emerald-400">Min $0.95 USDC (No Fine)</span>
                        </div>
                        {ephemeralDepositAddress && (
                          <div className="pt-2 border-t border-white/10">
                            <span className="text-[10px] text-[#909097] block mb-1">Deposit Address:</span>
                            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/40 border border-white/10">
                              <span className="truncate text-[11px] text-[#e5e2e3]">{ephemeralDepositAddress}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(ephemeralDepositAddress)}
                                className="text-[#c0c6de] hover:text-white shrink-0 text-xs flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-xs">{copied ? "check" : "content_copy"}</span>
                                <span>{copied ? "Copied" : "Copy"}</span>
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-[#909097]">Refund Address (Optional):</span>
                            <span className="text-[9px] text-[#606067]">Auto-detected from sender if empty</span>
                          </div>
                          <input
                            type="text"
                            placeholder={activeAddress ? `${activeAddress.slice(0, 10)}...${activeAddress.slice(-6)} (Connected)` : "0x... (Personal Base Wallet)"}
                            value={customRefundAddress}
                            onChange={(e) => setCustomRefundAddress(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-[11px] font-mono text-[#e5e2e3] placeholder-[#606067] focus:outline-none focus:border-cyan-400/50"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2 text-xs text-[#909097] animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span>Listening for deposit on Base... Auto-completes when detected.</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-2 mt-8 pt-4 border-t border-white/10">
                    <span className="material-symbols-outlined text-sm text-[#c0c6de]">verified_user</span>
                    <span className="font-label-caps text-[9px] text-[#909097] tracking-[0.25em]">
                      SECURED BY ZKPAY • BASE MAINNET ESCROW
                    </span>
                  </div>
                </motion.div>
              )}

              {/* ─── 3. Claimable Disbursement Mode (mode === "disburse") ─── */}
              {step === "claim" && linkData && (
                <motion.div
                  key="claim"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-label-caps text-emerald-400 text-[10px] tracking-[0.25em] font-bold">
                      CLAIMABLE ESCROW PAYOUT
                    </span>
                    <span className="font-mono text-xs text-[#c6c6cd]/60 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                      {linkData.linkId}
                    </span>
                  </div>

                  <h2 className="text-2xl font-bold text-[#e5e2e3] tracking-tight mb-1">
                    {linkData.title}
                  </h2>
                  <p className="text-xs text-[#c6c6cd]/80 mb-6">
                    Enter your recipient UPI ID and the 4-digit PIN provided by the sender.
                  </p>

                  {/* Amount Display */}
                  <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/15 mb-6 text-center">
                    <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-1">
                      YOU RECEIVE
                    </span>
                    <div className="text-4xl md:text-5xl font-extrabold tracking-tighter text-[#e5e2e3] mb-2">
                      {linkData.amountINR}
                    </div>
                    <span className="text-xs text-emerald-400 font-mono font-medium">
                      ✓ Pre-funded with {linkData.estimatedUsdc} on Base
                    </span>
                  </div>

                  <form onSubmit={handleClaim} className="space-y-5">
                    {/* UPI Input */}
                    <div>
                      <label className="block text-xs font-label-caps tracking-[0.15em] text-[#c6c6cd] font-semibold mb-2">
                        YOUR RECIPIENT UPI ID
                      </label>
                      <input
                        type="text"
                        value={claimUpi}
                        onChange={(e) => setClaimUpi(e.target.value.toLowerCase().trim())}
                        placeholder="e.g. yourname@okaxis / 9876543210@paytm"
                        required
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-[#e5e2e3] placeholder-[#909097] text-sm font-mono focus:outline-none focus:border-[#c0c6de] transition-colors"
                      />
                    </div>

                    {/* 4-Digit PIN Input */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-label-caps tracking-[0.15em] text-[#c6c6cd] font-semibold">
                          4-DIGIT SECURITY PIN
                        </label>
                        <span className="text-[10px] text-amber-400 font-mono">
                          {claimAttemptsRemaining} attempts remaining
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type={showPin ? "text" : "password"}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={4}
                          value={claimPin}
                          onChange={(e) => setClaimPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          placeholder="••••"
                          required
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-center text-2xl font-mono tracking-[0.5em] text-[#e5e2e3] placeholder-[#909097] focus:outline-none focus:border-[#c0c6de] transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#909097] hover:text-white text-xs font-mono"
                        >
                          <span className="material-symbols-outlined text-sm">
                            {showPin ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-[#ffb4ab] flex items-start gap-2">
                        <span className="material-symbols-outlined text-sm text-red-400 shrink-0 mt-0.5">error</span>
                        <span className="leading-relaxed">{error}</span>
                      </div>
                    )}

                    <ShimmerButton
                      type="submit"
                      disabled={isClaiming || claimPin.length !== 4 || !claimUpi}
                      className={`w-full py-4 text-xs ${
                        isClaiming || claimPin.length !== 4 || !claimUpi ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">
                        {isClaiming ? "hourglass_top" : "lock_open"}
                      </span>
                      <span>
                        {isClaiming ? "VERIFYING & CLAIMING..." : `CLAIM ${linkData.amountINR} NOW`}
                      </span>
                    </ShimmerButton>
                  </form>
                </motion.div>
              )}

              {/* ─── 4. Processing State ─── */}
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
                      Processing transaction and delivering fiat via UPI...
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ─── 5. Success Receipt ─── */}
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
                    {depositResult?.fiatAmount || linkData?.amountINR} delivered to {linkData?.claimantUpi || linkData?.recipientUpi} via UPI
                  </p>

                  {/* Discrepancy Notifications */}
                  {depositResult?.discrepancyType === "UNDERPAID_ACCEPTED" && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 text-left mb-6">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <span className="material-symbols-outlined text-sm text-amber-400">info</span>
                        <span>Partial Payment Accepted (No Fine)</span>
                      </div>
                      <p className="text-[11px] text-amber-200/80 leading-relaxed">
                        Received ${depositResult.receivedUsdc} USDC (expected {depositResult.expectedAmountUsdc}). Within tolerance margin — pro-rated {depositResult.fiatAmount} was processed directly to UPI!
                      </p>
                    </div>
                  )}

                  {depositResult?.discrepancyType === "OVERPAID_ACCEPTED" && (
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 text-left mb-6">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <span className="material-symbols-outlined text-sm text-emerald-400">celebration</span>
                        <span>Overpayment Processed</span>
                      </div>
                      <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                        Received ${depositResult.receivedUsdc} USDC (expected {depositResult.expectedAmountUsdc}). Full bonus amount of {depositResult.fiatAmount} was delivered to UPI!
                      </p>
                    </div>
                  )}

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

                  {linkData?.redirectUrl && /^https?:\/\//i.test(linkData.redirectUrl) && (
                    <a
                      href={linkData.redirectUrl}
                      rel="noopener noreferrer"
                      className="block w-full py-4 rounded-xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.25em] font-label-caps uppercase transition-all shadow-lg"
                    >
                      RETURN TO MERCHANT
                    </a>
                  )}
                </motion.div>
              )}

              {/* ─── 6. Locked State (Failed PIN attempts >= 5) ─── */}
              {step === "locked" && (
                <motion.div
                  key="locked"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <div className="w-16 h-16 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-red-400">
                    <span className="material-symbols-outlined text-3xl">lock</span>
                  </div>
                  <h3 className="text-xl font-bold text-[#e5e2e3] mb-2">
                    Link Locked
                  </h3>
                  <p className="text-xs text-[#c6c6cd] max-w-xs mx-auto mb-6">
                    This pay link has exceeded the maximum limit of 5 incorrect PIN attempts. For security, access has been permanently locked. Please contact the sender.
                  </p>
                </motion.div>
              )}

              {/* ─── 7. Error State (Including Sub-Minimum Deposits) ─── */}
              {step === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-8"
                >
                  {depositResult?.discrepancyType === "UNDERPAID_REJECTED" ? (
                    <div className="space-y-4">
                      <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                        <span className="material-symbols-outlined text-3xl">warning</span>
                      </div>
                      <h3 className="text-2xl font-bold text-[#e5e2e3]">
                        Deposit Under Minimum
                      </h3>
                      <p className="text-xs text-[#c6c6cd] max-w-xs mx-auto">
                        Deposit of <strong>${depositResult.receivedUsdc} USDC</strong> is below the minimum threshold ($0.95 USDC).
                      </p>

                      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-xs font-mono text-left space-y-2 max-w-sm mx-auto">
                        <div className="flex justify-between">
                          <span className="text-[#909097]">Received:</span>
                          <span className="text-white">${depositResult.receivedUsdc} USDC</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#909097]">Processing Fine:</span>
                          <span className="text-red-400">-${depositResult.underpaidPenaltyUsdc} USDC</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-white/10">
                          <span className="text-[#909097]">Refund Status:</span>
                          <span className="text-cyan-400">{depositResult.refundStatus || "REFUNDED"}</span>
                        </div>
                        {depositResult.refundAddress && (
                          <div className="text-[10px] text-[#909097] truncate">
                            To: {depositResult.refundAddress}
                          </div>
                        )}
                      </div>

                      {depositResult.refundTxHash && (
                        <a
                          href={`https://basescan.org/tx/${depositResult.refundTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-xs font-mono text-cyan-400 hover:text-white transition-colors"
                        >
                          <span>View Refund on Basescan</span>
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-[#ffb4ab]">
                        <span className="material-symbols-outlined text-3xl">error</span>
                      </div>
                      <h3 className="text-xl font-bold text-[#e5e2e3] mb-2">
                        Payment Error
                      </h3>
                      <p className="text-xs text-[#c6c6cd] max-w-xs mx-auto">
                        {error || "We could not locate this payment invoice."}
                      </p>
                    </>
                  )}
                </motion.div>
              )}

              {/* ─── 8. Expired State ─── */}
              {step === "expired" && (
                <motion.div
                  key="expired"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <div className="w-16 h-16 rounded-full bg-amber-950/40 border border-amber-500/30 flex items-center justify-center mx-auto mb-4 text-amber-400">
                    <span className="material-symbols-outlined text-3xl">timer_off</span>
                  </div>
                  <h3 className="text-xl font-bold text-[#e5e2e3] mb-2">
                    Link Expired or Refunded
                  </h3>
                  <p className="text-xs text-[#c6c6cd] max-w-xs mx-auto">
                    This payment link is no longer active.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </SpotlightCard>
        </motion.div>
      </main>

      {/* Bottom Legal / Info */}
      <footer className="max-w-[520px] w-full mx-auto text-center py-4 relative z-20">
        <p className="text-[10px] text-[#909097] font-mono">
          Powered by ZkPay Engine • Zero-Knowledge Crypto-to-Fiat Protocol
        </p>
      </footer>
    </div>
  );
}
