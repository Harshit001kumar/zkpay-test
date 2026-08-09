"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { DEPOSIT_ASSETS, TARGET_ASSET } from "@/lib/constants";
import { Copy, Check, ArrowRight, Loader2, RefreshCw } from "lucide-react";

export default function DepositFlow() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  // Step 1: Input state
  type DepositAsset = typeof DEPOSIT_ASSETS[number];
  const [sourceAsset, setSourceAsset] = useState<DepositAsset>(DEPOSIT_ASSETS[0]);
  const [depositAmount, setDepositAmount] = useState("0.01");
  const [estimatedReceive, setEstimatedReceive] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  // Step 2: Deposit address state
  const [exchangeId, setExchangeId] = useState<string | null>(null);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [exchangeStatus, setExchangeStatus] = useState<string>("waiting");
  const [isCreating, setIsCreating] = useState(false);

  const [copied, setCopied] = useState(false);

  // Estimate effect
  useEffect(() => {
    const fetchEstimate = async () => {
      if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
        setEstimatedReceive("0");
        return;
      }
      setIsEstimating(true);
      try {
        const res = await fetch(
          `/api/exchange/estimate?depositCoin=${sourceAsset.coin}&settleCoin=${TARGET_ASSET.coin}&depositNetwork=${sourceAsset.network}&settleNetwork=${TARGET_ASSET.network}&depositAmount=${depositAmount}`
        );
        const data = await res.json();
        if (res.ok && data.estimatedAmount) {
          setEstimatedReceive(data.estimatedAmount.toString());
        } else {
          // ChangeNOW usually returns { error: "message" } or { message: "error" }
          setEstimatedReceive(`Error: ${data.error || data.message || "Unknown"}`);
        }
      } catch (err: any) {
        setEstimatedReceive(`Error: ${err.message}`);
      }
      setIsEstimating(false);
    };

    const delayDebounceFn = setTimeout(() => {
      fetchEstimate();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [depositAmount, sourceAsset]);

  // Polling effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (exchangeId && exchangeStatus !== "settled" && exchangeStatus !== "failed" && exchangeStatus !== "expired") {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/exchange/status?id=${exchangeId}`);
          const data = await res.json();
          if (data.status) {
            setExchangeStatus(data.status);
          }
        } catch (error) {
          console.error("Failed to poll status", error);
        }
      }, 10000); // Poll every 10 seconds
    }
    return () => clearInterval(interval);
  }, [exchangeId, exchangeStatus]);

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4">Please connect wallet to continue.</div>;
  }

  const baseAddress = wallets[0].address;

  const handleCreateDeposit = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depositCoin: sourceAsset.coin,
          settleCoin: TARGET_ASSET.coin,
          depositNetwork: sourceAsset.network,
          settleNetwork: TARGET_ASSET.network,
          settleAddress: baseAddress, // Send to our embedded wallet
        }),
      });
      const data = await res.json();
      if (data.id && data.payinAddress) {
        setExchangeId(data.id);
        setDepositAddress(data.payinAddress);
        setExchangeStatus("pending");
      } else {
        alert("Failed to create deposit: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      alert("Error creating deposit.");
    }
    setIsCreating(false);
  };

  const copyAddress = () => {
    if (!depositAddress) return;
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusText = (status: string) => {
    const states: Record<string, string> = {
      pending: "Waiting for deposit...",
      processing: "Confirming on blockchain...",
      settling: "Swapping to USDC & Sending...",
      settled: "Deposit Complete!",
      failed: "Deposit Failed",
      refunded: "Refunded",
      expired: "Deposit Window Expired",
    };
    return states[status] || status;
  };

  const getStepProgress = (status: string) => {
    const steps = ["pending", "processing", "settling", "settled"];
    const index = steps.indexOf(status);
    return index >= 0 ? index : 0;
  };

  return (
    <div className="w-full">
      {!depositAddress ? (
        // STEP 1: CREATE DEPOSIT
        <div className="glass-card overflow-hidden flex flex-col">
          <div className="p-5 border-b border-[#46464c] flex items-center justify-between bg-[#201f21]/50">
            <h2 className="text-lg font-bold text-[#e5e2e3]">Cross-Chain Deposit</h2>
            <span className="label-caps text-[#909097]">Step 1 of 2</span>
          </div>

          <div className="p-5 flex flex-col gap-5">
            {/* Asset Selector */}
            <div className="flex flex-col gap-2">
              <label className="label-caps">Deposit Asset</label>
              <select
                value={sourceAsset.symbol}
                onChange={(e) => {
                  const asset = DEPOSIT_ASSETS.find(a => a.symbol === e.target.value);
                  if (asset) setSourceAsset(asset);
                }}
                className="w-full bg-[#131315] border border-[#46464c] rounded-xl text-sm p-3 font-semibold text-[#e5e2e3] focus:outline-none focus:border-[#c0c6de] transition-colors"
              >
                {DEPOSIT_ASSETS.map((asset) => (
                  <option key={asset.symbol} value={asset.symbol}>
                    {asset.name} ({asset.symbol})
                  </option>
                ))}
              </select>
            </div>

            {/* Amount Input */}
            <div className="flex flex-col gap-2">
              <label className="label-caps">Amount to Send</label>
              <div className="relative">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent border-b border-[#46464c] rounded-none text-3xl font-bold p-3 pl-0 text-[#e5e2e3] focus:outline-none focus:border-[#c0c6de] transition-colors placeholder:text-[#46464c]"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold text-[#46464c]">
                  {sourceAsset.symbol}
                </span>
              </div>
            </div>

            {/* Conversion Estimate */}
            <div className="glass-card-static p-4 flex flex-col gap-1 items-center text-center mt-2">
              <span className="label-caps text-[#909097]">You Will Receive Approx.</span>
              <div className="flex items-center gap-2 mt-1">
                {isEstimating ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#909097]" />
                ) : estimatedReceive?.startsWith("Error:") ? (
                  <span className="text-xs font-bold text-[#ffb4ab] px-2">{estimatedReceive.replace("Error: ", "")}</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold text-[#c0c6de]">{estimatedReceive || "0.00"}</span>
                    <span className="text-sm font-bold text-[#909097]">USDC (Base)</span>
                  </>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleCreateDeposit}
              disabled={isCreating || !estimatedReceive || estimatedReceive.startsWith("Error") || isEstimating}
              className="btn-primary mt-2 w-full py-4 flex items-center justify-center gap-2 disabled:bg-[#353436] disabled:text-[#909097] disabled:opacity-100"
            >
              {isCreating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating Address...</>
              ) : (
                <><RefreshCw className="w-4 h-4" /> Generate Deposit Address</>
              )}
            </button>
          </div>
        </div>
      ) : (
        // STEP 2: DEPOSIT ADDRESS & STATUS
        <div className="glass-card overflow-hidden flex flex-col">
          <div className="p-5 border-b border-[#46464c] flex items-center justify-between bg-[#201f21]/50">
            <h2 className="text-lg font-bold text-[#e5e2e3]">Send Funds</h2>
            <button onClick={() => setDepositAddress(null)} className="label-caps text-[#909097] hover:text-[#c0c6de] transition-colors">
              Cancel
            </button>
          </div>

          <div className="p-6 flex flex-col items-center gap-6 text-center">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-[#909097]">Send exactly</span>
              <span className="text-4xl font-bold tracking-tighter text-[#c0c6de]">{depositAmount} {sourceAsset.symbol}</span>
            </div>

            {/* QR Code */}
            <div className="p-4 bg-[#e5e2e3] rounded-2xl">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${depositAddress}&margin=0`} 
                alt="Deposit QR Code" 
                className="w-48 h-48 mix-blend-multiply"
              />
            </div>

            {/* Address Copy */}
            <div className="w-full flex flex-col gap-2">
              <label className="label-caps text-left">Deposit Address</label>
              <div className="flex items-center gap-2 glass-card-static rounded-xl p-1.5 pl-3">
                <code className="text-sm font-semibold text-[#e5e2e3] flex-1 truncate text-left">
                  {depositAddress}
                </code>
                <button 
                  onClick={copyAddress}
                  className="bg-[#c0c6de] hover:bg-[#cbd5e1] text-[#2a3043] px-3 py-2 text-xs font-bold rounded-lg uppercase tracking-wider transition-colors flex items-center gap-1"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-[#909097] mt-1 text-left">
                Only send {sourceAsset.symbol} on the {sourceAsset.network.toUpperCase()} network to this address.
              </p>
            </div>

            {/* Status Tracker */}
            <div className="w-full border-t border-[#46464c] pt-6 mt-2">
              <h3 className="label-caps text-left mb-4">Transaction Status</h3>
              
              <div className="relative pt-1">
                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded-full bg-[#2a2a2b]">
                  <div style={{ width: `${(getStepProgress(exchangeStatus) / 4) * 100}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-[#c0c6de] transition-all duration-500 rounded-full"></div>
                </div>
                <div className="flex justify-between text-xs">
                  <span className={getStepProgress(exchangeStatus) >= 0 ? "font-bold text-[#c0c6de]" : "text-[#909097]"}>Deposit</span>
                  <span className={getStepProgress(exchangeStatus) >= 2 ? "font-bold text-[#c0c6de]" : "text-[#909097]"}>Exchange</span>
                  <span className={getStepProgress(exchangeStatus) >= 4 ? "font-bold text-[#c0c6de]" : "text-[#909097]"}>Done</span>
                </div>
              </div>

              <div className="mt-4 p-3 glass-card-static flex items-center gap-3">
                {exchangeStatus === "settled" ? (
                  <div className="w-8 h-8 rounded-full bg-[#c0c6de] flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-[#2a3043]" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-transparent border border-[#46464c] flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-4 h-4 text-[#c0c6de] animate-spin" />
                  </div>
                )}
                <div className="flex flex-col text-left">
                  <span className="text-sm font-bold text-[#e5e2e3] capitalize">{exchangeStatus}</span>
                  <span className="text-xs text-[#909097]">{getStatusText(exchangeStatus)}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
