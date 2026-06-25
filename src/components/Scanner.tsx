"use client";

import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

interface ScannerProps {
  onScan: (data: string) => void;
  onCancel: () => void;
}

export default function Scanner({ onScan, onCancel }: ScannerProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!document.getElementById("reader")) return;

    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    scanner.render(
      (text) => {
        scanner.clear();
        onScan(text);
      },
      (err) => {
        // Ignored
      }
    );

    return () => {
      scanner.clear().catch(console.error);
    };
  }, [onScan]);

  return (
    <div className="scanner-overlay animate-fade-in-up">
      <div className="flex flex-col items-center justify-center h-full w-full px-4">
        <h2 className="text-xl font-bold mb-8">Scan Merchant QR</h2>
        
        <div className="w-full max-w-sm bg-white rounded-xl overflow-hidden border border-gray-200">
          <div id="reader" className="w-full"></div>
        </div>

        {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        
        <button
          onClick={onCancel}
          className="btn-secondary mt-12 w-full max-w-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
