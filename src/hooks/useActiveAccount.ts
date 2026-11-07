"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { createPublicClient, encodeFunctionData, fallback, http, maxUint256 } from "viem";
import { base } from "viem/chains";
import { BASE_RPC_URLS, CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";

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
  const { client } = useSmartWallets();

  const smartAccount = user?.linkedAccounts?.find(
    (acc: any) => acc.type === "smart_wallet"
  ) as any;

  const linkedWallet = user?.linkedAccounts?.find(
    (acc: any) => acc.type === "wallet"
  ) as any;

  const smartAccountAddress = (client?.account?.address || smartAccount?.address || null) as `0x${string}` | null;
  const eoaAddress = (user?.wallet?.address || wallets?.[0]?.address || linkedWallet?.address || null) as `0x${string}` | null;

  const address = (smartAccountAddress || eoaAddress || null) as `0x${string}` | null;
  const primaryWallet = wallets?.[0] || null;

  const [isPaymasterApproved, setIsPaymasterApproved] = useState(false);
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!smartAccountAddress) return;
    if (checkedRef.current === smartAccountAddress) return;
    checkedRef.current = smartAccountAddress;

    let active = true;
    (async () => {
      try {
        const publicClient = getBasePublicClient();
        const allowance = (await publicClient.readContract({
          address: CONTRACTS.USDC,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [smartAccountAddress, CONTRACTS.PIMLICO_PAYMASTER_V6],
        })) as bigint;

        if (active && allowance >= 50_000_000n) {
          setIsPaymasterApproved(true);
        }
      } catch {
        // Fall back to injecting approval
      }
    })();

    return () => {
      active = false;
    };
  }, [smartAccountAddress]);

  const wrappedClient = useMemo(() => {
    if (!client) return null;

    return new Proxy(client, {
      get(target: any, prop: string | symbol, receiver: any) {
        if (prop === "sendTransaction") {
          return async (args: any) => {
            const rawCalls = args?.calls ? [...args.calls] : [];
            if (!args?.calls && args?.to) {
              rawCalls.push({
                to: args.to,
                data: args.data || "0x",
                value: args.value || 0n,
              });
            }

            const hasPaymasterApproval = rawCalls.some((c: any) => {
              if (!c?.to || c.to.toLowerCase() !== CONTRACTS.USDC.toLowerCase()) return false;
              const data = (c?.data || "").toLowerCase();
              return (
                data.includes(CONTRACTS.PIMLICO_PAYMASTER_V6.toLowerCase().slice(2)) ||
                data.includes(CONTRACTS.PIMLICO_PAYMASTER_V7.toLowerCase().slice(2))
              );
            });

            if (!isPaymasterApproved && !hasPaymasterApproval) {
              const approveCall = {
                to: CONTRACTS.USDC as `0x${string}`,
                data: encodeFunctionData({
                  abi: ERC20_ABI,
                  functionName: "approve",
                  args: [CONTRACTS.PIMLICO_PAYMASTER_V6, maxUint256],
                }),
                value: 0n,
              };
              rawCalls.unshift(approveCall);
            }

            const { to, data, value, ...restArgs } = args || {};

            const txHash = await target.sendTransaction({
              ...restArgs,
              calls: rawCalls,
            });

            setIsPaymasterApproved(true);

            return txHash;
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }, [client, isPaymasterApproved, smartAccountAddress]);

  return {
    address,
    eoaAddress,
    smartAccountAddress,
    smartClient: wrappedClient,
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
