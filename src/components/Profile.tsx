"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { usePrivy } from "@privy-io/react-auth";
import { useCurrency } from "@/context/CurrencyContext";
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
  Plus,
  Trash2,
  Terminal,
  AlertCircle,
  RefreshCw,
  LayoutDashboard,
} from "lucide-react";

interface ApiKeyItem {
  id: string;
  label: string;
  maskedKey: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

export default function Profile({ onBack }: { onBack?: () => void }) {
  const router = useRouter();
  const { logout, address, isSmartWallet } = useActiveAccount();
  const { getAccessToken } = usePrivy();
  const { currencyMeta, setIsSelectorOpen } = useCurrency();

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [activeView, setActiveView] = useState<"main" | "referral" | "api-keys">("main");
  const [rewardsData, setRewardsData] = useState<any>(null);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [keyLabel, setKeyLabel] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<{
    plaintextKey: string;
    label: string;
    maskedKey: string;
  } | null>(null);
  const [copiedNewKey, setCopiedNewKey] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Manual Referral Code State
  const [manualRefCode, setManualRefCode] = useState("");
  const [isBindingRef, setIsBindingRef] = useState(false);
  const [refBindingMsg, setRefBindingMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleApplyReferral = async () => {
    if (!manualRefCode.trim() || !address) return;
    try {
      setIsBindingRef(true);
      setRefBindingMsg(null);
      const token = await getAccessToken();
      const res = await fetch("/api/referrals/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userAddress: address,
          referrerCodeOrAddress: manualRefCode.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRefBindingMsg({
          type: "success",
          text: data.alreadyBound ? "Referrer already linked to your account." : "Referral code bound successfully!",
        });
        setRewardsData((prev: any) => ({
          ...prev,
          referredBy: data.referrer,
        }));
        setManualRefCode("");
      } else {
        setRefBindingMsg({ type: "error", text: data.error || "Failed to apply referral code" });
      }
    } catch (err: any) {
      setRefBindingMsg({ type: "error", text: err.message || "Failed to bind referral" });
    } finally {
      setIsBindingRef(false);
    }
  };

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    async function loadRewards() {
      setIsLoadingRewards(true);
      try {
        const token = await getAccessToken();
        if (cancelled) return;
        const res = await fetch(`/api/rewards/user?address=${address}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (json.success && !cancelled) {
          setRewardsData(json.data);
        }
      } catch (err) {
        console.warn("[Profile] Failed to fetch rewards:", err);
      } finally {
        if (!cancelled) setIsLoadingRewards(false);
      }
    }

    loadRewards();
    return () => {
      cancelled = true;
    };
  }, [address, getAccessToken]);

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

  const fetchApiKeys = async () => {
    try {
      setIsLoadingKeys(true);
      setKeyError(null);
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/profile/api-keys", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.keys)) {
        setApiKeys(data.keys);
      } else {
        setKeyError(data.error || "Failed to load keys");
      }
    } catch (err: any) {
      setKeyError(err.message || "Failed to load keys");
    } finally {
      setIsLoadingKeys(false);
    }
  };

  useEffect(() => {
    if (activeView === "api-keys") {
      fetchApiKeys();
    }
  }, [activeView]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreatingKey(true);
      setKeyError(null);
      const token = await getAccessToken();
      if (!token) {
        setKeyError("Please connect your wallet first.");
        return;
      }
      const res = await fetch("/api/profile/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ label: keyLabel.trim() || "Default Merchant Key" }),
      });
      const data = await res.json();
      if (data.success && data.plaintextKey) {
        setNewKeyResult({
          plaintextKey: data.plaintextKey,
          label: data.key.label,
          maskedKey: data.key.maskedKey,
        });
        setKeyLabel("");
        fetchApiKeys();
      } else {
        setKeyError(data.error || "Could not generate API key.");
      }
    } catch (err: any) {
      setKeyError(err.message || "Could not generate API key.");
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? Applications using this key will immediately be denied access.")) {
      return;
    }
    try {
      setRevokingId(keyId);
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/profile/api-keys", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: keyId }),
      });
      const data = await res.json();
      if (data.success) {
        fetchApiKeys();
      } else {
        alert(data.error || "Failed to revoke API key.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to revoke API key.");
    } finally {
      setRevokingId(null);
    }
  };

  if (activeView === "referral") {
    const code = rewardsData?.referralCode || "...";
    const link = rewardsData?.referralLink || `https://zkpay.in/?ref=${code}`;
    const shareText = `Hey! I use ZkPay to scan any UPI QR code and pay directly with crypto on Base. Get Monthly Cashback on all payments: ${link}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Pay any UPI QR with crypto on Base and get Monthly Cashback!")}`;

    return (
      <div className="bg-surface-container-lowest text-on-surface font-body-md selection:bg-primary/30 min-h-screen relative flex flex-col pb-36 overflow-y-auto w-full">
        {/* TopAppBar */}
        <header className="w-full sticky top-0 z-50 flex justify-between items-center px-6 py-6 max-w-2xl mx-auto  bg-surface-container-lowest/60">
          <button
            onClick={() => setActiveView("main")}
            className="flex items-center gap-2 px-4 py-2 monolith-card rounded-full cursor-pointer active:scale-95 transition-transform text-xs font-sans tabular-nums font-bold text-primary"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK TO PROFILE</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 border border-success/20 text-success text-[10px] font-sans tabular-nums font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span>SCAN & PAY ONLY</span>
          </div>
        </header>

        <main className="w-full max-w-xl mx-auto px-4 pt-4 pb-40 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 text-primary mb-2 shadow-lg">
              <Gift className="w-7 h-7" />
            </div>
            <h2 className="font-display-xl-mobile text-[28px] font-bold text-white tracking-tight">
              Refer & Earn
            </h2>
            <p className="text-xs text-outline max-w-md mx-auto leading-relaxed font-sans tabular-nums">
              Earn 20% commission on friends&apos; Scan & Pay fees + get Monthly Cashback on all your own payments.
            </p>
          </div>

          {/* Monthly Pool Card */}
          <section className="monolith-card rounded-[28px] p-6 md:p-8 space-y-4 bg-gradient-to-b from-primary/15 via-white/5 to-transparent border border-primary/30">
            <div className="flex justify-between items-center text-xs font-sans tabular-nums text-primary">
              <span className=" tracking-normal font-bold">THIS MONTH&apos;S ACCRUAL</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-white">
                Cycle: {rewardsData?.currentCycle || "Current"}
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-4xl font-bold font-display tracking-tight text-white flex items-baseline gap-2">
                ${(rewardsData?.thisMonth?.totalDueUsdc || 0).toFixed(2)}
                <span className="text-base font-normal font-sans tabular-nums text-primary">USDC</span>
              </div>
              <p className="text-[11px] font-sans tabular-nums text-outline">
                Status:{" "}
                <span className="text-success font-bold">
                  {rewardsData?.thisMonth?.status === "PAID" ? "Settled / Paid" : "Accruing for Month-End Disbursal"}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10 text-xs font-sans tabular-nums">
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-outline block text-[10px] mb-1">YOUR CASHBACK</span>
                <span className="text-white font-bold text-sm">
                  ${(rewardsData?.thisMonth?.cashbackUsdc || 0).toFixed(2)} USDC
                </span>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-outline block text-[10px] mb-1">REFERRAL COMMISSIONS</span>
                <span className="text-white font-bold text-sm">
                  ${(rewardsData?.thisMonth?.referralUsdc || 0).toFixed(2)} USDC
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex items-start gap-3 text-[11px] font-sans tabular-nums text-outline leading-relaxed">
              <Calendar className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Rewards are sent automatically by Admin in a single batch directly to your wallet at the end of each month.
              </span>
            </div>
          </section>

          {/* Referral Sharing Card */}
          <section className="monolith-card rounded-[28px] p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-2 text-xs font-sans tabular-nums font-bold text-on-surface-variant  tracking-normal">
              <Share2 className="w-4 h-4 text-primary" />
              <span>Share Your Referral Link</span>
            </div>

            {/* Code Row */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-sans tabular-nums text-outline">Your Referral Code</label>
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-black/30 border border-white/10">
                <span className="font-sans tabular-nums text-base font-bold text-primary tracking-normal">{code}</span>
                <button
                  onClick={handleCopyReferralCode}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors"
                  title="Copy Code"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Link Row */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-sans tabular-nums text-outline">Your Referral Link</label>
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-black/30 border border-white/10">
                <span className="font-sans tabular-nums text-xs text-white truncate max-w-[260px]">{link}</span>
                <button
                  onClick={handleCopyReferralLink}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors"
                  title="Copy Link"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 1-Tap Share Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 px-4 rounded-xl bg-success/20 hover:bg-success/30 border border-success/30 text-success text-xs font-sans tabular-nums font-bold flex items-center justify-center gap-2 transition-colors active:scale-95"
              >
                <Share2 className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
              <a
                href={tgUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 px-4 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-xs font-sans tabular-nums font-bold flex items-center justify-center gap-2 transition-colors active:scale-95"
              >
                <Share2 className="w-4 h-4" />
                <span>Telegram</span>
              </a>
            </div>
          </section>

          {/* Referrer Status & Manual Binding Card */}
          <section className="monolith-card rounded-[28px] p-6 md:p-8 space-y-4">
            <div className="flex items-center gap-2 text-xs font-sans tabular-nums font-bold text-on-surface-variant  tracking-normal">
              <Gift className="w-4 h-4 text-primary" />
              <span>Your Referrer Status</span>
            </div>

            {rewardsData?.referredBy ? (
              <div className="flex items-center justify-between p-4 rounded-2xl bg-success/10 border border-success/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center text-success">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-sans tabular-nums font-bold text-white block">Bound to Referrer</span>
                    <span className="text-[11px] font-sans tabular-nums text-success">
                      {rewardsData.referredBy.slice(0, 6)}…{rewardsData.referredBy.slice(-4)}
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-success/20 text-success text-[10px] font-sans tabular-nums font-bold">
                  ACTIVE
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-sans tabular-nums text-outline leading-relaxed">
                  Have a friend&apos;s referral code or address? Enter it once below to link your account and earn cashback.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualRefCode}
                    onChange={(e) => setManualRefCode(e.target.value)}
                    placeholder="Enter code (e.g. ZK12AB)"
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-sans tabular-nums text-white placeholder-outline focus:outline-none focus:border-primary "
                  />
                  <button
                    onClick={handleApplyReferral}
                    disabled={isBindingRef || !manualRefCode.trim()}
                    className="px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-white text-surface font-sans tabular-nums font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
                  >
                    {isBindingRef ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
                  </button>
                </div>
                {refBindingMsg && (
                  <p
                    className={`text-[11px] font-sans tabular-nums ${
                      refBindingMsg.type === "success" ? "text-success" : "text-error"
                    }`}
                  >
                    {refBindingMsg.text}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Quick Stats Grid */}
          <section className="grid grid-cols-2 gap-3">
            <div className="monolith-card rounded-2xl p-5 text-center space-y-1">
              <Users className="w-5 h-5 text-primary mx-auto mb-1" />
              <div className="text-2xl font-bold text-white font-display">
                {rewardsData?.friendsInvited || 0}
              </div>
              <div className="text-[10px] font-sans tabular-nums text-outline  tracking-normal">Friends Invited</div>
            </div>
            <div className="monolith-card rounded-2xl p-5 text-center space-y-1">
              <Sparkles className="w-5 h-5 text-primary mx-auto mb-1" />
              <div className="text-2xl font-bold text-white font-display">
                ${(rewardsData?.lifetime?.totalEarnedUsdc || 0).toFixed(2)}
              </div>
              <div className="text-[10px] font-sans tabular-nums text-outline  tracking-normal">Lifetime Rewards</div>
            </div>
          </section>

          {/* Past Payouts History */}
          <section className="monolith-card rounded-[28px] p-6 space-y-3">
            <span className="text-xs font-sans tabular-nums font-bold text-on-surface-variant  tracking-normal block">
              Past Monthly Disbursals
            </span>
            {rewardsData?.pastPayouts && rewardsData.pastPayouts.length > 0 ? (
              <div className="space-y-2">
                {rewardsData.pastPayouts.map((p: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between text-xs font-sans tabular-nums"
                  >
                    <div>
                      <span className="text-white font-bold block">Cycle {p.cycle}</span>
                      <span className="text-[10px] text-outline">
                        {new Date(p.paidAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-success font-bold">+${p.amountUsdc.toFixed(2)} USDC</span>
                      <a
                        href={`https://basescan.org/tx/${p.payoutTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        title="View on Basescan"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-sans tabular-nums text-outline text-center py-4">
                No past payouts yet. Your active rewards will be included in this month&apos;s batch!
              </p>
            )}
          </section>
        </main>
      </div>
    );
  }

  if (activeView === "api-keys") {
    return (
      <div className="bg-surface-container-lowest text-on-surface font-body-md selection:bg-primary/30 min-h-screen relative flex flex-col pb-36 overflow-y-auto w-full">
        {/* TopAppBar */}
        <header className="w-full sticky top-0 z-50 flex justify-between items-center px-6 py-6 max-w-2xl mx-auto  bg-surface-container-lowest/60">
          <button
            onClick={() => setActiveView("main")}
            className="flex items-center gap-2 px-4 py-2 monolith-card rounded-full cursor-pointer active:scale-95 transition-transform text-xs font-sans tabular-nums font-bold text-primary"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK TO PROFILE</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-sans tabular-nums font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>MERCHANT API V1</span>
          </div>
        </header>

        <main className="w-full max-w-xl mx-auto px-4 pt-4 pb-40 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 text-primary mb-2 shadow-lg">
              <Key className="w-7 h-7" />
            </div>
            <h2 className="font-display-xl-mobile text-[28px] font-bold text-white tracking-tight">
              Merchant & Bot API Keys
            </h2>
            <p className="text-xs text-outline max-w-md mx-auto leading-relaxed font-sans tabular-nums">
              Integrate ZkPay into Telegram/Discord bots, payment checkouts, and automated systems with on-chain crypto-to-UPI settlements.
            </p>
          </div>

          {/* Partner Dashboard Quick Link */}
          <Link
            href="/partner"
            className="monolith-card rounded-[24px] p-4 bg-gradient-to-r from-success/10 via-transparent to-transparent border border-success/25 flex items-center justify-between gap-3 group hover:border-success/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center text-success">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">Partner Dashboard & Ledger</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-sans tabular-nums font-bold bg-success/20 text-success border border-success/30">
                    ANALYTICS
                  </span>
                </div>
                <p className="text-[11px] text-outline font-sans tabular-nums">
                  Track swap volumes, transactions & partner earnings
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-success group-hover:translate-x-0.5 transition-transform" />
          </Link>

          {/* New Key Generated Alert Banner */}
          {newKeyResult && (
            <section className="monolith-card rounded-[24px] p-6 space-y-4 bg-gradient-to-b from-warning/20 via-warning/5 to-transparent border border-warning/40 animate-in zoom-in-95 duration-300">
              <div className="flex items-center gap-2 text-warning text-xs font-sans tabular-nums font-bold  tracking-normal">
                <AlertCircle className="w-4 h-4" />
                <span>Save Your API Key Now</span>
              </div>
              <p className="text-xs font-sans tabular-nums text-on-surface-variant leading-relaxed">
                This secret API key will <strong className="text-white">never be shown again</strong>. Please copy and store it securely in your environment variables.
              </p>
              <div className="p-3.5 rounded-xl bg-black/60 border border-warning/30 flex items-center justify-between gap-2">
                <code className="text-xs font-sans tabular-nums text-warning break-all select-all font-semibold">
                  {newKeyResult.plaintextKey}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(newKeyResult.plaintextKey);
                    setCopiedNewKey(true);
                    setTimeout(() => setCopiedNewKey(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-warning/20 hover:bg-warning/30 border border-warning/40 text-warning text-xs font-sans tabular-nums font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  {copiedNewKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedNewKey ? "COPIED" : "COPY"}</span>
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setNewKeyResult(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-sans tabular-nums font-bold transition-colors cursor-pointer"
                >
                  I have saved this key
                </button>
              </div>
            </section>
          )}

          {/* Create Key Form */}
          <section className="monolith-card rounded-[28px] p-6 space-y-4 bg-gradient-to-b from-primary/10 to-transparent border border-primary/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-sans tabular-nums font-bold text-primary  tracking-normal">
                Create New API Key
              </span>
              <span className="text-[10px] font-sans tabular-nums text-outline">
                Base Mainnet • Chain 8453
              </span>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  placeholder="Key Label (e.g. Telegram Bot, E-commerce Store)"
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-outline text-xs font-sans tabular-nums focus:outline-none focus:border-primary/60 transition-colors"
                  maxLength={40}
                />
              </div>

              {keyError && (
                <p className="text-xs font-sans tabular-nums text-error flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{keyError}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={isCreatingKey}
                className="w-full py-3.5 rounded-xl bg-primary hover:bg-accent-hi text-on-primary font-bold text-xs tracking-normal transition-colors flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>{isCreatingKey ? "Generating Key…" : "Generate API Key"}</span>
              </button>
            </form>
          </section>

          {/* Active Keys Ledger */}
          <section className="monolith-card rounded-[28px] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-sans tabular-nums font-bold text-on-surface-variant  tracking-normal">
                Your API Keys ({apiKeys.length})
              </span>
              <button
                onClick={fetchApiKeys}
                disabled={isLoadingKeys}
                className="text-outline hover:text-primary transition-colors p-1 cursor-pointer"
                title="Refresh keys"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingKeys ? "animate-spin" : ""}`} />
              </button>
            </div>

            {isLoadingKeys && apiKeys.length === 0 ? (
              <div className="text-center py-8 text-xs font-sans tabular-nums text-outline">
                Loading keys…
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Key className="w-8 h-8 text-outline/40 mx-auto" />
                <p className="text-xs font-sans tabular-nums text-outline">
                  No API keys yet. Generate one above to access the API.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((k) => (
                  <div
                    key={k.id}
                    className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-2 hover:border-white/10 transition-colors font-sans tabular-nums"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{k.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            k.status === "ACTIVE"
                              ? "bg-success/10 text-success border border-success/20"
                              : "bg-surface-container-high/10 text-on-surface-variant border border-outline-variant/20"
                          }`}
                        >
                          {k.status}
                        </span>
                      </div>
                      {k.status === "ACTIVE" && (
                        <button
                          onClick={() => handleRevokeKey(k.id)}
                          disabled={revokingId === k.id}
                          className="text-error hover:text-error text-[11px] font-sans tabular-nums flex items-center gap-1 hover:underline cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{revokingId === k.id ? "Revoking…" : "Revoke"}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs bg-black/40 p-2.5 rounded-xl border border-white/5">
                      <span className="text-primary select-all">{k.maskedKey}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(k.id);
                          setCopiedKeyId(k.id);
                          setTimeout(() => setCopiedKeyId(null), 2000);
                        }}
                        className="text-outline hover:text-white transition-colors flex items-center gap-1 text-[10px] cursor-pointer"
                        title="Copy Key ID"
                      >
                        {copiedKeyId === k.id ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                        <span>ID</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-outline pt-1">
                      <span>Created: {new Date(k.createdAt).toLocaleDateString()}</span>
                      <span>
                        {k.lastUsedAt
                          ? `Last used: ${new Date(k.lastUsedAt).toLocaleDateString()}`
                          : "Never used"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Quickstart Developer Card */}
          <section className="monolith-card rounded-[28px] p-6 space-y-3 font-sans tabular-nums">
            <div className="flex items-center gap-2 text-xs font-bold text-primary  tracking-normal">
              <Terminal className="w-4 h-4" />
              <span>cURL Quickstart</span>
            </div>
            <p className="text-xs text-outline">
              Pass your API key in the <code className="text-primary">x-api-key</code> header:
            </p>
            <div className="p-3.5 rounded-xl bg-black/50 border border-white/5 text-[11px] text-primary overflow-x-auto leading-relaxed">
              <pre>{`curl -X POST "https://zkpay.top/api/v1/paylinks" \\
  -H "x-api-key: zkpay_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"amountINR": 500, "recipientUpi": "merchant@okaxis"}'`}</pre>
            </div>
            <div className="pt-2">
              <Link
                href="/docs"
                className="w-full py-3 rounded-xl monolith-card text-primary hover:text-white text-xs font-bold  tracking-normal flex items-center justify-center gap-2 hover:bg-white/5 transition-colors"
              >
                <span>View Full Developer Docs</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest text-on-surface font-body-md selection:bg-primary/30 min-h-screen relative flex flex-col pb-36 overflow-y-auto w-full">
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
      <header className="w-full sticky top-0 z-50 flex justify-between items-center px-6 py-6 max-w-2xl mx-auto  bg-surface-container-lowest/60">
        <button onClick={onBack} className="flex items-center justify-center w-12 h-12 monolith-card rounded-full cursor-pointer active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-on-surface">arrow_back</span>
        </button>
        <button className="flex items-center justify-center w-12 h-12 monolith-card rounded-full cursor-pointer active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-on-surface">settings</span>
        </button>
      </header>

      <main className="w-full max-w-xl mx-auto px-4 pt-6 pb-40 space-y-8">
        
        {/* Profile Monolith */}
        <section className="monolith-card rounded-[32px] p-8 flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="relative mb-6">
            <div className="w-32 h-32 rounded-2xl overflow-hidden border-2 border-white/20 p-1 bg-black/40 flex items-center justify-center">
              <span className="material-symbols-outlined text-[64px] text-primary opacity-50">person</span>
            </div>
            <button className="absolute -bottom-3 -right-3 bg-primary text-surface-container-lowest p-2.5 rounded-full active:scale-95 transition-colors border-2 border-surface-container-lowest">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>edit</span>
            </button>
          </div>
          
          <h2 className="font-display-xl-mobile text-[32px] font-bold text-on-surface mb-3 tracking-tight">
            {address ? "ZkPay User" : "Guest"}
          </h2>
          
          <div 
            onClick={() => {
              if (address) router.push(`/wallet/${address}`);
              else router.push("/wallet");
            }}
            className="flex items-center gap-3 text-on-surface-variant bg-black/30 hover:bg-black/50 px-5 py-2.5 rounded-full border border-white/10 hover:border-primary/30 mb-8 cursor-pointer transition-colors active:scale-95 group"
            title="Click to open Base USDC deposit & wallet page"
          >
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="font-body-md text-secondary font-sans tabular-nums tracking-tight group-hover:text-white transition-colors">{shortAddress}</span>
            <button onClick={handleCopy} className="hover:text-primary transition-colors flex items-center justify-center p-1 rounded-md hover:bg-white/10" title="Copy Address">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          
          <div className="flex flex-col divide-y divide-outline-variant/40 border-t border-outline-variant/40 w-full">
            <div className="py-3.5 px-2 text-left flex justify-between items-center">
              <span className="font-label-caps text-secondary-fixed tracking-normal text-[11px] font-bold">Platinum Tier</span>
              <span className="material-symbols-outlined text-secondary-fixed/50" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
            </div>
            <div className="py-3.5 px-2 text-left flex justify-between items-center">
              <span className="font-label-caps text-primary tracking-normal text-[11px] font-bold">ZK-Sync Native</span>
              <span className="material-symbols-outlined text-primary/50" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            </div>
          </div>
        </section>

        {/* Refer & Earn & Monthly Cashback Monolith */}
        <section className="monolith-card rounded-[32px] p-6 md:p-8 animate-in fade-in slide-in-from-bottom-6 duration-600 bg-gradient-to-b from-primary/10 via-white/5 to-transparent border border-primary/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                <Gift className="w-4 h-4" />
              </div>
              <span className="font-label-caps text-[11px] font-bold text-primary tracking-normal ">
                Refer & Earn • Monthly Cashback
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-success/10 border border-success/20 text-success text-[10px] font-sans tabular-nums font-bold">
              Scan & Pay Exclusive
            </span>
          </div>

          <div className="bg-black/30 rounded-2xl p-5 border border-white/5 mb-5 space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-outline font-sans tabular-nums">This Month&apos;s Accrued</span>
              <span className="text-2xl font-bold text-white font-display tracking-tight">
                ${(rewardsData?.thisMonth?.totalDueUsdc || 0).toFixed(2)}{" "}
                <span className="text-xs text-primary font-sans tabular-nums font-normal">USDC</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs font-sans tabular-nums text-outline">
              <div>
                Cashback:{" "}
                <span className="text-on-surface font-bold">
                  ${(rewardsData?.thisMonth?.cashbackUsdc || 0).toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                Referral:{" "}
                <span className="text-on-surface font-bold">
                  ${(rewardsData?.thisMonth?.referralUsdc || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-sans tabular-nums text-outline mb-5 px-1">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              Disbursed at Month-End
            </span>
            <span>{rewardsData?.friendsInvited || 0} friends invited</span>
          </div>

          <button
            onClick={() => setActiveView("referral")}
            className="w-full py-4 rounded-2xl bg-primary hover:bg-accent-hi text-on-primary font-bold text-xs tracking-normal transition-colors flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            <Share2 className="w-4 h-4" />
            <span>Open Referral Hub & Share</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </section>

        {/* Security Monolith */}
        <section className="monolith-card rounded-[32px] p-6 md:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex items-center gap-3 mb-6 ml-2">
            <span className="material-symbols-outlined text-primary">security</span>
            <h3 className="font-label-caps text-[11px] font-bold text-on-surface-variant tracking-normal ">Security</h3>
          </div>
          <div className="space-y-3">
            <div className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group cursor-pointer border border-white/5 hover:border-white/20 transition-colors">
              <div className="flex items-center gap-4">
                <Key className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <span className="font-body-lg text-on-surface font-semibold text-[15px]">Export Private Key</span>
              </div>
              <ChevronRight className="w-5 h-5 text-on-surface-variant" />
            </div>
            <div 
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group cursor-pointer border border-white/5 hover:border-white/20 transition-colors"
              onClick={() => setBiometricEnabled(!biometricEnabled)}
            >
              <div className="flex items-center gap-4">
                <Fingerprint className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <span className="font-body-lg text-on-surface font-semibold text-[15px]">Biometric Auth</span>
              </div>
              <div className={`silver-toggle ${biometricEnabled ? 'active' : ''}`}></div>
            </div>
            <div className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group cursor-pointer border border-white/5 hover:border-white/20 transition-colors">
              <div className="flex items-center gap-4">
                <FileText className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <span className="font-body-lg text-on-surface font-semibold text-[15px]">Recovery Phrase</span>
              </div>
              <ChevronRight className="w-5 h-5 text-on-surface-variant" />
            </div>
          </div>
        </section>

        {/* Preferences Monolith */}
        <section className="monolith-card rounded-[32px] p-6 md:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
          <div className="flex items-center gap-3 mb-6 ml-2">
            <span className="material-symbols-outlined text-primary">settings_suggest</span>
            <h3 className="font-label-caps text-[11px] font-bold text-on-surface-variant tracking-normal ">Preferences</h3>
          </div>
          <div className="space-y-3">
            <div 
              onClick={() => setIsSelectorOpen(true)}
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group cursor-pointer border border-white/5 hover:border-white/20 hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-4">
                <DollarSign className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="font-body-lg text-on-surface font-semibold text-[15px] block">Default Currency</span>
                  <span className="text-xs text-outline">{currencyMeta.name} • {currencyMeta.rail}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base mr-1">{currencyMeta.flag}</span>
                <span className="font-body-md text-primary font-bold text-sm">{currencyMeta.code} ({currencyMeta.symbol})</span>
                <ChevronRight className="w-5 h-5 text-on-surface-variant group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
            <div className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group cursor-pointer border border-white/5 hover:border-white/20 transition-colors">
              <div className="flex items-center gap-4">
                <Globe className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <span className="font-body-lg text-on-surface font-semibold text-[15px]">Language</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-body-md text-primary font-bold text-sm">English</span>
                <ChevronRight className="w-5 h-5 text-on-surface-variant" />
              </div>
            </div>
          </div>
        </section>

        {/* Network Monolith */}
        <section className="monolith-card rounded-[32px] p-6 md:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          <div className="flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 flex items-center justify-center bg-primary/10 rounded-2xl border border-white/5">
                <Network className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-label-caps text-[10px] text-on-surface-variant font-bold tracking-normal mb-1">CURRENT NETWORK</p>
                <span className="font-body-lg text-on-surface font-bold tracking-tight">Base Mainnet</span>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-full border border-white/10">
              <span className="status-dot"></span>
              <span className="font-label-caps text-on-surface tracking-normal text-[10px] font-bold">CONNECTED</span>
            </div>
          </div>
        </section>

        {/* Legal & Protocol Standards Monolith */}
        <section className="monolith-card rounded-[32px] p-6 md:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-400">
          <div className="flex items-center gap-3 mb-6 ml-2">
            <span className="material-symbols-outlined text-primary">policy</span>
            <h3 className="font-label-caps text-[11px] font-bold text-on-surface-variant tracking-normal ">Protocol & Legal</h3>
          </div>
          <div className="space-y-3">
            <Link 
              href="/privacy" 
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group border border-white/5 hover:border-white/20 transition-colors block"
            >
              <div className="flex items-center gap-4">
                <Shield className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="font-body-lg text-on-surface font-semibold text-[15px] block">Privacy Policy</span>
                  <span className="text-xs text-outline">Zero-knowledge & ECIES encryption standards</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-on-surface-variant" />
            </Link>

            <Link 
              href="/terms" 
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group border border-white/5 hover:border-white/20 transition-colors block"
            >
              <div className="flex items-center gap-4">
                <Scale className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="font-body-lg text-on-surface font-semibold text-[15px] block">Terms of Service</span>
                  <span className="text-xs text-outline">Protocol rules & non-custodial terms</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-on-surface-variant" />
            </Link>

            <button 
              onClick={() => setActiveView("api-keys")}
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group border border-white/5 hover:border-white/20 transition-colors block w-full text-left cursor-pointer whitespace-nowrap"
            >
              <div className="flex items-center gap-4">
                <Key className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-body-lg text-on-surface font-semibold text-[15px] block">Merchant & Bot API Keys</span>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-sans tabular-nums font-bold">MERCHANT</span>
                  </div>
                  <span className="text-xs text-outline">Create & manage keys for bots & checkouts</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-on-surface-variant" />
            </button>

            <Link 
              href="/partner" 
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group border border-success/20 hover:border-success/40 transition-colors block"
            >
              <div className="flex items-center gap-4">
                <LayoutDashboard className="w-5 h-5 text-success group-hover:text-success transition-colors" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-body-lg text-on-surface font-semibold text-[15px] block">Partner Dashboard</span>
                    <span className="px-2 py-0.5 rounded-full bg-success/10 border border-success/20 text-success text-[10px] font-sans tabular-nums font-bold">ANALYTICS</span>
                  </div>
                  <span className="text-xs text-outline">Track swaps, payments & live partner revenue</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-on-surface-variant" />
            </Link>

            <Link 
              href="/docs" 
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group border border-white/5 hover:border-white/20 transition-colors block"
            >
              <div className="flex items-center gap-4">
                <Code2 className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="font-body-lg text-on-surface font-semibold text-[15px] block">Developer APIs Documentation</span>
                  <span className="text-xs text-outline">Pay Links, Quotes & Rates endpoints</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-on-surface-variant" />
            </Link>

            <a 
              href="https://basescan.org/address/0x4cad6eC90e65baBec9335cAd728DDC610c316368" 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-black/20 p-5 rounded-2xl flex items-center justify-between group border border-white/5 hover:border-white/20 transition-colors block"
            >
              <div className="flex items-center gap-4">
                <ExternalLink className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="font-body-lg text-on-surface font-semibold text-[15px] block">P2P Diamond Contract</span>
                  <span className="text-xs font-sans tabular-nums text-outline">0x4cad...6368 (Base Mainnet)</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-on-surface-variant" />
            </a>
          </div>
        </section>

        {/* Footer / Disconnect */}
        <footer className="pt-4 flex justify-center animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500">
          <button 
            onClick={logout}
            className="monolith-card w-full flex items-center justify-center gap-3 px-10 py-5 text-error font-label-caps font-bold tracking-normal  hover:bg-error/10 border-error/30 active:scale-95 transition-colors rounded-[24px]"
          >
            <LogOut className="w-5 h-5" />
            Disconnect Wallet
          </button>
        </footer>
      </main>
    </div>
  );
}
