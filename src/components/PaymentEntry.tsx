"use client";

import { useState } from "react";
import CheckoutFlow from "./CheckoutFlow";
import { MerchantData } from "@/lib/types";

interface PaymentEntryProps {
  merchantData: MerchantData;
  onCancel: () => void;
}

export default function PaymentEntry({ merchantData, onCancel }: PaymentEntryProps) {
  const [amountStr, setAmountStr] = useState(merchantData.defaultAmount || "");
  const [showCheckout, setShowCheckout] = useState(false);
  const [mode, setMode] = useState<"fiat" | "crypto">("fiat");

  const amount = parseFloat(amountStr) || 0;
  const isUpi = merchantData.type === "upi";
  const displayName = isUpi ? merchantData.name || "Unknown Merchant" : "Crypto Wallet";
  const displayId = isUpi ? merchantData.upiId : merchantData.address;

  const handleConfirm = () => {
    if (amount > 0) {
      setShowCheckout(true);
    }
  };

  if (showCheckout) {
    return (
      <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button onClick={() => setShowCheckout(false)} className="mb-4 font-label-caps text-[12px] tracking-[0.1em] font-bold text-[#909097] hover:text-[#c0c6de] transition-colors uppercase">
          ← Back
        </button>
        <CheckoutFlow amount={amount} merchantData={merchantData} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#131315] text-[#e5e2e3] font-body-md overflow-hidden flex flex-col min-h-[100dvh]">
      <style dangerouslySetInnerHTML={{__html: `
        .glass-pane {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(226, 232, 240, 0.1);
        }
        .glass-pane-deep {
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(60px);
          -webkit-backdrop-filter: blur(60px);
          border: 1px solid rgba(226, 232, 240, 0.2);
        }
        .amount-input::placeholder {
          color: rgba(226, 232, 240, 0.2);
        }
        .glow-accent {
          box-shadow: 0 0 40px rgba(188, 199, 222, 0.1);
        }
      `}} />

      {/* Atmospheric Background Shader */}
      <div className="fixed inset-0 -z-10 bg-[#131315] overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#d8e3fb]/5 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#c0c6de]/5 blur-[120px]"></div>
      </div>

      {/* TopAppBar */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-6 md:px-16 h-24 bg-[#131315]/80 backdrop-blur-xl border-b border-[#46464c]/10">
        <button onClick={onCancel} className="flex items-center gap-2 text-[#c0c6de] hover:opacity-70 transition-all active:scale-95 group">
          <span className="material-symbols-outlined text-[28px]">arrow_back</span>
        </button>
        <h1 className="font-headline-md text-[24px] md:text-[32px] font-semibold text-[#e5e2e3] tracking-tight">Send Payment</h1>
        <button className="flex items-center text-[#c6c6cd] hover:opacity-70 transition-all active:scale-95">
          <span className="material-symbols-outlined text-[32px]">account_circle</span>
        </button>
      </nav>

      <main className="flex-grow pt-32 pb-44 px-6 md:px-16 max-w-[1440px] mx-auto w-full relative overflow-y-auto">
        <div className="max-w-3xl mr-auto lg:ml-[120px] space-y-12">
          
          {/* Recipient Card */}
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <p className="font-label-caps text-[12px] tracking-[0.1em] font-bold text-[#909097] mb-4 uppercase">Recipient</p>
            <div className="glass-pane p-6 rounded-xl flex items-center gap-6 group hover:border-[#c0c6de]/30 transition-all duration-500">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-[#bcc7de]/20 bg-white/5 flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl text-[#c0c6de]">{isUpi ? "storefront" : "wallet"}</span>
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#c0c6de] rounded-full border-4 border-[#131315] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px] text-[#2a3043] font-bold">check</span>
                </div>
              </div>
              <div className="space-y-1 truncate">
                <h2 className="font-headline-md text-2xl md:text-[32px] font-semibold text-[#bcc7de] leading-none truncate">{displayName}</h2>
                <p className="font-body-md text-[#909097] truncate">{displayId}</p>
              </div>
            </div>
          </section>

          {/* Amount Input Section */}
          <section className="space-y-8 py-8 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-150">
            <div className="flex flex-col items-start gap-2">
              <p className="font-label-caps text-[12px] tracking-[0.1em] font-bold text-[#909097] uppercase">Enter Amount</p>
              <div className="flex items-baseline gap-2 group w-full">
                <span className="font-display-xl text-[48px] md:text-[80px] font-extrabold text-[#c0c6de] opacity-50 select-none tracking-tighter">
                  {mode === "fiat" ? "₹" : "USDC"}
                </span>
                <input 
                  className="bg-transparent border-none p-0 font-display-xl text-[48px] md:text-[80px] font-extrabold text-[#e5e2e3] focus:ring-0 focus:outline-none w-full caret-[#c0c6de] selection:bg-[#c0c6de]/20 amount-input tracking-tighter" 
                  placeholder="0.00" 
                  type="number"
                  disabled={!!merchantData.defaultAmount}
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="h-px w-full bg-[#46464c]/30 group-focus-within:bg-[#c0c6de] transition-colors duration-500"></div>
            </div>
            
            {/* Toggle Control */}
            <div className="inline-flex glass-pane p-1 rounded-full w-full max-w-[320px] relative overflow-hidden">
              <div 
                className="absolute inset-y-1 w-[calc(50%-4px)] bg-[#bcc7de] rounded-full transition-all duration-500 ease-out" 
                style={{ left: mode === "fiat" ? "4px" : "calc(50% + 0px)" }}
              ></div>
              <button 
                className={`flex-1 py-3 px-6 relative z-10 font-label-caps text-[12px] tracking-[0.1em] font-bold uppercase transition-colors duration-300 ${mode === "fiat" ? "text-[#263143]" : "text-[#909097]"}`}
                onClick={() => setMode("fiat")}
              >
                Fiat
              </button>
              <button 
                className={`flex-1 py-3 px-6 relative z-10 font-label-caps text-[12px] tracking-[0.1em] font-bold uppercase transition-colors duration-300 ${mode === "crypto" ? "text-[#263143]" : "text-[#909097]"}`}
                onClick={() => setMode("crypto")}
              >
                Crypto
              </button>
            </div>
          </section>

          {/* Fee Breakdown */}
          <section className="animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
            <div className="glass-pane-deep p-8 rounded-xl space-y-4 max-w-md">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#909097] text-[20px]">speed</span>
                  <p className="font-body-md text-[#909097]">Network Fee</p>
                </div>
                <p className="font-label-caps text-[12px] tracking-[0.1em] font-bold text-[#bcc7de] uppercase">Gas: Sponsored</p>
              </div>
              <div className="flex justify-between items-center border-t border-[#46464c]/30 pt-4">
                <p className="font-body-md text-[#e5e2e3]">Total Estimation</p>
                <p className="font-body-md font-bold text-[#e5e2e3]">{mode === "fiat" ? "₹" : "$"} {amount > 0 ? amount.toFixed(2) : "0.00"}</p>
              </div>
            </div>
          </section>
          
        </div>
      </main>

      {/* Primary Action Container */}
      <footer className="fixed bottom-0 left-0 w-full p-6 md:p-8 z-[60] bg-gradient-to-t from-[#131315] via-[#131315]/95 to-transparent">
        <div className="max-w-3xl mx-auto md:ml-[120px] md:mr-auto">
          <button 
            onClick={handleConfirm}
            disabled={amount <= 0}
            className={`w-full bg-[#E2E8F0] hover:bg-white text-[#263143] font-headline-md text-2xl font-semibold py-6 rounded-xl transition-all duration-300 glow-accent flex justify-center items-center gap-4 group ${amount <= 0 ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
          >
            Review Payment
            <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform duration-300">arrow_forward</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
