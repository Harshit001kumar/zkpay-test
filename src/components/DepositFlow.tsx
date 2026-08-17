"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { DEPOSIT_ASSETS, TARGET_ASSET } from "@/lib/constants";
import { Copy, Check, Loader2, RefreshCw, ChevronDown } from "lucide-react";

export default function DepositFlow({ onBack }: { onBack?: () => void }) {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  // Step 1: Input state
  type DepositAsset = typeof DEPOSIT_ASSETS[number];
  const [sourceAsset, setSourceAsset] = useState<DepositAsset>(DEPOSIT_ASSETS[0]);
  const [depositAmount, setDepositAmount] = useState("0.01");
  const [estimatedReceive, setEstimatedReceive] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isAssetSelectOpen, setIsAssetSelectOpen] = useState(false);

  // Step 2: Deposit address state
  const [exchangeId, setExchangeId] = useState<string | null>(null);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [exchangeStatus, setExchangeStatus] = useState<string>("waiting");
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);

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
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [exchangeId, exchangeStatus]);

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4 text-[#909097] text-sm">Please connect wallet to continue.</div>;
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
          settleAddress: baseAddress,
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
      settling: "Swapping to USDC...",
      settled: "Deposit Complete",
      failed: "Failed",
      refunded: "Refunded",
      expired: "Window Expired",
    };
    return states[status] || status;
  };

  return (
    <div className="bg-[#0e0e0f] text-[#e5e2e3] font-body-md selection:bg-[#c0c6de]/30 min-h-[100dvh] relative flex flex-col z-[60] fixed inset-0 overflow-y-auto">
      <style dangerouslySetInnerHTML={{__html: `
        .obsidian-glass {
            background: rgba(255, 255, 255, 0.02);
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .silver-rim {
            box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.02), 0 0 1px rgba(255, 255, 255, 0.3);
        }
        .glass-monolith {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
            backdrop-filter: blur(60px);
            -webkit-backdrop-filter: blur(60px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-bottom: none;
            border-radius: 40px 40px 0 0;
        }
      `}} />

      {/* Top AppBar */}
      <header className="w-full z-50 flex justify-between items-center px-6 py-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="active:scale-95 transition-transform text-[#e5e2e3]">
            <span className="material-symbols-outlined text-[32px]">arrow_back</span>
          </button>
          <h1 className="font-headline-lg text-[24px] text-[#e5e2e3] tracking-tighter font-bold">Deposit Crypto</h1>
        </div>
        <div className="w-10 h-10 rounded-full obsidian-glass flex items-center justify-center silver-rim">
          <span className="material-symbols-outlined text-[#c0c6de]">person</span>
        </div>
      </header>

      {/* Minimal Asset Selector */}
      <section className="px-6 pb-6 relative z-30">
        <button 
          onClick={() => !depositAddress && setIsAssetSelectOpen(!isAssetSelectOpen)}
          className={`w-full max-w-sm mx-auto obsidian-glass silver-rim p-5 rounded-2xl flex items-center justify-between group transition-all ${depositAddress ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]'}`}
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#c0c6de]/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#c0c6de]">currency_bitcoin</span>
            </div>
            <div className="text-left">
              <p className="font-bold text-[#e5e2e3]">{sourceAsset.name}</p>
              <p className="text-[12px] text-[#c6c6cd] uppercase tracking-[0.2em] font-label-caps font-bold">{sourceAsset.network} Network</p>
            </div>
          </div>
          {!depositAddress && <ChevronDown className="w-5 h-5 text-[#c6c6cd] group-hover:text-[#c0c6de] transition-colors" />}
        </button>

        {isAssetSelectOpen && !depositAddress && (
          <div className="absolute top-full left-6 right-6 max-w-sm mx-auto mt-2 obsidian-glass silver-rim rounded-2xl overflow-hidden z-40 bg-[#0e0e0f]/90">
            {DEPOSIT_ASSETS.map(asset => (
              <button 
                key={`${asset.coin}-${asset.network}`}
                onClick={() => { setSourceAsset(asset); setIsAssetSelectOpen(false); }}
                className="w-full p-4 flex items-center gap-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 text-left"
              >
                <div className="w-8 h-8 rounded-full bg-[#c0c6de]/10 flex items-center justify-center text-[#c0c6de] text-xs font-bold">{asset.symbol[0]}</div>
                <div>
                  <p className="font-bold text-[#e5e2e3]">{asset.name}</p>
                  <p className="text-[10px] text-[#c6c6cd] uppercase tracking-[0.2em] font-bold">{asset.network} Network</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* The Glass Monolith */}
      <main className="flex-grow glass-monolith mx-0 mt-2 relative overflow-y-auto flex flex-col items-center pt-12 px-6 max-w-2xl md:mx-auto md:w-full md:rounded-t-[40px] md:border-x">
        {/* Subtle Gradient Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(192,198,222,0.08)_0%,transparent_60%)] pointer-events-none"></div>
        
        <div className="w-full max-w-sm flex flex-col items-center space-y-12 relative z-10 pb-44">
          
          {!depositAddress ? (
            // STEP 1 CONTENT
            <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-4 text-center">
                <p className="font-label-caps text-[12px] text-[#c6c6cd] uppercase tracking-[0.2em] font-bold">Amount to Send</p>
                <div className="relative inline-flex items-baseline group">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-transparent border-none text-center font-display-xl text-[64px] font-extrabold text-[#e5e2e3] focus:ring-0 p-0 w-48 tracking-tighter"
                  />
                </div>
                <p className="font-headline-md text-[#bcc7de] text-lg font-bold tracking-widest">{sourceAsset.symbol}</p>
              </div>

              <div className="bg-black/20 rounded-2xl p-6 border border-white/5 space-y-2 text-center">
                <p className="font-label-caps text-[10px] text-[#909097] uppercase tracking-[0.2em] font-bold">You will receive approx.</p>
                <div className="h-10 flex items-center justify-center">
                  {isEstimating ? (
                    <Loader2 className="w-5 h-5 animate-spin text-[#909097]" />
                  ) : estimatedReceive?.startsWith("Error:") ? (
                    <p className="text-[12px] font-bold text-[#ffb4ab]">{estimatedReceive.replace("Error: ", "")}</p>
                  ) : (
                    <p className="font-headline-md text-3xl font-bold text-[#c0c6de]">{estimatedReceive || "0.00"} <span className="text-sm text-[#909097]">USDC</span></p>
                  )}
                </div>
              </div>

              <button
                onClick={handleCreateDeposit}
                disabled={isCreating || !estimatedReceive || estimatedReceive.startsWith("Error") || isEstimating}
                className="w-full bg-[#c0c6de] text-[#131315] hover:bg-white font-headline-md text-[18px] font-bold py-5 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
              >
                {isCreating ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Generating Address</>
                ) : (
                  <><RefreshCw className="w-5 h-5" /> Generate Deposit Address</>
                )}
              </button>
            </div>
          ) : (
            // STEP 2 CONTENT
            <div className="w-full flex flex-col items-center space-y-12 animate-in fade-in slide-in-from-right-8">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-b from-white/20 to-transparent rounded-[32px] blur-sm opacity-50 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative bg-white p-6 rounded-[32px] shadow-2xl">
                  <img 
                    className="w-64 h-64 mix-blend-multiply" 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${depositAddress}&margin=0`}
                    alt="Deposit QR Code" 
                  />
                </div>
              </div>

              <div className="w-full space-y-6 text-center">
                <div className="space-y-2">
                  <p className="font-label-caps text-[12px] text-[#c6c6cd] uppercase tracking-[0.2em] font-bold">Wallet Address</p>
                  <div className="flex flex-col items-center gap-4">
                    <code className="font-mono text-xl text-white tracking-tight break-all max-w-[280px] bg-black/40 p-4 rounded-xl border border-white/10">
                      {depositAddress}
                    </code>
                    <button 
                      onClick={copyAddress}
                      className="flex items-center gap-2 px-6 py-3 rounded-full obsidian-glass silver-rim hover:bg-white/10 transition-all active:scale-95"
                    >
                      <span className={`material-symbols-outlined text-[20px] ${copied ? 'text-green-400' : 'text-[#c0c6de]'}`}>
                        {copied ? 'check' : 'content_copy'}
                      </span>
                      <span className="font-label-caps text-[#e5e2e3] uppercase tracking-widest text-[11px] font-bold">
                        {copied ? "Copied!" : "Copy Address"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/10 w-full flex items-center justify-between text-left">
                  <div>
                    <p className="font-label-caps text-[10px] text-[#909097] uppercase tracking-[0.2em] font-bold mb-1">Status</p>
                    <p className="font-headline-md text-lg text-[#e5e2e3] capitalize">{getStatusText(exchangeStatus)}</p>
                  </div>
                  {exchangeStatus === "settled" ? (
                    <div className="w-10 h-10 rounded-full bg-[#c0c6de] flex items-center justify-center">
                      <Check className="w-5 h-5 text-[#131315]" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full border-2 border-white/20 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-[#c0c6de] animate-spin" />
                    </div>
                  )}
                </div>

                <button onClick={() => {
                  setDepositAddress(null);
                  setExchangeId(null);
                  setExchangeStatus("waiting");
                }} className="text-xs text-[#909097] underline mt-4 hover:text-white transition-colors">
                  Cancel / Start Over
                </button>
              </div>

              {/* Floating Warning Toast */}
              <div className="mt-8 w-full max-w-sm mx-auto">
                <div className="bg-black/60 backdrop-blur-md border border-white/20 p-5 flex gap-4 items-start shadow-2xl rounded-2xl">
                  <span className="material-symbols-outlined text-[#c0c6de] flex-shrink-0">info</span>
                  <p className="text-[13px] text-[#e5e2e3] leading-relaxed">
                    Only send <span className="text-white font-bold">{sourceAsset.symbol} ({sourceAsset.network.toUpperCase()})</span> to this address. Other assets will be lost forever.
                  </p>
                </div>
              </div>

            </div>
          )}

        </div>
      </main>
    </div>
  );
}
