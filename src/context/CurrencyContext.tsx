"use client";
import React from "react";

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useCurrency() {
  return {
    currency: "USD",
    currencyMeta: { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸", rail: "Crypto" },
    setCurrency: () => {},
    isSelectorOpen: false,
    setIsSelectorOpen: () => {},
  };
}
