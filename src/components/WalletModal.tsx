"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, parseUnits, formatUnits, isAddress } from "viem";
import { base } from "viem/chains";
import { useReadContract, useBalance } from "wagmi";
import { CONTRACTS, CHAIN } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { 
  X, 
  Copy, 
  Check, 
  ExternalLink, 
  QrCode, 
  Send, 
  ArrowDownLeft, 
  AlertTriangle, 
  ArrowRightLeft,
  Loader2,
  Wallet,
  Coins,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { ShinyText } from "@/components/ui/ShinyText";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDeposit?: () => void;
}

type TabType = "receive" | "send";

export default function WalletModal({ isOpen, onClose, onOpenDeposit }: WalletModalProps) {
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const address = wallet?.address as `0x${string}` | undefined;

  const [activeTab, setActiveTab] = useState<TabType>("receive");
  const [copied, setCopied] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);

  // Send state
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendTxHash, setSendTxHash] = useState<string | null>(null);

  // 1. Fetch USDC balance on Base
  const { data: usdcBalRaw, refetch: refetchUsdc } = useReadContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: base.id,
    query: {
      enabled: isOpen && !!address,
      refetchInterval: 6000,
    },
  });

  // 2. Fetch Native ETH balance on Base (for gas fees)
  const { data: ethBalRaw, refetch: refetchEth } = useBalance({
    address,
    chainId: base.id,
    query: {
      enabled: isOpen && !!address,
      refetchInterval: 6000,
    },
  });

  const usdcBalance = usdcBalRaw !== undefined ? Number(formatUnits(usdcBalRaw as bigint, 6)) : 0;
  const ethBalance = ethBalRaw ? Number(formatUnits(ethBalRaw.value, ethBalRaw.decimals)).toFixed(4) : "0.0000";

  useEffect(() => {
    if (isOpen) {
      refetchUsdc?.();
      refetchEth?.();
      setSendTxHash(null);
      setSendError(null);
      setSendRecipient("");
      setSendAmount("");
    }
  }, [isOpen, refetchUsdc, refetchEth]);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleSendUsdc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet || !address) return;

    setSendError(null);
    setSendTxHash(null);

    const trimmedRecipient = sendRecipient.trim();
    if (!isAddress(trimmedRecipient)) {
      setSendError("Please enter a valid Ethereum / Base address (0x...).");
      return;
    }

    const numAmount = parseFloat(sendAmount);
    if (!sendAmount || isNaN(numAmount) || numAmount <= 0) {
      setSendError("Please enter a valid USDC amount.");
      return;
    }

    if (numAmount > usdcBalance) {
      setSendError(`Insufficient balance. You have $${usdcBalance.toFixed(2)} USDC.`);
      return;
    }

    try {
      setIsSending(true);
      const provider = await wallet.getEthereumProvider();
      const client = createWalletClient({
        account: address,
        chain: base,
        transport: custom(provider),
      });

      const amountUnits = parseUnits(numAmount.toFixed(6), 6);
      const hash = await client.writeContract({
        address: CONTRACTS.USDC as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [trimmedRecipient as `0x${string}`, amountUnits],
      });

      setSendTxHash(hash);
      setIsSending(false);
      refetchUsdc?.();
    } catch (err: any) {
      console.error("[WalletModal] Transfer failed:", err);
      setIsSending(false);
      setSendError(err?.message || "Transaction rejected or failed.");
    }
  };

  if (!isOpen) return null;

  const qrCodeUrl = address 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(address)}&color=131315&bgcolor=ffffff&margin=8`
    : "";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
          className="relative w-full max-w-lg z-10 my-auto"
        >
          <SpotlightCard className="p-6 md:p-8 bg-[#131315] border border-white/15 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-5 border-b border-white/10 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#c0c6de]/10 border border-[#c0c6de]/20 flex items-center justify-center text-[#c0c6de]">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#e5e2e3] tracking-tight flex items-center gap-2">
                    <span>Base USDC Wallet</span>
                  </h2>
                  <div className="flex items-center gap-1.5 text-xs text-[#909097] font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Base Mainnet (8453)</span>
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-[#909097] hover:text-[#e5e2e3] transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Balance Card Banner */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 mb-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold mb-0.5">
                  AVAILABLE BALANCE
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-white tracking-tight">
                    ${usdcBalance.toFixed(2)}
                  </span>
                  <span className="text-xs font-mono font-bold text-[#c0c6de]">USDC</span>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold mb-0.5">
                  GAS RESERVE
                </p>
                <p className="text-xs font-mono text-[#c6c6cd]">
                  {ethBalance} ETH
                </p>
              </div>
            </div>

            {/* Dual Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-white/[0.04] border border-white/5 mb-6">
              <button
                onClick={() => { setActiveTab("receive"); setSendError(null); }}
                className={`py-2.5 px-4 rounded-xl text-xs font-bold font-label-caps tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${
                  activeTab === "receive"
                    ? "bg-[#c0c6de] text-[#131315] shadow-lg shadow-[#c0c6de]/10 font-extrabold"
                    : "text-[#909097] hover:text-white"
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Receive / Deposit</span>
              </button>

              <button
                onClick={() => { setActiveTab("send"); setSendError(null); }}
                className={`py-2.5 px-4 rounded-xl text-xs font-bold font-label-caps tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${
                  activeTab === "send"
                    ? "bg-[#c0c6de] text-[#131315] shadow-lg shadow-[#c0c6de]/10 font-extrabold"
                    : "text-[#909097] hover:text-white"
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send USDC</span>
              </button>
            </div>

            {/* TAB 1: RECEIVE / DEPOSIT */}
            {activeTab === "receive" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* QR Code Card */}
                <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-black/40 border border-white/10 relative">
                  {address && qrCodeUrl ? (
                    <div className="w-48 h-48 rounded-2xl overflow-hidden bg-white p-3 shadow-2xl flex items-center justify-center">
                      <img
                        src={qrCodeUrl}
                        alt="Base USDC Wallet QR"
                        className="w-full h-full object-contain"
                        onLoad={() => setQrLoaded(true)}
                      />
                    </div>
                  ) : (
                    <div className="w-48 h-48 rounded-2xl bg-white/5 animate-pulse flex items-center justify-center text-[#909097] text-xs font-mono">
                      Generating QR...
                    </div>
                  )}

                  <p className="text-[11px] font-mono text-[#c0c6de] mt-3 text-center">
                    Scan to send Base USDC or ETH
                  </p>
                </div>

                {/* Address Copy Block */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold">
                      YOUR BASE RECEIVE ADDRESS
                    </span>
                    <a
                      href={`https://basescan.org/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-mono text-[#c0c6de] hover:underline inline-flex items-center gap-1"
                    >
                      <span>Basescan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                    <p className="font-mono text-xs text-[#e5e2e3] truncate select-all flex-1">
                      {address || "Not connected"}
                    </p>
                    <button
                      onClick={handleCopy}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                        copied
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                      }`}
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>COPIED</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>COPY</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Network Warning Banner */}
                <div className="p-3.5 rounded-xl bg-[#c0c6de]/5 border border-[#c0c6de]/20 flex items-start gap-3 text-xs text-[#c6c6cd]">
                  <AlertTriangle className="w-4 h-4 text-[#c0c6de] shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong className="text-white">Base Network only:</strong> Send native USDC (`0x8335...2913`) or ETH on Base. Transfers from other networks (like Ethereum Mainnet or Solana) will not be received directly.
                  </p>
                </div>

                {/* Cross Chain Deposit Option */}
                {onOpenDeposit && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenDeposit();
                    }}
                    className="w-full py-3.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-label-caps tracking-wider text-[#e5e2e3] hover:text-white uppercase font-bold flex items-center justify-center gap-2 transition-all group"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-[#c0c6de] group-hover:rotate-180 transition-transform duration-500" />
                    <span>Deposit from BTC, ETH, SOL, or LTC</span>
                  </button>
                )}
              </div>
            )}

            {/* TAB 2: SEND USDC */}
            {activeTab === "send" && (
              <form onSubmit={handleSendUsdc} className="space-y-5 animate-in fade-in duration-300">
                {/* Recipient Input */}
                <div>
                  <label className="block text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold mb-2">
                    RECIPIENT BASE ADDRESS
                  </label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={sendRecipient}
                    onChange={(e) => setSendRecipient(e.target.value)}
                    className="w-full p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-white placeholder:text-[#909097]/40 text-xs font-mono focus:border-[#c0c6de] focus:outline-none transition-colors"
                  />
                </div>

                {/* Amount Input */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold">
                      AMOUNT (USDC)
                    </label>
                    <button
                      type="button"
                      onClick={() => setSendAmount(usdcBalance.toString())}
                      className="text-[10px] font-mono text-[#c0c6de] hover:underline"
                    >
                      MAX (${usdcBalance.toFixed(2)})
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      className="w-full p-3.5 pr-16 rounded-xl bg-white/[0.03] border border-white/10 text-white placeholder:text-[#909097]/40 text-sm font-mono focus:border-[#c0c6de] focus:outline-none transition-colors"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[#909097]">
                      USDC
                    </span>
                  </div>
                </div>

                {/* Preset Chips */}
                <div className="flex gap-2">
                  {[5, 10, 25, 50].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setSendAmount(amt.toString())}
                      className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-[#c6c6cd] transition-colors"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                {/* Error Banner */}
                {sendError && (
                  <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/30 text-xs text-[#ffb4ab]">
                    {sendError}
                  </div>
                )}

                {/* Success Receipt */}
                {sendTxHash && (
                  <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold font-mono">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>TRANSFER CONFIRMED ON BASE</span>
                    </div>
                    <a
                      href={`https://basescan.org/tx/${sendTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-mono text-[#c0c6de] hover:underline flex items-center gap-1"
                    >
                      <span>View Transaction on Basescan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Submit Send Button */}
                <button
                  type="submit"
                  disabled={isSending || !sendAmount || !sendRecipient}
                  className="w-full py-4 rounded-xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.2em] font-label-caps uppercase transition-all shadow-lg hover:shadow-white/10 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>AUTHORIZING TRANSFER...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>TRANSFER USDC NOW</span>
                    </>
                  )}
                </button>
              </form>
            )}

          </SpotlightCard>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
