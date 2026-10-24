"use server";

import { CONTRACTS } from "@/lib/constants";
import {
  listAllPayInSessions,
  getPayInSession,
  updatePayInSession,
  getDecryptedPayinKey,
  PayInSession,
} from "./payStore";
import {
  getRelayerAddress,
  getRelayerBalance,
  getRelayerWalletClient,
} from "./relayer";
import { getResilientPublicClient } from "./p2pRates";
import {
  checkAndDeliverHandshake,
  handleOrderTimeoutOrCancel,
  relayEip3009Transfer,
} from "./p2pServerEngine";
import { parseAbi, parseUnits, formatUnits, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const USDC_ADDRESS = getAddress(CONTRACTS.USDC);
const REFUND_WALLET_ADDRESS = getAddress(CONTRACTS.REFUND_WALLET);
const TREASURY_ADDRESS = getAddress(CONTRACTS.TREASURY);

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export interface AdminPaymentOverview {
  success: boolean;
  relayer: {
    address: string | null;
    balanceEth: string;
    healthy: boolean;
  };
  wallets: {
    treasuryAddress: string;
    treasuryBalanceUsdc: string;
    refundWalletAddress: string;
    refundWalletBalanceUsdc: string;
  };
  stats: {
    totalSessions: number;
    activeSessions: number;
    settledSessions: number;
    storedRefundsCount: number;
    underpaidCount: number;
  };
  sessions: PayInSession[];
}

/**
 * Server Action: Fetches all payment sessions and wallet telemetry.
 * Safe & internal — NO REST API endpoint is exposed.
 */
export async function getAdminPaymentOverview(): Promise<AdminPaymentOverview> {
  const publicClient = getResilientPublicClient();
  let relayerAddress: string | null = null;
  let relayerEth = "0.0000";
  let relayerHealthy = false;

  try {
    relayerAddress = getRelayerAddress();
    const bal = await getRelayerBalance();
    relayerEth = (Number(bal) / 1e18).toFixed(4);
    relayerHealthy = bal > 10_000_000_000_000n; // > 0.00001 ETH
  } catch {}

  let treasuryUsdc = "0.00";
  let refundUsdc = "0.00";

  try {
    const [tBal, rBal] = await Promise.all([
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [TREASURY_ADDRESS],
      }),
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [REFUND_WALLET_ADDRESS],
      }),
    ]);
    treasuryUsdc = Number(formatUnits(tBal as bigint, 6)).toFixed(2);
    refundUsdc = Number(formatUnits(rBal as bigint, 6)).toFixed(2);
  } catch (err: any) {
    console.warn("[AdminPaymentActions] Balance query warning:", err?.message);
  }

  const allSessions = listAllPayInSessions();

  return {
    success: true,
    relayer: {
      address: relayerAddress,
      balanceEth: relayerEth,
      healthy: relayerHealthy,
    },
    wallets: {
      treasuryAddress: TREASURY_ADDRESS,
      treasuryBalanceUsdc: treasuryUsdc,
      refundWalletAddress: REFUND_WALLET_ADDRESS,
      refundWalletBalanceUsdc: refundUsdc,
    },
    stats: {
      totalSessions: allSessions.length,
      activeSessions: allSessions.filter((s) => s.status === "AWAITING_PAYMENT" || s.status === "ORDER_PLACED" || s.status === "AWAITING_FIAT_PAYMENT").length,
      settledSessions: allSessions.filter((s) => s.status === "SETTLED").length,
      storedRefundsCount: allSessions.filter((s) => s.status === "STORED_IN_REFUND_WALLET").length,
      underpaidCount: allSessions.filter((s) => s.status === "REJECTED_UNDER_MINIMUM" || s.underpaidPenaltyUsdc).length,
    },
    sessions: allSessions,
  };
}

/**
 * Server Action: Manually execute a refund to a user from the ZkPay Refund Wallet or Ephemeral Account.
 */
