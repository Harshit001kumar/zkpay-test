import { createOrders, createInMemoryRelayStore } from "@p2pdotme/sdk/orders";
import { createPrices } from "@p2pdotme/sdk/prices";
import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  parseAbi,
  parseUnits,
  formatUnits,
  hexToSignature,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import crypto from "crypto";
import {
  CONTRACTS,
  CHAIN,
  BASE_RPC_URLS,
  SUBGRAPH_URL,
  MIN_PAYMENT_USDC,
  UNDERPAID_PENALTY_USDC,
  RELAY_GAS_FEE_USDC,
  PLATFORM_FEE_BPS,
} from "@/lib/constants";
import {
  PayInSession,
  updatePayInSession,
  getDecryptedPayinKey,
  acquireSessionSweepLock,
  releaseSessionSweepLock,
} from "./payStore";
import {
  getRelayerAddress,
  getRelayerBalance,
  getRelayerWalletClient,
  sendUsdcFromRelayer,
  ensureRelayerDiamondApproved,
} from "./relayer";
import { getLiveFiatRate, getResilientPublicClient } from "./p2pRates";
import { dispatchWebhook } from "./webhooks";
import { parseOrderIdFromReceipt } from "@/lib/p2pkit";

const zeroAddress = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const USDC_ADDRESS = getAddress(CONTRACTS.USDC);
const TREASURY_ADDRESS = getAddress(CONTRACTS.TREASURY);
const REFUND_WALLET_ADDRESS = getAddress(CONTRACTS.REFUND_WALLET);

const USDC_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
]);

// 10 USDC threshold for small order fee
const SMALL_ORDER_THRESHOLD_USDC = 10;
const SMALL_ORDER_FEE_USDC = 0.10;

/**
 * Creates server-side P2PKit SDK client and Viem clients for an ephemeral deposit key.
 * Uses createInMemoryRelayStore() so no window/localStorage is needed.
 */
export function createServerP2PClient(ephemeralPrivateKey: `0x${string}`) {
  const account = privateKeyToAccount(ephemeralPrivateKey);

  const transport = fallback(
    BASE_RPC_URLS.map((url: string) =>
      http(url, {
        retryCount: 3,
        retryDelay: 800,
        timeout: 15_000,
      })
    ),
    { rank: false }
  );

  const publicClient = createPublicClient({
    chain: base,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport,
  });

  const orders = createOrders({
    publicClient,
    diamondAddress: CONTRACTS.DIAMOND,
    usdcAddress: CONTRACTS.USDC,
    subgraphUrl: SUBGRAPH_URL,
    relayIdentityStore: createInMemoryRelayStore(),
  });

  const prices = createPrices({
    publicClient,
    diamondAddress: CONTRACTS.DIAMOND,
  });

  return { orders, prices, publicClient, walletClient, account };
}

/**
 * Transfers USDC using EIP-3009 transferWithAuthorization.
 * The ephemeral account signs off-chain (0 gas). The Relayer pays Base L2 gas.
 */
export async function relayEip3009Transfer(params: {
  fromAccount: ReturnType<typeof privateKeyToAccount>;
  toAddress: `0x${string}`;
  amountWei: bigint;
}): Promise<string> {
  const { fromAccount, toAddress, amountWei } = params;
  const publicClient = getResilientPublicClient();
  const relayerWallet = getRelayerWalletClient();
  const fromAddress = getAddress(fromAccount.address);

  const nonce = (`0x${crypto.randomBytes(32).toString("hex")}`) as `0x${string}`;
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 7200);

  const signatureHex = await fromAccount.signTypedData({
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: BigInt(CHAIN.id),
      verifyingContract: USDC_ADDRESS,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: fromAddress,
      to: toAddress,
      value: amountWei,
      validAfter,
      validBefore,
      nonce,
    },
  });

  const sig = hexToSignature(signatureHex);
  let v = sig.v !== undefined ? Number(sig.v) : (sig.yParity === 0 ? 27 : 28);
  if (v < 27) v += 27;

  const txHash = await relayerWallet.writeContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "transferWithAuthorization",
    args: [
      fromAddress,
      toAddress,
      amountWei,
      validAfter,
      validBefore,
      nonce,
      v,
      sig.r,
      sig.s,
    ],
  });

  await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

  return txHash;
}

