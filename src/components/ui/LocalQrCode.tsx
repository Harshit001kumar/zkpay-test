"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

interface LocalQrCodeProps {
  value: string;
  size?: number;
  alt?: string;
  className?: string;
  margin?: number;
}

export function LocalQrCode({
  value,
  size = 240,
  alt = "QR code",
  className = "w-full h-full object-contain",
  margin = 1,
}: LocalQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    if (!value) {
      setDataUrl("");
      return;
    }
    QRCode.toDataURL(value, {
      width: size,
      margin,
      color: { dark: "#090A0E", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl("");
      });
    return () => {
      active = false;
    };
  }, [value, size, margin]);

  if (!dataUrl) {
    return <div className={`bg-white/90 animate-pulse ${className}`} aria-label={alt} />;
  }

  return <img src={dataUrl} alt={alt} className={className} />;
}
