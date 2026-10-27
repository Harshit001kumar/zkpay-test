"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { SupportedCurrency, CurrencyMeta, CURRENCY_CONFIGS } from "@/lib/types";
import { useActiveAccount } from "@/hooks/useActiveAccount";

interface CurrencyContextType {
  currency: SupportedCurrency;
  currencyMeta: CurrencyMeta;
  setCurrency: (currency: SupportedCurrency) => void;
  formatFiat: (amount: number) => string;
  isOnboardingOpen: boolean;
  setIsOnboardingOpen: (open: boolean) => void;
  isSelectorOpen: boolean;
  setIsSelectorOpen: (open: boolean) => void;
  hasUserSelected: boolean;
}

const STORAGE_KEY = "zkpay_selected_currency";
const USER_SELECTED_FLAG = "zkpay_currency_onboarded";

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, address } = useActiveAccount();
  const [currency, setCurrencyState] = useState<SupportedCurrency>("INR");
  const [hasUserSelected, setHasUserSelected] = useState<boolean>(true); // default true until check
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState<boolean>(false);
  const [initialized, setInitialized] = useState<boolean>(false);

  // Initialize currency from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY) as SupportedCurrency | null;
      if (stored && CURRENCY_CONFIGS[stored]) {
        setCurrencyState(stored);
      }
      const onboarded = localStorage.getItem(USER_SELECTED_FLAG) === "true";
      setHasUserSelected(onboarded);
    } catch (e) {
      console.warn("[CurrencyContext] Failed to read localStorage:", e);
    } finally {
      setInitialized(true);
    }
  }, []);

  // When user logs in for the first time, show onboarding modal if not previously onboarded
  useEffect(() => {
    if (!initialized || !ready) return;

    if (authenticated && address) {
      try {
        const userSpecificKey = `${USER_SELECTED_FLAG}_${address.toLowerCase()}`;
        const hasOnboardedUser = localStorage.getItem(userSpecificKey) === "true" ||
          localStorage.getItem(USER_SELECTED_FLAG) === "true";

        if (!hasOnboardedUser) {
          setHasUserSelected(false);
          setIsOnboardingOpen(true);
        } else {
          // Check if user has specific currency saved
          const userCurrencyKey = `${STORAGE_KEY}_${address.toLowerCase()}`;
          const userSavedCurrency = localStorage.getItem(userCurrencyKey) as SupportedCurrency | null;
          if (userSavedCurrency && CURRENCY_CONFIGS[userSavedCurrency]) {
            setCurrencyState(userSavedCurrency);
          }
        }
      } catch (err) {
        console.warn("[CurrencyContext] Onboarding check error:", err);
      }
    }
  }, [initialized, ready, authenticated, address]);

  const setCurrency = useCallback((newCurrency: SupportedCurrency) => {
    if (!CURRENCY_CONFIGS[newCurrency]) return;
    setCurrencyState(newCurrency);
    setHasUserSelected(true);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, newCurrency);
        localStorage.setItem(USER_SELECTED_FLAG, "true");

        if (address) {
          localStorage.setItem(`${STORAGE_KEY}_${address.toLowerCase()}`, newCurrency);
          localStorage.setItem(`${USER_SELECTED_FLAG}_${address.toLowerCase()}`, "true");
        }
      } catch (e) {
        console.warn("[CurrencyContext] Failed to save currency preference:", e);
      }
    }
  }, [address]);

  const formatFiat = useCallback((amount: number) => {
    const meta = CURRENCY_CONFIGS[currency];
    const formattedNum = (amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${meta.symbol}${formattedNum}`;
  }, [currency]);

  const value: CurrencyContextType = {
    currency,
    currencyMeta: CURRENCY_CONFIGS[currency],
    setCurrency,
    formatFiat,
    isOnboardingOpen,
    setIsOnboardingOpen,
    isSelectorOpen,
    setIsSelectorOpen,
    hasUserSelected,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