let _relayerOrdersClient: any = null;
export function getRelayerP2POrdersClient() {
  if (!_relayerOrdersClient) {
    const publicClient = getResilientPublicClient();
    _relayerOrdersClient = createOrders({
      publicClient,
      diamondAddress: CONTRACTS.DIAMOND,
      usdcAddress: CONTRACTS.USDC,
      subgraphUrl: SUBGRAPH_URL,
      relayIdentityStore: createInMemoryRelayStore(),
    });
  }
  return _relayerOrdersClient;
}

/**
 * @deprecated Ephemeral addresses no longer receive ETH. All transactions are relayed directly from the Relayer wallet.
 */
export async function ensureEphemeralHasGas(_ephemeralAddress: `0x${string}`): Promise<void> {
  // No-op: ephemeral address requires 0 ETH. Transactions are sent from the Relayer wallet.
}

/**
 * Core Evaluation Engine for Incoming Deposits.
 * 
 * Flow:
 * 1. If explicit tipUsdc is set, carve it out and sweep to Treasury via EIP-3009.
 * 2. If remaining USDC < 1.00 USDC:
 *    - Deduct 0.15 USDC penalty fee to Treasury.
 *    - Refund remainder to user's refundAddress (or sweep to ZkPay Refund Wallet).
 * 3. If remaining USDC >= 1.00 USDC:
 *    - Sweep 1% platform fee to Treasury via EIP-3009.
 *    - Recalculate pro-rated fiat = netUsdc * liveRate.
 *    - Seed gas from Relayer.
 *    - Approve USDC & execute Diamond.placeOrder.
 */
