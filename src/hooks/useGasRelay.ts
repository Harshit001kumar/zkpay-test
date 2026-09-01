"use client";

import { useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

/**
 * Client-side hook for the Backend Gas Relayer.
 *
 * Pre-funds the user's Smart Account or Embedded Wallet with micro ETH
 * on Base so they can execute transactions without AA21 errors.
 */
export function useGasRelay() {
  const { getAccessToken } = usePrivy();

  // Track in-flight prefund requests to avoid duplicate calls
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());

  const ensureGas = useCallback(
    async (address: `0x${string}` | string | null | undefined): Promise<void> => {
      if (!address) return;

      const key = address.toLowerCase();

      // If there's already an in-flight prefund for this address, wait for it
      const existing = inflightRef.current.get(key);
      if (existing) {
        await existing;
        return;
      }

      const prefundPromise = (async () => {
        try {
          const accessToken = await getAccessToken();
          if (!accessToken) {
            console.warn("[GasRelay] No access token available");
            return;
          }

          const res = await fetch("/api/relayer/prefund", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ address }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            console.warn("[GasRelay] Prefund response:", data.error || res.statusText);
            return;
          }

          const data = await res.json();
          if (data.alreadyFunded) {
            return;
          }

          if (data.txHash) {
            console.log("[GasRelay] Pre-funded account with tx:", data.txHash);
          }
        } catch (err) {
          console.warn("[GasRelay] Prefund failed (non-blocking):", err);
        } finally {
          inflightRef.current.delete(key);
        }
      })();

      inflightRef.current.set(key, prefundPromise);
      await prefundPromise;
    },
    [getAccessToken]
  );

  return { ensureGas };
}