export async function executeManualRefundAction(params: {
  sessionId: string;
  destinationAddress: string;
  amountUsdc?: string;
}): Promise<{ success: boolean; message: string; txHash?: string }> {
  const { sessionId, destinationAddress, amountUsdc } = params;

  if (!destinationAddress || !/^0x[a-fA-F0-9]{40}$/.test(destinationAddress.trim())) {
    return { success: false, message: "Invalid destination 0x EVM address." };
  }

  const session = getPayInSession(sessionId);
  if (!session) {
    return { success: false, message: `Session #${sessionId} not found.` };
  }

  const publicClient = getResilientPublicClient();
  const dest = getAddress(destinationAddress.trim() as `0x${string}`);

  try {
    // Strategy A: If funds are still on the ephemeral deposit address, transfer directly via EIP-3009
    const rawKey = getDecryptedPayinKey(session);
    const ephemeralAccount = privateKeyToAccount(rawKey);
    const ephemeralBal = (await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [getAddress(ephemeralAccount.address)],
    })) as bigint;

    if (ephemeralBal > 0n) {
      console.log(`[AdminPaymentActions] Sweeping directly from ephemeral address ${ephemeralAccount.address} -> ${dest}...`);
      const txHash = await relayEip3009Transfer({
        fromAccount: ephemeralAccount,
        toAddress: dest,
        amountWei: ephemeralBal,
      });

      updatePayInSession(session.id, {
        status: "REFUNDED_TO_USER",
        refundStatus: "MANUALLY_REFUNDED",
        refundAddress: dest,
        refundTxHash: txHash,
      });

      return {
        success: true,
        message: `Successfully refunded ${formatUnits(ephemeralBal, 6)} USDC from ephemeral address to ${dest}.`,
        txHash,
      };
    }

    // Strategy B: If funds were already swept to ZkPay Refund Wallet, transfer from Relayer wallet
    const relayerWallet = getRelayerWalletClient();
    const refundUsdcStr = amountUsdc || session.receivedUsdc || session.expectedUsdc;
    const refundWei = parseUnits(Number(refundUsdcStr).toFixed(6), 6);

    const relayerUsdcBal = (await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [relayerWallet.account.address],
    })) as bigint;

    if (relayerUsdcBal < refundWei) {
      return {
        success: false,
        message: `Insufficient USDC balance in admin relayer wallet (${formatUnits(relayerUsdcBal, 6)} USDC available, needed ${formatUnits(refundWei, 6)} USDC).`,
      };
    }

    console.log(`[AdminPaymentActions] Transferring ${refundUsdcStr} USDC from Relayer -> ${dest}...`);
    const txHash = await relayerWallet.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [dest, refundWei],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    updatePayInSession(session.id, {
      status: "REFUNDED_TO_USER",
      refundStatus: "MANUALLY_REFUNDED",
      refundAddress: dest,
      refundTxHash: txHash,
    });

    return {
      success: true,
      message: `Successfully dispatched manual refund of ${refundUsdcStr} USDC to ${dest}.`,
      txHash,
    };
  } catch (err: any) {
    console.error("[AdminPaymentActions] Manual refund failed:", err);
    return { success: false, message: err.message || "Failed to execute manual refund." };
  }
}

/**
 * Server Action: Re-triggers encrypted UPI handshake if an order was matched but not delivered.
 */
export async function retryHandshakeAction(sessionId: string): Promise<{ success: boolean; message: string }> {
  const session = getPayInSession(sessionId);
  if (!session) {
    return { success: false, message: `Session #${sessionId} not found.` };
  }

  try {
    const updated = await checkAndDeliverHandshake(session);
    return {
      success: true,
      message: `Handshake check executed. Status is now: ${updated.status}`,
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Failed to retry handshake." };
  }
}

/**
 * Server Action: Forces cancellation of a stalled Diamond order and triggers refund.
 */
export async function forceCancelOrderAction(sessionId: string): Promise<{ success: boolean; message: string }> {
  const session = getPayInSession(sessionId);
  if (!session) {
    return { success: false, message: `Session #${sessionId} not found.` };
  }

  try {
    const updated = await handleOrderTimeoutOrCancel(session);
    return {
      success: true,
      message: `Order cancellation complete. Session status: ${updated.status}`,
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Failed to cancel and refund order." };
  }
}
