"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useMemo } from "react";
import { CONTRACTS } from "@/lib/constants";

/**
 * Wraps a Privy SmartWalletClient so that every `sendTransaction` call
 * automatically includes `paymasterContext: { token: USDC }`.
 *
 * This makes the Pimlico ERC-20 Paymaster deduct a tiny gas fee from the
 * user's USDC balance instead of requiring developer-funded gas sponsorship.
 * The user never needs to hold native ETH for gas.
 */
function wrapSmartClientWithUSDCGas(client: any) {
  if (!client) return null;

  // Preserve all original properties and methods; only override sendTransaction
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "sendTransaction") {
        return async (...args: any[]) => {
          const [txParams, txOptions] = args;
          // Merge our paymasterContext into the options (second arg)
          const mergedOptions = {
            ...(txOptions || {}),
            paymasterContext: {
              token: CONTRACTS.USDC,
              ...(txOptions?.paymasterContext || {}),
            },
          };
          return target.sendTransaction(txParams, mergedOptions);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export function useActiveAccount() {
  const { user, ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { client } = useSmartWallets();

  // Find smart wallet account if available in linkedAccounts
  const smartAccount = user?.linkedAccounts?.find(
    (acc: any) => acc.type === "smart_wallet"
  ) as any;

  // Find embedded or linked wallet account in linkedAccounts
  const linkedWallet = user?.linkedAccounts?.find(
    (acc: any) => acc.type === "wallet"
  ) as any;

  const smartAccountAddress = (client?.account?.address || smartAccount?.address || null) as `0x${string}` | null;
  const eoaAddress = (user?.wallet?.address || wallets?.[0]?.address || linkedWallet?.address || null) as `0x${string}` | null;

  // Active address priority: Smart Account first (1-click batched txs & gas sponsorship), then EOA fallback
  const address = (smartAccountAddress || eoaAddress || null) as `0x${string}` | null;

  const primaryWallet = wallets?.[0] || null;

  // Wrap the smart client so gas is paid in USDC via Pimlico ERC-20 Paymaster
  const smartClient = useMemo(() => wrapSmartClientWithUSDCGas(client), [client]);

  return {
    address,
    eoaAddress,
    smartAccountAddress,
    smartClient,
    isSmartWallet: !!smartAccountAddress,
    user,
    wallets,
    primaryWallet,
    ready,
    authenticated,
    login,
    logout,
  };
}
