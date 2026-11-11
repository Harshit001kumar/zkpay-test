"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { usePrivy } from "@privy-io/react-auth";
import {
  DollarSign,
  Key,
  Copy,
  Check,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Terminal,
  Zap,
} from "lucide-react";

interface ApiKeyItem {
  id: string;
  label: string;
  maskedKey: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: number;
}

export function InAppPartner() {
  const { address } = useActiveAccount();
  const { getAccessToken } = usePrivy();
  const [balanceUsd, setBalanceUsd] = useState<number>(0);
  const [totalEarnedUsd, setTotalEarnedUsd] = useState<number>(0);
  const [swapsCount, setSwapsCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const token = await getAccessToken().catch(() => null);
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. Fetch balance
      const bRes = await fetch("/api/partner/balance", { headers });
      if (bRes.ok) {
        const bData = await bRes.json();
        if (bData.success) {
          const bal = bData.balance || bData;
          setBalanceUsd(bal.availableBalanceUsd || 0);
          setTotalEarnedUsd(bal.totalEarnedUsd || 0);
          setSwapsCount(bal.settledSwapsCount || 0);
        }
      }

      // 2. Fetch API keys
      const kRes = await fetch("/api/profile/api-keys", { headers });
      if (kRes.ok) {
        const kData = await kRes.json();
        const keysList = kData.keys || kData.apiKeys;
        if (kData.success && Array.isArray(keysList)) {
          setApiKeys(keysList);
        }
      }
    } catch {
      // silent fallback
    } finally {
      setLoading(false);
    }
  }, [address, getAccessToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyLabel.trim()) return;
    setCreatingKey(true);
    setErrorMsg(null);
    setCreatedKey(null);

    try {
      const token = await getAccessToken().catch(() => null);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch("/api/profile/api-keys", {
        method: "POST",
        headers,
        body: JSON.stringify({ label: newKeyLabel.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to generate key");
      }
      setCreatedKey(data.plaintextKey || data.apiKey);
      setNewKeyLabel("");
      loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Network error");
    } finally {
      setCreatingKey(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full pb-12 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary motion-safe:animate-pulse" />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
              Partner &amp; Developer Hub
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
            Monetize cross-chain swaps in your app or bot with 50/50 USD net revenue sharing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/partner"
            className="h-10 px-4 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-surface inline-flex items-center gap-1.5 hover:border-outline transition-colors"
          >
            <span>Full Portal</span>
            <ExternalLink className="w-3.5 h-3.5 text-on-surface-variant" />
          </Link>
          <Link
            href="/docs"
            className="h-10 px-4 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-transform"
          >
            <span>API Docs</span>
            <Terminal className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* 50/50 Revenue Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-[1.75rem] p-1.5 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
          <div className="rounded-[calc(1.75rem-0.375rem)] bg-surface-container-low p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <span>Available Yield</span>
              <DollarSign className="w-4 h-4 text-secondary" />
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-bold text-on-surface tabular-nums">
              ${balanceUsd.toFixed(2)}
              <span className="text-xs font-normal text-on-surface-variant ml-1">USD</span>
            </div>
            <span className="text-[11px] text-secondary font-medium block">
              Min withdrawal $1.00 in USDC/SOL/LTC
            </span>
          </div>
        </div>

        <div className="rounded-[1.75rem] p-1.5 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
          <div className="rounded-[calc(1.75rem-0.375rem)] bg-surface-container-low p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <span>Total Earned</span>
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-bold text-on-surface tabular-nums">
              ${totalEarnedUsd.toFixed(2)}
              <span className="text-xs font-normal text-on-surface-variant ml-1">USD</span>
            </div>
            <span className="text-[11px] text-on-surface-variant block">50% net split credited instantly</span>
          </div>
        </div>

        <div className="rounded-[1.75rem] p-1.5 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
          <div className="rounded-[calc(1.75rem-0.375rem)] bg-surface-container-low p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <span>Settled Orders</span>
              <ShieldCheck className="w-4 h-4 text-secondary" />
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-bold text-on-surface tabular-nums">
              {swapsCount}
            </div>
            <span className="text-[11px] text-on-surface-variant block">Across 9 blockchains</span>
          </div>
        </div>
      </div>

      {/* Generate API Key Card */}
      <div className="rounded-[2rem] p-1.5 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
        <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-5 sm:p-7 space-y-5">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-secondary" />
            <h2 className="text-base font-bold text-on-surface">Generate Partner API Key</h2>
          </div>

          <form onSubmit={handleCreateKey} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              placeholder="Key label (e.g. Telegram Bot, Web Widget)"
              className="flex-1 h-11 px-4 rounded-xl bg-surface-container border border-outline-variant text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary/60"
            />
            <button
              type="submit"
              disabled={creatingKey || !newKeyLabel.trim()}
              className="h-11 px-5 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {creatingKey ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Create Key</span>
            </button>
          </form>

          {createdKey && (
            <div className="p-4 rounded-xl bg-secondary/10 border border-secondary/30 space-y-2 animate-fade-in-up">
              <span className="text-xs font-bold text-secondary block">
                API Key Created (Save this now; it will not be displayed again):
              </span>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2.5 rounded-lg bg-surface font-mono text-xs text-on-surface select-all break-all">
                  {createdKey}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(createdKey, "created")}
                  className="h-9 px-3 rounded-lg bg-secondary text-on-secondary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey === "created" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy</span>
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-error/10 border border-error/25 text-xs text-error flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Active Keys List */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-semibold text-on-surface block">Your Active API Keys</span>
            {apiKeys.length === 0 ? (
              <p className="text-xs text-on-surface-variant py-2">
                No API keys generated yet. Create one above to start monetizing cross-chain trades.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/60 rounded-xl bg-surface-container border border-outline-variant overflow-hidden">
                {apiKeys.map((k) => (
                  <div key={k.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-on-surface block truncate">{k.label}</span>
                      <span className="font-mono text-[11px] text-on-surface-variant">{k.maskedKey}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-secondary/15 text-secondary text-[10px] font-bold">
                      ACTIVE
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
