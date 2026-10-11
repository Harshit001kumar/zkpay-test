"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";

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

  return {
    address,
    eoaAddress,
    smartAccountAddress,
    smartClient: client,
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
