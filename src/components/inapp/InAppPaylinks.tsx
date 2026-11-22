"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { usePrivy } from "@privy-io/react-auth";
import { SWAP_ALLOWED_TOKENS, TEMPORARILY_DISABLED_CHAINS } from "@/lib/constants";
import { CHAIN_METADATA, SupportedChainId, SwapTokenItem } from "@/lib/types";
import { isValidAddressForOriginAsset } from "@/lib/refundAddress";
import { CryptoIcon } from "@/components/ui/CryptoIcon";
import {
  Plus,
  Copy,
  Check,
  QrCode,
  ExternalLink,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  AlertCircle,
  ClipboardPaste,
  Wallet,
  CheckCircle2,
  Clock,
  Lock,
} from "lucide-react";

interface SavedAddressItem {
  id: string;
  userId: string;
  label: string;
  chain: string;
  address: string;
  createdAt: number;
}

interface PaylinkPaymentSummary {
  swapId: string;
  fromAsset: string;
  originChain: string;
  amountInFormatted: string;
  toAsset: string;
  destinationChain: string;
  amountOutFormatted: string;
  status: string;
  destinationTxHash: string | null;
  destinationExplorerUrl: string | null;
  createdAt: number;
}

interface PaylinkItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  receiveAssetId: string;
  receiveSymbol: string;
  receiveChain: string;
  receiveDecimals: number;
  recipientAddress: string;
  amountMode: "OPEN" | "FIXED";
  fixedAmount?: string;
  fixedCurrency?: "USD" | "ASSET";
  singleUse: boolean;
  status: "ACTIVE" | "PAUSED" | "PAID";
  createdAt: number;
  updatedAt: number;
  stats?: {
    totalCount: number;
    settledCount: number;
    pendingCount: number;
    payments: PaylinkPaymentSummary[];
  };
}

const EVM_CHAINS = new Set(["base", "eth", "arb", "polygon", "bsc"]);

function chainName(id: string): string {
  return CHAIN_METADATA[id as SupportedChainId]?.name || id.toUpperCase();
}

function shortAddr(a: string, head = 6, tail = 4): string {
  if (!a) return "";
  return a.length > head + tail + 2 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;
}

