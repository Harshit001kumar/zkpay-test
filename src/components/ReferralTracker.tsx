"use client";

import { useEffect, useRef } from "react";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { usePrivy } from "@privy-io/react-auth";

const REFERRAL_STORAGE_KEY = "zkpay_pending_ref";
const REFERRAL_COOKIE_NAME = "zkpay_ref";

/**
 * Retrieve any pending referral code from URL, localStorage, sessionStorage, or cookies.
 */
export function getPendingReferral(): string | null {
  if (typeof window === "undefined") return null;
  try {
    // 1. Check URL query params
    const params = new URLSearchParams(window.location.search);
    const refFromUrl = params.get("ref");
    if (refFromUrl && refFromUrl.trim()) {
      return refFromUrl.trim();
    }

    // 2. Check localStorage
    const refFromLocal = localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (refFromLocal && refFromLocal.trim()) {
      return refFromLocal.trim();
    }

    // 3. Check sessionStorage
    const refFromSession = sessionStorage.getItem(REFERRAL_STORAGE_KEY);
    if (refFromSession && refFromSession.trim()) {
      return refFromSession.trim();
    }

    // 4. Check cookie
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${REFERRAL_COOKIE_NAME}=([^;]*)`));
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim();
    }
  } catch {}
  return null;
}

/**
 * Persist pending referral across localStorage, sessionStorage, and 30-day cookie.
 */
export function savePendingReferral(code: string) {
  if (typeof window === "undefined" || !code) return;
  const trimmed = code.trim();
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, trimmed);
    sessionStorage.setItem(REFERRAL_STORAGE_KEY, trimmed);
    // 30 days cookie
    document.cookie = `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(
      trimmed
    )}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
  } catch {}
}

/**
 * Clear pending referral across all storage mechanisms once bound.
 */
export function clearPendingReferral() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
    sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
    document.cookie = `${REFERRAL_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  } catch {}
}

export default function ReferralTracker() {
  const { address, authenticated } = useActiveAccount();
  const { getAccessToken } = usePrivy();
  const bindingInProgress = useRef(false);

  // 1. Capture referral code immediately on mount of ANY page/route
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref && ref.trim()) {
        savePendingReferral(ref.trim());
      }
    } catch {}
  }, []);

  // 2. Automatically bind pending referral as soon as the user is authenticated with a wallet
  useEffect(() => {
    if (!authenticated || !address) return;
    let cancelled = false;

    async function attemptBinding() {
      const pendingRef = getPendingReferral();
      if (!pendingRef || bindingInProgress.current) return;

      bindingInProgress.current = true;
      try {
        const token = await getAccessToken();
        if (cancelled) return;

        const res = await fetch("/api/referrals/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            userAddress: address,
            referrerCodeOrAddress: pendingRef,
          }),
        });

        const data = await res.json();
        if (data.success) {
          clearPendingReferral();
        } else if (
          data.error &&
          (data.error.includes("Cannot refer yourself") ||
            data.error.includes("Invalid referee") ||
            data.error.includes("Referral code or address not found"))
        ) {
          // If code is invalid or self-referral, clear it so we don't repeat failed pings
          clearPendingReferral();
        }
      } catch (err) {
        console.warn("[ReferralTracker] Auto-binding attempt error:", err);
      } finally {
        bindingInProgress.current = false;
      }
    }

    attemptBinding();
    return () => {
      cancelled = true;
    };
  }, [authenticated, address, getAccessToken]);

  return null;
}
