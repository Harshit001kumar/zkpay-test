"use client";

import { useState } from "react";
import { CURRENCIES } from "@/lib/constants";

interface CashoutFlowProps {
  onClose: () => void;
  walletAddress: string;
}

type CashoutStep = "input" | "confirm" | "processing" | "success";

export default function CashoutFlow({ onClose, walletAddress }: CashoutFlowProps) {
  const [step, setStep] = useState<CashoutStep>("input");
  const [amount, setAmount] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState<(typeof CURRENCIES)[number]>(CURRENCIES[0]);
  const [payoutHandle, setPayoutHandle] = useState("");

  const usdcAmount = parseFloat(amount) || 0;
  // Simulated conversion rate
  const fiatAmount = usdcAmount * 83.5; // 1 USDC ≈ ₹83.5

  const handleProceed = () => {
    if (usdcAmount > 0 && payoutHandle) {
      setStep("confirm");
    }
  };

  const handleConfirm = () => {
    setStep("processing");
    // In production: call integrator's userInitiateOfframp
    // then the <Cashout/> widget handles deliverOfframpUpi + reconcile
    setTimeout(() => setStep("success"), 3500);
  };

  return (
    <div className="min-h-screen page-transition" style={{ background: "var(--color-surface)" }}>
      {/* Header */}
      <header className="px-5 pt-14 pb-4 flex items-center gap-4">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full glass-card flex items-center justify-center"
        >
          ←
        </button>
        <h2 className="text-xl font-bold">Cash Out</h2>
      </header>

      <div className="px-5">
        {step === "input" && (
          <div className="animate-fade-in-up">
            {/* Amount Input */}
            <div className="glass-card p-5 mb-4">
              <label className="label-caps block mb-3">Amount (USDC)</label>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
                  $
                </span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-transparent text-3xl font-bold outline-none flex-1 w-full"
                  style={{ color: "var(--color-on-surface)" }}
                />
              </div>
              {usdcAmount > 0 && (
                <p className="text-sm mt-2" style={{ color: "var(--color-on-surface-variant)" }}>
                  ≈ {selectedCurrency.symbol}{" "}
                  {fiatAmount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              )}

              {/* Quick amount buttons */}
              <div className="flex gap-2 mt-4">
                {[5, 10, 25, 50].map((val) => (
                  <button
                    key={val}
                    onClick={() => setAmount(val.toString())}
                    className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background:
                        amount === val.toString()
                          ? "var(--gradient-primary-subtle)"
                          : "rgba(255,255,255,0.03)",
                      border: "1px solid var(--glass-border)",
                      color:
                        amount === val.toString()
                          ? "var(--color-primary)"
                          : "var(--color-on-surface-variant)",
                    }}
                  >
                    ${val}
                  </button>
                ))}
              </div>
            </div>

            {/* Currency Selector */}
            <div className="glass-card p-5 mb-4">
              <label className="label-caps block mb-3">Receive In</label>
              <div className="grid grid-cols-2 gap-2">
                {CURRENCIES.map((curr) => (
                  <button
                    key={curr.symbol}
                    onClick={() => setSelectedCurrency(curr)}
                    className="py-3 px-4 rounded-xl text-left flex items-center gap-2 transition-all"
                    style={{
                      background:
                        selectedCurrency.symbol === curr.symbol
                          ? "var(--gradient-primary-subtle)"
                          : "rgba(255,255,255,0.03)",
                      border:
                        selectedCurrency.symbol === curr.symbol
                          ? "1px solid rgba(0,119,190,0.4)"
                          : "1px solid var(--glass-border)",
                    }}
                  >
                    <span className="text-xl">{curr.flag}</span>
                    <div>
                      <p className="text-sm font-semibold">{curr.symbol}</p>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        {curr.paymentMethod}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Payout Handle */}
            <div className="glass-card p-5 mb-6">
              <label className="label-caps block mb-3">
                {selectedCurrency.paymentMethod} ID
              </label>
              <input
                type="text"
                placeholder={
                  selectedCurrency.paymentMethod === "UPI"
                    ? "yourname@upi"
                    : "Account number"
                }
                value={payoutHandle}
                onChange={(e) => setPayoutHandle(e.target.value)}
                className="w-full bg-transparent border-b py-2 outline-none text-sm"
                style={{
                  borderColor: "var(--color-outline-variant)",
                  color: "var(--color-on-surface)",
                }}
              />
              <p
                className="text-xs mt-2 flex items-center gap-1"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                🔒 Encrypted end-to-end via P2PKit
              </p>
            </div>

            <button
              onClick={handleProceed}
              className="btn-primary w-full"
              style={{
                padding: "16px",
                opacity: usdcAmount > 0 && payoutHandle ? 1 : 0.5,
                pointerEvents: usdcAmount > 0 && payoutHandle ? "auto" : "none",
              }}
            >
              Review Cash Out
            </button>
          </div>
        )}

        {step === "confirm" && (
          <div className="animate-fade-in-up">
            <div className="glass-card p-5 mb-6">
              <h3 className="font-bold text-lg mb-4">Confirm Cash Out</h3>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--color-on-surface-variant)" }}>
                    You Send
                  </span>
                  <span className="font-semibold">{usdcAmount} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--color-on-surface-variant)" }}>
                    You Receive
                  </span>
                  <span className="font-semibold">
                    {selectedCurrency.symbol}{" "}
                    {fiatAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--color-on-surface-variant)" }}>
                    Via
                  </span>
                  <span className="font-medium">
                    {selectedCurrency.paymentMethod}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--color-on-surface-variant)" }}>
                    To
                  </span>
                  <span className="font-medium font-mono">{payoutHandle}</span>
                </div>
                <div className="divider" />
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--color-on-surface-variant)" }}>
                    Network
                  </span>
                  <span className="text-gradient font-semibold">
                    Base · USDC
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("input")}
                className="btn-secondary flex-1"
                style={{ padding: "14px" }}
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                className="btn-primary flex-1"
                style={{ padding: "14px" }}
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="animate-fade-in-up mt-20">
            <div className="text-center">
              <div
                className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 animate-pulse"
                style={{ background: "var(--gradient-primary)" }}
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <h3 className="text-xl font-bold">Processing Cash Out</h3>
              <p
                className="text-sm mt-2 max-w-xs mx-auto"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                A merchant is accepting your USDC. Your {selectedCurrency.paymentMethod}{" "}
                payment will arrive shortly.
              </p>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="animate-fade-in-up mt-20">
            <div className="text-center">
              <div
                className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6"
                style={{ background: "rgba(163, 217, 165, 0.15)" }}
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a3d9a5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-xl font-bold">Cash Out Complete!</h3>
              <p
                className="text-sm mt-2"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                {selectedCurrency.symbol}{" "}
                {fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                sent to your {selectedCurrency.paymentMethod}
              </p>

              <button
                onClick={onClose}
                className="btn-primary mt-8"
                style={{ padding: "14px 40px" }}
              >
                Back to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
