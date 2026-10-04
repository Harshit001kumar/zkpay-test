"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Zap, 
  ShieldCheck, 
  Volume2, 
  RotateCcw, 
  ArrowRight, 
  ExternalLink, 
  QrCode, 
  CheckCircle2, 
  Sparkles,
  Layers,
  Coffee,
  ShoppingBag,
  Fuel,
  Utensils,
  Laptop
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { CountUp } from "@/components/ui/CountUp";

interface SettlementSimulatorProps {
  onLaunchApp: () => void;
}

interface Scenario {
  id: string;
  name: string;
  category: string;
  icon: React.ElementType;
  inrAmount: number;
  merchantName: string;
  merchantUpi: string;
  soundboxProvider: "Paytm" | "PhonePe" | "Google Pay" | "BHIM";
  soundboxChime: string;
  latencySeconds: number;
  txHash: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "chai",
    name: "Tapri Chai & Bun Maska",
    category: "Street Vendor",
    icon: Coffee,
    inrAmount: 30,
    merchantName: "Sharma Tea Point",
    merchantUpi: "sharma.tea@paytm",
    soundboxProvider: "Paytm",
    soundboxChime: "Paytm par ₹30 prapt hue!",
    latencySeconds: 0.38,
    txHash: "0x89c1...4e1b",
  },
  {
    id: "food",
    name: "Swiggy Daily Lunch",
    category: "Online Order",
    icon: Utensils,
    inrAmount: 320,
    merchantName: "Swiggy Delivery Partner",
    merchantUpi: "swiggy.orders@icici",
    soundboxProvider: "PhonePe",
    soundboxChime: "PhonePe par ₹320 prapt hue!",
    latencySeconds: 0.44,
    txHash: "0x3f1a...7b82",
  },
  {
    id: "groceries",
    name: "Fresh Supermarket",
    category: "Retail Grocery",
    icon: ShoppingBag,
    inrAmount: 950,
    merchantName: "Nature's Basket Store #12",
    merchantUpi: "naturesbasket@okhdfcbank",
    soundboxProvider: "Google Pay",
    soundboxChime: "Payment of ₹950 received via Google Pay!",
    latencySeconds: 0.41,
    txHash: "0x5d92...9e44",
  },
  {
    id: "fuel",
    name: "HP Fuel Station",
    category: "Fuel & Transit",
    icon: Fuel,
    inrAmount: 1800,
    merchantName: "HP Auto Care Pump #44",
    merchantUpi: "hpautocare@paytm",
    soundboxProvider: "Paytm",
    soundboxChime: "Paytm par ₹1,800 prapt hue!",
    latencySeconds: 0.46,
    txHash: "0x2c77...11a9",
  },
  {
    id: "dev",
    name: "Freelance UI Delivery",
    category: "Direct Payout",
    icon: Laptop,
    inrAmount: 7500,
    merchantName: "Aarav Gupta (Designer)",
    merchantUpi: "aaravgupta@axisbank",
    soundboxProvider: "BHIM",
    soundboxChime: "BHIM UPI: ₹7,500 credited to account!",
    latencySeconds: 0.52,
    txHash: "0x7e88...ff33",
  },
];

const USDC_INR_RATE = 87.5;