export async function evaluateAndProcessDeposit(session: PayInSession): Promise<PayInSession> {
  if (!acquireSessionSweepLock(session.id)) {
    return session;
  }

  try {
    const publicClient = getResilientPublicClient();
    const payinAddress = getAddress(session.payinAddress as `0x${string}`);
    const rawKey = getDecryptedPayinKey(session);
    const ephemeralAccount = privateKeyToAccount(rawKey);

    const balanceWei = (await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [payinAddress],
    })) as bigint;

    const totalBalanceUsdc = Number(formatUnits(balanceWei, 6));

    // Must have at least something deposited
    if (balanceWei <= 0n) {
      return session;
    }

    console.log(`[P2PServerEngine] Deposit detected for ${session.id}: ${totalBalanceUsdc} USDC on Base.`);

    let remainingWei = balanceWei;

    // ── STEP 1: Handle Explicit Provider Tip ──
    const tipUsdcNum = session.tipUsdc ? Number(session.tipUsdc) : 0;
    if (tipUsdcNum > 0 && !session.tipTxHash) {
      const tipWei = parseUnits(tipUsdcNum.toFixed(6), 6);
      if (remainingWei >= tipWei) {
        console.log(`[P2PServerEngine] Carving out provider tip: ${tipUsdcNum} USDC -> Treasury...`);
        try {
          const tipTx = await relayEip3009Transfer({
            fromAccount: ephemeralAccount,
            toAddress: TREASURY_ADDRESS,
            amountWei: tipWei,
          });
          remainingWei -= tipWei;
          updatePayInSession(session.id, { tipTxHash: tipTx });
        } catch (tipErr: any) {
          console.warn(`[P2PServerEngine] Tip transfer failed:`, tipErr?.message);
        }
      }
    }

    const netAvailableUsdc = Number(formatUnits(remainingWei, 6));

    // ── STEP 2: Underpaid Check (< 1.00 USDC Minimum) ──
    if (netAvailableUsdc < MIN_PAYMENT_USDC) {
      console.warn(`[P2PServerEngine] Session ${session.id} under minimum ($${netAvailableUsdc} < $${MIN_PAYMENT_USDC}). Processing rejection & penalty...`);

      const penaltyUsdc = Math.min(UNDERPAID_PENALTY_USDC, netAvailableUsdc);
      const penaltyWei = parseUnits(penaltyUsdc.toFixed(6), 6);
      const refundWei = remainingWei - penaltyWei;

      // Sweep penalty to Treasury
      if (penaltyWei > 0n) {
        try {
          await relayEip3009Transfer({
            fromAccount: ephemeralAccount,
            toAddress: TREASURY_ADDRESS,
            amountWei: penaltyWei,
          });
        } catch (err: any) {
          console.warn(`[P2PServerEngine] Penalty fee sweep failed:`, err?.message);
        }
      }

      // Route remaining refund
      if (refundWei > 0n) {
        if (session.refundAddress && /^0x[a-fA-F0-9]{40}$/.test(session.refundAddress.trim())) {
          const dest = getAddress(session.refundAddress.trim() as `0x${string}`);
          const refundTx = await relayEip3009Transfer({
            fromAccount: ephemeralAccount,
            toAddress: dest,
            amountWei: refundWei,
          });
          return updatePayInSession(session.id, {
            status: "REFUNDED_TO_USER",
            gasFeeUsdc: RELAY_GAS_FEE_USDC.toFixed(2),
            receivedUsdc: totalBalanceUsdc.toFixed(2),
            refundTxHash: refundTx,
            underpaidPenaltyUsdc: penaltyUsdc.toFixed(2),
            refundStatus: "REFUNDED_TO_USER",
          })!;
        } else {
          // Fallback: sweep to ZkPay Refund Wallet
          const refundTx = await relayEip3009Transfer({
            fromAccount: ephemeralAccount,
            toAddress: REFUND_WALLET_ADDRESS,
            amountWei: refundWei,
          });
          return updatePayInSession(session.id, {
            status: "STORED_IN_REFUND_WALLET",
            gasFeeUsdc: RELAY_GAS_FEE_USDC.toFixed(2),
            receivedUsdc: totalBalanceUsdc.toFixed(2),
            refundTxHash: refundTx,
            underpaidPenaltyUsdc: penaltyUsdc.toFixed(2),
            refundStatus: "STORED_IN_REFUND_WALLET",
          })!;
        }
      } else {
        return updatePayInSession(session.id, {
          status: "REJECTED_UNDER_MINIMUM",
          gasFeeUsdc: RELAY_GAS_FEE_USDC.toFixed(2),
          receivedUsdc: totalBalanceUsdc.toFixed(2),
          underpaidPenaltyUsdc: penaltyUsdc.toFixed(2),
        })!;
      }
    }

    // ── STEP 3: Process Valid Payment (>= 1.00 USDC) ──
    // Compute 1% platform fee
    const feeUsdcNum = netAvailableUsdc * (PLATFORM_FEE_BPS / 10000);
    const feeWei = parseUnits(feeUsdcNum.toFixed(6), 6);

    // Sweep 1% fee to Treasury via EIP-3009
    console.log(`[P2PServerEngine] Sweeping 1% fee (${feeUsdcNum.toFixed(4)} USDC) -> Treasury...`);
    let feeTxHash = "";
    try {
      feeTxHash = await relayEip3009Transfer({
        fromAccount: ephemeralAccount,
        toAddress: TREASURY_ADDRESS,
        amountWei: feeWei,
      });
    } catch (feeErr: any) {
      console.warn(`[P2PServerEngine] Fee transfer warning:`, feeErr?.message);
    }

    const principalWei = remainingWei - feeWei;
    const principalUsdc = Number(formatUnits(principalWei, 6));

    // Account for P2P small order fee if principal <= 10 USDC
    const isSmallOrder = principalUsdc > 0 && principalUsdc <= SMALL_ORDER_THRESHOLD_USDC;
    const protocolFeeUsdc = isSmallOrder ? SMALL_ORDER_FEE_USDC : 0;
    const protocolFeeWei = parseUnits(protocolFeeUsdc.toFixed(6), 6);

    if (principalWei <= protocolFeeWei) {
      throw new Error(`Net amount too small to cover P2P protocol fee.`);
    }

    const actualOrderUsdcWei = principalWei - protocolFeeWei;
    const actualOrderUsdc = Number(formatUnits(actualOrderUsdcWei, 6));

    // Read live sell price
    const sellPrice = await getLiveFiatRate("INR");
    const proRatedFiat = Math.floor(actualOrderUsdc * sellPrice);

    const relayerAddress = getRelayerAddress();
    const relayerWallet = getRelayerWalletClient();

    // 1. Sweep net principal from ephemeral account to Relayer wallet via EIP-3009
    // Zero ETH is sent to ephemeral address! Ephemeral signs off-chain, relayer executes on Base.
    console.log(`[P2PServerEngine] Sweeping net principal (${principalUsdc.toFixed(2)} USDC) -> Relayer (${relayerAddress})...`);
    let sweepPrincipalTx = "";
    try {
      sweepPrincipalTx = await relayEip3009Transfer({
        fromAccount: ephemeralAccount,
        toAddress: relayerAddress,
        amountWei: principalWei,
      });
    } catch (sweepErr: any) {
      console.error(`[P2PServerEngine] Failed to sweep USDC to Relayer:`, sweepErr?.message);
      throw new Error(`Failed to relay USDC to Relayer: ${sweepErr?.message}`);
    }

    // 2. Ensure Relayer wallet has approved Diamond contract for USDC
    await ensureRelayerDiamondApproved(principalWei);

    // 3. Execute placeOrder directly from Relayer wallet
    console.log(`[P2PServerEngine] Placing P2P order from Relayer: ${actualOrderUsdc.toFixed(2)} USDC -> ₹${proRatedFiat} INR...`);
    const fiatAmountLimit = BigInt(proRatedFiat * 1_000_000);
    const orders = getRelayerP2POrdersClient();

    let placedResult: any;
    try {
      placedResult = await orders.placeOrder.execute({
        walletClient: relayerWallet,
        waitForReceipt: true,
        orderType: 1, // 1 = SELL
        currency: "INR",
        user: relayerAddress,
        recipientAddr: zeroAddress,
        amount: actualOrderUsdcWei,
        fiatAmount: fiatAmountLimit,
        fiatAmountLimit,
      });
    } catch (err: any) {
      placedResult = { isErr: () => true, error: err };
    }

    // 4. If placeOrder fails, gas fee is paid in USDC itself and remainder is refunded to user
    if (placedResult.isErr()) {
      console.error(`[P2PServerEngine] placeOrder failed on Diamond:`, placedResult.error);
      const gasFeeUsdc = RELAY_GAS_FEE_USDC;
      const gasFeeWei = parseUnits(gasFeeUsdc.toFixed(6), 6);
      const refundWei = principalWei > gasFeeWei ? principalWei - gasFeeWei : 0n;

      let refundTx = "";
      if (refundWei > 0n) {
        const dest = (session.refundAddress && /^0x[a-fA-F0-9]{40}$/.test(session.refundAddress.trim()))
          ? getAddress(session.refundAddress.trim() as `0x${string}`)
          : REFUND_WALLET_ADDRESS;
        try {
          refundTx = await sendUsdcFromRelayer(dest, refundWei);
          console.log(`[P2PServerEngine] Gas reimbursed ($${gasFeeUsdc} USDC). Remainder refunded -> ${dest}. Tx: ${refundTx}`);
        } catch (refErr: any) {
          console.error(`[P2PServerEngine] Refund transfer failed:`, refErr?.message);
        }
      }

      return updatePayInSession(session.id, {
        status: "FAILED_AND_REFUNDED",
        gasFeeUsdc: gasFeeUsdc.toFixed(2),
        receivedUsdc: totalBalanceUsdc.toFixed(2),
        refundTxHash: refundTx || undefined,
        refundStatus: session.refundAddress ? "REFUNDED_TO_USER" : "STORED_IN_REFUND_WALLET",
      })!;
    }

    const orderMeta = placedResult.value?.meta;
    let p2pOrderId = orderMeta?.orderId ? String(orderMeta.orderId) : "";
    const placedTxHash = placedResult.value?.hash || sweepPrincipalTx;

    if (!p2pOrderId && placedResult.value?.receipt) {
      try {
        const parsed = await parseOrderIdFromReceipt(placedResult.value.receipt, relayerAddress);
        if (parsed) p2pOrderId = String(parsed);
      } catch {}
    }

    console.log(`[P2PServerEngine] Order placed successfully from Relayer! Order ID: ${p2pOrderId}, Tx: ${placedTxHash}`);

    return updatePayInSession(session.id, {
      status: "ORDER_PLACED",
      p2pOrderId,
      txHash: placedTxHash,
      receivedUsdc: totalBalanceUsdc.toFixed(2),
      amountINR: proRatedFiat,
      feeUsdc: feeUsdcNum.toFixed(2),
    })!;
  } finally {
    releaseSessionSweepLock(session.id);
  }
}

