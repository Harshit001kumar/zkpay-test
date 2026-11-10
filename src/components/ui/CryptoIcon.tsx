"use client";

import React from "react";
import { chainVisual } from "@/lib/chainVisuals";

export type CryptoSymbol =
  | "BTC"
  | "ETH"
  | "SOL"
  | "USDC"
  | "USDT"
  | "BNB"
  | "TRX"
  | "LTC"
  | "POL"
  | "ARB"
  | "BASE"
  | string;

interface CryptoIconProps {
  symbol: CryptoSymbol;
  chain?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  withChainBadge?: boolean;
}

const SIZE_MAP = {
  xs: { box: 16, px: "w-4 h-4", badge: "w-2 h-2 -bottom-0.5 -right-0.5" },
  sm: { box: 22, px: "w-[22px] h-[22px]", badge: "w-2.5 h-2.5 -bottom-0.5 -right-0.5" },
  md: { box: 32, px: "w-8 h-8", badge: "w-3.5 h-3.5 -bottom-0.5 -right-0.5" },
  lg: { box: 40, px: "w-10 h-10", badge: "w-4 h-4 -bottom-1 -right-1" },
  xl: { box: 48, px: "w-12 h-12", badge: "w-4.5 h-4.5 -bottom-1 -right-1" },
};