export function InAppPaylinks() {
  const { address } = useActiveAccount();
  const { getAccessToken } = usePrivy();

  const availableTokens = useMemo(
    () =>
      SWAP_ALLOWED_TOKENS.filter(
        (t) => !TEMPORARILY_DISABLED_CHAINS.has(t.blockchain)
      ) as unknown as SwapTokenItem[],
    []
  );

  // Default receive token: LTC (common request) or first available
  const defaultReceiveToken = useMemo(
    () =>
      availableTokens.find((t) => t.symbol === "LTC" && t.blockchain === "ltc") ||
      availableTokens[0],
    [availableTokens]
  );

  const [paylinks, setPaylinks] = useState<PaylinkItem[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Creator form state
  const [selectedToken, setSelectedToken] = useState<SwapTokenItem>(defaultReceiveToken);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [addressLabel, setAddressLabel] = useState("");
  const [title, setTitle] = useState("");
  const [amountMode, setAmountMode] = useState<"OPEN" | "FIXED">("OPEN");
  const [fixedAmount, setFixedAmount] = useState("25");
  const [fixedCurrency, setFixedCurrency] = useState<"USD" | "ASSET">("USD");
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [customSlug, setCustomSlug] = useState("");
  const [description, setDescription] = useState("");
  const [singleUse, setSingleUse] = useState(false);

  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newlyCreatedUrl, setNewlyCreatedUrl] = useState<string | null>(null);

  // Modal & card UI states
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openQrId, setOpenQrId] = useState<string | null>(null);
  const [expandedPaymentsId, setExpandedPaymentsId] = useState<string | null>(null);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  const loadPaylinks = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken().catch(() => null);
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/paylinks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPaylinks(Array.isArray(data.paylinks) ? data.paylinks : []);
          setSavedAddresses(Array.isArray(data.addresses) ? data.addresses : []);
        }
      }
    } catch {
      // ignore transient fetch errors
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadPaylinks();
  }, [loadPaylinks]);

  const savedForSelectedChain = useMemo(
    () => savedAddresses.filter((a) => a.chain.toLowerCase() === selectedToken.blockchain.toLowerCase()),
    [savedAddresses, selectedToken.blockchain]
  );

  const didAutoFillRef = useRef(false);

  // Auto-select first saved address for selected chain on initial load when input is empty
  useEffect(() => {
    if (didAutoFillRef.current) return;
    if (savedForSelectedChain.length > 0) {
      didAutoFillRef.current = true;
      setRecipientAddress((prev) => prev || savedForSelectedChain[0].address);
    }
  }, [savedForSelectedChain]);

  // Auto-select first saved address when switching chains if current input is empty or for another chain
  const handleSelectReceiveToken = (tok: SwapTokenItem) => {
    setSelectedToken(tok);
    setPickerOpen(false);
    setSearchQuery("");
    setChainFilter("all");
    const matchingSaved = savedAddresses.find(
      (a) => a.chain.toLowerCase() === tok.blockchain.toLowerCase()
    );
    if (matchingSaved) {
      setRecipientAddress(matchingSaved.address);
    } else if (EVM_CHAINS.has(tok.blockchain) && address) {
      setRecipientAddress(address);
    } else {
      setRecipientAddress("");
    }
    setAddressLabel("");
    setFormError(null);
  };

  useEffect(() => {
    if (!pickerOpen) return;
    if (window.matchMedia?.("(pointer: fine)").matches) {
      setTimeout(() => searchRef.current?.focus(), 40);
    }
  }, [pickerOpen]);

  const chainOptions = useMemo(() => {
    const uniq = Array.from(new Set(availableTokens.map((t) => t.blockchain)));
    return ["all", ...uniq];
  }, [availableTokens]);

  const filteredTokens = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return availableTokens.filter((t) => {
      if (chainFilter !== "all" && t.blockchain !== chainFilter) return false;
      if (!q) return true;
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.blockchain.toLowerCase().includes(q)
      );
    });
  }, [availableTokens, chainFilter, searchQuery]);

  const addrTrimmed = recipientAddress.trim();
  const addrValid = addrTrimmed
    ? isValidAddressForOriginAsset(selectedToken.assetId, addrTrimmed)
    : false;

  const isAlreadySaved = useMemo(
    () =>
      savedForSelectedChain.some(
        (a) => a.address.toLowerCase() === addrTrimmed.toLowerCase()
      ),
    [savedForSelectedChain, addrTrimmed]
  );

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // clipboard blocked
    }
  };

  const fullPayUrl = (slug: string) => {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}/pay/${slug}`;
    }
    return `https://zkpay.top/pay/${slug}`;
  };

  const handlePasteAddress = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) {
        setRecipientAddress(txt.trim());
        setFormError(null);
      }
    } catch {
      // clipboard denied
    }
  };

  const handleDeleteSavedAddress = async (addrId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const token = await getAccessToken().catch(() => null);
      if (!token) return;
      const res = await fetch("/api/paylinks/addresses", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: addrId }),
      });
      if (res.ok) {
        setSavedAddresses((prev) => prev.filter((a) => a.id !== addrId));
      }
    } catch {
      // ignore
    }
  };

  const handleCreatePaylink = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNewlyCreatedUrl(null);

    if (!addrTrimmed) {
      setFormError(`Enter a ${chainName(selectedToken.blockchain)} address to receive ${selectedToken.symbol}.`);
      return;
    }
    if (!addrValid) {
      setFormError(`Invalid ${selectedToken.symbol} (${chainName(selectedToken.blockchain)}) address.`);
      return;
    }
    if (amountMode === "FIXED" && (!fixedAmount.trim() || isNaN(Number(fixedAmount)) || Number(fixedAmount) <= 0)) {
      setFormError("Enter a valid positive fixed amount.");
      return;
    }

    setCreating(true);
    try {
      const token = await getAccessToken().catch(() => null);
      if (!token) {
        setFormError("Please wait for wallet session and retry.");
        setCreating(false);
        return;
      }

      const res = await fetch("/api/paylinks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          receiveAssetId: selectedToken.assetId,
          receiveChain: selectedToken.blockchain,
          recipientAddress: addrTrimmed,
          addressLabel: addressLabel.trim() || undefined,
          amountMode,
          fixedAmount: amountMode === "FIXED" ? fixedAmount.trim() : undefined,
          fixedCurrency: amountMode === "FIXED" ? fixedCurrency : undefined,
          singleUse,
          customSlug: customSlug.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.message || data.error || "Failed to create Paylink.");
        return;
      }

      const url = fullPayUrl(data.paylink.slug);
      setNewlyCreatedUrl(url);
      setTitle("");
      setDescription("");
      setCustomSlug("");
      setSingleUse(false);
      await loadPaylinks();
    } catch (err: any) {
      setFormError(err?.message || "Network error creating Paylink.");
    } finally {
      setCreating(false);
    }
  };

  const handleTogglePause = async (item: PaylinkItem) => {
    if (item.status === "PAID") return;
    setBusyLinkId(item.id);
    try {
      const token = await getAccessToken().catch(() => null);
      if (!token) return;
      const nextStatus = item.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      const res = await fetch(`/api/paylinks/${encodeURIComponent(item.slug)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setPaylinks((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: nextStatus } : p))
        );
      }
    } finally {
      setBusyLinkId(null);
    }
  };

  const handleDeletePaylink = async (item: PaylinkItem) => {
    setBusyLinkId(item.id);
    try {
      const token = await getAccessToken().catch(() => null);
      if (!token) return;
      const res = await fetch(`/api/paylinks/${encodeURIComponent(item.slug)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPaylinks((prev) => prev.filter((p) => p.id !== item.id));
      }
    } finally {
      setBusyLinkId(null);
    }
  };

  const selectedChainMeta = CHAIN_METADATA[selectedToken.blockchain as SupportedChainId];

  return (
    <div className="max-w-[540px] mx-auto w-full space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
            Paylinks
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Get paid in your chosen coin — anyone can pay with any supported crypto.
          </p>
        </div>
        <button
          type="button"
          onClick={loadPaylinks}
          disabled={loading}
          aria-label="Refresh Paylinks"
          className="h-9 w-9 rounded-xl bg-surface-container border border-outline-variant text-on-surface-variant hover:text-on-surface flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Create Paylink Card */}
      <form
        onSubmit={handleCreatePaylink}
        className="rounded-2xl bg-surface-container border border-outline-variant p-4 sm:p-5 space-y-4"
      >
        {/* 1. Receive Currency */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-on-surface-variant block">
            1. Currency you want to receive
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full min-h-[56px] px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant hover:border-secondary/50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <CryptoIcon
                symbol={selectedToken.symbol}
                chain={selectedToken.blockchain}
                size="md"
                withChainBadge
              />
              <div className="text-left min-w-0">
                <span className="block text-sm font-semibold text-on-surface">
                  {selectedToken.symbol}
                </span>
                <span className="block text-xs text-on-surface-variant truncate">
                  {selectedToken.name} · {chainName(selectedToken.blockchain)}
                </span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-on-surface-variant shrink-0" />
          </button>
        </div>

        {/* 2. Receiving Address (Saved pills + inline add) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-on-surface-variant">
              2. Your {chainName(selectedToken.blockchain)} wallet address
            </span>
            <div className="flex items-center gap-2">
              {EVM_CHAINS.has(selectedToken.blockchain) && address && (
                <button
                  type="button"
                  onClick={() => {
                    setRecipientAddress(address);
                    setFormError(null);
                  }}
                  className="text-[11px] font-medium text-secondary hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Wallet className="w-3 h-3" />
                  <span>Use wallet</span>
                </button>
              )}
              <button
                type="button"
                onClick={handlePasteAddress}
                className="text-[11px] font-medium text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 cursor-pointer"
              >
                <ClipboardPaste className="w-3 h-3" />
                <span>Paste</span>
              </button>
            </div>
          </div>

          {/* Saved Addresses for this chain */}
          {savedForSelectedChain.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {savedForSelectedChain.map((saved) => {
                const isPicked = saved.address.toLowerCase() === addrTrimmed.toLowerCase();
                return (
                  <div
                    key={saved.id}
                    className={`inline-flex items-center rounded-lg border text-xs transition-colors ${
                      isPicked
                        ? "bg-secondary/15 border-secondary text-on-surface"
                        : "bg-surface-container-low border-outline-variant text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setRecipientAddress(saved.address);
                        setFormError(null);
                      }}
                      className="px-2.5 py-1.5 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {isPicked && <Check className="w-3 h-3 text-secondary" />}
                      <span className="font-medium truncate max-w-[110px]">{saved.label}</span>
                      <span className="font-mono text-[11px] opacity-80">
                        {shortAddr(saved.address, 5, 4)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${saved.label}`}
                      onClick={(e) => handleDeleteSavedAddress(saved.id, e)}
                      className="pr-2 pl-1 py-1.5 text-on-surface-variant hover:text-error cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Address Input */}
          <div className="space-y-2">
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => {
                setRecipientAddress(e.target.value);
                setFormError(null);
              }}
              placeholder={
                selectedChainMeta?.addressPlaceholder ||
                `Enter your ${selectedToken.symbol} address`
              }
              spellCheck={false}
              autoComplete="off"
              className="w-full h-12 px-3.5 rounded-xl bg-surface-container-low border border-outline-variant font-mono text-base sm:text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-secondary/60"
            />
            {addrTrimmed && !addrValid && (
              <p className="text-[11px] text-error">
                Address does not match valid {selectedToken.symbol} ({chainName(selectedToken.blockchain)}) format.
              </p>
            )}
            {addrTrimmed && addrValid && !isAlreadySaved && (
              <input
                type="text"
                value={addressLabel}
                onChange={(e) => setAddressLabel(e.target.value)}
                placeholder="Save address label (optional, e.g. My Ledger LTC)"
                maxLength={40}
                className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-base sm:text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-secondary/60"
              />
            )}
          </div>
        </div>

        {/* 3. Label & Amount Mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-on-surface-variant block mb-1.5">
              Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Pay ${selectedToken.symbol}`}
              maxLength={80}
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-base sm:text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-secondary/60"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-on-surface-variant block mb-1.5">
              Amount type
            </label>
            <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-container-low border border-outline-variant h-11">
              {(["OPEN", "FIXED"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAmountMode(m)}
                  className={`rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    amountMode === m
                      ? "bg-secondary text-on-secondary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {m === "OPEN" ? "Any amount" : "Fixed amount"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {amountMode === "FIXED" && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={fixedAmount}
              onChange={(e) => setFixedAmount(e.target.value)}
              placeholder={fixedCurrency === "USD" ? "25.00" : "0.5"}
              className="flex-1 h-11 px-3.5 rounded-xl bg-surface-container-low border border-outline-variant font-mono text-base sm:text-sm text-on-surface focus:outline-none focus:border-secondary/60"
            />
            <div className="inline-flex p-1 rounded-xl bg-surface-container-low border border-outline-variant h-11 shrink-0">
              {(["USD", "ASSET"] as const).map((cur) => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setFixedCurrency(cur)}
                  className={`px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    fixedCurrency === cur
                      ? "bg-on-surface text-surface"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {cur === "USD" ? "USD" : selectedToken.symbol}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible Extra Options */}
        <div className="border-t border-outline-variant/60 pt-2">
          <button
            type="button"
            onClick={() => setShowMoreOptions((v) => !v)}
            className="text-xs font-medium text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 cursor-pointer py-1"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showMoreOptions ? "rotate-180" : ""}`}
            />
            <span>More options (custom slug, single-use)</span>
          </button>

          {showMoreOptions && (
            <div className="mt-2.5 space-y-2.5 animate-fade-in-up">
              <div>
                <label className="text-[11px] font-medium text-on-surface-variant block mb-1">
                  Custom link slug (optional)
                </label>
                <div className="flex items-center h-10 rounded-xl bg-surface-container-low border border-outline-variant px-3 gap-1">
                  <span className="text-xs text-on-surface-variant font-mono shrink-0">
                    /pay/
                  </span>
                  <input
                    type="text"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value.toLowerCase())}
                    placeholder="my-ltc-link"
                    maxLength={32}
                    className="flex-1 bg-transparent text-base sm:text-xs font-mono text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-on-surface-variant block mb-1">
                  Note to payer (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Thanks for the payment!"
                  maxLength={160}
                  className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-base sm:text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-on-surface cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={singleUse}
                  onChange={(e) => setSingleUse(e.target.checked)}
                  className="w-4 h-4 accent-secondary rounded cursor-pointer"
                />
                <span>Single-use link (marks PAID after 1 settled payment)</span>
              </label>
            </div>
          )}
        </div>

        {formError && (
          <div className="p-3 rounded-xl bg-error/10 border border-error/25 text-xs text-error flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={creating || !addrValid}
          className="w-full h-12 px-5 rounded-xl bg-secondary hover:brightness-110 disabled:bg-surface-container-high disabled:text-on-surface-variant disabled:cursor-not-allowed text-on-secondary font-semibold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span>{creating ? "Creating Paylink…" : `Create ${selectedToken.symbol} Paylink`}</span>
        </button>
      </form>

      {/* Newly Created Link Share Banner */}
      {newlyCreatedUrl && (
        <div className="p-4 rounded-2xl bg-secondary/10 border border-secondary/30 space-y-2.5 animate-fade-in-up">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-secondary inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Paylink ready to share
            </span>
            <button
              type="button"
              onClick={() => setNewlyCreatedUrl(null)}
              className="text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={newlyCreatedUrl}
              className="flex-1 h-10 px-3 rounded-xl bg-surface font-mono text-xs text-on-surface select-all border border-outline-variant"
            />
            <button
              type="button"
              onClick={() => copyText(newlyCreatedUrl, "new-url")}
              className="h-10 px-3.5 rounded-xl bg-secondary text-on-secondary text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              {copiedId === "new-url" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === "new-url" ? "Copied" : "Copy"}</span>
            </button>
            <Link
              href={newlyCreatedUrl.replace(/^https?:\/\/[^/]+/, "")}
              target="_blank"
              className="h-10 px-3 rounded-xl bg-surface-container-high border border-outline-variant text-xs font-medium text-on-surface inline-flex items-center gap-1 shrink-0"
            >
              <span>Open</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Existing Paylinks List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-on-surface">
            Your Paylinks ({paylinks.length})
          </h2>
        </div>

        {loading && paylinks.length === 0 ? (
          <div className="rounded-2xl bg-surface-container border border-outline-variant p-8 text-center text-xs text-on-surface-variant">
            Loading Paylinks…
          </div>
        ) : paylinks.length === 0 ? (
          <div className="rounded-2xl bg-surface-container border border-outline-variant p-8 text-center text-xs text-on-surface-variant">
            No Paylinks yet. Pick a currency and wallet above to create your first payment link.
          </div>
        ) : (
          <div className="space-y-3">
            {paylinks.map((item) => {
              const linkUrl = fullPayUrl(item.slug);
              const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                linkUrl
              )}&color=090A0E&bgcolor=ffffff&margin=8`;
              const payments = item.stats?.payments || [];
              const settledCount = item.stats?.settledCount || 0;
              const isQrOpen = openQrId === item.id;
              const isPaymentsOpen = expandedPaymentsId === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-surface-container border border-outline-variant p-4 space-y-3"
                >
                  {/* Top Summary */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CryptoIcon
                        symbol={item.receiveSymbol}
                        chain={item.receiveChain}
                        size="md"
                        withChainBadge
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-on-surface truncate">
                            {item.title}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.status === "ACTIVE"
                                ? "bg-secondary/15 text-secondary"
                                : item.status === "PAID"
                                ? "bg-primary/15 text-primary"
                                : "bg-warning/15 text-warning"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5 flex-wrap">
                          <span className="font-mono">{item.receiveSymbol}</span>
                          <span>·</span>
                          <span className="font-mono">{shortAddr(item.recipientAddress, 6, 4)}</span>
                          <span>·</span>
                          <span>
                            {item.amountMode === "FIXED" && item.fixedAmount
                              ? item.fixedCurrency === "USD"
                                ? `$${item.fixedAmount} USD`
                                : `${item.fixedAmount} ${item.receiveSymbol}`
                              : "Any amount"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-semibold text-on-surface block">
                        {settledCount} paid
                      </span>
                      {item.singleUse && (
                        <span className="text-[10px] text-on-surface-variant inline-flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" /> 1x
                        </span>
                      )}
                    </div>
                  </div>

                  {/* URL & Action Row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => copyText(linkUrl, `copy-${item.id}`)}
                      className="flex-1 min-w-[140px] h-9 px-3 rounded-xl bg-surface-container-low border border-outline-variant hover:border-secondary/40 text-left flex items-center justify-between gap-2 text-xs font-mono text-on-surface cursor-pointer"
                    >
                      <span className="truncate">/pay/{item.slug}</span>
                      {copiedId === `copy-${item.id}` ? (
                        <Check className="w-3.5 h-3.5 text-secondary shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setOpenQrId(isQrOpen ? null : item.id)}
                      aria-label="Toggle QR code"
                      className={`h-9 w-9 rounded-xl border flex items-center justify-center cursor-pointer ${
                        isQrOpen
                          ? "bg-secondary/15 border-secondary/40 text-secondary"
                          : "bg-surface-container-low border-outline-variant text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                    </button>

                    <Link
                      href={`/pay/${item.slug}`}
                      target="_blank"
                      aria-label="Open Paylink"
                      className="h-9 w-9 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface-variant hover:text-on-surface flex items-center justify-center"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>

                    {item.status !== "PAID" && (
                      <button
                        type="button"
                        disabled={busyLinkId === item.id}
                        onClick={() => handleTogglePause(item)}
                        className="h-9 px-2.5 rounded-xl bg-surface-container-low border border-outline-variant text-[11px] font-medium text-on-surface-variant hover:text-on-surface cursor-pointer disabled:opacity-50"
                      >
                        {item.status === "ACTIVE" ? "Pause" : "Resume"}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busyLinkId === item.id}
                      onClick={() => handleDeletePaylink(item)}
                      aria-label="Delete Paylink"
                      className="h-9 w-9 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface-variant hover:text-error flex items-center justify-center cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Inline QR Drawer */}
                  {isQrOpen && (
                    <div className="pt-2 flex flex-col items-center gap-2 animate-fade-in-up">
                      <div className="w-40 h-40 rounded-xl bg-white p-2">
                        <img
                          src={qrImgUrl}
                          alt={`QR code for /pay/${item.slug}`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <span className="text-[11px] font-mono text-on-surface-variant">
                        {linkUrl}
                      </span>
                    </div>
                  )}

                  {/* Payments Expandable Drawer */}
                  {payments.length > 0 && (
                    <div className="border-t border-outline-variant/60 pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPaymentsId(isPaymentsOpen ? null : item.id)
                        }
                        className="w-full flex items-center justify-between text-xs font-medium text-on-surface-variant hover:text-on-surface cursor-pointer py-1"
                      >
                        <span>
                          Received & recent payments ({item.stats?.totalCount || payments.length})
                        </span>
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform ${
                            isPaymentsOpen ? "rotate-90" : ""
                          }`}
                        />
                      </button>

                      {isPaymentsOpen && (
                        <div className="mt-2 divide-y divide-outline-variant/50 rounded-xl bg-surface-container-low border border-outline-variant overflow-hidden">
                          {payments.map((p) => (
                            <div
                              key={p.swapId}
                              className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-medium text-on-surface block truncate">
                                  {p.amountInFormatted} {p.fromAsset} → {p.amountOutFormatted}{" "}
                                  {p.toAsset}
                                </span>
                                <span className="text-[10px] text-on-surface-variant">
                                  {p.originChain} → {p.destinationChain}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                                    p.status === "SETTLED"
                                      ? "bg-secondary/15 text-secondary"
                                      : p.status === "FAILED" ||
                                        p.status === "REFUNDED" ||
                                        p.status === "EXPIRED"
                                      ? "bg-error/15 text-error"
                                      : "bg-warning/15 text-warning"
                                  }`}
                                >
                                  {p.status === "SETTLED" ? (
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                  ) : (
                                    <Clock className="w-2.5 h-2.5" />
                                  )}
                                  {p.status}
                                </span>
                                {p.destinationExplorerUrl && (
                                  <a
                                    href={p.destinationExplorerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="View transaction on explorer"
                                    className="text-on-surface-variant hover:text-on-surface"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Token Selector Modal */}
      {pickerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Select receiving currency"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4 animate-fade-in"
            onClick={() => setPickerOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-[440px] max-h-[85dvh] sm:rounded-2xl rounded-t-2xl bg-surface-container border border-outline-variant flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]"
            >
              <div className="sm:hidden flex justify-center pt-2.5 pb-1">
                <span className="w-9 h-1 rounded-full bg-outline-variant" />
              </div>

              <div className="flex items-center justify-between px-4 pt-2 sm:pt-4 pb-3">
                <h4 className="text-base font-semibold text-on-surface">
                  Currency you receive
                </h4>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  aria-label="Close"
                  className="w-10 h-10 -mr-2 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-4 space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                  <input
                    ref={searchRef}
                    type="text"
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search token or network"
                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface border border-outline-variant text-base sm:text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-secondary/60"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
                  {chainOptions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setChainFilter(c)}
                      className={`h-8 px-3 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-colors border ${
                        chainFilter === c
                          ? "bg-on-surface text-surface border-on-surface"
                          : "border-outline-variant text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {c === "all" ? "All" : chainName(c)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-y-auto flex-1 px-2 pt-2 pb-2 mt-1 border-t border-outline-variant overscroll-contain">
                {filteredTokens.length === 0 ? (
                  <div className="py-12 text-center text-sm text-on-surface-variant">
                    No tokens match &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : (
                  filteredTokens.map((token) => {
                    const isSelected = token.assetId === selectedToken.assetId;
                    return (
                      <button
                        key={token.assetId}
                        type="button"
                        onClick={() => handleSelectReceiveToken(token)}
                        className={`w-full min-h-[56px] px-2.5 py-2 rounded-xl text-left flex items-center gap-3 transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-secondary/10"
                            : "hover:bg-surface-container-high active:bg-surface-container-high"
                        }`}
                      >
                        <CryptoIcon
                          symbol={token.symbol}
                          chain={token.blockchain}
                          size="lg"
                          withChainBadge
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-on-surface">
                            {token.symbol}
                          </span>
                          <span className="block text-xs text-on-surface-variant truncate">
                            {token.name} · {chainName(token.blockchain)}
                          </span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-secondary shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
