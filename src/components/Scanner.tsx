"use client";

import { useState, useEffect, useRef } from "react";

interface ScannerProps {
  onResult: (data: string) => void;
  onClose: () => void;
}

export default function Scanner({ onResult, onClose }: ScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasPermission(true);
      setIsScanning(true);
    } catch {
      setHasPermission(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  // Simulate a scan result for demo purposes
  const handleDemoScan = () => {
    stopCamera();
    // Simulated QR payload: merchant + amount
    onResult(
      JSON.stringify({
        merchant: "Chai Point",
        merchantId: "0xMERCHANT123",
        amount: 5,
        currency: "USDC",
        fiatAmount: 420,
        fiatCurrency: "INR",
      })
    );
  };

  return (
    <div className="scanner-overlay page-transition">
      {/* Close Button */}
      <button
        onClick={() => {
          stopCamera();
          onClose();
        }}
        className="absolute top-14 right-5 w-10 h-10 rounded-full glass-card flex items-center justify-center text-white z-50"
      >
        ✕
      </button>

      {/* Title */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold">Scan to Pay</h2>
        <p
          className="text-sm mt-2"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          Point your camera at a merchant QR code
        </p>
      </div>

      {/* Viewfinder */}
      <div className="scanner-viewfinder">
        <div className="scanner-corner scanner-corner--tl" />
        <div className="scanner-corner scanner-corner--tr" />
        <div className="scanner-corner scanner-corner--bl" />
        <div className="scanner-corner scanner-corner--br" />

        {hasPermission === false ? (
          <div className="w-full h-full flex items-center justify-center bg-obsidian-900 rounded-3xl">
            <div className="text-center px-6">
              <p className="text-sm font-medium">Camera access required</p>
              <p
                className="text-xs mt-2"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                Please allow camera access in your browser settings to scan QR
                codes.
              </p>
              <button
                onClick={startCamera}
                className="btn-primary mt-4 text-sm"
                style={{ padding: "10px 20px" }}
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover rounded-3xl"
            style={{ transform: "scaleX(-1)" }}
          />
        )}
      </div>

      {/* Scanning indicator */}
      {isScanning && (
        <div className="mt-6 flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--color-ocean-blue)" }}
          />
          <span className="text-sm" style={{ color: "var(--color-primary)" }}>
            Scanning...
          </span>
        </div>
      )}

      {/* Demo scan button */}
      <button
        onClick={handleDemoScan}
        className="btn-primary mt-8 flex items-center gap-2"
        style={{ padding: "14px 28px" }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        </svg>
        Simulate Demo Scan
      </button>

      <p
        className="text-xs mt-4 text-center max-w-[260px]"
        style={{ color: "var(--color-on-surface-variant)" }}
      >
        On testnet, tap "Simulate Demo Scan" to test the payment flow with demo data.
      </p>
    </div>
  );
}
