"use client";

import { useState } from "react";
import CheckoutFlow from "./CheckoutFlow";

interface PaymentEntryProps {
  merchantId: string;
  onCancel: () => void;
}

export default function PaymentEntry({ merchantId, onCancel }: PaymentEntryProps) {
  const [amountStr, setAmountStr] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

  const amount = parseFloat(amountStr) || 0;
  const fee = amount * 0.01;
  const total = amount + fee;

  const handleConfirm = () => {
    if (amount > 0) {
      setShowCheckout(true);
    }
  };

  if (showCheckout) {
    return (
      <div className="w-full animate-fade-in-up">
        <button onClick={() => setShowCheckout(false)} className="mb-4 text-sm font-semibold text-gray-500 hover:text-black">
          ← Back
        </button>
        <CheckoutFlow amount={total} merchantId={merchantId} />
      </div>
    );
  }

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm animate-fade-in-up">
      <div className="p-6 flex flex-col gap-6">
        <div className="text-center">
          <h3 className="text-lg font-bold">Pay Merchant</h3>
          <p className="text-sm text-gray-500 break-all">{merchantId}</p>
        </div>

        <div className="flex flex-col items-center">
          <p className="label-caps mb-2">Enter Amount (INR)</p>
          <div className="flex items-end justify-center gap-1 border-b-2 border-black pb-2">
            <span className="text-3xl font-bold">₹</span>
            <input
              type="number"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              className="text-5xl font-bold tracking-tighter text-center bg-transparent outline-none w-full max-w-[200px]"
              autoFocus
            />
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Entered Amount</span>
            <span>₹ {amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Platform Fee (1%)</span>
            <span>₹ {fee.toFixed(2)}</span>
          </div>
          <div className="divider my-1"></div>
          <div className="flex justify-between font-bold text-lg">
            <span>Total to Pay</span>
            <span>₹ {total.toFixed(2)}</span>
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
