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

  const smartAccountAddress = (client?.account?.address || smartAccount?.address || null) as `0x${string}` | null;
  const eoaAddress = (user?.wallet?.address || wallets?.[0]?.address || null) as `0x${string}` | null;

  // Active address priority: Primary embedded wallet EOA first (holds user funds), then smart account
  const address = (eoaAddress || smartAccountAddress || null) as `0x${string}` | null;

  return {
    address,
    eoaAddress,
    smartAccountAddress,
    smartClient: client,
    isSmartWallet: !!smartAccountAddress,
    user,
    wallets,
    ready,
    authenticated,
    login,
    logout,
  };
}
