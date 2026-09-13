"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import {
  Copy,
  Check,
  ChevronRight,
  Key,
  Fingerprint,
  FileText,
  DollarSign,
  Globe,
  Network,
  LogOut,
  Shield,
  Scale,
  Code2,
  ExternalLink,
  Gift,
  Users,
  Share2,
  ArrowLeft,
  Sparkles,
  Calendar,
  CheckCircle,
} from "lucide-react";

export default function Profile({ onBack }: { onBack?: () => void }) {
  const router = useRouter();
  const { logout, address, isSmartWallet } = useActiveAccount();

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [activeView, setActiveView] = useState<"main" | "referral">("main");
  const [rewardsData, setRewardsData] = useState<any>(null);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);

  useEffect(() => {
    if (!address) return;
    setIsLoadingRewards(true);
    fetch(`/api/rewards/user?address=${address}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setRewardsData(json.data);
      })
      .catch((err) => console.warn("[Profile] Failed to fetch rewards:", err))
      .finally(() => setIsLoadingRewards(false));
  }, [address]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyReferralCode = () => {
    if (rewardsData?.referralCode) {
      navigator.clipboard.writeText(rewardsData.referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyReferralLink = () => {
    if (rewardsData?.referralLink) {
      navigator.clipboard.writeText(rewardsData.referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (activeView === "referral") {
    const code = rewardsData?.referralCode || "...";
    const link = rewardsData?.referralLink || `https://zkpay.in/?ref=${code}`;
    const shareText = `Hey! I use ZkPay to scan any UPI QR code and pay directly with crypto on Base. Get Monthly Cashback on all payments: ${link}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Pay any UPI QR with crypto on Base and get Monthly Cashback!")}`;

    return (
      <div className="bg-[#020408] text-[#e5e2e3] font-body-md selection:bg-[#c0c6de]/30 min-h-screen relative flex flex-col pb-36 overflow-y-auto w-full">
        {/* TopAppBar */}
        <header className="w-full sticky top-0 z-50 flex justify-between items-center px-6 py-6 max-w-2xl mx-auto backdrop-blur-md bg-[#020408]/60">
          <button
            onClick={() => setActiveView("main")}
            className="flex items-center gap-2 px-4 py-2 monolith-card rounded-full cursor-pointer hover:scale-105 active:scale-95 transition-transform text-xs font-mono font-bold text-[#c0c6de]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK TO PROFILE</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>SCAN & PAY ONLY</span>
          </div>
        </header>

        <main className="w-full max-w-xl mx-auto px-4 pt-4 pb-40 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#c0c6de]/10 border border-[#c0c6de]/30 text-[#c0c6de] mb-2 shadow-lg">
              <Gift className="w-7 h-7" />
            </div>
            <h2 className="font-display-xl-mobile text-[28px] font-bold text-white tracking-tight">
              Refer & Earn
            </h2>
            <p className="text-xs text-[#909097] max-w-md mx-auto leading-relaxed font-mono">
              Earn 20% commission on friends&apos; Scan & Pay fees + get Monthly Cashback on all your own payments.
            </p>
          </div>

          {/* Monthly Pool Card */}
          <section className="monolith-card rounded-[28px] p-6 md:p-8 space-y-4 bg-gradient-to-b from-[#c0c6de]/15 via-white/5 to-transparent border border-[#c0c6de]/30 shadow-2xl">
            <div className="flex justify-between items-center text-xs font-mono text-[#c0c6de]">
              <span className="uppercase tracking-widest font-bold">THIS MONTH&apos;S ACCRUAL</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-white">
                Cycle: {rewardsData?.currentCycle || "Current"}
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-4xl font-bold font-display tracking-tight text-white flex items-baseline gap-2">
                ${(rewardsData?.thisMonth?.totalDueUsdc || 0).toFixed(2)}
                <span className="text-base font-normal font-mono text-[#c0c6de]">USDC</span>
              </div>
              <p className="text-[11px] font-mono text-[#909097]">
                Status:{" "}
                <span className="text-emerald-400 font-bold">
                  {rewardsData?.thisMonth?.status === "PAID" ? "Settled / Paid" : "Accruing for Month-End Disbursal"}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10 text-xs font-mono">
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-[#909097] block text-[10px] mb-1">YOUR CASHBACK</span>
                <span className="text-white font-bold text-sm">
                  ${(rewardsData?.thisMonth?.cashbackUsdc || 0).toFixed(2)} USDC
                </span>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-[#909097] block text-[10px] mb-1">REFERRAL COMMISSIONS</span>
                <span className="text-white font-bold text-sm">
                  ${(rewardsData?.thisMonth?.referralUsdc || 0).toFixed(2)} USDC
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex items-start gap-3 text-[11px] font-mono text-[#909097] leading-relaxed">
              <Calendar className="w-4 h-4 text-[#c0c6de] shrink-0 mt-0.5" />
              <span>
                Rewards are sent automatically by Admin in a single batch directly to your wallet at the end of each month.
              </span>
            </div>
          </section>

          {/* Referral Sharing Card */}
          <section className="monolith-card rounded-[28px] p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#c6c6cd] uppercase tracking-wider">
              <Share2 className="w-4 h-4 text-[#c0c6de]" />
              <span>Share Your Referral Link</span>
            </div>

            {/* Code Row */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-[#909097]">Your Referral Code</label>
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-black/30 border border-white/10">
                <span className="font-mono text-base font-bold text-[#c0c6de] tracking-wider">{code}</span>
                <button
                  onClick={handleCopyReferralCode}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors"
                  title="Copy Code"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Link Row */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-[#909097]">Your Referral Link</label>
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-black/30 border border-white/10">
                <span className="font-mono text-xs text-white truncate max-w-[260px]">{link}</span>
                <button
                  onClick={handleCopyReferralLink}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors"
                  title="Copy Link"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 1-Tap Share Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 px-4 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Share2 className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
              <a
                href={tgUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 px-4 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Share2 className="w-4 h-4" />
                <span>Telegram</span>
              </a>
            </div>
          </section>

          {/* Quick Stats Grid */}
          <section className="grid grid-cols-2 gap-3">
            <div className="monolith-card rounded-2xl p-5 text-center space-y-1">
              <Users className="w-5 h-5 text-[#c0c6de] mx-auto mb-1" />
              <div className="text-2xl font-bold text-white font-display">
                {rewardsData?.friendsInvited || 0}
              </div>
              <div className="text-[10px] font-mono text-[#909097] uppercase tracking-wider">Friends Invited</div>
            </div>
            <div className="monolith-card rounded-2xl p-5 text-center space-y-1">
              <Sparkles className="w-5 h-5 text-[#c0c6de] mx-auto mb-1" />
              <div className="text-2xl font-bold text-white font-display">
                ${(rewardsData?.lifetime?.totalEarnedUsdc || 0).toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-[#909097] uppercase tracking-wider">Lifetime Rewards</div>
            </div>
          </section>

          {/* Past Payouts History */}
          <section className="monolith-card rounded-[28px] p-6 space-y-3">
            <span className="text-xs font-mono font-bold text-[#c6c6cd] uppercase tracking-wider block">
              Past Monthly Disbursals
            </span>
            {rewardsData?.pastPayouts && rewardsData.pastPayouts.length > 0 ? (
              <div className="space-y-2">
                {rewardsData.pastPayouts.map((p: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between text-xs font-mono"
                  >
                    <div>
                      <span className="text-white font-bold block">Cycle {p.cycle}</span>
                      <span className="text-[10px] text-[#909097]">
                        {new Date(p.paidAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-400 font-bold">+${p.amountUsdc.toFixed(2)} USDC</span>
                      <a
                        href={`https://basescan.org/tx/${p.payoutTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#c0c6de] hover:underline"
                        title="View on Basescan"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-mono text-[#909097] text-center py-4">
                No past payouts yet. Your active rewards will be included in this month&apos;s batch!
              </p>
            )}
          </section>
        </main>
      </div>
    );
  }

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
            onClick={() => {
              if (address) router.push(`/wallet/${address}`);
              else router.push("/wallet");
            }}
            className="flex items-center gap-3 text-[#c6c6cd] bg-black/30 hover:bg-black/50 px-5 py-2.5 rounded-full border border-white/10 hover:border-[#c0c6de]/30 mb-8 cursor-pointer transition-all active:scale-95 group"
            title="Click to open Base USDC deposit & wallet page"
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

        {/* Refer & Earn & Monthly Cashback Monolith */}
        <section className="monolith-card rounded-[32px] p-6 md:p-8 animate-in fade-in slide-in-from-bottom-6 duration-600 bg-gradient-to-b from-[#c0c6de]/10 via-white/5 to-transparent border border-[#c0c6de]/30 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#c0c6de]/20 flex items-center justify-center text-[#c0c6de]">
                <Gift className="w-4 h-4" />
              </div>
              <span className="font-label-caps text-[11px] font-bold text-[#c0c6de] tracking-[0.2em] uppercase">
                Refer & Earn • Monthly Cashback
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
              Scan & Pay Exclusive
            </span>
          </div>

          <div className="bg-black/30 rounded-2xl p-5 border border-white/5 mb-5 space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#909097] font-mono">This Month&apos;s Accrued</span>
              <span className="text-2xl font-bold text-white font-display tracking-tight">
                ${(rewardsData?.thisMonth?.totalDueUsdc || 0).toFixed(2)}{" "}
                <span className="text-xs text-[#c0c6de] font-mono font-normal">USDC</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs font-mono text-[#909097]">
              <div>
                Cashback:{" "}
                <span className="text-[#e5e2e3] font-bold">
                  ${(rewardsData?.thisMonth?.cashbackUsdc || 0).toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                Referral:{" "}
                <span className="text-[#e5e2e3] font-bold">
                  ${(rewardsData?.thisMonth?.referralUsdc || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-[#909097] mb-5 px-1">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#c0c6de]" />
              Disbursed at Month-End
            </span>
            <span>{rewardsData?.friendsInvited || 0} friends invited</span>
          </div>

          <button
            onClick={() => setActiveView("referral")}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#c0c6de] to-[#a0a8c2] hover:from-white hover:to-[#c0c6de] text-[#020408] font-bold text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(192,198,222,0.25)] active:scale-[0.98] cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Open Referral Hub & Share</span>
            <ChevronRight className="w-4 h-4" />
          </button>
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
      </main>
    </div>
  );
}
