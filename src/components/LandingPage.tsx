"use client";

import Link from "next/link";
import { useEffect, useState, useRef, MouseEvent } from "react";
import { 
  QrCode, 
  Zap, 
  ShieldCheck, 
  ArrowRight, 
  TrendingUp, 
  Wallet,
  Coins,
  ArrowRightLeft,
  Sparkles,
  Smartphone,
  CheckCircle2,
  Lock,
  Layers
} from "lucide-react";

export default function LandingPage({ login }: { login: () => void }) {
  const [upiAmount, setUpiAmount] = useState<number>(500);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const phoneRef = useRef<HTMLDivElement>(null);

  // React Bits TiltedCard 3D Interaction
  const handlePhoneMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!phoneRef.current) return;
    const rect = phoneRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setTilt({
      x: -(y / rect.height) * 20,
      y: (x / rect.width) * 20
    });
  };

  const handlePhoneMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  // React Bits Spotlight Card Handler
  const handleSpotlightMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
    e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
  };

  const usdcEquivalent = (upiAmount / 87.5).toFixed(2);
  const feeEquivalent = (Number(usdcEquivalent) * 0.01).toFixed(2);

  return (
    <div className="font-body-md text-body-md min-h-screen flex flex-col bg-[#0e0e0f] text-[#e5e2e3] selection:bg-[#c0c6de]/30 relative overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        /* React Bits Spotlight Effect */
        .spotlight-card {
          position: relative;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }
        .spotlight-card::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(192, 198, 222, 0.15), transparent 40%);
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        }
        .spotlight-card:hover::before {
          opacity: 1;
        }

        /* React Bits Shiny Text Effect */
        .shiny-text {
          background: linear-gradient(
            120deg,
            rgba(255, 255, 255, 0.7) 0%,
            rgba(255, 255, 255, 1) 25%,
            rgba(192, 198, 222, 1) 50%,
            rgba(255, 255, 255, 1) 75%,
            rgba(255, 255, 255, 0.7) 100%
          );
          background-size: 200% auto;
          color: #000;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shine 4s linear infinite;
        }
        @keyframes shine {
          to {
            background-position: 200% center;
          }
        }

        /* React Bits Star Border Glow Button */
        .star-border-btn {
          position: relative;
          background: rgba(192, 198, 222, 0.95);
          color: #151b2d;
          border-radius: 14px;
          z-index: 1;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .star-border-btn::after {
          content: "";
          position: absolute;
          inset: -2px;
          background: linear-gradient(90deg, #ffffff, #c0c6de, #72778d, #ffffff);
          background-size: 300% 300%;
          z-index: -1;
          animation: starBorder 3s linear infinite;
          border-radius: 16px;
        }
        @keyframes starBorder {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        /* Viewfinder Laser Scan Line */
        .laser-line {
          position: absolute;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, #c0c6de 50%, transparent 100%);
          box-shadow: 0 0 15px #c0c6de;
          animation: scan 2.5s ease-in-out infinite alternate;
        }
        @keyframes scan {
          0% { top: 10%; }
          100% { top: 85%; }
        }
      `}} />

      {/* Top Navbar */}
      <header className="fixed top-0 left-0 w-full z-50 bg-[#0e0e0f]/80 backdrop-blur-xl border-b border-white/10 h-20 transition-all duration-300">
        <div className="flex justify-between items-center max-w-7xl mx-auto px-6 md:px-12 h-full">
          <div className="flex items-center gap-3 cursor-pointer" onClick={login}>
            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/15 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#c0c6de] text-[22px]">security</span>
            </div>
            <span className="font-headline-lg text-2xl font-bold tracking-tighter text-white">ZkPay</span>
          </div>

          <nav className="hidden md:flex gap-8 items-center font-label-caps text-[11px] tracking-[0.2em] text-[#c6c6cd]">
            <a href="#scan-demo" className="hover:text-white transition-colors">SCAN DEMO</a>
            <a href="#calculator" className="hover:text-white transition-colors">CALCULATOR</a>
            <a href="#features" className="hover:text-white transition-colors">FEATURES</a>
            <a href="#card" className="hover:text-white transition-colors">OBSIDIAN CARD</a>
          </nav>

          <button 
            onClick={login}
            className="star-border-btn px-6 py-2.5 font-label-caps text-[12px] font-bold uppercase tracking-[0.1em] hover:scale-105 active:scale-95 shadow-xl"
          >
            Launch App
          </button>
        </div>
      </header>

      <main className="flex-grow pt-28">
        
        {/* HERO SECTION: Smartphone Scanner Viewfinder Focus */}
        <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 py-12 overflow-hidden">
          
          {/* Ambient Background Radial Mesh */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#c0c6de]/5 rounded-full blur-[150px] pointer-events-none"></div>

          <div className="relative z-10 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: Headlines & Call-to-Actions */}
            <div className="lg:col-span-7 text-left flex flex-col items-start">
              
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full spotlight-card mb-6 border border-white/10 text-xs text-[#c0c6de] font-label-caps tracking-widest uppercase">
                <Sparkles className="w-3.5 h-3.5 text-[#c0c6de]" />
                Pure Scan & Pay Protocol • Built on Base Chain
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter leading-none mb-6 text-white">
                Scan Any UPI QR. <br />
                Pay with <span className="shiny-text">USDC</span>.
              </h1>

              <p className="text-lg md:text-xl text-[#c6c6cd] max-w-xl mb-8 leading-relaxed font-body-lg">
                Point your camera at any merchant UPI QR code across India. ZkPay instantly converts your USDC on Base and settles INR directly into the merchant's bank account.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md mb-3">
                <button 
                  onClick={login}
                  className="star-border-btn py-4 px-8 font-label-caps text-[13px] font-bold uppercase tracking-[0.1em] flex items-center justify-center gap-2 shadow-2xl active:scale-95"
                >
                  <QrCode className="w-4 h-4" />
                  Scan UPI QR Now
                </button>
                
                <button 
                  onClick={login}
                  className="spotlight-card text-white border border-white/20 py-4 px-8 rounded-xl font-label-caps text-[13px] font-bold uppercase tracking-[0.1em] flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all"
                >
                  <Wallet className="w-4 h-4 text-[#c0c6de]" />
                  Connect Wallet
                </button>
              </div>

              {/* Legal Agreement Consent Notice */}
              <p className="text-[11px] text-[#909097] mb-6 leading-relaxed">
                By connecting, you agree to ZkPay&apos;s{" "}
                <Link href="/terms" className="text-[#c0c6de] hover:underline underline-offset-2">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-[#c0c6de] hover:underline underline-offset-2">
                  Privacy Policy
                </Link>.
              </p>

              {/* Quick Feature Chips */}
              <div className="flex flex-wrap gap-4 text-xs text-[#909097] font-label-caps tracking-wider">
                <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Zero KYC up to $100
                </div>
                <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                  <Zap className="w-3.5 h-3.5 text-[#c0c6de]" />
                  1% Fixed Platform Fee
                </div>
              </div>

            </div>

            {/* Right Column: React Bits Tilted Smartphone Viewfinder Display */}
            <div className="lg:col-span-5 flex justify-center items-center">
              <div 
                ref={phoneRef}
                onMouseMove={handlePhoneMouseMove}
                onMouseLeave={handlePhoneMouseLeave}
                style={{
                  transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                  transition: "transform 0.1s ease-out"
                }}
                className="relative w-[320px] md:w-[340px] aspect-[9/18] rounded-[48px] p-4 bg-[#1b1b1d] border-4 border-[#353436] shadow-[0_30px_100px_rgba(0,0,0,0.9)] cursor-pointer group select-none"
              >
                {/* Smartphone Dynamic Island / Notch */}
                <div className="absolute top-7 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-30 flex items-center justify-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#1b1b1d]"></div>
                  <div className="w-2 h-2 rounded-full bg-[#0e0e0f]"></div>
                </div>

                {/* Smartphone Screen Viewfinder */}
                <div className="w-full h-full rounded-[38px] bg-[#0e0e0f] border border-white/10 relative overflow-hidden flex flex-col justify-between p-5 pt-10">
                  
                  {/* Top Status inside Phone */}
                  <div className="flex justify-between items-center z-20">
                    <span className="font-label-caps text-[9px] text-[#c0c6de] tracking-widest font-bold">ZKPAY CAMERA</span>
                    <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      BASE MAINNET
                    </span>
                  </div>

                  {/* QR Code Scanner Viewfinder Box */}
                  <div id="scan-demo" className="relative my-auto w-full aspect-square bg-black/50 rounded-2xl border border-white/20 p-4 flex flex-col items-center justify-center overflow-hidden group-hover:border-[#c0c6de] transition-colors">
                    {/* Viewfinder Reticle Corners */}
                    <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#c0c6de]"></div>
                    <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#c0c6de]"></div>
                    <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#c0c6de]"></div>
                    <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#c0c6de]"></div>

                    {/* Animated Scanning Laser Line */}
                    <div className="laser-line z-10"></div>

                    {/* Simulated UPI Merchant QR Code */}
                    <img 
                      src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=merchant@upi&pn=ChaiPoint&am=150&cu=INR" 
                      alt="UPI Merchant QR Code Scanner"
                      className="w-36 h-36 opacity-80 mix-blend-screen"
                    />

                    <div className="absolute bottom-2 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] text-[#c0c6de] font-mono font-bold z-20">
                      SCANNING MERCHANT QR...
                    </div>
                  </div>

                  {/* Bottom Payment Preview inside Phone */}
                  <div className="bg-white/5 backdrop-blur-md border border-white/15 p-4 rounded-2xl z-20 text-left space-y-1">
                    <div className="flex justify-between items-center text-[10px] text-[#909097] font-label-caps">
                      <span>MERCHANT</span>
                      <span className="text-white font-bold">Chai Point (UPI)</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-2xl font-extrabold text-white font-mono">₹150.00</span>
                      <span className="text-xs font-bold text-[#c0c6de] font-mono">1.71 USDC</span>
                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>
        </section>

        {/* REACT BITS INTERACTIVE CALCULATOR */}
        <section id="calculator" className="py-20 px-6 border-t border-white/5 bg-[#0e0e0f]/60">
          <div className="max-w-4xl mx-auto text-center">
            <span className="font-label-caps text-[11px] text-[#909097] uppercase tracking-[0.2em] font-bold">Live Conversion Simulator</span>
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tighter mt-2 mb-12">Scan & Pay Calculator</h2>

            <div className="spotlight-card p-8 md:p-12 rounded-3xl text-left flex flex-col md:flex-row gap-8 items-center" onMouseMove={handleSpotlightMouseMove}>
              
              {/* Left Controls */}
              <div className="flex-1 w-full space-y-6">
                <div>
                  <label className="font-label-caps text-xs text-[#c0c6de] tracking-widest font-bold block mb-3">
                    SELECT PAYMENT AMOUNT (INR)
                  </label>
                  <div className="text-4xl font-extrabold text-white font-mono mb-4">
                    ₹ {upiAmount.toLocaleString("en-IN")}
                  </div>
                  <input 
                    type="range" 
                    min={100} 
                    max={8500} 
                    step={100}
                    value={upiAmount}
                    onChange={(e) => setUpiAmount(Number(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#c0c6de]"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[#909097] mt-2">
                    <span>₹100</span>
                    <span>₹8,500 ($100 Limit)</span>
                  </div>
                </div>
              </div>

              {/* Right Calculation Display */}
              <div className="flex-1 w-full bg-black/40 p-6 rounded-2xl border border-white/10 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-label-caps text-xs text-[#909097]">USDC Debited (Base)</span>
                  <span className="font-mono text-xl font-bold text-white">{usdcEquivalent} USDC</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-label-caps text-xs text-[#909097]">1% Platform Fee</span>
                  <span className="font-mono text-sm text-[#c0c6de]">{feeEquivalent} USDC</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-label-caps text-xs text-[#909097]">KYC Status</span>
                  <span className="font-label-caps text-[10px] text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded-full">ZERO KYC</span>
                </div>
                <div className="border-t border-white/10 pt-4 flex justify-between items-center">
                  <span className="font-label-caps text-xs text-[#909097]">Merchant Receives</span>
                  <span className="font-mono text-xl font-bold text-emerald-400">₹ {upiAmount.toLocaleString("en-IN")} INR</span>
                </div>

                <button onClick={login} className="w-full star-border-btn py-3 font-label-caps text-xs font-bold uppercase tracking-wider mt-2">
                  Test This Amount
                </button>
              </div>

            </div>
          </div>
        </section>

        {/* REACT BITS SPOTLIGHT BENTO FEATURES GRID */}
        <section id="features" className="py-24 px-6 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <span className="font-label-caps text-[11px] text-[#909097] uppercase tracking-[0.2em] font-bold">Architecture</span>
              <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tighter mt-2">Protocol Capabilities</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Feature 1 */}
              <div className="md:col-span-7 spotlight-card p-8 md:p-10 rounded-2xl flex flex-col justify-between" onMouseMove={handleSpotlightMouseMove}>
                <div className="w-12 h-12 rounded-xl bg-[#c0c6de]/10 flex items-center justify-center text-[#c0c6de] mb-8">
                  <QrCode className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-label-caps text-[10px] text-[#909097] uppercase tracking-widest font-bold">Primary Retail Engine</span>
                  <h3 className="text-2xl font-bold text-white mt-1 mb-2">Instant UPI QR Scanning</h3>
                  <p className="text-[#c6c6cd] text-sm leading-relaxed">Pay at millions of stores across India directly from your self-custodial Web3 wallet. Works with Google Pay, PhonePe, and Paytm merchant QRs.</p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="md:col-span-5 spotlight-card p-8 md:p-10 rounded-2xl flex flex-col justify-between" onMouseMove={handleSpotlightMouseMove}>
                <div className="w-12 h-12 rounded-xl bg-[#c0c6de]/10 flex items-center justify-center text-[#c0c6de] mb-8">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-label-caps text-[10px] text-[#909097] uppercase tracking-widest font-bold">Zero Friction</span>
                  <h3 className="text-2xl font-bold text-white mt-1 mb-2">Zero KYC Up To $100</h3>
                  <p className="text-[#c6c6cd] text-sm leading-relaxed">No passport or identity uploads needed. Start scanning and paying immediately upon connecting your wallet.</p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="md:col-span-5 spotlight-card p-8 md:p-10 rounded-2xl flex flex-col justify-between" onMouseMove={handleSpotlightMouseMove}>
                <div className="w-12 h-12 rounded-xl bg-[#c0c6de]/10 flex items-center justify-center text-[#c0c6de] mb-8">
                  <ArrowRightLeft className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-label-caps text-[10px] text-[#909097] uppercase tracking-widest font-bold">Cross-Chain Vault</span>
                  <h3 className="text-2xl font-bold text-white mt-1 mb-2">Deposit ETH, SOL, or BTC</h3>
                  <p className="text-[#c6c6cd] text-sm leading-relaxed">Deposit tokens from any blockchain. ZkPay converts them to USDC on Base automatically.</p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="md:col-span-7 spotlight-card p-8 md:p-10 rounded-2xl flex flex-col justify-between" onMouseMove={handleSpotlightMouseMove}>
                <div className="w-12 h-12 rounded-xl bg-[#c0c6de]/10 flex items-center justify-center text-[#c0c6de] mb-8">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-label-caps text-[10px] text-[#909097] uppercase tracking-widest font-bold">Yield Engine</span>
                  <h3 className="text-2xl font-bold text-white mt-1 mb-2">Earn Yield While Idle</h3>
                  <p className="text-[#c6c6cd] text-sm leading-relaxed">Keep your USDC in ZkPay Yield Vaults to earn interest continuously. Your balance remains 100% liquid for instant scan-and-pay transactions.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* OBSIDIAN CARD WAITLIST SECTION */}
        <section id="card" className="py-20 px-6 border-t border-white/5 bg-[#0e0e0f]">
          <div className="max-w-4xl mx-auto spotlight-card p-8 md:p-12 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-8" onMouseMove={handleSpotlightMouseMove}>
            <div className="flex-1 text-left">
              <span className="font-label-caps text-[11px] text-[#c0c6de] uppercase tracking-[0.2em] font-bold">Coming Soon</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mt-2 mb-3">ZkPay Obsidian Card</h2>
              <p className="text-[#c6c6cd] text-sm leading-relaxed">Spend your USDC balance directly anywhere Visa is accepted worldwide with zero foreign transaction fees.</p>
            </div>

            <button 
              onClick={login}
              className="star-border-btn px-8 py-4 font-label-caps text-xs font-bold uppercase tracking-[0.1em] flex items-center gap-2 whitespace-nowrap active:scale-95"
            >
              Join Priority Waitlist
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-white/10 bg-[#0e0e0f] text-[#909097]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-xs font-label-caps tracking-widest">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white text-sm">ZkPay</span>
            <span>• Powered by Base Chain & P2PKit</span>
          </div>

          <div className="flex flex-wrap gap-6 items-center">
            <a href="https://basescan.org/address/0x4cad6eC90e65baBec9335cAd728DDC610c316368" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">BASE CONTRACT</a>
            <Link href="/docs" className="hover:text-white transition-colors">DEVELOPERS</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">PRIVACY</Link>
            <Link href="/terms" className="hover:text-white transition-colors">TERMS</Link>
          </div>

          <p>© {new Date().getFullYear()} ZkPay Protocol. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
