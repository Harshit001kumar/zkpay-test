"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { encodeFunctionData, maxUint256 } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { getPublicClient } from "@/lib/p2pkit";

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

  const [isPaymasterApproved, setIsPaymasterApproved] = useState(false);
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!smartAccountAddress) return;
    if (checkedRef.current === smartAccountAddress) return;
    checkedRef.current = smartAccountAddress;

    let active = true;
    (async () => {
      try {
        const publicClient = getPublicClient();
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

  // Wrap smartClient to ensure Pimlico ERC-20 paymaster has sufficient USDC allowance
  // This prevents `AA50 postOp reverted: TRANSFER_FROM_FAILED` when paying gas in USDC
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

            // Check if approval for Pimlico ERC-20 paymaster is already in the batch
            const hasPaymasterApproval = rawCalls.some((c: any) => {
              if (!c?.to || c.to.toLowerCase() !== CONTRACTS.USDC.toLowerCase()) return false;
              const data = (c?.data || "").toLowerCase();
              return (
                data.includes(CONTRACTS.PIMLICO_PAYMASTER_V6.toLowerCase().slice(2)) ||
                data.includes(CONTRACTS.PIMLICO_PAYMASTER_V7.toLowerCase().slice(2))
              );
            });

            // If not already approved on-chain and not in current batch, prepend approval
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