/**
 * Checks if merchant has accepted the order, and delivers the ECIES-encrypted UPI ID.
 */
export async function checkAndDeliverHandshake(session: PayInSession): Promise<PayInSession> {
  if (!session.p2pOrderId || session.status !== "ORDER_PLACED") {
    return session;
  }

  const orders = getRelayerP2POrdersClient();
  const relayerWallet = getRelayerWalletClient();

  const orderIdBigInt = BigInt(session.p2pOrderId);
  const orderRes = await orders.getOrder({ orderId: orderIdBigInt });

  if (orderRes.isErr()) {
    console.warn(`[P2PServerEngine] getOrder check warning for #${session.p2pOrderId}:`, orderRes.error?.message);
    return session;
  }

  const order = orderRes.value;

  if (order.status === "accepted" && order.pubkey) {
    console.log(`[P2PServerEngine] Peer matched for Order #${session.p2pOrderId}! Delivering encrypted UPI from Relayer (${session.recipientUpi})...`);

    // SDK encrypts with ECIES using the merchant's pubkey and submits on-chain from the Relayer wallet
    const setUpiRes = await orders.setSellOrderUpi.execute({
      walletClient: relayerWallet,
      waitForReceipt: true,
      orderId: orderIdBigInt,
      paymentAddress: session.recipientUpi,
      merchantPublicKey: order.pubkey,
      updatedAmount: 0n,
    });

    if (setUpiRes.isErr()) {
      console.warn(`[P2PServerEngine] setSellOrderUpi delivery error:`, setUpiRes.error);
      return session;
    }

    console.log(`[P2PServerEngine] Encrypted UPI delivered! Tx: ${setUpiRes.value.hash}`);

    return updatePayInSession(session.id, {
      status: "AWAITING_FIAT_PAYMENT",
    })!;
  }

  if (order.status === "completed") {
    return checkOrderSettlement(session);
  }

  if (order.status === "cancelled") {
    return handleOrderTimeoutOrCancel(session);
  }

  return session;
}

