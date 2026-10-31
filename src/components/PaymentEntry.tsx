"use client";

import { useState } from "react";
import CheckoutFlow from "./CheckoutFlow";
import { MerchantData, CURRENCY_CONFIGS, SupportedCurrency } from "@/lib/types";
import { useCurrency } from "@/context/CurrencyContext";

interface PaymentEntryProps {
  merchantData: MerchantData;
  onCancel: () => void;
}

export default function PaymentEntry({ merchantData, onCancel }: PaymentEntryProps) {
  const { currency, currencyMeta } = useCurrency();
  const [amountStr, setAmountStr] = useState(merchantData.defaultAmount || "");
  const [showCheckout, setShowCheckout] = useState(false);
  const [mode, setMode] = useState<"fiat" | "crypto">("fiat");

  // Determine active currency for this payment (from merchantData if detected, or default preference)
  const activeCurrencyCode: SupportedCurrency = (merchantData.currency || currency) as SupportedCurrency;
  const activeCurrency = CURRENCY_CONFIGS[activeCurrencyCode] || currencyMeta;

  const amount = parseFloat(amountStr) || 0;
  const isFiatRail = merchantData.type === "upi" || merchantData.type === "pix" || merchantData.type === "paypal";
  
  const displayName = merchantData.name || (
    merchantData.type === "upi" ? "UPI Merchant" :
    merchantData.type === "pix" ? "Pix Merchant" :
    merchantData.type === "paypal" ? "PayPal Recipient" : "Crypto Wallet"
  );

  const displayId = merchantData.paymentId || merchantData.upiId || merchantData.pixKey || merchantData.paypalId || merchantData.address;

  const handleConfirm = () => {
    if (amount > 0) {
      setShowCheckout(true);
    }
  };

  if (showCheckout) {
    return (
      <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button onClick={() => setShowCheckout(false)} className="mb-4 font-label-caps text-[12px] tracking-normal font-bold text-outline hover:text-primary transition-colors ">
          ← Back
        </button>
        <CheckoutFlow amount={amount} merchantData={merchantData} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-surface text-on-surface font-body-md overflow-hidden flex flex-col min-h-[100dvh]">
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
      <div className="fixed inset-0 -z-10 bg-surface overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-secondary-fixed/5 blur-xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-xl"></div>
      </div>

      {/* TopAppBar */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-6 md:px-16 h-24 bg-surface/80  border-b border-outline-variant/10">
        <button onClick={onCancel} className="flex items-center gap-2 text-primary hover:opacity-70 transition-colors active:scale-95 group">
          <span className="material-symbols-outlined text-[28px]">arrow_back</span>
        </button>
        <h1 className="font-headline-md text-[24px] md:text-[32px] font-semibold text-on-surface tracking-tight">Send Payment</h1>
        <button className="flex items-center text-on-surface-variant hover:opacity-70 transition-colors active:scale-95">
          <span className="material-symbols-outlined text-[32px]">account_circle</span>
        </button>
      </nav>

      <main className="flex-grow pt-32 pb-44 px-6 md:px-16 max-w-[1440px] mx-auto w-full relative overflow-y-auto">
        <div className="max-w-3xl mr-auto lg:ml-[120px] space-y-12">
          
          {/* Recipient Card */}
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-sm font-medium text-outline mb-4">Recipient</h2>
            <div className="glass-pane p-6 rounded-xl flex items-center gap-6 group hover:border-primary/30 transition-colors duration-500">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-secondary/20 bg-white/5 flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl text-primary">
                    {merchantData.type === "upi" ? "storefront" : 
                     merchantData.type === "pix" ? "qr_code_2" : 
                     merchantData.type === "paypal" ? "account_balance_wallet" : "wallet"}
                  </span>
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full border-4 border-surface flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px] text-on-primary font-bold">check</span>
                </div>
              </div>
              <div className="space-y-1 truncate">
                <div className="flex items-center gap-2">
                  <p className="font-headline-md text-2xl md:text-[32px] font-semibold text-secondary leading-none truncate">{displayName}</p>
                  {activeCurrency.flag && <span className="text-sm">{activeCurrency.flag}</span>}
                </div>
                <p className="font-body-md text-outline truncate">{displayId}</p>
              </div>
            </div>
          </section>

          {/* Amount Input Section */}
          <section className="space-y-8 py-8 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-150">
            <div className="flex flex-col items-start gap-2">
              <p className="font-label-caps text-[12px] tracking-normal font-bold text-outline ">Enter Amount</p>
              <div className="flex items-baseline gap-2 group w-full">
                <span className="font-display-xl text-[48px] md:text-[80px] font-extrabold text-primary opacity-50 select-none tracking-tighter">
                  {mode === "fiat" ? activeCurrency.symbol : "USDC"}
                </span>
                <input 
                  className="bg-transparent border-none p-0 font-display-xl text-[48px] md:text-[80px] font-extrabold text-on-surface focus:ring-0 focus:outline-none w-full caret-primary selection:bg-primary/20 amount-input tracking-tighter" 
                  placeholder="0.00" 
                  type="number"
                  disabled={!!merchantData.defaultAmount}
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="h-px w-full bg-outline-variant/30 group-focus-within:bg-primary transition-colors duration-500"></div>
            </div>
            
            {/* Toggle Control */}
            <div className="inline-flex glass-pane p-1 rounded-full w-full max-w-[320px] relative overflow-hidden">
              <div 
                className="absolute inset-y-1 w-[calc(50%-4px)] bg-secondary rounded-full transition-colors duration-500 ease-out" 
                style={{ left: mode === "fiat" ? "4px" : "calc(50% + 0px)" }}
              ></div>
              <button 
                className={`flex-1 py-3 px-6 relative z-10 font-label-caps text-[12px] tracking-normal font-bold  transition-colors duration-300 ${mode === "fiat" ? "text-on-secondary" : "text-outline"}`}
                onClick={() => setMode("fiat")}
              >
                Fiat
              </button>
              <button 
                className={`flex-1 py-3 px-6 relative z-10 font-label-caps text-[12px] tracking-normal font-bold  transition-colors duration-300 ${mode === "crypto" ? "text-on-secondary" : "text-outline"}`}
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
                  <span className="material-symbols-outlined text-outline text-[20px]">speed</span>
                  <p className="font-body-md text-outline">Network Fee</p>
                </div>
                <p className="font-label-caps text-[12px] tracking-normal font-bold text-secondary ">Gas: Sponsored</p>
              </div>
              <div className="flex justify-between items-center border-t border-outline-variant/30 pt-4">
                <p className="font-body-md text-on-surface">Total Estimation</p>
                <p className="font-body-md font-bold text-on-surface">{mode === "fiat" ? "₹" : "$"} {amount > 0 ? amount.toFixed(2) : "0.00"}</p>
              </div>
            </div>
          </section>
          
        </div>
      </main>

      {/* Primary Action Container */}
      <footer className="fixed bottom-0 left-0 w-full p-6 md:p-8 z-[60] bg-gradient-to-t from-surface via-surface/95 to-transparent">
        <div className="max-w-3xl mx-auto md:ml-[120px] md:mr-auto">
          <button 
            onClick={handleConfirm}
            disabled={amount <= 0}
            className={`w-full bg-on-surface hover:bg-white text-on-secondary font-headline-md text-2xl font-semibold py-6 rounded-xl transition-colors duration-300 glow-accent flex justify-center items-center gap-4 group whitespace-nowrap ${amount <= 0 ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
          >
            Review Payment
            <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform duration-300">arrow_forward</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
