"use client";

import { useState } from "react";
import CheckoutFlow from "./CheckoutFlow";
import { MerchantData } from "@/lib/types";

interface PaymentEntryProps {
  merchantData: MerchantData;
  onCancel: () => void;
}

export default function PaymentEntry({ merchantData, onCancel }: PaymentEntryProps) {
  const [amountStr, setAmountStr] = useState(merchantData.defaultAmount || "");
  const [showCheckout, setShowCheckout] = useState(false);

  const amount = parseFloat(amountStr) || 0;

  const handleConfirm = () => {
    if (amount > 0) {
      setShowCheckout(true);
    }
  };

  if (showCheckout) {
    return (
      <div className="w-full animate-fade-in-up">
        <button onClick={() => setShowCheckout(false)} className="mb-4 text-sm font-semibold text-[#909097] hover:text-[#c0c6de] transition-colors">
          ← Back
        </button>
        <CheckoutFlow amount={amount} merchantData={merchantData} />
      </div>
    );
  }

  const isUpi = merchantData.type === "upi";
  const displayName = isUpi ? merchantData.name || "Unknown Merchant" : "Crypto Wallet";
  const displayId = isUpi ? merchantData.upiId : merchantData.address;

  return (
    <div className="w-full glass-card overflow-hidden animate-fade-in-up">
      <div className="p-6 flex flex-col gap-6">
        <div className="text-center">
          <h3 className="text-lg font-bold flex items-center justify-center gap-2 text-[#e5e2e3]">
            Pay {displayName}
          </h3>
          <p className="text-sm text-[#909097] break-all">{displayId}</p>
        </div>

        <div className="flex flex-col items-center">
          <p className="label-caps mb-2">Enter Amount (INR)</p>
          <div className="flex items-end justify-center gap-1 border-b-2 border-[#46464c] pb-2 focus-within:border-[#c0c6de] transition-colors">
            <span className="text-3xl font-bold text-[#c0c6de]">₹</span>
            <input
              type="number"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              disabled={!!merchantData.defaultAmount}
              className={`text-5xl font-bold tracking-tighter text-center bg-transparent outline-none w-full max-w-[200px] text-[#e5e2e3] placeholder:text-[#46464c] ${merchantData.defaultAmount ? 'text-[#909097]' : ''}`}
              autoFocus
            />
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between font-bold text-lg text-[#e5e2e3]">
            <span>Payment Amount</span>
            <span>₹ {amount.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex gap-4 mt-4">
          <button onClick={onCancel} className="btn-secondary flex-1 py-3">Cancel</button>
          <button 
            onClick={handleConfirm} 
            disabled={amount <= 0}
            className={`btn-primary flex-1 py-3 ${amount <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
