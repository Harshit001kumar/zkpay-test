"use client";

import { useState } from "react";
import { APP_NAME } from "@/lib/constants";
import Scanner from "@/components/Scanner";
import CheckoutFlow from "@/components/CheckoutFlow";
import CashoutFlow from "@/components/CashoutFlow";
import PaymentHistory from "@/components/PaymentHistory";
import BottomNav from "@/components/BottomNav";
import WalletConnect from "@/components/WalletConnect";

type View = "home" | "scan" | "cashout" | "history";

export default function Home() {
  const [activeView, setActiveView] = useState<View>("home");
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [scannedData, setScannedData] = useState<string | null>(null);

  const handleScanResult = (data: string) => {
    setScannedData(data);
    setActiveView("home");
  };

  const truncateAddress = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  // Mock balance for demo
  const balance = {
    total: "142,580.42",
    usdc: "12,450.80",
    btc: "1.428",
    eth: "18.50",
  };

  // Mock recent transactions
  const transactions = [
    {
      id: 1,
      merchant: "Starbucks India",
      amount: "-₹450.00",
      crypto: "~5.40 USDC",
      status: "completed" as const,
      time: "2 min ago",
      icon: "☕",
    },
    {
      id: 2,
      merchant: "Cash Out to Bank",
      amount: "+₹8,350.00",
      crypto: "100 USDC",
      status: "completed" as const,
      time: "1 hour ago",
      icon: "🏦",
    },
    {
      id: 3,
      merchant: "Amazon.in",
      amount: "-₹2,199.00",
      crypto: "~26.40 USDC",
      status: "pending" as const,
      time: "3 hours ago",
      icon: "📦",
    },
    {
      id: 4,
      merchant: "Zomato",
      amount: "-₹680.00",
      crypto: "~8.16 USDC",
      status: "completed" as const,
      time: "Yesterday",
      icon: "🍕",
    },
  ];

  if (activeView === "scan") {
    return (
      <Scanner
        onResult={handleScanResult}
        onClose={() => setActiveView("home")}
      />
    );
  }

  if (activeView === "cashout") {
    return (
      <CashoutFlow
        onClose={() => setActiveView("home")}
        walletAddress={walletAddress}
      />
    );
  }

  if (activeView === "history") {
    return (
      <PaymentHistory
        onClose={() => setActiveView("home")}
      />
    );
  }

  return (
    <main className="min-h-screen pb-24 page-transition">
      {/* ====== HEADER ====== */}
      <header className="px-5 pt-14 pb-2 flex items-center justify-between">
        <div>
          <p className="label-caps tracking-widest" style={{ fontSize: 11 }}>
            PORTFOLIO VALUE
          </p>
          <h1
            className="text-3xl font-bold mt-1 tracking-tight"
            style={{ letterSpacing: "-0.02em" }}
          >
            ${balance.total}
          </h1>
        </div>
        <WalletConnect
          isConnected={isConnected}
          walletAddress={walletAddress}
          onConnect={() => {
            setIsConnected(true);
            setWalletAddress("0x1a2b3c4d5e6f7890abcdef1234567890abcdef12");
          }}
          onDisconnect={() => {
            setIsConnected(false);
            setWalletAddress("");
          }}
        />
      </header>

      {/* ====== ASSET OVERVIEW CARD ====== */}
      <section
        className="mx-5 mt-6 glass-card p-5 animate-fade-in-up"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="label-caps">Assets</span>
          <span className="text-sm" style={{ color: "var(--color-primary)" }}>
            View All →
          </span>
        </div>

        {/* BTC Row */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
              style={{ background: "rgba(247, 147, 26, 0.15)" }}
            >
              ₿
            </div>
            <div>
              <p className="font-semibold text-sm">Bitcoin</p>
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                BTC
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-sm">{balance.btc} BTC</p>
            <p className="text-xs" style={{ color: "var(--color-primary)" }}>
              +2.4%
            </p>
          </div>
        </div>

        <div className="divider" />

        {/* ETH Row */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
              style={{ background: "rgba(98, 126, 234, 0.15)" }}
            >
              Ξ
            </div>
            <div>
              <p className="font-semibold text-sm">Ethereum</p>
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                ETH
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-sm">{balance.eth} ETH</p>
            <p className="text-xs" style={{ color: "var(--color-primary)" }}>
              +1.8%
            </p>
          </div>
        </div>

        <div className="divider" />

        {/* USDC Row */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
              style={{ background: "rgba(38, 132, 255, 0.15)" }}
            >
              $
            </div>
            <div>
              <p className="font-semibold text-sm">USDC</p>
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                Base
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-sm">${balance.usdc}</p>
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
              Stablecoin
            </p>
          </div>
        </div>
      </section>

      {/* ====== PRIMARY ACTIONS ====== */}
      <section
        className="mx-5 mt-6 animate-fade-in-up"
        style={{ animationDelay: "0.2s" }}
      >
        {/* Scan to Pay — Primary CTA */}
        <button
          id="btn-scan-to-pay"
          onClick={() => setActiveView("scan")}
          className="btn-primary w-full flex items-center justify-center gap-3 animate-pulse-glow"
          style={{ padding: "18px 32px", fontSize: "17px" }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
          Scan to Pay
        </button>

        {/* Cash Out — Secondary */}
        <button
          id="btn-cash-out"
          onClick={() => setActiveView("cashout")}
          className="btn-secondary w-full flex items-center justify-center gap-3 mt-3"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Cash Out
        </button>
      </section>

      {/* ====== QUICK ACTIONS ====== */}
      <section
        className="mx-5 mt-6 animate-fade-in-up"
        style={{ animationDelay: "0.3s" }}
      >
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: "↓", label: "Buy", color: "rgba(0,119,190,0.12)" },
            { icon: "↑", label: "Sell", color: "rgba(75,0,130,0.12)" },
            { icon: "⇄", label: "Swap", color: "rgba(154,203,255,0.1)" },
            { icon: "→", label: "Send", color: "rgba(221,183,255,0.1)" },
          ].map((action) => (
            <button
              key={action.label}
              className="glass-card flex flex-col items-center justify-center py-4 gap-2"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                style={{ background: action.color }}
              >
                {action.icon}
              </div>
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ====== CHECKOUT FLOW (if scanned) ====== */}
      {scannedData && (
        <section className="mx-5 mt-6 animate-fade-in-up">
          <CheckoutFlow
            scannedData={scannedData}
            onClose={() => setScannedData(null)}
          />
        </section>
      )}

      {/* ====== RECENT ACTIVITY ====== */}
      <section
        className="mx-5 mt-6 mb-4 animate-fade-in-up"
        style={{ animationDelay: "0.4s" }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="label-caps">Recent Activity</span>
          <button
            onClick={() => setActiveView("history")}
            className="text-sm"
            style={{ color: "var(--color-primary)" }}
          >
            See All →
          </button>
        </div>

        <div className="glass-card-static overflow-hidden">
          {transactions.map((tx, i) => (
            <div key={tx.id}>
              <div className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-white/[0.03]">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style={{ background: "var(--glass-bg)" }}
                  >
                    {tx.icon}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{tx.merchant}</p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      {tx.crypto} · {tx.time}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">{tx.amount}</p>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium inline-block mt-1 ${
                      tx.status === "completed"
                        ? "status-completed"
                        : "status-pending"
                    }`}
                  >
                    {tx.status === "completed" ? "Done" : "Pending"}
                  </span>
                </div>
              </div>
              {i < transactions.length - 1 && (
                <div className="divider mx-4" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ====== BOTTOM NAV ====== */}
      <BottomNav
        activeView={activeView}
        onNavigate={(view: string) => setActiveView(view as View)}
      />
    </main>
  );
}
