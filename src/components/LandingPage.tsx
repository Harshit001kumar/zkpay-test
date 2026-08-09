"use client";

import { ScanLine, ArrowRightLeft, Globe, Zap, ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import Image from "next/image";

export default function LandingPage({ login }: { login: () => void }) {
  // Adding the floating mouse effect logic
  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const handleMouseMove = (e: MouseEvent) => {
        const moveX = (e.clientX - window.innerWidth / 2) / 100;
        const moveY = (e.clientY - window.innerHeight / 2) / 100;
        const card = document.querySelector('.float-animation') as HTMLElement;
        if (card) {
          card.style.transform = `translateY(${moveY}px) rotateX(${10 - moveY}deg) rotateY(${moveX}deg)`;
        }
      };
      document.addEventListener('mousemove', handleMouseMove);
      return () => document.removeEventListener('mousemove', handleMouseMove);
    }
  }, []);

  return (
    <div className="font-body-md text-body-md overflow-x-hidden min-h-screen flex flex-col bg-[#131315] text-[#e5e2e3]">
      <style dangerouslySetInnerHTML={{__html: `
        .float-animation {
            animation: floating 6s ease-in-out infinite;
        }
        @keyframes floating {
            0% { transform: translateY(0px) rotateX(5deg); }
            50% { transform: translateY(-15px) rotateX(10deg); }
            100% { transform: translateY(0px) rotateX(5deg); }
        }
        .mesh-bg {
            background: radial-gradient(circle at 50% -20%, rgba(255,255,255,0.08) 0%, transparent 50%);
        }
      `}} />

      {/* TopAppBar Shell */}
      <header className="fixed top-0 left-0 w-full z-50 bg-[#131315]/80 backdrop-blur-md flex justify-between items-center px-5 md:px-10 py-4 transition-opacity">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/15 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#c0c6de]">account_circle</span>
          </div>
        </div>
        <h1 className="font-label-caps text-label-caps tracking-[0.15em] font-bold text-[#c0c6de]">ZKPAY</h1>
        <button onClick={login} className="font-label-caps text-label-caps tracking-[0.15em] font-bold text-[#e5e2e3] hover:text-[#c0c6de] transition-colors">
          LOGIN
        </button>
      </header>

      {/* Main Canvas */}
      <main className="flex-grow flex flex-col items-center justify-center relative mesh-bg px-5 pt-32 pb-32">
        {/* Hero Section: Floating Card */}
        <div className="relative w-full max-w-[400px] aspect-[1.586/1] mb-16 perspective-[1000px]">
          <div className="float-animation w-full h-full relative group">
            {/* Glass Credit Card Representation */}
            <div className="w-full h-full rounded-2xl bg-white/5 backdrop-blur-[40px] border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-6 flex flex-col justify-between overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none"></div>
              
              <div className="flex justify-between items-start relative z-10">
                <span className="font-label-caps text-[10px] tracking-[0.25em] font-bold text-[#c0c6de]">ZKPAY BLACK</span>
                <span className="material-symbols-outlined text-white/50">contactless</span>
              </div>
              
              <div className="relative z-10">
                <div className="w-8 h-6 rounded bg-white/20 mb-4"></div>
                <div className="font-display-xl text-3xl md:text-[40px] font-medium tracking-tight text-white mb-1">
                  **** **** **** 4242
                </div>
                <div className="flex justify-between items-center text-[10px] font-label-caps tracking-widest text-[#c6c6cd]">
                  <span>OSIDIAN</span>
                  <span>12/28</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mb-12 max-w-lg">
          <h2 className="text-4xl md:text-5xl font-display-xl font-bold tracking-tighter mb-4 text-[#e5e2e3]">
            Crypto to Fiat. <span className="text-[#c0c6de]">Instantly.</span>
          </h2>
          <p className="text-[#909097] text-lg font-body-md leading-relaxed">
            Scan any UPI QR code and pay directly from your self-custodial wallet. Settled on Base.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 w-full max-w-sm">
          <button onClick={login} className="flex-1 bg-[#c0c6de] text-[#2a3043] py-4 rounded-xl font-label-caps text-label-caps uppercase flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all duration-200">
            <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
            Connect Wallet
          </button>
        </div>

        {/* Secondary Info (Minimalist Bento Hint) */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm mt-8 opacity-60">
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-4 border border-white/15">
            <p className="text-[10px] font-label-caps text-[#c6c6cd] mb-1 tracking-widest">NETWORK</p>
            <p className="font-headline-md text-[#c0c6de] text-[14px] font-medium tracking-tight">Base Mainnet</p>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-4 border border-white/15">
            <p className="text-[10px] font-label-caps text-[#c6c6cd] mb-1 tracking-widest">SAFETY</p>
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-emerald-400">shield</span>
              <p className="font-headline-md text-[#c0c6de] text-[14px] font-medium tracking-tight">Self-Custodial</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
