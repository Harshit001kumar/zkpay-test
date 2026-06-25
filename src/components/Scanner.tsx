"use client";

import { useEffect, useCallback, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

interface ScannerProps {
  onScan: (data: string) => void;
  onCancel: () => void;
}

export default function Scanner({ onScan, onCancel }: ScannerProps) {
  const [hasStarted, setHasStarted] = useState(false);

  const stableOnScan = useCallback(onScan, [onScan]);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const el = document.getElementById("reader");
      if (!el) return;

      const scanner = new Html5QrcodeScanner(
        "reader",
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          rememberLastUsedCamera: true,
        },
        false
      );

      scanner.render(
        (text) => {
          scanner.clear().catch(() => {});
          stableOnScan(text);
        },
        () => {
          // scan error — ignored, fires continuously
        }
      );

      setHasStarted(true);

      return () => {
        scanner.clear().catch(() => {});
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [stableOnScan]);

  return (
    <div className="scanner-overlay">
      <div className="w-full max-w-sm px-6 flex flex-col items-center gap-6">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-xl font-bold">Scan QR Code</h2>
          <p className="text-sm text-gray-500 mt-1">
            Point your camera at a merchant QR code
          </p>
        </div>

        {/* Scanner Container */}
        <div className="w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <div id="reader" className="w-full"></div>
        </div>

        {/* Cancel Button */}
        <button onClick={onCancel} className="btn-secondary w-full">
          Cancel
        </button>
      </div>
    </div>
  );
}