/**
 * Checks if order has completed, extracts payment proof, and sets status to SETTLED.
 */
export async function checkOrderSettlement(session: PayInSession): Promise<PayInSession> {
  if (!session.p2pOrderId) return session;

  const orders = getRelayerP2POrdersClient();
  const orderIdBigInt = BigInt(session.p2pOrderId);
  const orderRes = await orders.getOrder({ orderId: orderIdBigInt });

  if (orderRes.isErr()) return session;
  const order = orderRes.value;

  if (order.status === "completed") {
    console.log(`[P2PServerEngine] Order #${session.p2pOrderId} SETTLED! Extracting payment proof...`);

    const actualFiat = order.actualFiatAmount ? Number(order.actualFiatAmount) / 1e6 : session.amountINR;
    const actualUsdc = order.actualUsdcAmount ? (Number(order.actualUsdcAmount) / 1e6).toFixed(2) : session.expectedUsdc;

    const updated = updatePayInSession(session.id, {
      status: "SETTLED",
      actualFiatAmount: actualFiat,
      actualUsdcAmount: actualUsdc,
      settledAt: Date.now(),
      completedTxHash: session.txHash,
    })!;

    if (session.webhookUrl) {
      dispatchWebhook(session.webhookUrl, {
        event: "payin.settled",
        sessionId: session.id,
        orderId: session.p2pOrderId,
        recipientUpi: session.recipientUpi,
        fiatAmount: actualFiat,
        currency: "INR",
        amountUsdc: actualUsdc,
        txHash: session.txHash,
        timestamp: Date.now(),
        proof: {
          verification: "P2P.me Protocol Escrow Verified",
          p2pOrderId: session.p2pOrderId,
          actualFiatAmount: actualFiat,
          basescanTx: session.txHash,
        },
      }).catch((e) => console.warn(`[Webhook] Dispatch warning:`, e?.message));
    }

    return updated;
  }

  if (order.status === "cancelled") {
    return handleOrderTimeoutOrCancel(session);
  }

  return session;
}

