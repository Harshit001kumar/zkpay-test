"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { BASE_RPC_URLS } from "@/lib/constants";

let _basePublicClient: ReturnType<typeof createPublicClient> | null = null;

export function getBasePublicClient() {
  if (!_basePublicClient) {
    _basePublicClient = createPublicClient({
      chain: base,
      transport: fallback(
        BASE_RPC_URLS.map((url) => http(url, { timeout: 10_000, retryCount: 2 })),
        { rank: false }
      ),
    });
  }
  return _basePublicClient;
}

export function useActiveAccount() {
  const { user, ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const smartAccount = user?.linkedAccounts?.find(
    (acc: any) => acc.type === "smart_wallet"
  ) as any;

  const linkedWallet = user?.linkedAccounts?.find(
    (acc: any) => acc.type === "wallet"
  ) as any;

  const smartAccountAddress = (smartAccount?.address || null) as `0x${string}` | null;
  const eoaAddress = (user?.wallet?.address || wallets?.[0]?.address || linkedWallet?.address || null) as `0x${string}` | null;

  const address = (smartAccountAddress || eoaAddress || null) as `0x${string}` | null;
  const primaryWallet = wallets?.[0] || null;

  return {
    address,
    eoaAddress,
    smartAccountAddress,
    smartClient: null as any,
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
