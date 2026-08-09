"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth";

export default function Profile() {
  const { logout, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];

  const address = wallet?.address || user?.wallet?.address;
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";

  return (
    <div className="flex flex-col gap-6 px-5 py-4 fade-in">
      <h2 className="text-2xl font-bold font-['Hanken_Grotesk'] text-[#e5e2e3]">Profile</h2>
      
      <div className="glass-card p-6 flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 rounded-full bg-[#1c1c1f] border border-[#46464c] flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c0c6de" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-[#e5e2e3]">{shortAddress}</h3>
          <p className="text-sm text-[#909097] mt-1">ZkPay User</p>
        </div>
      </div>

      <div className="glass-card p-2 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#ffffff1a]">
          <span className="text-[#e5e2e3] font-medium">Settings</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#909097" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div className="flex items-center justify-between p-4 border-b border-[#ffffff1a]">
          <span className="text-[#e5e2e3] font-medium">Security</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#909097" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div className="flex items-center justify-between p-4">
          <span className="text-[#e5e2e3] font-medium">Support</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#909097" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>

      <button 
        onClick={logout}
        className="btn-secondary w-full py-4 mt-4 text-[#ffb4ab]"
      >
        Log Out
      </button>
    </div>
  );
}