/**
 * Handles cancelled or timed-out orders:
 * 1. Unlocks escrowed USDC back into the Relayer wallet.
 * 2. Deducts the gas fee in USDC ($0.05 USDC) to reimburse the Relayer.
 * 3. Refunds remainder directly from Relayer to refundAddress (or ZkPay Refund Wallet).
 */
export async function handleOrderTimeoutOrCancel(session: PayInSession): Promise<PayInSession> {
  if (!session.p2pOrderId) return session;

  console.log(`[P2PServerEngine] Order #${session.p2pOrderId} cancelled/timeout. Unlocking escrow & refunding (gas paid in USDC)...`);

  const orders = getRelayerP2POrdersClient();
  const relayerWallet = getRelayerWalletClient();

  try {
    // Attempt cancel on contract if not yet cancelled (returns escrowed USDC to Relayer)
    await orders.cancelOrder.execute({
      walletClient: relayerWallet,
      waitForReceipt: true,
      orderId: BigInt(session.p2pOrderId),
    }).catch(() => null);
  } catch {}

  // Deduct gas fee in USDC ($0.05 USDC) and refund remainder to user
  const gasFeeUsdc = RELAY_GAS_FEE_USDC;
  const gasFeeWei = parseUnits(gasFeeUsdc.toFixed(6), 6);
  const refundUsdcStr = session.actualUsdcAmount || session.receivedUsdc || session.expectedUsdc;
  const totalBalanceWei = parseUnits(Number(refundUsdcStr).toFixed(6), 6);
  const refundWei = totalBalanceWei > gasFeeWei ? totalBalanceWei - gasFeeWei : 0n;

  let refundTx = "";
  if (refundWei > 0n) {
    const dest = (session.refundAddress && /^0x[a-fA-F0-9]{40}$/.test(session.refundAddress.trim()))
      ? getAddress(session.refundAddress.trim() as `0x${string}`)
      : REFUND_WALLET_ADDRESS;
    try {
      refundTx = await sendUsdcFromRelayer(dest, refundWei);
      console.log(`[P2PServerEngine] Gas reimbursed ($${gasFeeUsdc} USDC). Remainder refunded -> ${dest}. Tx: ${refundTx}`);
    } catch (refErr: any) {
      console.error(`[P2PServerEngine] Cancellation refund failed:`, refErr?.message);
    }
  }

  return updatePayInSession(session.id, {
    status: "CANCELLED_AND_REFUNDED",
    gasFeeUsdc: gasFeeUsdc.toFixed(2),
    refundTxHash: refundTx || undefined,
    refundStatus: session.refundAddress ? "REFUNDED_TO_USER" : "STORED_IN_REFUND_WALLET",
  })!;
}
