"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth";
import { Copy, Check, ChevronRight, Key, Fingerprint, FileText, DollarSign, Globe, Network, LogOut, Shield, Scale, Code2, ExternalLink } from "lucide-react";

import WalletModal from "@/components/WalletModal";

export default function Profile({ onBack }: { onBack?: () => void }) {
  const { logout, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];

  const address = wallet?.address || user?.wallet?.address;
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
  const [copied, setCopied] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-[#020408] text-[#e5e2e3] font-body-md selection:bg-[#c0c6de]/30 min-h-screen relative flex flex-col pb-36 overflow-y-auto w-full">
      <style dangerouslySetInnerHTML={{__html: `
        .monolith-card {
            background: rgba(255, 255, 255, 0.04);
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
            border: 1px solid rgba(226, 232, 240, 0.15);
            box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.8), 
                        inset 0 1px 1px rgba(255, 255, 255, 0.05);
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .monolith-card:active {
            transform: scale(0.985);
            background: rgba(255, 255, 255, 0.06);
        }
        .silver-toggle {
            position: relative;
            width: 48px;
            height: 28px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 99px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .silver-toggle::after {
            content: '';
            position: absolute;
            top: 3px;
            left: 3px;
            width: 20px;
            height: 20px;
            background: #ffffff;
            box-shadow: 0 0 10px rgba(255,255,255,0.5);
            border-radius: 50%;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .silver-toggle.active {
            background: rgba(192, 198, 222, 0.4);
            border-color: rgba(192, 198, 222, 0.6);
        }
        .silver-toggle.active::after {
            transform: translateX(20px);
            background: #c0c6de;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #b9c7e0;
            box-shadow: 0 0 10px rgba(185, 199, 224, 0.8);
        }
      `}} />

      {/* TopAppBar */}
      <header className="w-full sticky top-0 z-50 flex justify-between items-center px-6 py-6 max-w-2xl mx-auto backdrop-blur-md bg-[#020408]/60">
        <button onClick={onBack} className="flex items-center justify-center w-12 h-12 monolith-card rounded-full cursor-pointer hover:scale-110 active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-[#e5e2e3]">arrow_back</span>
        </button>
        <button className="flex items-center justify-center w-12 h-12 monolith-card rounded-full cursor-pointer hover:scale-110 active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-[#e5e2e3]">settings</span>
        </button>
      </header>

      <main className="w-full max-w-xl mx-auto px-4 pt-6 pb-40 space-y-8">
        
        {/* Profile Monolith */}
        <section className="monolith-card rounded-[32px] p-8 flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="relative mb-6">
            <div className="w-32 h-32 rounded-2xl overflow-hidden border-2 border-white/20 p-1 bg-black/40 shadow-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[64px] text-[#c0c6de] opacity-50">person</span>
            </div>
            <button className="absolute -bottom-3 -right-3 bg-[#c0c6de] text-[#020408] p-2.5 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all border-2 border-[#020408]">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>edit</span>
            </button>
          </div>
          
          <h2 className="font-display-xl-mobile text-[32px] font-bold text-[#e5e2e3] mb-3 tracking-tight">
            {address ? "ZkPay User" : "Guest"}
          </h2>
          
          <div 
            onClick={() => setIsWalletModalOpen(true)}
            className="flex items-center gap-3 text-[#c6c6cd] bg-black/30 hover:bg-black/50 px-5 py-2 rounded-full border border-white/10 hover:border-[#c0c6de]/30 mb-8 cursor-pointer transition-all active:scale-95 group"
            title="Click to view Base address & deposit/send USDC"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-body-md text-[#bcc7de] font-mono tracking-tight group-hover:text-white transition-colors">{shortAddress}</span>
            <button onClick={handleCopy} className="hover:text-[#c0c6de] transition-colors flex items-center justify-center p-1 rounded-md hover:bg-white/10" title="Copy Address">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          
          <div className="flex flex-col gap-3 w-full">
            <div className="monolith-card bg-white/5 py-4 px-6 rounded-2xl text-left flex justify-between items-center">
              <span className="font-label-caps text-[#d8e3fb] tracking-widest text-[11px] font-bold">PLATINUM TIER</span>
              <span className="material-symbols-outlined text-[#d8e3fb]/50" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
            </div>
            <div className="monolith-card bg-white/5 py-4 px-6 rounded-2xl text-left flex justify-between items-center">
              <span className="font-label-caps text-[#c0c6de] tracking-widest text-[11px] font-bold">ZK-SYNC NATIVE</span>
              <span className="material-symbols-outlined text-[#c0c6de]/50" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            </div>
          </div>
        </section>

        {/* Security Monolith */}
        <section className="monolith-card rounded-[32px] p-6 md:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex items-center gap-3 mb-6 ml-2">
            <span className="material-symbols-outlined text-[#c0c6de]">security</span>
            <h3 className="font-label-caps text-[11px] font-bold text-[#c6c6cd] tracking-[0.2em] uppercase">Security</h3>
          </div>
          <div className="space-y-3">
            <div className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group cursor-pointer border border-white/5 hover:border-white/20 transition-all">
              <div className="flex items-center gap-4">
                <Key className="w-5 h-5 text-[#c6c6cd] group-hover:text-[#c0c6de] transition-colors" />
                <span className="font-body-lg text-[#e5e2e3] font-semibold text-[15px]">Export Private Key</span>
              </div>
              <ChevronRight className="w-5 h-5 text-[#c6c6cd]" />
            </div>
            <div 
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group cursor-pointer border border-white/5 hover:border-white/20 transition-all"
              onClick={() => setBiometricEnabled(!biometricEnabled)}
            >
              <div className="flex items-center gap-4">
                <Fingerprint className="w-5 h-5 text-[#c6c6cd] group-hover:text-[#c0c6de] transition-colors" />
                <span className="font-body-lg text-[#e5e2e3] font-semibold text-[15px]">Biometric Auth</span>
              </div>
              <div className={`silver-toggle ${biometricEnabled ? 'active' : ''}`}></div>
            </div>
            <div className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group cursor-pointer border border-white/5 hover:border-white/20 transition-all">
              <div className="flex items-center gap-4">
                <FileText className="w-5 h-5 text-[#c6c6cd] group-hover:text-[#c0c6de] transition-colors" />
                <span className="font-body-lg text-[#e5e2e3] font-semibold text-[15px]">Recovery Phrase</span>
              </div>
              <ChevronRight className="w-5 h-5 text-[#c6c6cd]" />
            </div>
          </div>
        </section>

        {/* Preferences Monolith */}
        <section className="monolith-card rounded-[32px] p-6 md:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
          <div className="flex items-center gap-3 mb-6 ml-2">
            <span className="material-symbols-outlined text-[#c0c6de]">settings_suggest</span>
            <h3 className="font-label-caps text-[11px] font-bold text-[#c6c6cd] tracking-[0.2em] uppercase">Preferences</h3>
          </div>
          <div className="space-y-3">
            <div className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group cursor-pointer border border-white/5 hover:border-white/20 transition-all">
              <div className="flex items-center gap-4">
                <DollarSign className="w-5 h-5 text-[#c6c6cd] group-hover:text-[#c0c6de] transition-colors" />
                <span className="font-body-lg text-[#e5e2e3] font-semibold text-[15px]">Default Currency</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-body-md text-[#c0c6de] font-bold text-sm">USD</span>
                <ChevronRight className="w-5 h-5 text-[#c6c6cd]" />
              </div>
            </div>
            <div className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group cursor-pointer border border-white/5 hover:border-white/20 transition-all">
              <div className="flex items-center gap-4">
                <Globe className="w-5 h-5 text-[#c6c6cd] group-hover:text-[#c0c6de] transition-colors" />
                <span className="font-body-lg text-[#e5e2e3] font-semibold text-[15px]">Language</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-body-md text-[#c0c6de] font-bold text-sm">English</span>
                <ChevronRight className="w-5 h-5 text-[#c6c6cd]" />
              </div>
            </div>
          </div>
        </section>

        {/* Network Monolith */}
        <section className="monolith-card rounded-[32px] p-6 md:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          <div className="flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 flex items-center justify-center bg-[#c0c6de]/10 rounded-2xl border border-white/5">
                <Network className="w-6 h-6 text-[#c0c6de]" />
              </div>
              <div>
                <p className="font-label-caps text-[10px] text-[#c6c6cd] font-bold tracking-[0.1em] mb-1">CURRENT NETWORK</p>
                <span className="font-body-lg text-[#e5e2e3] font-bold tracking-tight">Base Mainnet</span>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-full border border-white/10">
              <span className="status-dot"></span>
              <span className="font-label-caps text-[#e5e2e3] tracking-widest text-[10px] font-bold">CONNECTED</span>
            </div>
          </div>
        </section>

        {/* Legal & Protocol Standards Monolith */}
        <section className="monolith-card rounded-[32px] p-6 md:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-400">
          <div className="flex items-center gap-3 mb-6 ml-2">
            <span className="material-symbols-outlined text-[#c0c6de]">policy</span>
            <h3 className="font-label-caps text-[11px] font-bold text-[#c6c6cd] tracking-[0.2em] uppercase">Protocol & Legal</h3>
          </div>
          <div className="space-y-3">
            <Link 
              href="/privacy" 
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all block"
            >
              <div className="flex items-center gap-4">
                <Shield className="w-5 h-5 text-[#c6c6cd] group-hover:text-[#c0c6de] transition-colors" />
                <div>
                  <span className="font-body-lg text-[#e5e2e3] font-semibold text-[15px] block">Privacy Policy</span>
                  <span className="text-xs text-[#909097]">Zero-knowledge & ECIES encryption standards</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#c6c6cd]" />
            </Link>

            <Link 
              href="/terms" 
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all block"
            >
              <div className="flex items-center gap-4">
                <Scale className="w-5 h-5 text-[#c6c6cd] group-hover:text-[#c0c6de] transition-colors" />
                <div>
                  <span className="font-body-lg text-[#e5e2e3] font-semibold text-[15px] block">Terms of Service</span>
                  <span className="text-xs text-[#909097]">Protocol rules & non-custodial terms</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#c6c6cd]" />
            </Link>

            <Link 
              href="/docs" 
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all block"
            >
              <div className="flex items-center gap-4">
                <Code2 className="w-5 h-5 text-[#c6c6cd] group-hover:text-[#c0c6de] transition-colors" />
                <div>
                  <span className="font-body-lg text-[#e5e2e3] font-semibold text-[15px] block">Developer APIs</span>
                  <span className="text-xs text-[#909097]">Pay Links, Quotes & Rates endpoints</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#c6c6cd]" />
            </Link>

            <a 
              href="https://basescan.org/address/0x4cad6eC90e65baBec9335cAd728DDC610c316368" 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group border border-white/5 hover:border-white/20 transition-all block"
            >
              <div className="flex items-center gap-4">
                <ExternalLink className="w-5 h-5 text-[#c6c6cd] group-hover:text-[#c0c6de] transition-colors" />
                <div>
                  <span className="font-body-lg text-[#e5e2e3] font-semibold text-[15px] block">P2P Diamond Contract</span>
                  <span className="text-xs font-mono text-[#909097]">0x4cad...6368 (Base Mainnet)</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#c6c6cd]" />
            </a>
          </div>
        </section>

        {/* Footer / Disconnect */}
        <footer className="pt-4 flex justify-center animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500">
          <button 
            onClick={logout}
            className="monolith-card w-full flex items-center justify-center gap-3 px-10 py-5 text-[#ffb4ab] font-label-caps font-bold tracking-widest uppercase hover:bg-[#ffb4ab]/10 border-[#ffb4ab]/30 active:scale-95 transition-all rounded-[24px]"
          >
            <LogOut className="w-5 h-5" />
            Disconnect Wallet
          </button>
        </footer>

        {/* Base USDC Wallet Modal */}
        <WalletModal 
          isOpen={isWalletModalOpen} 
          onClose={() => setIsWalletModalOpen(false)} 
        />
      </main>
    </div>
  );
}
