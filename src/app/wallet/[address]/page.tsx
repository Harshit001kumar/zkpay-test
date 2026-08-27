"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, parseUnits, formatUnits, isAddress, encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { useReadContract, useBalance } from "wagmi";
import { CONTRACTS, CHAIN } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { parseP2PError, getPublicClient } from "@/lib/p2pkit";
import { 
  ArrowLeft, 
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
  CheckCircle2,
  Share2
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";

type TabType = "receive" | "send";

export default function WalletAddressPage() {
  const params = useParams();
  const router = useRouter();
  const rawAddressParam = params?.address as string | undefined;

  const { wallets } = useWallets();
  const connectedWallet = wallets?.[0];
  const connectedAddress = connectedWallet?.address as `0x${string}` | undefined;

  // Use route address if valid, otherwise fallback to connected wallet
  const targetAddress = (rawAddressParam && isAddress(rawAddressParam) 
    ? rawAddressParam 
    : connectedAddress) as `0x${string}` | undefined;

  const isOwner = connectedAddress && targetAddress && connectedAddress.toLowerCase() === targetAddress.toLowerCase();

  const [activeTab, setActiveTab] = useState<TabType>("receive");
  const [copied, setCopied] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);

  // Send state
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendTxHash, setSendTxHash] = useState<string | null>(null);

  const handleSendAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      setSendAmount(val);
    }
  };

  // 1. Fetch USDC balance on Base for the target address
  const { data: usdcBalRaw, refetch: refetchUsdc } = useReadContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [targetAddress ?? "0x0000000000000000000000000000000000000000"],
    chainId: base.id,
    query: {
      enabled: !!targetAddress,
      refetchInterval: 6000,
    },
  });

  // 2. Fetch Native ETH balance on Base (for gas fees)
  const { data: ethBalRaw, refetch: refetchEth } = useBalance({
    address: targetAddress,
    chainId: base.id,
    query: {
      enabled: !!targetAddress,
      refetchInterval: 6000,
    },
  });

  const usdcBalance = usdcBalRaw !== undefined ? Number(formatUnits(usdcBalRaw as bigint, 6)) : 0;
  const ethBalance = ethBalRaw ? Number(formatUnits(ethBalRaw.value, ethBalRaw.decimals)).toFixed(4) : "0.0000";

  const handleCopy = () => {
    if (targetAddress) {
      navigator.clipboard.writeText(targetAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleSendUsdc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectedWallet || !connectedAddress) {
      setSendError("Please connect your wallet to send funds.");
      return;
    }

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
      const provider = await connectedWallet.getEthereumProvider();
      const publicClient = getPublicClient();
      const amountUnits = parseUnits(numAmount.toFixed(6), 6);
      
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [trimmedRecipient as `0x${string}`, amountUnits],
      });

      let hash = "";

      try {
        // 1. Try wallet_sendCalls (Privy Smart Wallet / Paymaster to pay gas in USDC)
        const id = await provider.request({
          method: "wallet_sendCalls",
          params: [{
            version: "1.0",
            from: connectedAddress,
            calls: [{
              to: CONTRACTS.USDC,
              data: transferData,
            }],
          }],
        });

        const MAX_POLLS = 60;
        for (let i = 0; i < MAX_POLLS; i++) {
          const statusRes: any = await provider.request({
            method: "wallet_getCallsStatus",
            params: [id],
          });
          if (statusRes.status === "CONFIRMED" && statusRes.receipts && statusRes.receipts.length > 0) {
            hash = statusRes.receipts[0].transactionHash || statusRes.receipts[0].blockHash;
            break;
          }
          if (statusRes.status === "FAILED" || statusRes.status === "REJECTED") {
            throw new Error(`Transaction ${statusRes.status.toLowerCase()} by wallet`);
          }
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (batchErr: any) {
        // 2. Fallback to standard Viem writeContract
        const client = createWalletClient({
          account: connectedAddress,
          chain: base,
          transport: custom(provider),
        });

        hash = await client.writeContract({
          address: CONTRACTS.USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [trimmedRecipient as `0x${string}`, amountUnits],
        });
      }

      setSendTxHash(hash);
      setIsSending(false);
      refetchUsdc?.();
    } catch (err: any) {
      console.error("[WalletPage] Transfer failed:", err);
      setIsSending(false);
      const parsed = await parseP2PError(err);
      setSendError(parsed.message || "Transaction rejected or failed.");
    }
  };

  const qrCodeUrl = targetAddress 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(targetAddress)}&color=131315&bgcolor=ffffff&margin=10`
    : "";

  return (
    <div className="min-h-screen bg-[#131315] text-[#e5e2e3] font-sans selection:bg-[#c0c6de]/20 selection:text-white">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#c0c6de]/5 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 -right-40 w-96 h-96 bg-[#8a92a6]/5 rounded-full blur-[140px]" />
      </div>

      {/* Sticky Navigation Header */}
      <header className="sticky top-0 z-50 bg-[#131315]/90 backdrop-blur-2xl border-b border-white/10 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[#909097] hover:text-[#e5e2e3] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK TO DASHBOARD</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-[#909097] uppercase tracking-widest">
              BASE MAINNET (8453)
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto px-5 py-8 md:py-12 space-y-6">
        
        {/* Profile / Account Monolith Header */}
        <SpotlightCard className="p-6 md:p-8 bg-[#1b1b1d] border border-white/15 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between pb-5 border-b border-white/10 mb-6">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#c0c6de]/10 border border-[#c0c6de]/30 flex items-center justify-center text-[#c0c6de]">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Base USDC Account</span>
                </h1>
                <p className="text-xs text-[#909097] font-mono">
                  Native Ethereum Layer-2 Settlement
                </p>
              </div>
            </div>

            <a
              href={`https://basescan.org/address/${targetAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-[#c0c6de] hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <span>Basescan</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Balance Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold mb-1">
                USDC BALANCE
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  ${usdcBalance.toFixed(2)}
                </span>
                <span className="text-xs font-mono font-bold text-[#c0c6de]">USDC</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold mb-1">
                GAS RESERVE
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  {ethBalance}
                </span>
                <span className="text-xs font-mono font-bold text-[#909097]">ETH</span>
              </div>
            </div>
          </div>

          {/* Dual Tab Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-black/40 border border-white/10 mb-6">
            <button
              onClick={() => { setActiveTab("receive"); setSendError(null); }}
              className={`py-3 px-4 rounded-xl text-xs font-bold font-label-caps tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${
                activeTab === "receive"
                  ? "bg-[#c0c6de] text-[#131315] shadow-lg font-extrabold"
                  : "text-[#909097] hover:text-white"
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Receive / Deposit</span>
            </button>

            <button
              onClick={() => { setActiveTab("send"); setSendError(null); }}
              className={`py-3 px-4 rounded-xl text-xs font-bold font-label-caps tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${
                activeTab === "send"
                  ? "bg-[#c0c6de] text-[#131315] shadow-lg font-extrabold"
                  : "text-[#909097] hover:text-white"
              }`}
            >
              <Send className="w-4 h-4" />
              <span>Send USDC</span>
            </button>
          </div>

          {/* TAB 1: RECEIVE / DEPOSIT */}
          {activeTab === "receive" && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* High Contrast QR Code Display */}
              <div className="flex flex-col items-center justify-center p-8 rounded-3xl bg-black/50 border border-white/10 relative">
                {targetAddress && qrCodeUrl ? (
                  <div className="w-56 h-56 rounded-3xl overflow-hidden bg-white p-4 shadow-2xl flex items-center justify-center">
                    <img
                      src={qrCodeUrl}
                      alt="Base USDC Wallet QR"
                      className="w-full h-full object-contain"
                      onLoad={() => setQrLoaded(true)}
                    />
                  </div>
                ) : (
                  <div className="w-56 h-56 rounded-3xl bg-white/5 animate-pulse flex items-center justify-center text-[#909097] text-xs font-mono">
                    Generating QR...
                  </div>
                )}

                <p className="text-xs font-mono text-[#c0c6de] mt-4 text-center">
                  Scan using Binance, Coinbase, Bybit, or any Web3 Wallet
                </p>
              </div>

              {/* Full Address Block with 1-Click Copy */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold">
                    YOUR BASE ADDRESS
                  </span>
                  <button
                    onClick={handleCopy}
                    className="text-[11px] font-mono text-[#c0c6de] hover:underline"
                  >
                    {copied ? "COPIED TO CLIPBOARD" : "CLICK TO COPY"}
                  </button>
                </div>

                <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-black/40 border border-white/10">
                  <p className="font-mono text-xs md:text-sm text-[#e5e2e3] truncate select-all flex-1">
                    {targetAddress || "Not connected"}
                  </p>
                  <button
                    onClick={handleCopy}
                    className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 ${
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

              {/* Security Network Banner */}
              <div className="p-4 rounded-2xl bg-[#c0c6de]/5 border border-[#c0c6de]/20 flex items-start gap-3.5 text-xs md:text-sm text-[#c6c6cd]">
                <AlertTriangle className="w-5 h-5 text-[#c0c6de] shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong className="text-white">Base Network only:</strong> Send native USDC (<code className="font-mono text-[#c0c6de]">0x8335...2913</code>) or ETH on Base. Transfers from other networks will not settle automatically.
                </p>
              </div>

              {/* Cross Chain Bridge Link */}
              <button
                onClick={() => router.push("/#deposit")}
                className="w-full py-4 px-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-label-caps tracking-wider text-white uppercase font-bold flex items-center justify-center gap-2.5 transition-all group"
              >
                <ArrowRightLeft className="w-4 h-4 text-[#c0c6de] group-hover:rotate-180 transition-transform duration-500" />
                <span>Deposit from BTC, ETH, SOL, or LTC (Cross-Chain)</span>
              </button>
            </div>
          )}

          {/* TAB 2: SEND USDC */}
          {activeTab === "send" && (
            <form onSubmit={handleSendUsdc} className="space-y-5 animate-in fade-in duration-300">
              <div>
                <label className="block text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold mb-2">
                  RECIPIENT BASE ADDRESS
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={sendRecipient}
                  onChange={(e) => setSendRecipient(e.target.value)}
                  className="w-full p-4 rounded-2xl bg-black/40 border border-white/10 text-white placeholder:text-[#909097]/40 text-xs md:text-sm font-mono focus:border-[#c0c6de] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold">
                    AMOUNT (USDC)
                  </label>
                  <button
                    type="button"
                    onClick={() => setSendAmount(usdcBalance.toFixed(2))}
                    className="text-[11px] font-mono text-[#c0c6de] hover:underline"
                  >
                    MAX (${usdcBalance.toFixed(2)})
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={sendAmount}
                    onChange={handleSendAmountChange}
                    className="w-full p-4 pr-16 rounded-2xl bg-black/40 border border-white/10 text-white placeholder:text-[#909097]/40 text-base font-mono focus:border-[#c0c6de] focus:outline-none transition-colors"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[#909097]">
                    USDC
                  </span>
                </div>
              </div>

              {/* Preset Amount Chips */}
              <div className="flex gap-2.5">
                {[5, 10, 25, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSendAmount(amt.toFixed(2))}
                    className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-[#c6c6cd] transition-colors"
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              {/* Error Message */}
              {sendError && (
                <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 text-xs text-[#ffb4ab]">
                  {sendError}
                </div>
              )}

              {/* Transaction Confirmed Receipt */}
              {sendTxHash && (
                <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold font-mono">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>TRANSFER CONFIRMED ON BASE</span>
                  </div>
                  <a
                    href={`https://basescan.org/tx/${sendTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-[#c0c6de] hover:underline flex items-center gap-1.5"
                  >
                    <span>View Transaction on Basescan</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* Submit Transfer Button */}
              <button
                type="submit"
                disabled={isSending || !sendAmount || !sendRecipient}
                className="w-full py-4 rounded-2xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.2em] font-label-caps uppercase transition-all shadow-lg hover:shadow-white/10 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AUTHORIZING TRANSFER...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>TRANSFER USDC ON BASE</span>
                  </>
                )}
              </button>
            </form>
          )}

        </SpotlightCard>
      </main>
    </div>
  );
}
