"use client";

import { useEffect, useCallback, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

interface ScannerProps {
  onScan: (data: string) => void;
  onCancel: () => void;
}

export default function Scanner({ onScan, onCancel }: ScannerProps) {
  const [manualId, setManualId] = useState("");
  const stableOnScan = useCallback(onScan, [onScan]);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    let isMounted = true;

    // We delay slightly to ensure the #reader div is fully painted
    const timer = setTimeout(() => {
      if (!isMounted) return;
      
      const el = document.getElementById("reader");
      if (!el) return;

      // Clean up any existing injected HTML just in case
      el.innerHTML = '';

      // Removing qrbox completely removes the broken CSS corners 
      // and lets the user scan using the entire camera frame
      scanner = new Html5QrcodeScanner(
        "reader",
        {
          fps: 10,
          rememberLastUsedCamera: true,
          supportedScanTypes: [0], // 0 = QR_CODE
          videoConstraints: {
            facingMode: "environment" // Force back camera
          }
        },
        /* verbose= */ false
      );

      scanner.render(
        (text) => {
          if (scanner) {
            scanner.clear().catch(() => {});
          }
          stableOnScan(text);
        },
        (error) => {
          // Continuous scan errors are normal, ignore them
        }
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
    <div className="scanner-overlay">
      <div className="w-full max-w-sm px-6 flex flex-col items-center gap-6 overflow-y-auto max-h-screen py-8">
        
        <div className="text-center">
          <h2 className="text-2xl font-bold">Scan to Pay</h2>
          <p className="text-sm text-gray-500 mt-1">
            Point your camera at the merchant's QR code
          </p>
        </div>

        {/* QR Scanner */}
        <div className="w-full rounded-2xl overflow-hidden border-2 border-gray-100 bg-white shadow-sm">
          <div id="reader" className="w-full min-h-[300px]"></div>
        </div>

        <div className="flex items-center gap-4 w-full opacity-50">
          <div className="h-px bg-gray-400 flex-1"></div>
          <span className="text-xs font-semibold uppercase tracking-widest">OR</span>
          <div className="h-px bg-gray-400 flex-1"></div>
        </div>

        {/* Manual Input Fallback */}
        <form onSubmit={handleManualSubmit} className="w-full flex flex-col gap-3">
          <p className="text-sm font-semibold text-center">Camera not working?</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter Merchant ID"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm outline-none focus:border-black transition-colors"
            />
            <button 
              type="submit"
              disabled={!manualId.trim()}
              className="bg-black text-white px-6 font-semibold rounded-lg text-sm disabled:opacity-50"
            >
              Go
            </button>
          </div>
        </form>

        <button onClick={onCancel} className="btn-secondary w-full mt-4">
          Cancel Payment
        </button>
      </div>
    </div>
  );
}
