"use client";

import { useState } from "react";

export default function CardsWaitlist() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="flex flex-col gap-6 px-5 py-4 fade-in">
      <div className="text-center mt-8 mb-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#1c1c1f] border border-[#46464c] mb-6">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c0c6de" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
            <line x1="1" y1="10" x2="23" y2="10"></line>
          </svg>
        </div>
        <h2 className="text-3xl font-bold font-['Hanken_Grotesk'] text-[#e5e2e3] mb-2">ZkPay Card</h2>
        <p className="text-[#909097] text-sm max-w-[240px] mx-auto leading-relaxed">
          Spend your crypto balance directly anywhere Visa is accepted.
        </p>
      </div>

      <div className="glass-card-elevated p-6 mt-4">
        {submitted ? (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-4 fade-in">
            <div className="w-12 h-12 rounded-full bg-[#c0c6de]/20 flex items-center justify-center text-[#c0c6de]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#e5e2e3]">You're on the list</h3>
              <p className="text-sm text-[#909097] mt-1">We'll notify you when cards are available in your region.</p>
            </div>
          </div>
        ) : (
          <form 
            onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
            className="flex flex-col gap-4"
          >
            <h3 className="text-lg font-bold text-[#e5e2e3] mb-2">Join the waitlist</h3>
            <div className="flex flex-col gap-2">
              <label className="label-caps text-[#909097]">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@example.com"
                className="w-full bg-transparent border-b border-[#ffffff4d] py-3 text-[#e5e2e3] placeholder-[#909097] focus:outline-none focus:border-[#c0c6de] text-lg transition-colors"
              />
            </div>
            <button type="submit" className="btn-primary w-full py-4 mt-6">
              Get Early Access
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
