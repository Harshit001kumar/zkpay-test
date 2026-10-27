"use client";

import React, { useState } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import { SupportedCurrency, CURRENCY_CONFIGS } from "@/lib/types";
import { Check, Globe, Sparkles, X, ChevronRight, ShieldCheck } from "lucide-react";

interface CurrencyModalProps {
  mode: "onboarding" | "selector";
  onClose?: () => void;
}

export default function CurrencyModal({ mode, onClose }: CurrencyModalProps) {
  const { 
    currency, 
    setCurrency, 
    isOnboardingOpen, 
    setIsOnboardingOpen,
    isSelectorOpen,
    setIsSelectorOpen 
  } = useCurrency();

  const [selected, setSelected] = useState<SupportedCurrency>(currency);

  const isOpen = mode === "onboarding" ? isOnboardingOpen : isSelectorOpen;

  if (!isOpen) return null;

  const handleClose = () => {
    if (mode === "onboarding") {
      setIsOnboardingOpen(false);
    } else {
      setIsSelectorOpen(false);
    }
    if (onClose) onClose();
  };

  const handleConfirm = () => {
    setCurrency(selected);
    handleClose();
  };

  const currencies: SupportedCurrency[] = ["INR", "BRL", "USD"];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      {/* Click outside to close (only in selector mode, onboarding requires explicit choice or dismiss) */}
      <div 
        className="absolute inset-0" 
        onClick={mode === "selector" ? handleClose : undefined} 
      />

      <div className="relative w-full max-w-lg bg-[#18181b] border-t sm:border border-white/15 rounded-t-[32px] sm:rounded-[32px] p-6 sm:p-8 shadow-2xl overflow-hidden z-10 animate-in slide-in-from-bottom-6 duration-300">
        
        {/* Decorative Top Accent Bar */}
        <div className="sm:hidden w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6" />

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#c0c6de] animate-pulse" />
              <span className="font-label-caps text-[10px] text-[#c0c6de] font-bold tracking-[0.2em] uppercase">
                {mode === "onboarding" ? "Welcome to ZkPay" : "Preferences"}
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {mode === "onboarding" ? "Select Default Currency" : "Change Currency"}
            </h2>
            <p className="text-xs text-[#909097] leading-relaxed">
              {mode === "onboarding" 
                ? "Choose your primary fiat rail for scan-and-pay & instant cashouts. You can change this anytime in your Profile."
                : "Select the currency rail used by default across Scan & Pay and Cashout."}
            </p>
          </div>

          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-white/10 text-[#909097] hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Currency Options */}
        <div className="space-y-3 mb-8">
          {currencies.map((code) => {
            const config = CURRENCY_CONFIGS[code];
            const isCurrent = selected === code;

            return (
              <button
                key={code}
                type="button"
                onClick={() => setSelected(code)}
                className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between group ${
                  isCurrent
                    ? "bg-[#c0c6de]/10 border-[#c0c6de] shadow-lg shadow-[#c0c6de]/5"
                    : "bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-2xl shrink-0">
                    {config.flag}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-white">{config.code}</span>
                      <span className="text-xs text-[#c0c6de] font-mono font-semibold">({config.symbol})</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-[#c6c6cd]">
                        {config.rail}
                      </span>
                    </div>
                    <div className="text-xs text-[#909097] mt-0.5">
                      {config.name} • {config.provider === "p2pkit" ? "P2PKit" : "Peer.xyz"}
                    </div>
                    <div className="text-[11px] text-[#71717a] mt-0.5">
                      {config.railDescription}
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                      isCurrent
                        ? "bg-[#c0c6de] border-[#c0c6de] text-[#18181b]"
                        : "border-white/20 group-hover:border-white/40"
                    }`}
                  >
                    {isCurrent && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Protocol Trust Badge */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-[#909097] mb-6 py-2 px-3 rounded-full bg-white/[0.02] border border-white/5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Non-custodial Base USDC settlement via P2PKit & Peer.xyz</span>
        </div>

        {/* Action Button */}
        <button
          onClick={handleConfirm}
          className="w-full py-4 rounded-xl bg-[#c0c6de] hover:bg-[#d8e3fb] text-[#131315] font-bold text-sm tracking-wide transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-xl shadow-[#c0c6de]/10"
        >
          <span>
            {mode === "onboarding" ? `Set ${CURRENCY_CONFIGS[selected].code} as Default` : "Confirm Selection"}
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
