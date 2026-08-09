"use client";

import React, { useState, useEffect } from "react";
import { ArrowRight, Check } from "lucide-react";

export default function CardsWaitlist() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="bg-[#131315] font-body-md text-[#e5e2e3] selection:bg-[#c0c6de]/30 min-h-screen relative flex flex-col pt-6 pb-32 overflow-hidden w-full max-w-7xl mx-auto">
      <style dangerouslySetInnerHTML={{__html: `
        .glass-pane {
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(40px);
            border: 1px solid rgba(226, 232, 240, 0.1);
        }
        .silver-text {
            background: linear-gradient(135deg, #E2E8F0 0%, #94A3B8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .floating-anim {
            animation: float 6s ease-in-out infinite;
        }
        @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(2deg); }
        }
      `}} />

      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 -right-1/4 w-[600px] h-[600px] bg-[#c0c6de]/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 -left-1/4 w-[600px] h-[600px] bg-[#b9c7e0]/5 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="px-6 md:px-16 flex flex-col md:flex-row md:items-center gap-12">
        {/* Headline Column */}
        <div className="flex-1 flex flex-col items-start z-10 text-left animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h2 className="font-display-xl text-[48px] md:text-[80px] font-extrabold text-[#e5e2e3] mb-6 md:mb-8 max-w-xl leading-tight tracking-tighter">
            The <span className="silver-text">Obsidian</span> Card is Coming
          </h2>
          <p className="font-body-lg text-lg text-[#c6c6cd] max-w-md mb-12 opacity-80 leading-relaxed">
            Experience the new standard of crypto-to-fiat fluidity. A masterclass in privacy and structural elegance.
          </p>

          {!submitted ? (
            <div className="w-full max-w-md glass-pane p-8 rounded-2xl animate-in zoom-in-95 duration-500">
              <form 
                onSubmit={(e: React.FormEvent) => { e.preventDefault(); setSubmitted(true); }}
                className="flex flex-col gap-6"
              >
                <div>
                  <label className="font-label-caps text-[12px] text-[#909097] uppercase tracking-[0.1em] font-bold">Priority Access</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full bg-transparent border-b border-white/20 py-4 text-[#e5e2e3] placeholder-[#909097] focus:outline-none focus:border-[#c0c6de] text-xl transition-colors font-body-md"
                  />
                </div>
                <button type="submit" className="w-full bg-[#E2E8F0] text-[#131315] hover:bg-white font-label-caps text-[12px] font-bold uppercase tracking-[0.1em] py-5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 group mt-2">
                  Join Waitlist
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </form>
            </div>
          ) : (
            <div className="w-full max-w-md glass-pane p-8 md:p-10 rounded-2xl flex flex-col items-center justify-center gap-6 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="flex flex-col items-center">
                <span className="font-label-caps text-[12px] text-[#909097] uppercase tracking-[0.1em] font-bold mb-2">Your Position in Line</span>
                <span className="font-display-xl text-[48px] md:text-[64px] font-extrabold silver-text tracking-tighter">#4,092</span>
              </div>
              <div className="w-full border-t border-white/10 pt-6 mt-2">
                <p className="font-body-md text-[#c6c6cd] mb-6">Invite friends to skip the line</p>
                <button className="w-full bg-[#E2E8F0] text-[#131315] font-label-caps text-[12px] font-bold px-6 py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-white transition-all active:scale-95 group uppercase tracking-[0.1em]">
                  Share Invite Link
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Image Column */}
        <div className="flex-1 relative flex justify-center items-center py-10 md:py-20 animate-in fade-in zoom-in-105 duration-1000 delay-300">
          <div className="floating-anim relative z-20 w-full max-w-[400px] md:max-w-[480px]">
            <img 
              alt="ZKPay Obsidian Card" 
              className="w-full h-auto object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] rounded-2xl" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAxTZrzrs78luuvHrIfqWx2-PmTP8fTW4GllDauq9lpjAdvcN29k7azsA0uLPuRQqlcir4D_RATiYex0Z6D_ZUb19VVi3grf5ZdNPsF11WR870hFl9pogIe9B0U0xviH6yLXDNnkALSgVN29pojPxRrdEaHNJd0c3Cy4LcgYUjAYUNi35HbZOrYuEqd0VYla-OXsELfn9sABZItBs2j9XCz8RK39PIUzcsnirDXap05H_QYRMReprtnA_ELE5KIkDjfXC8K4IhSy_9L"
            />
          </div>
          {/* Card Glow Aura */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-white/5 blur-[100px] rounded-full pointer-events-none"></div>
        </div>
      </div>
    </div>
  );
}
