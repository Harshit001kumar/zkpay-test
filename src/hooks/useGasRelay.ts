"use client";

import { useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

/**
 * Client-side hook for the Backend Gas Relayer.
 *
 * Exclusively pre-funds Privy Smart Accounts and Embedded Wallets.
 * External connected wallets (MetaMask, Phantom, etc.) are skipped
 * since they pay their own gas.
 */
export function useGasRelay() {
  const { user, getAccessToken } = usePrivy();

  // Track in-flight prefund requests to avoid duplicate calls
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());

  const ensureGas = useCallback(
    async (address: `0x${string}` | string | null | undefined): Promise<void> => {
      if (!address) return;

      const key = address.toLowerCase();

      // Check if target is an external wallet (MetaMask, Phantom, etc.)
      // Skip prefund if not a Privy Smart Account or Embedded Wallet
      if (user?.linkedAccounts) {
        const isPrivyManaged = user.linkedAccounts.some(
          (acc: any) =>
            (acc.type === "smart_wallet" ||
              (acc.type === "wallet" &&
                (acc.walletClientType === "privy" || acc.connectorType === "embedded"))) &&
            (acc.address || "").toLowerCase() === key
        );

        const isExternalWallet = user.linkedAccounts.some(
          (acc: any) =>
            acc.type === "wallet" &&
            acc.walletClientType !== "privy" &&
            acc.connectorType !== "embedded" &&
            (acc.address || "").toLowerCase() === key
        );

        if (isExternalWallet && !isPrivyManaged) {
          // External wallet pays their own gas — skip prefund
          return;
        }
      }

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
            console.log("[GasRelay] Pre-funded smart account with tx:", data.txHash);
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
    [user, getAccessToken]
  );

  return { ensureGas };
}
