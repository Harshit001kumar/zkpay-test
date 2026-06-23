"use client";

import { useState } from "react";
import { CONTRACTS, PLATFORM_FEE_BPS } from "@/lib/constants";

interface CheckoutFlowProps {
  scannedData: string;
  onClose: () => void;
}

type PaymentStep = "review" | "processing" | "success" | "failed";

export default function CheckoutFlow({ scannedData, onClose }: CheckoutFlowProps) {
  const [step, setStep] = useState<PaymentStep>("review");
  const [countdown, setCountdown] = useState(300); // 5 min auto-cancel

  let merchantData = {
    merchant: "Unknown",
    merchantId: "",
    amount: 0,
    currency: "USDC",
    fiatAmount: 0,
    fiatCurrency: "INR",
  };

  try {
    merchantData = JSON.parse(scannedData);
  } catch {
    // Use defaults
  }

  const platformFee = (merchantData.amount * PLATFORM_FEE_BPS) / 10000;
  const totalCrypto = merchantData.amount + platformFee;

  const handleConfirmPayment = async () => {
    setStep("processing");

    // Simulate the P2PKit placeOrder flow
    // In production: call the integrator contract's userPlaceOrder via the signer
    // then use parseOrderIdFromReceipt to get the orderId
    setTimeout(() => {
      setStep("success");
    }, 3000);
  };

  if (step === "processing") {
    return (
      <div className="glass-card p-6">
        <div className="text-center">
          <div
            className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 animate-pulse"
            style={{ background: "var(--gradient-primary)" }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
            >
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="m4.93 4.93 2.83 2.83" />
              <path d="m16.24 16.24 2.83 2.83" />
              <path d="M2 12h4" />
              <path d="M18 12h4" />
              <path d="m4.93 19.07 2.83-2.83" />
              <path d="m16.24 7.76 2.83-2.83" />
            </svg>
          </div>
          <h3 className="text-lg font-bold">Processing Payment</h3>
          <p
            className="text-sm mt-2"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Waiting for fiat confirmation from the merchant network...
          </p>
          <div className="mt-4 w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--color-outline-variant)" }}>
            <div
              className="h-full rounded-full animate-shimmer"
              style={{
                width: "70%",
                background: "var(--gradient-primary)",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="glass-card p-6">
        <div className="text-center">
          <div
            className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4"
            style={{ background: "rgba(163, 217, 165, 0.15)" }}
          >
            <svg
              width="28"
              height="28"
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
          <h3 className="text-lg font-bold">Payment Successful!</h3>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            {merchantData.fiatCurrency} {merchantData.fiatAmount.toLocaleString()} paid to{" "}
            {merchantData.merchant}
          </p>

          <div
            className="mt-4 p-3 rounded-lg text-left"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <div className="flex justify-between text-xs mb-1.5">
              <span style={{ color: "var(--color-on-surface-variant)" }}>
                Amount
              </span>
              <span className="font-medium">
                {merchantData.amount} {merchantData.currency}
              </span>
            </div>
            <div className="flex justify-between text-xs mb-1.5">
              <span style={{ color: "var(--color-on-surface-variant)" }}>
                Fee (1%)
              </span>
              <span className="font-medium">
                {platformFee.toFixed(2)} {merchantData.currency}
              </span>
            </div>
            <div className="divider my-2" />
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--color-on-surface-variant)" }}>
                Settled via
              </span>
              <span className="font-medium text-gradient">P2PKit · Base</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn-primary w-full mt-4"
            style={{ padding: "14px" }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Review step
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg">Payment Review</h3>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          ✕
        </button>
      </div>

      {/* Merchant Info */}
      <div
        className="p-4 rounded-xl mb-4"
        style={{ background: "rgba(255,255,255,0.03)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ background: "var(--gradient-primary-subtle)" }}
          >
            🏪
          </div>
          <div>
            <p className="font-semibold">{merchantData.merchant}</p>
            <p
              className="text-xs mt-0.5 font-mono"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              {merchantData.merchantId
                ? `${merchantData.merchantId.slice(0, 10)}...`
                : "Demo Merchant"}
            </p>
          </div>
        </div>
      </div>

      {/* Amount Breakdown */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--color-on-surface-variant)" }}>
            Fiat Amount
          </span>
          <span className="font-semibold">
            {merchantData.fiatCurrency} {merchantData.fiatAmount.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--color-on-surface-variant)" }}>
            Crypto Equivalent
          </span>
          <span className="font-semibold">
            {merchantData.amount} {merchantData.currency}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--color-on-surface-variant)" }}>
            Platform Fee (1%)
          </span>
          <span className="font-medium">
            {platformFee.toFixed(2)} {merchantData.currency}
          </span>
        </div>
        <div className="divider" />
        <div className="flex justify-between text-sm">
          <span className="font-semibold">Total</span>
          <span className="font-bold text-gradient">
            {totalCrypto.toFixed(2)} {merchantData.currency}
          </span>
        </div>
      </div>

      {/* Settlement Info */}
      <div
        className="flex items-center gap-2 p-3 rounded-lg mb-5 text-xs"
        style={{
          background: "rgba(0, 119, 190, 0.08)",
          color: "var(--color-primary)",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        Settled on Base via USDC · Contract: {CONTRACTS.INTEGRATOR.slice(0, 8)}...
      </div>

      {/* Confirm Button */}
      <button
        id="btn-confirm-payment"
        onClick={handleConfirmPayment}
        className="btn-primary w-full flex items-center justify-center gap-2"
        style={{ padding: "16px" }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        Confirm Payment
      </button>
    </div>
  );
}
