"use client";

import { ScanLine, ArrowRightLeft, Globe, Zap, ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";

function useInView(options = { threshold: 0.5 }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  // Memoize options to prevent unnecessary re-renders in useEffect
  const optionsMemo = useMemo(() => options, [options.threshold]);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
    }, optionsMemo);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [optionsMemo]);

  return { ref, isInView };
}

export default function LandingPage({ login }: { login: () => void }) {
  const { ref: ref1, isInView: inView1 } = useInView({ threshold: 0.5 });
  const { ref: ref2, isInView: inView2 } = useInView({ threshold: 0.5 });
  const { ref: ref3, isInView: inView3 } = useInView({ threshold: 0.5 });

  return (
    <div className="min-h-screen bg-[#131315] text-[#e5e2e3] font-sans overflow-x-hidden">
      
      {/* Navigation — Frosted Glass */}
      <nav className="fixed top-0 left-0 right-0 p-6 flex justify-between items-center bg-[#131315]/80 backdrop-blur-glass z-50 border-b border-[#46464c]">
        <div className="text-xl font-bold tracking-tighter">
          <span className="text-[#c0c6de]">Zk</span>Pay
        </div>
        <button 
          onClick={login}
          className="text-sm font-semibold text-[#c6c6cd] hover:text-[#e5e2e3] transition-colors"
        >
          Login
        </button>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 flex flex-col items-center text-center max-w-4xl mx-auto min-h-[80vh] justify-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card-static text-xs font-semibold mb-8 animate-fade-in-up text-[#c0c6de]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Live on Base
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter leading-[1.1] mb-6 animate-fade-in-up text-[#e5e2e3]" style={{ animationDelay: '0.1s' }}>
          Crypto to Fiat.<br />
          <span className="text-[#c0c6de]">Seamlessly.</span>
        </h1>
        
        <p className="text-[#909097] text-lg md:text-xl max-w-2xl mb-10 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          Scan any UPI QR code and pay instantly using your crypto balance. Zero knowledge proofs ensure your transactions are private and secure.
        </p>
        
        <button 
          onClick={login}
          className="group relative inline-flex items-center justify-center gap-2 bg-[#E2E8F0] text-[#2a3043] px-8 py-4 rounded-full font-bold text-lg hover:bg-[#cbd5e1] transition-all active:scale-95 animate-fade-in-up"
          style={{ animationDelay: '0.3s' }}
        >
          Connect Wallet
          <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </section>

      {/* Abstract Scroll Divider */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-[#46464c] to-transparent my-10"></div>

      {/* Features Showcase */}
      <section className="py-24 px-6 max-w-5xl mx-auto">
        
        {/* Feature 1: Scan & Pay */}
        <div ref={ref1} className="flex flex-col md:flex-row items-center gap-16 mb-32">
          <div className="flex-1 space-y-6">
            <div className="w-12 h-12 glass-card flex items-center justify-center text-[#c0c6de]">
              <ScanLine size={24} />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#e5e2e3]">Scan & Pay Any UPI</h2>
            <p className="text-[#909097] leading-relaxed text-lg">
              No need to wait for merchant adoption. Scan standard Indian UPI QR codes and pay directly with USDC. We handle the on-chain to off-chain settlement instantly.
            </p>
          </div>
          <div className="flex-1 relative w-full aspect-square md:aspect-auto md:h-[400px] glass-card overflow-hidden">
            {/* Abstract UI representation */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-48 h-48 border-[2px] border-[#c0c6de]/30 border-dashed rounded-3xl transition-transform duration-700 ease-out flex items-center justify-center ${inView1 ? 'rotate-12' : ''}`}>
                <div className="w-32 h-1 bg-[#c0c6de]/50 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 2: Withdraw */}
        <div ref={ref2} className="flex flex-col md:flex-row-reverse items-center gap-16 mb-32">
          <div className="flex-1 space-y-6">
            <div className="w-12 h-12 glass-card flex items-center justify-center text-[#c0c6de]">
              <ArrowRightLeft size={24} />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#e5e2e3]">Withdraw to Bank</h2>
            <p className="text-[#909097] leading-relaxed text-lg">
              Convert your crypto directly to fiat and deposit into your bank account. Our liquidity network ensures you get the best rates with minimal slippage.
            </p>
          </div>
          <div className="flex-1 relative w-full aspect-square md:aspect-auto md:h-[400px] glass-card overflow-hidden">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className={`w-32 h-16 glass-card-elevated flex items-center justify-center font-mono font-bold text-[#c0c6de] transition-transform duration-500 ${inView2 ? '-translate-y-2' : ''}`}>
                100 USDC
              </div>
              <ArrowRight size={24} className={`rotate-90 transition-colors ${inView2 ? 'text-[#c0c6de]' : 'text-[#46464c]'}`} />
              <div className={`w-32 h-16 bg-[#E2E8F0] text-[#2a3043] rounded-2xl flex items-center justify-center font-mono font-bold transition-transform duration-500 ${inView2 ? 'translate-y-2' : ''}`}>
                ₹8,350
              </div>
            </div>
          </div>
        </div>

        {/* Feature 3: Expansion */}
        <div ref={ref3} className="flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1 space-y-6">
            <div className="w-12 h-12 glass-card flex items-center justify-center text-[#c0c6de]">
              <Globe size={24} />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#e5e2e3]">Global Expansion</h2>
            <p className="text-[#909097] leading-relaxed text-lg">
              Starting with India&apos;s UPI, our architecture is built to scale. We are actively expanding to support regional payment networks across Southeast Asia, Europe, and LATAM.
            </p>
          </div>
          <div className="flex-1 relative w-full aspect-square md:aspect-auto md:h-[400px] glass-card overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <Globe size={120} strokeWidth={1} className={`transition-all duration-700 ease-out ${inView3 ? 'scale-110 text-[#c0c6de]' : 'text-[#46464c]'}`} />
              <div className="absolute flex gap-2">
                <div className="w-3 h-3 bg-[#c0c6de] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-3 h-3 bg-[#c0c6de] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-3 h-3 bg-[#c0c6de] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* Value Props */}
      <section className="bg-[#0e0e0f] border-t border-[#46464c] py-24 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="glass-card p-8 hover:border-[#c0c6de]/20 transition-colors">
            <ShieldCheck size={32} className="mb-6 text-[#c0c6de]" />
            <h3 className="text-xl font-bold mb-3 text-[#e5e2e3]">Self-Custodial by Design</h3>
            <p className="text-[#909097]">
              Your keys, your crypto. ZkPay uses embedded wallets to ensure you never give up custody of your assets until the moment you pay.
            </p>
          </div>
          <div className="glass-card p-8 hover:border-[#c0c6de]/20 transition-colors">
            <Zap size={32} className="mb-6 text-[#c0c6de]" />
            <h3 className="text-xl font-bold mb-3 text-[#e5e2e3]">Built on Base</h3>
            <p className="text-[#909097]">
              Leveraging the speed and low fees of the Base L2 network to make crypto micro-transactions viable for everyday merchant payments.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <footer className="py-24 px-6 text-center flex flex-col items-center">
        <h2 className="text-4xl font-bold tracking-tight mb-8 text-[#e5e2e3]">Ready to spend?</h2>
        <button 
          onClick={login}
          className="bg-[#E2E8F0] text-[#2a3043] px-10 py-5 rounded-full font-bold text-xl hover:bg-[#cbd5e1] transition-all hover:scale-105 active:scale-95"
        >
          Create ZkPay Wallet
        </button>
        <p className="mt-12 text-sm text-[#46464c]">
          © 2026 ZkPay. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
