"use client";

import { useEffect, useCallback, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { MerchantData } from "@/lib/types";

interface ScannerProps {
  onScan: (data: MerchantData) => void;
  onCancel: () => void;
}

export default function Scanner({ onScan, onCancel }: ScannerProps) {
  const [manualId, setManualId] = useState("");
  
  const processScanData = useCallback((text: string) => {
    if (text.toLowerCase().startsWith("upi://pay")) {
      try {
        const url = new URL(text);
        const upiId = url.searchParams.get("pa") || undefined;
        const name = url.searchParams.get("pn") || undefined;
        const defaultAmount = url.searchParams.get("am") || undefined;
        
        onScan({
          type: "upi",
          raw: text,
          upiId,
          name,
          defaultAmount
        });
        return;
      } catch (e) {
        console.error("Failed to parse UPI URL", e);
      }
    }
    
    onScan({
      type: "eth",
      raw: text,
      address: text
    });
  }, [onScan]);

  const stableOnScan = useCallback(processScanData, [processScanData]);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    let isMounted = true;

    const timer = setTimeout(() => {
      if (!isMounted) return;
      
      const el = document.getElementById("reader");
      if (!el) return;

      el.innerHTML = '';

      scanner = new Html5QrcodeScanner(
        "reader",
        {
          fps: 10,
          rememberLastUsedCamera: true,
          supportedScanTypes: [0], // 0 = QR_CODE
          videoConstraints: {
            facingMode: "environment"
          }
        },
        false
      );

      scanner.render(
        (text) => {
          if (scanner) {
            scanner.clear().catch(() => {});
          }
          stableOnScan(text);
        },
        (error) => {}
      );
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scanner) {
        scanner.clear().catch((e) => console.error("Failed to clear scanner", e));
      }
    };
  }, [stableOnScan]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualId.trim()) {
      stableOnScan(manualId.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0e0e0f] text-[#e5e2e3] font-body-md overflow-hidden flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        .scan-line {
            width: 100%;
            height: 2px;
            background: linear-gradient(90deg, transparent, #c0c6de, transparent);
            position: absolute;
            top: 0;
            left: 0;
            animation: scan 3.5s ease-in-out infinite;
            box-shadow: 0 0 20px 2px rgba(192, 198, 222, 0.4);
            z-index: 10;
        }
        @keyframes scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
        .crosshair {
            position: absolute;
            background: rgba(226, 232, 240, 0.4);
            z-index: 5;
        }
        .ch-h { width: 24px; height: 1px; top: 50%; left: 50%; transform: translate(-50%, -50%); }
        .ch-v { height: 24px; width: 1px; top: 50%; left: 50%; transform: translate(-50%, -50%); }
        
        #reader { border: none !important; }
        #reader video { object-fit: cover; width: 100%; height: 100%; border-radius: 50%; }
        #reader__dashboard_section_csr span { display: none !important; }
        #reader__dashboard_section_swaplink { color: #c0c6de !important; text-decoration: none !important; }
      `}} />

      {/* Top Navigation */}
      <header className="w-full flex justify-between items-center px-6 py-6 absolute top-0 z-50">
        <button onClick={onCancel} className="text-[#e5e2e3] hover:opacity-80 transition-opacity flex items-center gap-2">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-label-caps tracking-[0.15em] font-bold">BACK</span>
        </button>
      </header>

      {/* Floating HUD Balance Hint */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-white/[0.08] backdrop-blur-[60px] rounded-full px-6 py-2 flex items-center gap-3 border border-white/20 shadow-lg">
          <div className="w-1.5 h-1.5 rounded-full bg-[#c0c6de] animate-pulse"></div>
          <span className="font-label-caps text-[10px] text-[#c6c6cd] uppercase tracking-tighter mr-1 font-bold">SCANNING</span>
        </div>
      </div>

      <main className="flex-1 w-full flex flex-col items-center justify-center relative px-6">
        {/* Background Atmospheric Element */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] bg-[#c0c6de]/10 blur-[150px] rounded-full pointer-events-none"></div>
        
        {/* Centered Circular Viewfinder */}
        <div className="relative w-full max-w-[340px] aspect-square group">
          {/* Thick Frosted Border */}
          <div className="absolute inset-0 rounded-full border-[12px] border-white/5 bg-white/[0.03] backdrop-blur-[40px] shadow-2xl z-0 pointer-events-none"></div>
          
          {/* Inner Viewfinder Container */}
          <div className="absolute inset-[12px] rounded-full overflow-hidden bg-black flex items-center justify-center z-10">
            <div className="scan-line pointer-events-none"></div>
            <div className="crosshair ch-h pointer-events-none"></div>
            <div className="crosshair ch-v pointer-events-none"></div>
            
            {/* The actual camera output */}
            <div id="reader" className="w-full h-full scale-[1.3]"></div>
            
            <div className="absolute bottom-12 w-full text-center pointer-events-none">
              <p className="font-label-caps text-[10px] text-white/60 tracking-[0.2em] font-bold">PRECISION FOCUS REQUIRED</p>
            </div>
          </div>
          
          {/* Corner Accents */}
          <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-[#c0c6de]/40 rounded-tl-xl pointer-events-none z-20"></div>
          <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-[#c0c6de]/40 rounded-tr-xl pointer-events-none z-20"></div>
          <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-[#c0c6de]/40 rounded-bl-xl pointer-events-none z-20"></div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-[#c0c6de]/40 rounded-br-xl pointer-events-none z-20"></div>
        </div>

        {/* Status Message */}
        <div className="mt-12 text-center max-w-[280px] relative z-20">
          <h3 className="font-headline-md text-xl font-bold tracking-tight text-[#e5e2e3] mb-2">Awaiting Scan</h3>
          <p className="text-sm text-[#c6c6cd] font-light">Position the recipient&apos;s QR code within the glass optics for instant verification.</p>
        </div>

        {/* Manual Input Fallback */}
        <div className="w-full max-w-sm mt-12 relative z-20">
          <form onSubmit={handleManualSubmit} className="bg-white/5 backdrop-blur-[60px] rounded-2xl p-4 flex gap-2 border border-white/10 shadow-xl">
             <input
              type="text"
              placeholder="Or enter Merchant ID / Address"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              className="flex-1 bg-transparent border-b border-white/10 px-3 py-2 text-sm outline-none focus:border-[#c0c6de] transition-colors text-[#e5e2e3] placeholder:text-[#909097] font-medium"
            />
            <button 
              type="submit"
              disabled={!manualId.trim()}
              className="bg-white/10 hover:bg-white/20 text-[#c0c6de] rounded-xl px-4 font-bold text-[10px] tracking-widest disabled:opacity-50 transition-colors"
            >
              GO
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
