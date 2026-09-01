"use client";

import { useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

/**
 * Client-side hook for the Backend Gas Relayer.
 *
 * Before any on-chain transaction, call `ensureGas(address)` to
 * guarantee the smart account has enough ETH for gas. The relayer
 * will pre-fund it with ~$0.02 of ETH if needed.
 *
 * Usage:
 * ```
 * const { ensureGas } = useGasRelay();
 * await ensureGas(smartAccountAddress); // returns instantly if already funded
 * await smartClient.sendTransaction({ calls });
 * ```
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
            console.warn("[GasRelay] No access token available, skipping prefund");
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
            // Don't throw — let the transaction attempt anyway
            // (the account might already have enough ETH from a previous prefund)
            return;
          }

          const data = await res.json();
          if (data.alreadyFunded) {
            // Account already has enough ETH — no action needed
            return;
          }

          if (data.txHash) {
            console.log("[GasRelay] Pre-funded with tx:", data.txHash);
          }
        } catch (err) {
          console.warn("[GasRelay] Prefund failed (non-blocking):", err);
          // Don't throw — best effort. Transaction may still succeed.
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
