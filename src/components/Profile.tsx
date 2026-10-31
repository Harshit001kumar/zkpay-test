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
  UserCheck,
  Zap,
  Sliders,
  Lock,
} from "lucide-react";
import { Tilt3DMonolith, DepthLayer } from "@/components/ui/Tilt3DMonolith";

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
  const { getAccessToken, exportWallet } = usePrivy();
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
    const code = rewardsData?.referralCode || "…";
    const link = rewardsData?.referralLink || `https://zkpay.top/?ref=${code}`;
    const shareText = `Hey! I use ZkPay to scan any UPI QR code and pay directly with crypto on Base. Get Monthly Cashback on all payments: ${link}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Pay any UPI QR with crypto on Base and get Monthly Cashback!")}`;

    return (
      <div className="fixed inset-0 z-[70] bg-surface text-on-surface font-body-md selection:bg-primary/30 min-h-screen flex flex-col pb-36 overflow-y-auto w-full">
        {/* TopAppBar */}
        <header className="w-full sticky top-3.5 z-50 flex justify-between items-center px-6 py-3 max-w-2xl mx-auto bg-surface/85 backdrop-blur-xl rounded-full border border-primary/25 mt-3.5">
          <button
            onClick={() => setActiveView("main")}
            className="flex items-center gap-2 px-4 py-2 bg-surface-container-low border border-primary/30 rounded-full cursor-pointer active:scale-95 transition-transform text-xs font-sans tabular-nums font-bold text-primary hover:text-on-surface whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Profile</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-xs font-sans tabular-nums font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>Scan &amp; Pay</span>
          </div>
        </header>

        <main className="w-full max-w-xl mx-auto px-4 pt-4 pb-40 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 text-primary mb-2 shadow-dock-label">
              <Gift className="w-7 h-7" />
            </div>
            <h2 className="font-display-xl-mobile text-[28px] font-bold text-on-surface tracking-tight">
              Refer &amp; Earn
            </h2>
            <p className="text-xs text-on-surface-variant max-w-md mx-auto leading-relaxed font-sans tabular-nums">
              Earn 20% commission on friends&apos; Scan &amp; Pay fees + get Monthly Cashback on all your own payments.
            </p>
          </div>

          {/* Monthly Pool Card */}
          <section className="bg-surface-container-low border border-primary/30 shadow-elevated rounded-3xl p-6 md:p-8 space-y-4">
            <div className="flex justify-between items-center text-xs font-sans tabular-nums text-primary">
              <span className="tracking-normal font-bold">This month&apos;s accrual</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-surface-container text-on-surface">
                Cycle: {rewardsData?.currentCycle || "Current"}
              </span>
            </div>

            <div className="space-y-1">
              <div className="font-mono text-4xl font-bold tracking-tight text-on-surface flex items-baseline gap-2">
                ${(rewardsData?.thisMonth?.totalDueUsdc || 0).toFixed(2)}
                <span className="text-base font-normal font-sans tabular-nums text-primary">USDC</span>
              </div>
              <p className="text-xs font-sans tabular-nums text-on-surface-variant">
                Status:{" "}
                <span className="text-secondary font-bold">
                  {rewardsData?.thisMonth?.status === "PAID" ? "Settled / Paid" : "Accruing for Month-End Disbursal"}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-primary/15 text-xs font-sans tabular-nums">
              <div className="bg-surface-container p-3 rounded-xl border border-primary/15">
                <span className="text-on-surface-variant block text-xs mb-1">Your cashback</span>
                <span className="font-mono text-on-surface font-bold text-sm">
                  ${(rewardsData?.thisMonth?.cashbackUsdc || 0).toFixed(2)} USDC
                </span>
              </div>
              <div className="bg-surface-container p-3 rounded-xl border border-primary/15">
                <span className="text-on-surface-variant block text-xs mb-1">Referral commissions</span>
                <span className="font-mono text-on-surface font-bold text-sm">
                  ${(rewardsData?.thisMonth?.referralUsdc || 0).toFixed(2)} USDC
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-container border border-primary/15 flex items-start gap-3 text-xs font-sans tabular-nums text-on-surface-variant leading-relaxed">
              <Calendar className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Rewards are sent automatically by Admin in a single batch directly to your wallet at the end of each month.
              </span>
            </div>
          </section>

          {/* Referral Sharing Card */}
          <section className="bg-surface-container-low border border-primary/20 shadow-elevated rounded-3xl p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-2 text-xs font-sans tabular-nums font-bold text-on-surface-variant tracking-normal">
              <Share2 className="w-4 h-4 text-primary" />
              <span>Share Your Referral Link</span>
            </div>

            {/* Code Row */}
            <div className="space-y-1.5">
              <label className="text-xs font-sans tabular-nums text-on-surface-variant">Your Referral Code</label>
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container border border-primary/15">
                <span className="font-mono tabular-nums text-base font-bold text-primary tracking-normal">{code}</span>
                <button
                  onClick={handleCopyReferralCode}
                  className="p-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface transition-colors"
                  title="Copy Code"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Link Row */}
            <div className="space-y-1.5">
              <label className="text-xs font-sans tabular-nums text-on-surface-variant">Your Referral Link</label>
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container border border-primary/15">
                <span className="font-mono tabular-nums text-xs text-on-surface truncate max-w-[260px]">{link}</span>
                <button
                  onClick={handleCopyReferralLink}
                  className="p-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface transition-colors"
                  title="Copy Link"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 1-Tap Share Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 px-4 rounded-xl bg-secondary/20 hover:bg-secondary/30 border border-secondary/30 text-secondary text-xs font-sans tabular-nums font-bold flex items-center justify-center gap-2 transition-colors active:scale-95 whitespace-nowrap"
              >
                <Share2 className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
              <a
                href={tgUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 px-4 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-xs font-sans tabular-nums font-bold flex items-center justify-center gap-2 transition-colors active:scale-95 whitespace-nowrap"
              >
                <Share2 className="w-4 h-4" />
                <span>Telegram</span>
              </a>
            </div>
          </section>

          {/* Referrer Status & Manual Binding Card */}
          <section className="bg-surface-container-low border border-primary/20 shadow-elevated rounded-3xl p-6 md:p-8 space-y-4">
            <div className="flex items-center gap-2 text-xs font-sans tabular-nums font-bold text-on-surface-variant tracking-normal">
              <Gift className="w-4 h-4 text-primary" />
              <span>Your Referrer Status</span>
            </div>

            {rewardsData?.referredBy ? (
              <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/10 border border-secondary/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-secondary">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-sans tabular-nums font-bold text-on-surface block">Bound to Referrer</span>
                    <span className="text-xs font-mono tabular-nums text-secondary">
                      {rewardsData.referredBy.slice(0, 6)}…{rewardsData.referredBy.slice(-4)}
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-secondary/20 text-secondary text-xs font-sans tabular-nums font-bold">
                  Active
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-sans tabular-nums text-on-surface-variant leading-relaxed">
                  Have a friend&apos;s referral code or address? Enter it once below to link your account and earn cashback.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualRefCode}
                    onChange={(e) => setManualRefCode(e.target.value)}
                    placeholder="Enter code (e.g. ZK12AB)"
                    className="flex-1 bg-surface-container border border-primary/20 rounded-xl px-4 py-3 text-xs font-sans tabular-nums text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={handleApplyReferral}
                    disabled={isBindingRef || !manualRefCode.trim()}
                    className="px-5 py-3 rounded-xl bg-primary text-on-primary font-sans tabular-nums font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {isBindingRef ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
                  </button>
                </div>
                {refBindingMsg && (
                  <p
                    className={`text-xs font-sans tabular-nums ${
                      refBindingMsg.type === "success" ? "text-secondary" : "text-error"
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
            <div className="bg-surface-container-low border border-primary/20 shadow-elevated rounded-2xl p-5 text-center space-y-1">
              <Users className="w-5 h-5 text-primary mx-auto mb-1" />
              <div className="font-mono text-2xl font-bold text-on-surface">
                {rewardsData?.friendsInvited || 0}
              </div>
              <div className="text-xs font-sans tabular-nums text-on-surface-variant tracking-normal">Friends Invited</div>
            </div>
            <div className="bg-surface-container-low border border-primary/20 shadow-elevated rounded-2xl p-5 text-center space-y-1">
              <Sparkles className="w-5 h-5 text-primary mx-auto mb-1" />
              <div className="font-mono text-2xl font-bold text-on-surface">
                ${(rewardsData?.lifetime?.totalEarnedUsdc || 0).toFixed(2)}
              </div>
              <div className="text-xs font-sans tabular-nums text-on-surface-variant tracking-normal">Lifetime Rewards</div>
            </div>
          </section>

          {/* Past Payouts History */}
          <section className="bg-surface-container-low border border-primary/20 shadow-elevated rounded-3xl p-6 space-y-3">
            <span className="text-xs font-sans tabular-nums font-bold text-on-surface-variant tracking-normal block">
              Past Monthly Disbursals
            </span>
            {rewardsData?.pastPayouts && rewardsData.pastPayouts.length > 0 ? (
              <div className="space-y-2">
                {rewardsData.pastPayouts.map((p: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-surface-container border border-primary/15 flex items-center justify-between text-xs font-sans tabular-nums"
                  >
                    <div>
                      <span className="text-on-surface font-bold block">Cycle {p.cycle}</span>
                      <span className="text-xs text-on-surface-variant">
                        {new Date(p.paidAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-secondary font-bold">
                        +<span className="font-mono">${p.amountUsdc.toFixed(2)}</span> USDC
                      </span>
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
              <p className="text-xs font-sans tabular-nums text-on-surface-variant text-center py-4">
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
      <div className="fixed inset-0 z-[70] bg-surface text-on-surface font-body-md selection:bg-primary/30 min-h-screen flex flex-col pb-36 overflow-y-auto w-full">
        {/* TopAppBar */}
        <header className="w-full sticky top-3.5 z-50 flex justify-between items-center px-6 py-3 max-w-2xl mx-auto bg-surface/85 backdrop-blur-xl rounded-full border border-primary/25 mt-3.5">
          <button
            onClick={() => setActiveView("main")}
            className="flex items-center gap-2 px-4 py-2 bg-surface-container-low border border-primary/30 rounded-full cursor-pointer active:scale-95 transition-transform text-xs font-sans tabular-nums font-bold text-primary hover:text-on-surface whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Profile</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-sans tabular-nums font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span>Merchant API v1</span>
          </div>
        </header>

        <main className="w-full max-w-xl mx-auto px-4 pt-4 pb-40 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 text-primary mb-2 shadow-dock-label">
              <Key className="w-7 h-7" />
            </div>
            <h2 className="font-display-xl-mobile text-[28px] font-bold text-on-surface tracking-tight">
              Merchant &amp; Bot API Keys
            </h2>
            <p className="text-xs text-on-surface-variant max-w-md mx-auto leading-relaxed font-sans tabular-nums">
              Integrate ZkPay into Telegram/Discord bots, payment checkouts, and automated systems with on-chain crypto-to-UPI settlements.
            </p>
          </div>

          {/* Partner Dashboard Quick Link */}
          <Link
            href="/partner"
            className="bg-surface-container-low border border-secondary/25 shadow-elevated rounded-3xl p-4 flex items-center justify-between gap-3 group hover:border-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-on-surface">Partner Dashboard &amp; Ledger</span>
                  <span className="px-2 py-0.5 rounded text-xs font-sans tabular-nums font-bold bg-secondary/20 text-secondary border border-secondary/30">
                    Analytics
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant font-sans tabular-nums">
                  Track swap volumes, transactions &amp; partner earnings
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-secondary group-hover:translate-x-0.5 transition-transform" />
          </Link>

          {/* New Key Generated Alert Banner */}
          {newKeyResult && (
            <section className="bg-surface-container-low border border-warning/40 shadow-elevated rounded-3xl p-6 space-y-4 animate-in zoom-in-95 duration-300">
              <div className="flex items-center gap-2 text-warning text-xs font-sans tabular-nums font-bold tracking-normal">
                <AlertCircle className="w-4 h-4" />
                <span>Save Your API Key Now</span>
              </div>
              <p className="text-xs font-sans tabular-nums text-on-surface-variant leading-relaxed">
                This secret API key will <strong className="text-on-surface">never be shown again</strong>. Please copy and store it securely in your environment variables.
              </p>
              <div className="p-3.5 rounded-xl bg-surface-container border border-warning/30 flex items-center justify-between gap-2">
                <code className="text-xs font-mono tabular-nums text-warning break-all select-all font-semibold">
                  {newKeyResult.plaintextKey}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(newKeyResult.plaintextKey);
                    setCopiedNewKey(true);
                    setTimeout(() => setCopiedNewKey(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-warning/20 hover:bg-warning/30 border border-warning/40 text-warning text-xs font-sans tabular-nums font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                >
                  {copiedNewKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedNewKey ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setNewKeyResult(null)}
                  className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-sans tabular-nums font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  I have saved this key
                </button>
              </div>
            </section>
          )}

          {/* Create Key Form */}
          <section className="bg-surface-container-low border border-primary/20 shadow-elevated rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-sans tabular-nums font-bold text-primary tracking-normal">
                Create New API Key
              </span>
              <span className="text-xs font-sans tabular-nums text-on-surface-variant">
                Base Mainnet · Chain 8453
              </span>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  placeholder="Key Label (e.g. Telegram Bot, E-commerce Store)"
                  className="w-full px-4 py-3 rounded-xl bg-surface-container border border-primary/20 text-on-surface placeholder-on-surface-variant text-xs font-sans tabular-nums focus:outline-none focus:border-primary/60 transition-colors"
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
          <section className="bg-surface-container-low border border-primary/20 shadow-elevated rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-sans tabular-nums font-bold text-on-surface-variant tracking-normal">
                Your API Keys ({apiKeys.length})
              </span>
              <button
                onClick={fetchApiKeys}
                disabled={isLoadingKeys}
                className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer"
                title="Refresh keys"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingKeys ? "animate-spin" : ""}`} />
              </button>
            </div>

            {isLoadingKeys && apiKeys.length === 0 ? (
              <div className="text-center py-8 text-xs font-sans tabular-nums text-on-surface-variant">
                Loading keys…
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Key className="w-8 h-8 text-on-surface-variant/40 mx-auto" />
                <p className="text-xs font-sans tabular-nums text-on-surface-variant">
                  No API keys yet. Generate one above to access the API.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((k) => (
                  <div
                    key={k.id}
                    className="p-4 rounded-2xl bg-surface-container border border-primary/15 space-y-2 hover:border-primary/30 transition-colors font-sans tabular-nums"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-on-surface">{k.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            k.status === "ACTIVE"
                              ? "bg-secondary/10 text-secondary border border-secondary/20"
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
                          className="text-error hover:text-error text-xs font-sans tabular-nums flex items-center gap-1 hover:underline cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{revokingId === k.id ? "Revoking…" : "Revoke"}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs bg-surface-container-low p-2.5 rounded-xl border border-primary/15">
                      <span className="font-mono text-primary select-all">{k.maskedKey}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(k.id);
                          setCopiedKeyId(k.id);
                          setTimeout(() => setCopiedKeyId(null), 2000);
                        }}
                        className="text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap"
                        title="Copy Key ID"
                      >
                        {copiedKeyId === k.id ? <Check className="w-3 h-3 text-secondary" /> : <Copy className="w-3 h-3" />}
                        <span>ID</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-on-surface-variant pt-1">
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
          <section className="bg-surface-container-low border border-primary/20 shadow-elevated rounded-3xl p-6 space-y-3 font-sans tabular-nums">
            <div className="flex items-center gap-2 text-xs font-bold text-primary tracking-normal">
              <Terminal className="w-4 h-4" />
              <span>cURL Quickstart</span>
            </div>
            <p className="text-xs text-on-surface-variant">
              Pass your API key in the <code className="font-mono text-primary">x-api-key</code> header:
            </p>
            <div className="p-3.5 rounded-xl bg-surface-container border border-primary/15 text-xs font-mono text-primary overflow-x-auto leading-relaxed">
              <pre>{`curl -X POST "https://zkpay.top/api/v1/paylinks" \\
  -H "x-api-key: zkpay_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"amountINR": 500, "recipientUpi": "merchant@okaxis"}'`}</pre>
            </div>
            <div className="pt-2">
              <Link
                href="/docs"
                className="w-full py-3 rounded-xl bg-surface-container border border-primary/20 text-primary hover:text-on-surface text-xs font-bold tracking-normal flex items-center justify-center gap-2 hover:bg-surface-container-high transition-colors whitespace-nowrap"
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

  const handleExportWallet = async () => {
    try {
      if (typeof exportWallet === "function") {
        await exportWallet();
      } else if (address) {
        router.push(`/wallet/${address}`);
      }
    } catch {
      if (address) router.push(`/wallet/${address}`);
    }
  };

  return (
    <div className="text-on-surface font-sans selection:bg-primary/30 w-full pb-28">
      <main className="w-full max-w-2xl mx-auto space-y-6">
        {/* 3D Identity Vault Monolith */}
        <Tilt3DMonolith
          maxTilt={8}
          className="w-full"
          innerClassName="p-6 sm:p-8 flex flex-col items-center text-center bg-gradient-to-br from-surface-container-low via-surface-container to-surface"
        >
          <DepthLayer z={24} className="mb-4">
            <div className="w-20 h-20 rounded-2xl border border-primary/30 bg-surface-container flex items-center justify-center">
              <UserCheck className="w-9 h-9 text-secondary" />
            </div>
          </DepthLayer>

          <DepthLayer z={28}>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-on-surface mb-1 tracking-tight">
              {address ? "ZkPay Vault Signer" : "Guest Session"}
            </h2>
            <p className="text-xs font-semibold text-secondary mb-4">
              {isSmartWallet ? "ERC-4337 smart account" : "Non-custodial signer"}
            </p>
          </DepthLayer>

          <DepthLayer z={20} className="w-full flex flex-col items-center">
            <div
              onClick={() => {
                if (address) router.push(`/wallet/${address}`);
                else router.push("/wallet");
              }}
              className="inline-flex items-center gap-3 bg-surface-container hover:bg-surface-container-high px-5 py-2.5 rounded-full border border-primary/30 hover:border-primary/60 mb-6 cursor-pointer transition-colors active:scale-95 group"
              title="Open Base USDC deposit & wallet telemetry"
            >
              <span className="w-2 h-2 rounded-full bg-secondary" />
              <span className="font-mono text-xs text-primary tabular-nums group-hover:text-on-surface transition-colors">
                {shortAddress}
              </span>
              <button
                onClick={handleCopy}
                className="hover:text-on-surface text-on-surface-variant transition-colors flex items-center justify-center p-1 rounded-md hover:bg-surface-container-low"
                title="Copy Address"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full pt-4 border-t border-primary/15">
              <div className="p-3 rounded-xl bg-surface-container/90 border border-primary/25 flex items-center justify-between">
                <span className="text-xs text-primary font-bold">
                  Platinum tier
                </span>
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div className="p-3 rounded-xl bg-surface-container/90 border border-secondary/25 flex items-center justify-between">
                <span className="text-xs text-secondary font-bold">
                  Gasless paymaster
                </span>
                <Zap className="w-4 h-4 text-secondary" />
              </div>
            </div>
          </DepthLayer>
        </Tilt3DMonolith>

        {/* Refer & Earn & Monthly Cashback Module */}
        <section className="rounded-3xl p-6 sm:p-7 bg-surface-container-low border border-primary/25 shadow-elevated">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/35 flex items-center justify-center text-primary">
                <Gift className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-on-surface">
                Refer &amp; Earn · Monthly Cashback
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-secondary/10 border border-secondary/30 text-secondary text-xs font-bold">
              Scan &amp; Pay
            </span>
          </div>

          <div className="bg-surface-container rounded-2xl p-5 border border-primary/20 mb-5 space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-on-surface-variant">
                This month&apos;s accrued
              </span>
              <span className="font-mono text-2xl font-extrabold text-on-surface tracking-tight tabular-nums">
                ${(rewardsData?.thisMonth?.totalDueUsdc || 0).toFixed(2)}{" "}
                <span className="font-sans text-xs text-primary font-semibold">USDC</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-primary/15 text-xs tabular-nums text-on-surface-variant">
              <div>
                Cashback:{" "}
                <span className="font-mono text-on-surface font-bold">
                  ${(rewardsData?.thisMonth?.cashbackUsdc || 0).toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                Referral:{" "}
                <span className="font-mono text-on-surface font-bold">
                  ${(rewardsData?.thisMonth?.referralUsdc || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs tabular-nums text-on-surface-variant mb-5 px-1">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span>Batch disbursed at month-end</span>
            </span>
            <span>
              <span className="font-mono">{rewardsData?.friendsInvited || 0}</span> invited
            </span>
          </div>

          <button
            onClick={() => setActiveView("referral")}
            className="w-full py-4 rounded-xl bg-secondary hover:brightness-110 text-on-secondary font-bold text-xs transition-colors flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-card whitespace-nowrap"
          >
            <Share2 className="w-4 h-4" />
            <span>Open Referral Hub &amp; Share</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </section>

        {/* Security Module */}
        <section className="rounded-3xl p-6 sm:p-7 bg-surface-container-low border border-primary/25 shadow-elevated">
          <div className="flex items-center gap-2.5 mb-5">
            <Lock className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold text-on-surface-variant">
              Security &amp; signing keys
            </h3>
          </div>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleExportWallet}
              className="w-full bg-surface-container p-4 rounded-2xl flex items-center justify-between group cursor-pointer border border-primary/20 hover:border-primary/50 transition-colors text-left whitespace-nowrap"
            >
              <div className="flex items-center gap-3.5">
                <Key className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">Export Signer Key</span>
                  <span className="text-xs text-on-surface-variant">
                    Privy non-custodial enclave export
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-on-surface-variant" />
            </button>

            <div
              className="bg-surface-container p-4 rounded-2xl flex items-center justify-between group cursor-pointer border border-primary/20 hover:border-primary/50 transition-colors"
              onClick={() => setBiometricEnabled(!biometricEnabled)}
            >
              <div className="flex items-center gap-3.5">
                <Fingerprint className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">Passkey &amp; Biometric Guard</span>
                  <span className="text-xs text-on-surface-variant">
                    Hardware enclave verification
                  </span>
                </div>
              </div>
              <div
                className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
                  biometricEnabled ? "bg-secondary/25 border border-secondary/50" : "bg-surface-container-low border border-primary/20"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full transition-transform ${
                    biometricEnabled ? "translate-x-5 bg-secondary" : "translate-x-0 bg-on-surface/70"
                  }`}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (address) router.push(`/wallet/${address}`);
                else router.push("/wallet");
              }}
              className="w-full bg-surface-container p-4 rounded-2xl flex items-center justify-between group cursor-pointer border border-primary/20 hover:border-primary/50 transition-colors text-left whitespace-nowrap"
            >
              <div className="flex items-center gap-3.5">
                <FileText className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">Wallet Telemetry &amp; Backup</span>
                  <span className="text-xs text-on-surface-variant">
                    Inspect smart account &amp; EOA balances
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-on-surface-variant" />
            </button>
          </div>
        </section>

        {/* Preferences Module */}
        <section className="rounded-3xl p-6 sm:p-7 bg-surface-container-low border border-primary/25 shadow-elevated">
          <div className="flex items-center gap-2.5 mb-5">
            <Sliders className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold text-on-surface-variant">
              Settlement preferences
            </h3>
          </div>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setIsSelectorOpen(true)}
              className="w-full bg-surface-container p-4 rounded-2xl flex items-center justify-between group cursor-pointer border border-primary/20 hover:border-primary/50 transition-colors text-left whitespace-nowrap"
            >
              <div className="flex items-center gap-3.5">
                <DollarSign className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">Default Global Rail</span>
                  <span className="text-xs text-on-surface-variant">
                    {currencyMeta.name} / {currencyMeta.rail}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-secondary font-bold">
                  {currencyMeta.code} ({currencyMeta.symbol})
                </span>
                <ChevronRight className="w-4 h-4 text-on-surface-variant group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>

            <div className="bg-surface-container p-4 rounded-2xl flex items-center justify-between border border-primary/20">
              <div className="flex items-center gap-3.5">
                <Network className="w-4 h-4 text-secondary" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">Settlement L2 Network</span>
                  <span className="text-xs text-on-surface-variant">Base Mainnet (Chain 8453)</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/30 text-xs text-secondary font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                Connected
              </span>
            </div>
          </div>
        </section>

        {/* Protocol & Developer Tools Module */}
        <section className="rounded-3xl p-6 sm:p-7 bg-surface-container-low border border-primary/25 shadow-elevated">
          <div className="flex items-center gap-2.5 mb-5">
            <Terminal className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold text-on-surface-variant">
              Developer &amp; protocol standards
            </h3>
          </div>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setActiveView("api-keys")}
              className="bg-surface-container p-4 rounded-2xl flex items-center justify-between group border border-primary/20 hover:border-primary/50 transition-colors w-full text-left cursor-pointer whitespace-nowrap"
            >
              <div className="flex items-center gap-3.5">
                <Key className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-on-surface font-semibold text-sm">Merchant &amp; Bot API Keys</span>
                    <span className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/35 text-primary text-xs font-bold">
                      REST v1
                    </span>
                  </div>
                  <span className="text-xs text-on-surface-variant">
                    Create &amp; manage keys for bots &amp; checkouts
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-on-surface-variant" />
            </button>

            <Link
              href="/partner"
              className="bg-surface-container p-4 rounded-2xl flex items-center justify-between group border border-secondary/25 hover:border-secondary/50 transition-colors block"
            >
              <div className="flex items-center gap-3.5">
                <LayoutDashboard className="w-4 h-4 text-secondary" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-on-surface font-semibold text-sm">Partner Dashboard</span>
                    <span className="px-2 py-0.5 rounded-full bg-secondary/10 border border-secondary/30 text-secondary text-xs font-bold">
                      Analytics
                    </span>
                  </div>
                  <span className="text-xs text-on-surface-variant">
                    Track swaps, payments &amp; live partner revenue
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-on-surface-variant" />
            </Link>

            <Link
              href="/docs"
              className="bg-surface-container p-4 rounded-2xl flex items-center justify-between group border border-primary/20 hover:border-primary/50 transition-colors block"
            >
              <div className="flex items-center gap-3.5">
                <Code2 className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">Developer APIs Documentation</span>
                  <span className="text-xs text-on-surface-variant">
                    Pay Links, Quotes &amp; Rates endpoints
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-on-surface-variant" />
            </Link>

            <Link
              href="/privacy"
              className="bg-surface-container p-4 rounded-2xl flex items-center justify-between group border border-primary/20 hover:border-primary/50 transition-colors block"
            >
              <div className="flex items-center gap-3.5">
                <Shield className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">Privacy Policy</span>
                  <span className="text-xs text-on-surface-variant">
                    Zero-knowledge &amp; ECIES encryption standards
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-on-surface-variant" />
            </Link>

            <Link
              href="/terms"
              className="bg-surface-container p-4 rounded-2xl flex items-center justify-between group border border-primary/20 hover:border-primary/50 transition-colors block"
            >
              <div className="flex items-center gap-3.5">
                <Scale className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">Terms of Service</span>
                  <span className="text-xs text-on-surface-variant">
                    Protocol rules &amp; non-custodial terms
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-on-surface-variant" />
            </Link>

            <a
              href="https://basescan.org/address/0x4cad6eC90e65baBec9335cAd728DDC610c316368"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-surface-container p-4 rounded-2xl flex items-center justify-between group border border-primary/20 hover:border-primary/50 transition-colors block"
            >
              <div className="flex items-center gap-3.5">
                <ExternalLink className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">P2P Diamond Contract</span>
                  <span className="font-mono text-xs tabular-nums text-on-surface-variant">
                    0x4cad…6368 (Base Mainnet)
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-on-surface-variant" />
            </a>
          </div>
        </section>

        {/* Disconnect Button */}
        <footer className="pt-2">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl bg-error/10 hover:bg-error/20 border border-error/30 text-error text-xs font-bold active:scale-[0.98] transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnect Session</span>
          </button>
        </footer>
      </main>
    </div>
  );
}