export function SettlementSimulator({ onLaunchApp }: SettlementSimulatorProps) {
  const [activeScenarioId, setActiveScenarioId] = useState<string>("food");
  const [customInr, setCustomInr] = useState<string>("");
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simStep, setSimStep] = useState<number>(3); // 1: escrow, 2: zkVerify, 3: soundbox
  const [audioPulsing, setAudioPulsing] = useState<boolean>(true);

  const selectedScenario = SCENARIOS.find((s) => s.id === activeScenarioId) || SCENARIOS[1];
  const activeInr = customInr ? Math.max(1, Number(customInr) || 0) : selectedScenario.inrAmount;
  
  const rawUsdc = activeInr / USDC_INR_RATE;
  const protocolFeeUsdc = rawUsdc * 0.01;
  const totalDebitUsdc = rawUsdc + protocolFeeUsdc;

  const triggerSimulation = (scenarioId?: string) => {
    if (scenarioId) {
      setActiveScenarioId(scenarioId);
      setCustomInr("");
    }
    setIsSimulating(true);
    setSimStep(1);
    setAudioPulsing(false);

    // Step 1: Base Escrow
    const t1 = setTimeout(() => {
      setSimStep(2);
    }, 280);

    // Step 2: zkProof & Settlement
    const t2 = setTimeout(() => {
      setSimStep(3);
      setIsSimulating(false);
      setAudioPulsing(true);
    }, 620);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  };

  // Re-trigger pulse animation when scenario changes
  useEffect(() => {
    setAudioPulsing(true);
  }, [activeScenarioId]);

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">
      {/* Section Header */}
      <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-3 max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[10px] font-mono tracking-widest text-[#c0c6de] uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>Real-Time Settlement Simulator • ReactBits Inspired</span>
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
          Watch crypto settle to UPI in{" "}
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-400 bg-clip-text text-transparent">
            under 0.5s.
          </span>
        </h2>
        <p className="text-sm sm:text-base text-[#909097] leading-relaxed">
          Test real-world transactions below. From Base L2 smart contract escrow to instant merchant soundbox audio announcement — with zero FX markups and zero KYC under $100.
        </p>
      </div>

      {/* Main Dual-Console Hardware Shell */}
      <div className="relative rounded-[2.5rem] p-2 sm:p-2.5 bg-white/[0.02] border border-white/10 ring-1 ring-white/5 shadow-[0_30px_90px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Animated Perimeter Glow (ReactBits Border Trail) */}
        <div className="absolute -inset-[100%] pointer-events-none opacity-40 bg-[conic-gradient(from_0deg,transparent_0_340deg,#c0c6de_360deg)] animate-[spin_8s_linear_infinite]" />

        <SpotlightCard className="relative rounded-[calc(2.5rem-0.625rem)] bg-[#0e0e10]/95 backdrop-blur-2xl border border-white/10 p-6 sm:p-8 lg:p-10 flex flex-col gap-8 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
          {/* Top Bar: Interactive Scenario Tabs & Custom Input */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-5">
              <div className="flex items-center gap-2 text-xs font-mono text-[#909097] uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-[#c0c6de]" />
                <span>Select Everyday Transaction Scenario</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono text-emerald-400">
                  Oracle Rate: 1 USDC = ₹{USDC_INR_RATE.toFixed(2)}
                </span>
                <button
                  onClick={() => triggerSimulation()}
                  disabled={isSimulating}
                  className="px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] font-mono text-[#c6c6cd] hover:text-white transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <RotateCcw className={`w-3 h-3 ${isSimulating ? "animate-spin text-[#c0c6de]" : ""}`} />
                  <span>Replay Rail</span>
                </button>
              </div>
            </div>

            {/* Scenario Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {SCENARIOS.map((sc) => {
                const IconComponent = sc.icon;
                const isSelected = !customInr && activeScenarioId === sc.id;
                return (
                  <button
                    key={sc.id}
                    onClick={() => triggerSimulation(sc.id)}
                    className={`p-3 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group flex flex-col justify-between gap-3 ${
                      isSelected
                        ? "bg-white/[0.08] border-white/30 text-white shadow-lg shadow-black/40 scale-[1.02]"
                        : "bg-white/[0.02] border-white/10 text-[#909097] hover:border-white/20 hover:text-[#e5e2e3]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        isSelected ? "bg-white/20 text-white" : "bg-white/5 text-[#c0c6de] group-hover:bg-white/10"
                      }`}>
                        <IconComponent className="w-4 h-4" strokeWidth={1.5} />
                      </div>
                      <span className="font-mono text-xs font-bold text-white">₹{sc.inrAmount}</span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[11px] font-medium tracking-tight text-white/90 truncate">
                        {sc.name.split(" ")[0]} {sc.name.split(" ")[1] || ""}
                      </span>
                      <span className="font-mono text-[10px] text-[#909097]">
                        ${(sc.inrAmount / USDC_INR_RATE).toFixed(2)} USDC
                      </span>
                    </div>

                    {isSelected && (
                      <motion.div
                        layoutId="activePillGlow"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#c0c6de] to-transparent"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom Amount Mini-Input */}
            <div className="relative mt-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sm text-[#909097]">₹</span>
              <input
                type="number"
                placeholder="Or test your custom INR amount (e.g. 500, 2000)..."
                value={customInr}
                onChange={(e) => {
                  setCustomInr(e.target.value);
                  triggerSimulation();
                }}
                className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-xs font-mono text-white placeholder:text-[#909097]/60 focus:outline-none focus:border-[#c0c6de]/50 transition-colors"
              />
            </div>
          </div>

          {/* Dual Engine Display: Cryptographic Pipeline (Left) & Soundbox Telemetry (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Console: Cryptographic Pipeline (7 cols) */}
            <div className="lg:col-span-7 rounded-2xl bg-black/40 border border-white/10 p-5 sm:p-6 flex flex-col justify-between gap-6 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#0052FF]" />
                  <span className="font-mono text-xs font-bold text-white tracking-wider uppercase">
                    Base L2 Smart Escrow Rail
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[#909097]">Chain ID: 8453</span>
              </div>

              {/* Step Sequence Visualization */}
              <div className="space-y-4">
                {/* Step 1 */}
                <div className={`p-3.5 rounded-xl border transition-all duration-300 flex items-start gap-3.5 ${
                  simStep >= 1 ? "bg-white/[0.04] border-white/20" : "bg-white/[0.01] border-white/5 opacity-50"
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold mt-0.5 ${
                    simStep >= 1 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-[#909097]"
                  }`}>
                    {simStep > 1 ? "✓" : "1"}
                  </div>
                  <div className="flex flex-col flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">USDC Escrow Lock</span>
                      <span className="text-[10px] font-mono text-emerald-400">Gas: &lt; $0.001</span>
                    </div>
                    <p className="text-[11px] text-[#909097] mt-0.5">
                      Native USDC locked inside ZkPay Base Diamond Contract (<code className="text-[#c0c6de]">{selectedScenario.txHash}</code>)
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className={`p-3.5 rounded-xl border transition-all duration-300 flex items-start gap-3.5 ${
                  simStep >= 2 ? "bg-white/[0.04] border-white/20" : "bg-white/[0.01] border-white/5 opacity-50"
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold mt-0.5 ${
                    simStep >= 2 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-[#909097]"
                  }`}>
                    {simStep > 2 ? "✓" : "2"}
                  </div>
                  <div className="flex flex-col flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Zero-Knowledge Non-Custodial Check</span>
                      <span className="text-[10px] font-mono text-[#c0c6de]">zkProof Validated</span>
                    </div>
                    <p className="text-[11px] text-[#909097] mt-0.5">
                      Amount is within the no-KYC tier floor ($100). No identity credentials or bank account leaked.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className={`p-3.5 rounded-xl border transition-all duration-300 flex items-start gap-3.5 ${
                  simStep >= 3 ? "bg-white/[0.04] border-emerald-500/30 bg-emerald-500/[0.02]" : "bg-white/[0.01] border-white/5 opacity-50"
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold mt-0.5 ${
                    simStep >= 3 ? "bg-emerald-400 text-[#131315]" : "bg-white/5 text-[#909097]"
                  }`}>
                    {simStep >= 3 ? "✓" : "3"}
                  </div>
                  <div className="flex flex-col flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Instant NPCI UPI Dispatch</span>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">SETTLED IN {selectedScenario.latencySeconds}s</span>
                    </div>
                    <p className="text-[11px] text-[#909097] mt-0.5">
                      Direct fiat credit dispatched to VPA <code className="text-[#c0c6de]">{selectedScenario.merchantUpi}</code>
                    </p>
                  </div>
                </div>
              </div>

              {/* Financial Metrics Strip */}
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs font-mono">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#909097] uppercase">Merchant INR</span>
                  <span className="text-white font-bold text-sm">₹{activeInr.toLocaleString()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#909097] uppercase">Fee (1%)</span>
                  <span className="text-[#c0c6de] font-bold text-sm">${protocolFeeUsdc.toFixed(2)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#909097] uppercase">USDC Debit</span>
                  <span className="text-emerald-400 font-bold text-sm">${totalDebitUsdc.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Right Console: The Physical Soundbox Experience (5 cols) */}
            <div className="lg:col-span-5 rounded-2xl bg-gradient-to-b from-[#18181b] via-[#121214] to-[#0c0c0e] border border-white/15 p-6 flex flex-col justify-between gap-6 relative shadow-2xl overflow-hidden">
              {/* Speaker Acoustic Mesh Accent */}
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#c0c6de]">
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white tracking-tight">Merchant Soundbox HUD</span>
                    <span className="text-[10px] font-mono text-[#909097]">{selectedScenario.soundboxProvider} Official Audio</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>ONLINE</span>
                </div>
              </div>

              {/* Soundbox Speaker Perforation & Dynamic Audio Waveform (ReactBits Inspired) */}
              <div className="flex flex-col items-center justify-center gap-4 py-4">
                {/* Speaker Grille Pattern */}
                <div className="w-20 h-20 rounded-full bg-black/60 border border-white/15 flex items-center justify-center p-3 relative shadow-[inset_0_4px_12px_rgba(0,0,0,0.9)]">
                  {/* Pulsing Concentric Sound Waves */}
                  {audioPulsing && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0.8 }}
                      animate={{ scale: 1.4, opacity: 0 }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                      className="absolute inset-0 rounded-full border border-emerald-400/40 pointer-events-none"
                    />
                  )}
                  <div className="w-full h-full rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
                    <Volume2 className="w-6 h-6 text-white" />
                  </div>
                </div>

                {/* ReactBits Dynamic Audio EQ Waveform */}
                <div className="flex items-center gap-1 h-8 px-4 py-1 rounded-full bg-black/50 border border-white/10">
                  {[12, 24, 18, 28, 16, 26, 32, 22, 14, 25, 20, 16, 24, 10].map((h, i) => (
                    <motion.span
                      key={i}
                      animate={audioPulsing ? {
                        height: [h * 0.4, h, h * 0.3],
                        opacity: [0.5, 1, 0.6]
                      } : { height: 4, opacity: 0.3 }}
                      transition={{
                        duration: 0.6 + (i % 3) * 0.2,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut",
                        delay: i * 0.05
                      }}
                      className="w-1 bg-gradient-to-t from-emerald-500 via-[#c0c6de] to-white rounded-full inline-block"
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>

                {/* Audio Voice Chime Readout */}
                <div className="w-full p-4 rounded-xl bg-black/60 border border-emerald-500/25 flex flex-col items-center text-center gap-1.5 shadow-inner">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#909097]">
                    🔊 Verified Audio Broadcast
                  </span>
                  <span className="text-sm font-semibold text-white tracking-wide">
                    &ldquo;{selectedScenario.soundboxChime}&rdquo;
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    Recipient: {selectedScenario.merchantName} ({selectedScenario.merchantUpi})
                  </span>
                </div>
              </div>

              {/* Execution CTA Button */}
              <button
                onClick={onLaunchApp}
                className="w-full rounded-full pl-6 pr-2 py-2.5 bg-[#e5e2e3] text-[#131315] font-bold text-xs uppercase tracking-wider hover:bg-white transition-all duration-300 shadow-[0_10px_25px_rgba(229,226,227,0.18)] active:scale-[0.98] group flex items-center justify-between"
              >
                <span>SCAN UPI QR &amp; PAY NOW</span>
                <div className="w-8 h-8 rounded-full bg-[#131315] text-white flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1 shadow-sm">
                  <QrCode className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
                </div>
              </button>
            </div>
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}
