"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets, getAccessToken } from "@privy-io/react-auth";
import { formatUnits, parseUnits, encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { useReadContract } from "wagmi";
import { CONTRACTS, EARN_CONFIG } from "@/lib/constants";
import { ERC20_ABI, ERC4626_ABI } from "@/lib/abi";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { floorTo2Decimals } from "@/lib/format";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { ShinyText } from "@/components/ui/ShinyText";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import { CountUp } from "@/components/ui/CountUp";
import { Tilt3DMonolith, DepthLayer } from "@/components/ui/Tilt3DMonolith";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";

interface VaultInfo {
  address?: string | null;
  name: string;
  provider: string;
  apy: string;
  tvlUsd: number | null;
  availableLiquidityUsd: number | null;
  asset: string;
}

interface PositionInfo {
  totalDeposited: number;
  totalWithdrawn: number;
  assetsInVault: number;
  earnedYield: number;
}

const PRESET_AMOUNTS = [10, 50, 100, 250];

export default function EarnFlow() {
  const { authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { address: activeAddress, smartAccountAddress, eoaAddress, smartClient } = useActiveAccount();

  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [position, setPosition] = useState<PositionInfo | null>(null);
  const [isLoadingPosition, setIsLoadingPosition] = useState(true);

  // Address resolution: Ensure smart account (UserOp sender) is checked
  const smartWalletFromPrivy = (user?.linkedAccounts?.find((acc: any) => acc.type === "smart_wallet") as any)?.address as `0x${string}` | undefined;
  const resolvedSmartAddr = (smartClient?.account?.address || smartAccountAddress || smartWalletFromPrivy) as `0x${string}` | undefined;
  const resolvedEoaAddr = (eoaAddress || user?.wallet?.address || wallets?.[0]?.address) as `0x${string}` | undefined;

  const primaryHolderAddress = (resolvedSmartAddr || resolvedEoaAddr || activeAddress) as `0x${string}` | undefined;
  const secondaryHolderAddress = (resolvedSmartAddr && resolvedEoaAddr && resolvedSmartAddr.toLowerCase() !== resolvedEoaAddr.toLowerCase()) ? resolvedEoaAddr : undefined;

  // Available Base USDC balance
  const { data: rawBal, refetch: refetchBal } = useReadContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [activeAddress ?? "0x0000000000000000000000000000000000000000"],
    chainId: base.id,
    query: {
      enabled: !!activeAddress,
      refetchInterval: 5000,
    },
  });

  const availableUsdc = rawBal !== undefined ? floorTo2Decimals(rawBal as bigint) : 0;

  // 1. Check Steakhouse Prime Instant vault (0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9) for smart account
  const { data: sharesSmartPrimary, refetch: refetchSharesSmartPrimary } = useReadContract({
    address: CONTRACTS.EARN_VAULT,
    abi: ERC4626_ABI,
    functionName: "balanceOf",
    args: [(resolvedSmartAddr ?? "0x0000000000000000000000000000000000000000") as `0x${string}`],
    chainId: base.id,
    query: {
      enabled: !!resolvedSmartAddr,
      refetchInterval: 4000,
    },
  });

  // 2. Check Steakhouse Prime Instant vault for EOA (if different)
  const { data: sharesEoaPrimary, refetch: refetchSharesEoaPrimary } = useReadContract({
    address: CONTRACTS.EARN_VAULT,
    abi: ERC4626_ABI,
    functionName: "balanceOf",
    args: [(resolvedEoaAddr ?? "0x0000000000000000000000000000000000000000") as `0x${string}`],
    chainId: base.id,
    query: {
      enabled: !!resolvedEoaAddr && resolvedEoaAddr.toLowerCase() !== resolvedSmartAddr?.toLowerCase(),
      refetchInterval: 4000,
    },
  });

  // 3. Check Alt Steakhouse vault (0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183)
  const { data: sharesAltVault, refetch: refetchSharesAlt } = useReadContract({
    address: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
    abi: ERC4626_ABI,
    functionName: "balanceOf",
    args: [(primaryHolderAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`],
    chainId: base.id,
    query: {
      enabled: !!primaryHolderAddress,
      refetchInterval: 4000,
    },
  });

  // Resolve active vault and active holder that holds the tokens
  let activeVaultAddress: `0x${string}` = (vault?.address as `0x${string}`) || CONTRACTS.EARN_VAULT;
  let activeHolderAddress: `0x${string}` = (primaryHolderAddress || activeAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`;
  let isHolderSmartAccount: boolean = !!resolvedSmartAddr;
  let onChainVaultShares: bigint = 0n;

  if (sharesSmartPrimary && (sharesSmartPrimary as bigint) > 0n) {
    activeVaultAddress = CONTRACTS.EARN_VAULT;
    activeHolderAddress = resolvedSmartAddr!;
    isHolderSmartAccount = true;
    onChainVaultShares = sharesSmartPrimary as bigint;
  } else if (sharesEoaPrimary && (sharesEoaPrimary as bigint) > 0n) {
    activeVaultAddress = CONTRACTS.EARN_VAULT;
    activeHolderAddress = resolvedEoaAddr!;
    isHolderSmartAccount = false;
    onChainVaultShares = sharesEoaPrimary as bigint;
  } else if (sharesAltVault && (sharesAltVault as bigint) > 0n) {
    activeVaultAddress = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";
    activeHolderAddress = primaryHolderAddress!;
    isHolderSmartAccount = !!resolvedSmartAddr && activeHolderAddress.toLowerCase() === resolvedSmartAddr.toLowerCase();
    onChainVaultShares = sharesAltVault as bigint;
  }

  // Live convertToAssets valuation for current shares on the active vault
  const { data: onChainConvertedAssets } = useReadContract({
    address: activeVaultAddress,
    abi: ERC4626_ABI,
    functionName: "convertToAssets",
    args: [onChainVaultShares],
    chainId: base.id,
    query: {
      enabled: onChainVaultShares > 0n,
      refetchInterval: 4000,
    },
  });

  // Live maxWithdraw check for active holder
  const { data: onChainVaultAssets, refetch: refetchVaultBal } = useReadContract({
    address: activeVaultAddress,
    abi: ERC4626_ABI,
    functionName: "maxWithdraw",
    args: [activeHolderAddress],
    chainId: base.id,
    query: {
      enabled: !!activeHolderAddress && activeHolderAddress !== "0x0000000000000000000000000000000000000000",
      refetchInterval: 4000,
    },
  });

  const bestAssetsBigInt =
    (onChainConvertedAssets as bigint | undefined) && (onChainConvertedAssets as bigint) > 0n
      ? (onChainConvertedAssets as bigint)
      : (onChainVaultAssets as bigint | undefined) && (onChainVaultAssets as bigint) > 0n
      ? (onChainVaultAssets as bigint)
      : undefined;

  const effectiveAssetsInVault =
    bestAssetsBigInt !== undefined
      ? Number(formatUnits(bestAssetsBigInt, 6))
      : (position?.assetsInVault ?? 0);

  // Resolve target wallet ID: Prefer the Privy embedded wallet ID from linkedAccounts
  const getWalletId = useCallback(() => {
    const embeddedWallet = user?.linkedAccounts?.find(
      (acc: any) =>
        acc.type === "wallet" &&
        (acc.walletClientType === "privy" || acc.connectorType === "embedded")
    ) as any;

    if (embeddedWallet?.id) return embeddedWallet.id;
    if (embeddedWallet?.address) return embeddedWallet.address;
    return activeAddress || wallets?.[0]?.address || null;
  }, [user, activeAddress, wallets]);

  const fetchPosition = useCallback(async () => {
    const walletId = getWalletId();
    if (!walletId || !authenticated) {
      setIsLoadingPosition(false);
      return;
    }

    try {
      setIsLoadingPosition(true);
      const accessToken = await getAccessToken();

      const res = await fetch(
        `/api/earn/position?walletId=${encodeURIComponent(walletId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setVault(data.vault);
        setPosition(data.position);
      }
    } catch (err: any) {
      console.error("[EarnFlow] Failed to fetch position:", err);
    } finally {
      setIsLoadingPosition(false);
    }
  }, [getWalletId, authenticated]);

  useEffect(() => {
    fetchPosition();
  }, [fetchPosition]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      setAmount(val);
      setError("");
    }
  };

  const handleSetMax = () => {
    if (availableUsdc > 0.02) {
      // Leave $0.02 USDC buffer so the ERC-20 paymaster can collect gas without failing
      setAmount((availableUsdc - 0.02).toFixed(2));
      setError("");
    } else if (availableUsdc > 0) {
      setAmount(availableUsdc.toFixed(2));
      setError("");
    }
  };

  const handleWithdrawAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      setWithdrawAmount(val);
      setError("");
    }
  };

  const handleSetMaxWithdraw = () => {
    if (effectiveAssetsInVault > 0) {
      setWithdrawAmount(effectiveAssetsInVault.toFixed(2));
      setError("");
    }
  };

  const handleDeposit = async () => {
    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid deposit amount.");
      return;
    }

    if (isHolderSmartAccount && parsedAmount > (availableUsdc - 0.01)) {
      setError(`Please leave at least $0.02 USDC in your wallet to cover gas fees.`);
      return;
    }

    if (parsedAmount > availableUsdc) {
      setError(`Insufficient USDC balance. You have $${availableUsdc.toFixed(2)} USDC.`);
      return;
    }

    if (!activeAddress) {
      setError("Please connect your wallet first.");
      return;
    }

    setIsDepositing(true);
    setError("");
    setSuccess("");

    try {
      if (activeVaultAddress) {
        // Direct on-chain deposit via ERC-4626 standard (gas paid in USDC via ERC-20 Paymaster)
        const amountUnits = parseUnits(parsedAmount.toFixed(6), 6);

        if (smartClient) {
          const txHash = await smartClient.sendTransaction({
            calls: [
              {
                to: CONTRACTS.USDC as `0x${string}`,
                data: encodeFunctionData({
                  abi: ERC20_ABI,
                  functionName: "approve",
                  args: [activeVaultAddress, amountUnits],
                }),
                value: 0n,
              },
              {
                to: activeVaultAddress,
                data: encodeFunctionData({
                  abi: ERC4626_ABI,
                  functionName: "deposit",
                  args: [amountUnits, activeAddress as `0x${string}`],
                }),
                value: 0n,
              },
            ],
          });
          console.log("[EarnFlow] On-chain deposit tx:", txHash);
        } else {
          const wallet =
            wallets?.find((w) => w.address.toLowerCase() === activeAddress?.toLowerCase()) ||
            wallets?.[0];
          if (!wallet) throw new Error("Connected wallet not found");
          const provider = await wallet.getEthereumProvider();

          await provider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: activeAddress,
                to: CONTRACTS.USDC,
                data: encodeFunctionData({
                  abi: ERC20_ABI,
                  functionName: "approve",
                  args: [activeVaultAddress, amountUnits],
                }),
              },
            ],
          });

          await provider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: activeAddress,
                to: activeVaultAddress,
                data: encodeFunctionData({
                  abi: ERC4626_ABI,
                  functionName: "deposit",
                  args: [amountUnits, activeAddress as `0x${string}`],
                }),
              },
            ],
          });
        }

        setSuccess(`Successfully deposited $${parsedAmount.toFixed(2)} USDC into vault!`);
        setAmount("");
        refetchBal?.();
        refetchVaultBal?.();
        setTimeout(() => {
          fetchPosition();
          refetchBal?.();
          refetchVaultBal?.();
        }, 3000);
      } else {
        // Fallback to server route
        const walletId = getWalletId();
        if (!walletId) {
          setError("Please connect your wallet first.");
          return;
        }

        const accessToken = await getAccessToken();

        const response = await fetch("/api/earn/deposit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ amount: parsedAmount, walletId }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Deposit failed");
        }

        setSuccess(`Deposit of $${parsedAmount.toFixed(2)} USDC initiated!`);
        setAmount("");
        refetchBal?.();
        setTimeout(() => {
          fetchPosition();
          refetchBal?.();
        }, 4000);
      }
    } catch (err: any) {
      console.error("[EarnFlow] Deposit error:", err);
      setError(err.message || "Deposit transaction failed.");
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async (overrideAmount?: number, isFullRedeem: boolean = false) => {
    const rawTarget = overrideAmount !== undefined ? overrideAmount : (withdrawAmount ? Number(withdrawAmount) : effectiveAssetsInVault);
    const targetAmount = isNaN(rawTarget) ? 0 : rawTarget;

    if (!isFullRedeem && targetAmount <= 0) {
      setError("Please enter a valid withdrawal amount.");
      return;
    }

    if (!isFullRedeem && targetAmount > (effectiveAssetsInVault + 0.01)) {
      setError(`Cannot withdraw more than deposited ($${effectiveAssetsInVault.toFixed(2)} USDC).`);
      return;
    }

    if (!activeAddress) {
      setError("Please connect your wallet first.");
      return;
    }

    setIsWithdrawing(true);
    setError("");
    setSuccess("");

    try {
      if (activeVaultAddress) {
        // Direct on-chain withdrawal from ERC-4626 vault
        // If full redeem is requested (or targetAmount >= effectiveAssetsInVault) and user holds shares,
        // use redeem(shares) to avoid rounding dust/errors.
        const userShares = (onChainVaultShares as bigint) ?? 0n;
        const shouldRedeemShares = (isFullRedeem || targetAmount >= (effectiveAssetsInVault - 0.0001)) && userShares > 0n;
        const withdrawUnits = parseUnits(targetAmount.toFixed(6), 6);

        const callData = shouldRedeemShares
          ? encodeFunctionData({
              abi: ERC4626_ABI,
              functionName: "redeem",
              args: [userShares, activeHolderAddress, activeHolderAddress],
            })
          : encodeFunctionData({
              abi: ERC4626_ABI,
              functionName: "withdraw",
              args: [withdrawUnits, activeHolderAddress, activeHolderAddress],
            });

        if (isHolderSmartAccount && smartClient) {
          const txHash = await smartClient.sendTransaction({
            calls: [
              {
                to: activeVaultAddress,
                data: callData,
                value: 0n,
              },
            ],
          });
          console.log("[EarnFlow] On-chain smart withdraw tx:", txHash);
        } else {
          const wallet =
            wallets?.find((w) => w.address.toLowerCase() === activeHolderAddress.toLowerCase()) ||
            wallets?.[0];
          if (!wallet) throw new Error("Connected wallet not found");
          const provider = await wallet.getEthereumProvider();

          await provider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: wallet.address,
                to: activeVaultAddress,
                data: callData,
              },
            ],
          });
        }

        setSuccess(`Successfully withdrawn ${shouldRedeemShares ? "all" : `$${targetAmount.toFixed(2)}`} USDC from vault!`);
        setWithdrawAmount("");
        refetchBal?.();
        refetchSharesSmartPrimary?.();
        refetchSharesEoaPrimary?.();
        refetchSharesAlt?.();
        refetchVaultBal?.();
        setTimeout(() => {
          fetchPosition();
          refetchBal?.();
          refetchSharesSmartPrimary?.();
          refetchSharesEoaPrimary?.();
          refetchSharesAlt?.();
          refetchVaultBal?.();
        }, 3000);
      } else {
        const walletId = getWalletId();
        if (!walletId) {
          setError("Please connect your wallet first.");
          return;
        }

        const accessToken = await getAccessToken();

        const response = await fetch("/api/earn/withdraw", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            amount: withdrawAmount,
            walletId,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Withdrawal failed");
        }

        setSuccess("Withdrawal request submitted successfully!");
        refetchBal?.();
        setTimeout(() => {
          fetchPosition();
          refetchBal?.();
        }, 4000);
      }
    } catch (err: any) {
      console.error("[EarnFlow] Withdraw error:", err);
      setError(err.message || "Withdrawal failed.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleClaimRewards = async () => {
    if (!activeAddress) {
      setError("Please connect your wallet first.");
      return;
    }

    const earnedYield = position?.earnedYield || 0;

    setIsClaiming(true);
    setError("");
    setSuccess("");

    try {
      if (earnedYield > 0.001 && activeVaultAddress) {
        // Direct on-chain harvest of earned yield with 10% platform performance fee to Treasury
        const totalYieldUnits = parseUnits(earnedYield.toFixed(6), 6);
        const feeUnits = (totalYieldUnits * BigInt(EARN_CONFIG.PERFORMANCE_FEE_BPS)) / 10000n;
        const netUserYield = earnedYield * (1 - EARN_CONFIG.PERFORMANCE_FEE_BPS / 10000);

        if (smartClient) {
          // Bundle yield withdrawal + 10% fee routing to Treasury in a single atomic transaction
          const calls: any[] = [
            {
              to: activeVaultAddress,
              data: encodeFunctionData({
                abi: ERC4626_ABI,
                functionName: "withdraw",
                args: [totalYieldUnits, activeAddress as `0x${string}`, activeAddress as `0x${string}`],
              }),
              value: 0n,
            },
          ];

          if (feeUnits > 0n) {
            calls.push({
              to: CONTRACTS.USDC as `0x${string}`,
              data: encodeFunctionData({
                abi: ERC20_ABI,
                functionName: "transfer",
                args: [CONTRACTS.TREASURY as `0x${string}`, feeUnits],
              }),
              value: 0n,
            });
          }

          const txHash = await smartClient.sendTransaction({ calls });
          console.log("[EarnFlow] On-chain yield claim tx:", txHash);
        } else {
          // Standard wallet provider: Withdraw yield to user wallet, then route fee
          const wallet =
            wallets?.find((w) => w.address.toLowerCase() === activeAddress?.toLowerCase()) ||
            wallets?.[0];
          if (!wallet) throw new Error("Connected wallet not found");
          const provider = await wallet.getEthereumProvider();

          await provider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: activeAddress,
                to: activeVaultAddress,
                data: encodeFunctionData({
                  abi: ERC4626_ABI,
                  functionName: "withdraw",
                  args: [totalYieldUnits, activeAddress as `0x${string}`, activeAddress as `0x${string}`],
                }),
              },
            ],
          });

          if (feeUnits > 0n) {
            try {
              await provider.request({
                method: "eth_sendTransaction",
                params: [
                  {
                    from: activeAddress,
                    to: CONTRACTS.USDC,
                    data: encodeFunctionData({
                      abi: ERC20_ABI,
                      functionName: "transfer",
                      args: [CONTRACTS.TREASURY as `0x${string}`, feeUnits],
                    }),
                  },
                ],
              });
            } catch (feeErr) {
              console.warn("[EarnFlow] Fee transfer skipped:", feeErr);
            }
          }
        }

        setSuccess(`Successfully claimed $${netUserYield.toFixed(2)} USDC in yield! (10% fee routed to treasury)`);
        refetchBal?.();
        refetchVaultBal?.();
        setTimeout(() => {
          fetchPosition();
          refetchBal?.();
          refetchVaultBal?.();
        }, 3000);
      } else {
        // Fallback to server route (e.g. protocol token incentives)
        const walletId = getWalletId();
        const accessToken = await getAccessToken();

        const response = await fetch("/api/earn/claim", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ walletId }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Claim failed");
        }

        setSuccess("Reward incentives claimed successfully!");
        refetchBal?.();
        setTimeout(() => {
          fetchPosition();
          refetchBal?.();
        }, 4000);
      }
    } catch (err: any) {
      console.error("[EarnFlow] Claim error:", err);
      setError(err.message || "Failed to claim rewards.");
    } finally {
      setIsClaiming(false);
    }
  };

  const rawApy = vault?.apy && parseFloat(vault.apy) > 0 ? vault.apy : EARN_CONFIG.BENCHMARK_APY;
  const displayApy = `${rawApy}%`;
  const displayVaultName = vault?.name && vault.name !== "Yield Vault" ? vault.name : EARN_CONFIG.VAULT_NAME;
  const displayPosition = `$${effectiveAssetsInVault.toFixed(2)}`;
  const displayYield = position ? `+$${position.earnedYield.toFixed(2)}` : "+$0.00";
  const hasPosition = effectiveAssetsInVault > 0 || onChainVaultShares > 0n;
  const isLoading = isDepositing || isWithdrawing || isClaiming;

  return (
    <div className="w-full relative flex flex-col items-center justify-start pt-4 pb-28 text-[#F8FAFC] space-y-8">
      {/* 3D Tilting Yield Performance Monolith */}
      <Tilt3DMonolith
        maxTilt={8}
        className="w-full max-w-3xl"
        innerClassName="p-6 sm:p-9 relative overflow-hidden bg-gradient-to-br from-[#0B0E14] via-[#111622] to-[#050608]"
      >
        <DepthLayer z={18} className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#CCFF00] font-bold">
              ERC-4626 AUTO-COMPOUNDING VAULT
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A94A6]">
            {displayVaultName.toUpperCase()}
          </span>
        </DepthLayer>

        <DepthLayer z={30} className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
          <div className="md:col-span-6">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A94A6] block mb-1">
              LIVE BENCHMARK YIELD
            </span>
            <div className="flex items-baseline gap-2.5">
              <span className="text-5xl sm:text-7xl font-extrabold tracking-tighter text-[#F8FAFC] tabular-nums leading-none">
                <ShinyText text={displayApy} className="tracking-tighter" />
              </span>
              <span className="font-mono text-sm sm:text-lg font-bold text-[#CCFF00] uppercase tracking-[0.16em]">
                APY
              </span>
            </div>
          </div>

          <div className="md:col-span-6 grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-[#111622] border border-[#2970FF]/25">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8A94A6] block mb-1">
                STAKED PRINCIPAL
              </span>
              {isLoadingPosition ? (
                <div className="w-5 h-5 border-2 border-[#2970FF] border-t-transparent rounded-full animate-spin mt-1" />
              ) : (
                <div className="text-xl sm:text-2xl font-bold text-[#F8FAFC] tracking-tight tabular-nums">
                  <CountUp to={effectiveAssetsInVault} prefix="$" decimals={2} />
                  <span className="text-[10px] font-mono text-[#8A94A6] ml-1">USDC</span>
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-[#111622] border border-[#2970FF]/25">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8A94A6] block mb-1">
                ACCRUED YIELD
              </span>
              <div className="text-xl sm:text-2xl font-bold text-[#CCFF00] tracking-tight tabular-nums">
                <CountUp to={position ? Math.max(0, position.earnedYield) : 0} prefix="+$" decimals={2} />
                <span className="text-[10px] font-mono text-[#8A94A6] ml-1">USDC</span>
              </div>
            </div>
          </div>
        </DepthLayer>
      </Tilt3DMonolith>

      {/* Main Vault Execution Console (Double-Bezel) */}
      <div className="w-full max-w-3xl">
        <div className="p-1.5 rounded-[32px] bg-[#0B0E14]/90 border border-[#2970FF]/25 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.95)]">
          <SpotlightCard className="p-6 sm:p-8 bg-[#0B0E14] border border-white/[0.07] rounded-[26px]">
            {/* Action Tabs: Deposit vs Withdraw */}
            <div className="flex rounded-2xl bg-[#111622] p-1.5 border border-[#2970FF]/20 mb-6">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("deposit");
                  setError("");
                  setSuccess("");
                }}
                className={`flex-1 py-3 font-mono text-xs font-bold uppercase tracking-[0.14em] rounded-xl transition-all cursor-pointer ${
                  activeTab === "deposit"
                    ? "bg-[#CCFF00] text-[#050608] shadow-md"
                    : "text-[#8A94A6] hover:text-[#F8FAFC]"
                }`}
              >
                Supply USDC
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("withdraw");
                  setError("");
                  setSuccess("");
                }}
                className={`flex-1 py-3 font-mono text-xs font-bold uppercase tracking-[0.14em] rounded-xl transition-all cursor-pointer ${
                  activeTab === "withdraw"
                    ? "bg-[#2970FF] text-[#F8FAFC] shadow-md"
                    : "text-[#8A94A6] hover:text-[#F8FAFC]"
                }`}
              >
                Withdraw USDC
              </button>
            </div>

            {/* Interactive Form Area */}
            <div className="space-y-6">
              {activeTab === "deposit" ? (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A94A6] font-bold">
                      SUPPLY AMOUNT (BASE USDC)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#8A94A6] tabular-nums">
                        Available: <span className="text-[#F8FAFC] font-bold">${availableUsdc.toFixed(2)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleSetMax}
                        disabled={availableUsdc <= 0}
                        className="font-mono text-[10px] tabular-nums font-bold px-2.5 py-0.5 rounded-full bg-[#2970FF]/15 hover:bg-[#2970FF]/25 text-[#2970FF] border border-[#2970FF]/35 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#CCFF00] font-bold text-xl">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0.00"
                      disabled={isLoading}
                      className="w-full pl-9 pr-4 py-4 rounded-2xl bg-[#111622] border border-[#2970FF]/25 text-[#F8FAFC] text-2xl font-bold placeholder-[#8A94A6]/40 focus:outline-none focus:border-[#CCFF00] transition-colors tracking-tight tabular-nums shadow-[inset_0_2px_8px_rgba(0,0,0,0.85)]"
                    />
                  </div>

                  {/* Quick Amount Pills */}
                  <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
                    {PRESET_AMOUNTS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAmount(String(preset))}
                        className={`px-3.5 py-1.5 rounded-xl font-mono text-xs tabular-nums font-semibold transition-colors cursor-pointer ${
                          amount === String(preset)
                            ? "bg-[#CCFF00] text-[#050608] font-bold shadow-md"
                            : "bg-[#111622] hover:bg-[#161D2B] text-[#8A94A6] hover:text-[#F8FAFC] border border-[#2970FF]/20"
                        }`}
                      >
                        ${preset}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A94A6] font-bold">
                      WITHDRAW AMOUNT (BASE USDC)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#8A94A6] tabular-nums">
                        Staked:{" "}
                        <span className="text-[#F8FAFC] font-bold">${effectiveAssetsInVault.toFixed(2)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleSetMaxWithdraw}
                        disabled={effectiveAssetsInVault <= 0}
                        className="font-mono text-[10px] tabular-nums font-bold px-2.5 py-0.5 rounded-full bg-[#2970FF]/15 hover:bg-[#2970FF]/25 text-[#2970FF] border border-[#2970FF]/35 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2970FF] font-bold text-xl">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={withdrawAmount}
                      onChange={handleWithdrawAmountChange}
                      placeholder={effectiveAssetsInVault > 0 ? effectiveAssetsInVault.toFixed(2) : "0.00"}
                      disabled={isLoading}
                      className="w-full pl-9 pr-4 py-4 rounded-2xl bg-[#111622] border border-[#2970FF]/25 text-[#F8FAFC] text-2xl font-bold placeholder-[#8A94A6]/40 focus:outline-none focus:border-[#2970FF] transition-colors tracking-tight tabular-nums shadow-[inset_0_2px_8px_rgba(0,0,0,0.85)]"
                    />
                  </div>

                  {/* Percentage Pills */}
                  <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
                    {[0.25, 0.5, 0.75, 1].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        disabled={effectiveAssetsInVault <= 0}
                        onClick={() => setWithdrawAmount((effectiveAssetsInVault * pct).toFixed(2))}
                        className="px-3.5 py-1.5 rounded-xl font-mono text-xs tabular-nums font-semibold transition-colors bg-[#111622] hover:bg-[#161D2B] text-[#8A94A6] hover:text-[#F8FAFC] border border-[#2970FF]/20 disabled:opacity-40 cursor-pointer"
                      >
                        {pct === 1 ? "100% (ALL)" : `${pct * 100}%`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3.5 rounded-2xl bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 font-mono text-xs text-[#FF4D4D]">
                  {error}
                </div>
              )}

              {success && (
                <div className="p-3.5 rounded-2xl bg-[#CCFF00]/10 border border-[#CCFF00]/30 font-mono text-xs text-[#CCFF00]">
                  {success}
                </div>
              )}

              {/* CTA Button */}
              {authenticated ? (
                activeTab === "deposit" ? (
                  <ShimmerButton
                    onClick={handleDeposit}
                    disabled={!amount || isLoading || Number(amount) <= 0}
                    className="w-full py-4 text-xs font-mono uppercase tracking-[0.14em]"
                  >
                    {isDepositing ? (
                      <div className="w-5 h-5 border-2 border-[#050608] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <ArrowDownLeft className="w-4 h-4" />
                        <span>SUPPLY &amp; AUTO-COMPOUND</span>
                      </>
                    )}
                  </ShimmerButton>
                ) : (
                  <div className="space-y-3">
                    <ShimmerButton
                      onClick={() =>
                        handleWithdraw(
                          withdrawAmount ? Number(withdrawAmount) : undefined,
                          !withdrawAmount || Number(withdrawAmount) >= effectiveAssetsInVault
                        )
                      }
                      disabled={isLoading || (!hasPosition && effectiveAssetsInVault <= 0)}
                      className="w-full py-4 text-xs font-mono uppercase tracking-[0.14em]"
                    >
                      {isWithdrawing ? (
                        <div className="w-5 h-5 border-2 border-[#050608] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <ArrowUpRight className="w-4 h-4" />
                          <span>
                            {withdrawAmount && Number(withdrawAmount) < effectiveAssetsInVault
                              ? `WITHDRAW $${Number(withdrawAmount).toFixed(2)} USDC`
                              : "WITHDRAW ALL TO VAULT"}
                          </span>
                        </>
                      )}
                    </ShimmerButton>
                    <p className="font-mono text-[10px] text-center text-[#8A94A6] uppercase tracking-[0.12em]">
                      ZERO LOCKUP / ATOMIC ERC-4626 REDEMPTION
                    </p>
                  </div>
                )
              ) : (
                <button
                  onClick={() => login()}
                  className="w-full py-4 rounded-2xl bg-[#CCFF00] hover:brightness-110 text-[#050608] font-mono uppercase tracking-[0.14em] font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Wallet className="w-4 h-4" />
                  <span>CONNECT WALLET</span>
                </button>
              )}

              {/* Footer Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/[0.07] text-xs">
                <a
                  href={`https://basescan.org/address/${activeVaultAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A94A6] hover:text-[#F8FAFC] flex items-center gap-1.5 transition-colors"
                >
                  <span>CONTRACT: {displayVaultName.toUpperCase()}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClaimRewards}
                    disabled={!hasPosition || isLoading}
                    className="text-[#CCFF00] hover:text-[#F8FAFC] font-mono text-[10px] uppercase tracking-[0.14em] font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {isClaiming && (
                      <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>HARVEST YIELD</span>
                  </button>
                  <span className="text-white/20">/</span>
                  <button
                    onClick={() => handleWithdraw(undefined, true)}
                    disabled={!hasPosition || isLoading}
                    className="text-[#2970FF] hover:text-[#F8FAFC] font-mono text-[10px] uppercase tracking-[0.14em] font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {isWithdrawing && (
                      <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>REDEEM ALL</span>
                  </button>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </div>
      </div>

      {/* Protocol Telemetry Feature Cards */}
      <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#2970FF]/20 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#111622] border border-[#CCFF00]/30 flex items-center justify-center text-[#CCFF00] shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8A94A6] block">
              STRATEGY
            </span>
            <p className="text-xs font-bold text-[#F8FAFC]">Morpho Auto-Compound</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#2970FF]/20 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#111622] border border-[#2970FF]/30 flex items-center justify-center text-[#2970FF] shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8A94A6] block">
              LIQUIDITY
            </span>
            <p className="text-xs font-bold text-[#F8FAFC]">Zero Lockup Period</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#2970FF]/20 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#111622] border border-[#2970FF]/30 flex items-center justify-center text-[#2970FF] shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8A94A6] block">
              CUSTODY
            </span>
            <p className="text-xs font-bold text-[#F8FAFC]">ERC-4626 Non-Custodial</p>
          </div>
        </div>
      </div>
    </div>
  );
}
