"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { usePrivy } from "@privy-io/react-auth";
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
  ArrowLeft,
  Plus,
  Trash2,
  Terminal,
  AlertCircle,
  RefreshCw,
  LayoutDashboard,
  UserCheck,
  Sliders,
  Lock,
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
  const { getAccessToken, exportWallet } = usePrivy();

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
  const [copied, setCopied] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [activeView, setActiveView] = useState<"main" | "api-keys">("main");

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

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
              Integrate ZkPay into Telegram/Discord bots, payment checkouts, and automated systems with instant cross-chain swap settlements.
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
              <pre>{`curl -X POST "https://zkpay.top/api/v1/swap/create" \\
  -H "x-api-key: zkpay_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"fromAsset": "SOL", "chain": "sol", "toAsset": "USDC", "destinationChain": "base", "amount": "1000000000", "recipient": "0x..."}'`}</pre>
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
        {/* Identity Vault Card */}
        <div className="w-full rounded-2xl border border-outline-variant bg-surface-container p-6 sm:p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl border border-outline-variant bg-surface-container-high flex items-center justify-center mb-3">
            <UserCheck className="w-8 h-8 text-secondary" />
          </div>

          <h2 className="text-xl sm:text-2xl font-semibold text-on-surface mb-1 tracking-tight">
            {address ? "ZkPay Vault Signer" : "Guest Session"}
          </h2>
          <p className="text-xs text-secondary font-medium mb-4">
            {isSmartWallet ? "ERC-4337 smart account" : "Non-custodial signer"}
          </p>

          <div className="w-full flex flex-col items-center">
            <div
              onClick={() => {
                if (address) router.push(`/wallet/${address}`);
                else router.push("/wallet");
              }}
              className="inline-flex items-center gap-3 bg-surface-container-low hover:bg-surface-container-high px-4 py-2 rounded-xl border border-outline-variant mb-5 cursor-pointer transition-colors active:scale-95 group"
              title="Open Base USDC deposit & wallet telemetry"
            >
              <span className="w-2 h-2 rounded-full bg-secondary" />
              <span className="font-mono text-xs text-on-surface tabular-nums">
                {shortAddress}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="hover:text-on-surface text-on-surface-variant transition-colors flex items-center justify-center p-1 rounded-md"
                title="Copy Address"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 w-full pt-4 border-t border-outline-variant">
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between">
                <span className="text-xs text-on-surface font-medium">
                  Platinum tier
                </span>
                <Shield className="w-4 h-4 text-secondary" />
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between">
                <span className="text-xs text-on-surface font-medium">
                  Non-custodial
                </span>
                <Shield className="w-4 h-4 text-secondary" />
              </div>
            </div>
          </div>
        </div>

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
            <Link
              href="/partner"
              className="w-full bg-surface-container p-4 rounded-2xl flex items-center justify-between group cursor-pointer border border-primary/20 hover:border-primary/50 transition-colors text-left whitespace-nowrap"
            >
              <div className="flex items-center gap-3.5">
                <DollarSign className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">Partner Fee Settlement</span>
                  <span className="text-xs text-on-surface-variant">
                    50/50 USD Revenue Share · Crypto Withdrawals
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-secondary font-bold">
                  USD Ledger
                </span>
                <ChevronRight className="w-4 h-4 text-on-surface-variant group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>

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
              href="https://basescan.org/address/0xb856b24fb054135deba5e0309edd31ed6a8afbe2"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-surface-container p-4 rounded-2xl flex items-center justify-between group border border-primary/20 hover:border-primary/50 transition-colors block"
            >
              <div className="flex items-center gap-3.5">
                <ExternalLink className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                <div>
                  <span className="text-on-surface font-semibold text-sm block">ZkPay Treasury</span>
                  <span className="font-mono text-xs tabular-nums text-on-surface-variant">
                    0xb856…fbe2 (Base Mainnet)
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
