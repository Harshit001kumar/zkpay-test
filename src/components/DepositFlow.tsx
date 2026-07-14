"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { DEPOSIT_ASSETS, TARGET_ASSET } from "@/lib/constants";
import { Copy, Check, ArrowRight, Loader2, RefreshCw } from "lucide-react";

export default function DepositFlow() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  // Step 1: Input state
  const [sourceAsset, setSourceAsset] = useState(DEPOSIT_ASSETS[0]);
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
          `/api/exchange/estimate?fromCurrency=${sourceAsset.ticker}&toCurrency=${TARGET_ASSET.ticker}&fromAmount=${depositAmount}`
        );
        const data = await res.json();
        if (data.estimatedAmount) {
          setEstimatedReceive(data.estimatedAmount.toString());
        } else {
          setEstimatedReceive("Error");
        }
      } catch (err) {
        setEstimatedReceive("Error");
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
    if (exchangeId && exchangeStatus !== "finished" && exchangeStatus !== "failed") {
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
          fromCurrency: sourceAsset.ticker,
          toCurrency: TARGET_ASSET.ticker,
          fromNetwork: sourceAsset.network,
          toNetwork: TARGET_ASSET.network,
          fromAmount: depositAmount,
          address: baseAddress, // Send to our embedded wallet
        }),
      });
      const data = await res.json();
      if (data.id && data.payinAddress) {
        setExchangeId(data.id);
        setDepositAddress(data.payinAddress);
        setExchangeStatus("waiting");
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
      waiting: "Waiting for deposit...",
      confirming: "Confirming on blockchain...",
      exchanging: "Swapping to USDC...",
      sending: "Sending to your Base wallet...",
      finished: "Deposit Complete!",
      failed: "Deposit Failed",
      refunded: "Refunded",
    };
    return states[status] || status;
  };

  const getStepProgress = (status: string) => {
    const steps = ["waiting", "confirming", "exchanging", "sending", "finished"];
    const index = steps.indexOf(status);
    return index >= 0 ? index : 0;
  };

  return (
    <div className="flex flex-col gap-6">
      {!depositAddress ? (
        // STEP 1: CREATE DEPOSIT
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <h2 className="text-lg font-bold font-['Inter'] text-black">Cross-Chain Deposit</h2>
            <span className="text-[10px] font-bold tracking-wider text-gray-500 uppercase font-['Geist']">Step 1 of 2</span>
          </div>

          <div className="p-5 flex flex-col gap-5">
            {/* Asset Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-700 tracking-wider uppercase font-['Geist']">Deposit Asset</label>
              <select
                value={sourceAsset.symbol}
                onChange={(e) => {
                  const asset = DEPOSIT_ASSETS.find(a => a.symbol === e.target.value);
                  if (asset) setSourceAsset(asset);
                }}
                className="w-full border border-gray-200 rounded text-sm p-3 font-medium bg-white focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-colors"
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
              <label className="text-xs font-bold text-gray-700 tracking-wider uppercase font-['Geist']">Amount to Send</label>
              <div className="relative">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded text-lg p-3 font-mono bg-white focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 font-mono">
                  {sourceAsset.symbol}
                </span>
              </div>
            </div>

            {/* Conversion Estimate */}
            <div className="bg-gray-50 rounded border border-gray-100 p-4 flex flex-col gap-1 items-center text-center mt-2">
              <span className="text-xs font-semibold text-gray-500 font-['Geist'] uppercase tracking-wider">You Will Receive Approx.</span>
              <div className="flex items-center gap-2 mt-1">
                {isEstimating ? (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                ) : (
                  <span className="text-2xl font-bold font-mono text-black">{estimatedReceive || "0.00"}</span>
                )}
                <span className="text-sm font-bold text-gray-600 font-['Inter']">USDC (Base)</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleCreateDeposit}
              disabled={isCreating || !estimatedReceive || estimatedReceive === "Error" || isEstimating}
              className="mt-2 w-full bg-black text-white py-4 rounded font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-['Geist']"
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
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <h2 className="text-lg font-bold font-['Inter'] text-black">Send Funds</h2>
            <button onClick={() => setDepositAddress(null)} className="text-[10px] font-bold tracking-wider text-gray-500 hover:text-black uppercase font-['Geist'] transition-colors">
              Cancel
            </button>
          </div>

          <div className="p-6 flex flex-col items-center gap-6 text-center">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-500 font-['Inter']">Send exactly</span>
              <span className="text-2xl font-bold font-mono text-black">{depositAmount} {sourceAsset.symbol}</span>
            </div>

            {/* QR Code */}
            <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${depositAddress}&margin=0`} 
                alt="Deposit QR Code" 
                className="w-48 h-48"
              />
            </div>

            {/* Address Copy */}
            <div className="w-full flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-700 tracking-wider uppercase font-['Geist'] text-left">Deposit Address</label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md p-1.5 pl-3">
                <code className="text-[13px] font-mono text-gray-700 flex-1 truncate font-['Geist'] text-left">
                  {depositAddress}
                </code>
                <button 
                  onClick={copyAddress}
                  className="bg-white border border-gray-200 hover:bg-gray-50 text-black px-3 py-1.5 text-xs font-bold rounded uppercase tracking-wider transition-colors font-['Geist'] flex items-center gap-1"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1 font-['Hanken_Grotesk'] text-left">
                Only send {sourceAsset.symbol} on the {sourceAsset.network.toUpperCase()} network to this address.
              </p>
            </div>

            {/* Status Tracker */}
            <div className="w-full border-t border-gray-100 pt-6 mt-2">
              <h3 className="text-xs font-bold text-gray-700 tracking-wider uppercase font-['Geist'] text-left mb-4">Transaction Status</h3>
              
              <div className="relative pt-1">
                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-100">
                  <div style={{ width: `${(getStepProgress(exchangeStatus) / 4) * 100}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-black transition-all duration-500"></div>
                </div>
                <div className="flex justify-between text-xs font-['Inter']">
                  <span className={getStepProgress(exchangeStatus) >= 0 ? "font-bold text-black" : "text-gray-400"}>Deposit</span>
                  <span className={getStepProgress(exchangeStatus) >= 2 ? "font-bold text-black" : "text-gray-400"}>Exchange</span>
                  <span className={getStepProgress(exchangeStatus) >= 4 ? "font-bold text-black" : "text-gray-400"}>Done</span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-100 flex items-center gap-3">
                {exchangeStatus === "finished" ? (
                  <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-4 h-4 text-black animate-spin" />
                  </div>
                )}
                <div className="flex flex-col text-left">
                  <span className="text-sm font-bold text-black font-['Inter'] capitalize">{exchangeStatus}</span>
                  <span className="text-xs text-gray-500 font-['Hanken_Grotesk']">{getStatusText(exchangeStatus)}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