export function CryptoIcon({
  symbol,
  chain,
  size = "md",
  className = "",
  withChainBadge = false,
}: CryptoIconProps) {
  const norm = (symbol || "").toUpperCase();
  const cfg = SIZE_MAP[size] || SIZE_MAP.md;
  const cv = chain ? chainVisual(chain) : null;

  const renderVector = () => {
    switch (norm) {
      case "BTC":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#F7931A" />
            <path
              d="M23.189 14.02c.314-2.096-.689-3.224-2.457-3.978l.502-2.016-1.226-.306-.489 1.96c-.322-.08-.654-.156-.985-.231l.493-1.977-1.226-.306-.502 2.015c-.267-.061-.53-.122-.782-.186l.002-.007-1.692-.423-.327 1.31s.911.209.892.222c.497.124.587.453.572.714l-.573 2.298c.034.009.079.022.127.043-.041-.01-.086-.022-.13-.033l-.803 3.22c-.061.151-.215.378-.563.291.012.018-.893-.223-.893-.223l-.61 1.407 1.597.398c.297.075.587.153.873.228l-.507 2.039 1.225.306.502-2.014c.335.091.66.175.979.255l-.5 2.008 1.226.306.508-2.036c2.09.396 3.662.236 4.323-1.655.533-1.522-.027-2.4-.1.127-3.084.792-.916 1.385-2.106 1.006-3.87zm-1.85 4.237c-.38 1.523-2.946.699-3.778.492l.674-2.702c.832.207 3.498.618 3.104 2.21zm.379-4.26c-.346 1.387-2.484.682-3.176.51l.611-2.451c.692.172 2.923.493 2.565 1.941z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case "ETH":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#627EEA" />
            <g fill="#FFFFFF" fillRule="evenodd">
              <path d="M16 4v9.112l7.7 3.447L16 4z" fillOpacity="0.6" />
              <path d="M16 4L8.3 16.559l7.7-3.447V4z" />
              <path d="M16 21.668v6.326l7.708-10.662L16 21.668z" fillOpacity="0.6" />
              <path d="M16 27.994v-6.326L8.3 17.332l7.7 10.662z" />
              <path d="M16 20.316l7.695-4.475L16 12.394v7.922z" fillOpacity="0.2" />
              <path d="M8.305 15.841L16 20.316v-7.922l-7.695 3.447z" fillOpacity="0.6" />
            </g>
          </svg>
        );

      case "SOL":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#0E0F14" />
            <defs>
              <linearGradient id="sol-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#14F195" />
                <stop offset="100%" stopColor="#9945FF" />
              </linearGradient>
            </defs>
            <path
              d="M9.2 19.8a.9.9 0 01.63-.26h12.37a.45.45 0 01.32.77l-2.32 2.32a.9.9 0 01-.64.27H7.19a.45.45 0 01-.32-.77l2.33-2.33zM9.2 8.7a.9.9 0 01.63-.26h12.37a.45.45 0 01.32.77L20.2 11.53a.9.9 0 01-.64.27H7.19a.45.45 0 01-.32-.77L9.2 8.7zm13.6 5.55a.9.9 0 00-.63-.26H9.8a.45.45 0 00-.32.77l2.32 2.32a.9.9 0 00.64.27h12.37a.45.45 0 00.32-.77l-2.33-2.33z"
              fill="url(#sol-grad)"
            />
          </svg>
        );

      case "USDC":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#2775CA" />
            <path
              d="M16 6.8c-5.08 0-9.2 4.12-9.2 9.2s4.12 9.2 9.2 9.2 9.2-4.12 9.2-9.2S21.08 6.8 16 6.8zm.8 14.54v1.86h-1.6v-1.84c-1.84-.14-3.08-1.08-3.2-2.56h1.92c.16.8 1.02 1.28 2.08 1.28 1.18 0 1.94-.58 1.94-1.42 0-.82-.6-1.22-2.02-1.58-2.04-.52-3.52-1.08-3.52-2.92 0-1.5 1.14-2.5 2.8-2.7v-1.66h1.6v1.64c1.58.16 2.68 1.04 2.82 2.34h-1.9c-.16-.62-.84-1.12-1.72-1.12-.96 0-1.64.5-1.64 1.24 0 .7.52 1.06 1.84 1.4 2.16.54 3.7 1.14 3.7 3.1 0 1.62-1.24 2.66-2.9 2.88z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case "USDT":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#26A17B" />
            <path
              d="M17.92 14.98v-2.06h5.2v-2.76H8.88v2.76h5.2v2.06c-4.48.2-7.84 1.16-7.84 2.32 0 1.16 3.36 2.12 7.84 2.32v6.5h3.84v-6.5c4.48-.2 7.84-1.16 7.84-2.32 0-1.16-3.36-2.12-7.84-2.32zm0 3.38c-.5.04-1.2.06-1.92.06-.72 0-1.42-.02-1.92-.06-3.52-.16-5.88-.8-5.88-1.52 0-.72 2.36-1.36 5.88-1.52.5-.02 1.2-.04 1.92-.04.72 0 1.42.02 1.92.04 3.52.16 5.88.8 5.88 1.52 0 .72-2.36 1.36-5.88 1.52z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case "BNB":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
            <path
              d="M16 7.2l3.4 3.4-3.4 3.4-3.4-3.4L16 7.2zm-4.8 4.8l3.4 3.4-3.4 3.4-3.4-3.4 3.4-3.4zm9.6 0l3.4 3.4-3.4 3.4-3.4-3.4 3.4-3.4zM16 16.8l3.4 3.4-3.4 3.4-3.4-3.4 3.4-3.4zM16 12l2.4 2.4L16 16.8l-2.4-2.4L16 12z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case "TRX":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#FF0013" />
            <path
              d="M7.4 8.2l17.2 4.4-11.4 12.8L7.4 8.2zm14.6 4.3L10.8 9.6l2.1 11.2 9.1-8.3zm-1.8 1.6l-6.8 6.2 6.8-6.2z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case "LTC":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#345D9D" />
            <path
              d="M17.4 7.6h-3.2l-2.3 9-2.1.8.6 2.1 1.6-.6-1.5 5.5h11.2l1-3.6H14.1l1.2-4.5 2.1-.8-.6-2.1-1.6.6 2.2-6.4z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case "POL":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#8247E5" />
            <path
              d="M20.9 12.2c-.8-.5-1.9-.5-2.7 0l-3.3 1.9-2.2 1.3-3.3 1.9c-.8.5-1.9.5-2.7 0-.8-.5-1.4-1.4-1.4-2.4s.5-1.9 1.4-2.4c.8-.5 1.9-.5 2.7 0l3.3 1.9 2.2-1.3-3.3-1.9c-1.7-1-3.9-1-5.6 0C2.2 12.2 1.2 14 1.2 16s1 3.8 2.7 4.8c1.7 1 3.9 1 5.6 0l3.3-1.9 2.2-1.3 3.3-1.9c.8-.5 1.9-.5 2.7 0 .8.5 1.4 1.4 1.4 2.4s-.5 1.9-1.4 2.4c-.8.5-1.9.5-2.7 0l-3.3-1.9-2.2 1.3 3.3 1.9c1.7 1 3.9 1 5.6 0 1.7-1 2.7-2.8 2.7-4.8s-1-3.8-2.7-4.8z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case "ARB":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#28A0F0" />
            <path
              d="M16 6.8l7.6 13.2h-3.4l-4.2-7.4-4.2 7.4H8.4L16 6.8zm-3.6 15l1.8-3.2h3.6l1.8 3.2h-7.2z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case "BASE":
        return (
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <circle cx="16" cy="16" r="16" fill="#2970FF" />
            <path
              d="M16 7.2C11.14 7.2 7.2 11.14 7.2 16c0 4.86 3.94 8.8 8.8 8.8 4.6 0 8.36-3.53 8.76-8h-8.76v-1.6h8.76c-.4-4.47-4.16-8-8.76-8z"
              fill="#FFFFFF"
            />
          </svg>
        );

      default:
        return (
          <div
            className="w-full h-full rounded-full flex items-center justify-center font-mono font-bold text-on-surface"
            style={{
              backgroundColor: cv?.color || "#1E2738",
              fontSize: `${cfg.box * 0.36}px`,
            }}
          >
            {norm.slice(0, 3)}
          </div>
        );
    }
  };

  return (
    <span className={`relative inline-flex shrink-0 ${cfg.px} ${className}`} aria-hidden="true">
      {renderVector()}
      {withChainBadge && cv && (
        <span
          className={`absolute rounded-full border-2 border-surface-container ${cfg.badge}`}
          style={{ backgroundColor: cv.color }}
          title={cv.name}
        />
      )}
    </span>
  );
}
