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

  // Active address priority:
  // 1. Smart account address from client
  // 2. Smart account address from user.linkedAccounts
  // 3. EOA wallet address
  const address = (
    client?.account?.address ||
    smartAccount?.address ||
    user?.wallet?.address ||
    wallets?.[0]?.address ||
    null
  ) as `0x${string}` | null;

  return {
    address,
    smartAccountAddress: (client?.account?.address || smartAccount?.address || null) as `0x${string}` | null,
    eoaAddress: (user?.wallet?.address || wallets?.[0]?.address || null) as `0x${string}` | null,
    smartClient: client,
    isSmartWallet: !!(client?.account?.address || smartAccount?.address),
    user,
    wallets,
    ready,
    authenticated,
    login,
    logout,
  };
}
