/**
 * P2PKit Integration Helpers
 *
 * This module wraps the @p2pdotme/widgets SDK calls.
 * In production, these functions are passed as callbacks to the
 * <Checkout/> and <Cashout/> widgets from @p2pdotme/widgets.
 *
 * On testnet (Base Sepolia), you can use the pre-deployed demo
 * MarketplaceCheckoutIntegrator at:
 *   0x6daE4C184a32782A72bd99875379fc1E7383213B
 */

import { CONTRACTS, CHAIN, SUBGRAPH_URL } from "./constants";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface CheckoutSigner {
  address: string;
  sendTransaction: (tx: {
    to: string;
    data: string;
    gasLimit?: bigint;
  }) => Promise<{ hash: string }>;
}

export interface PlaceOrderContext {
  currency: {
    symbol: string;
    circleId: string;
  };
  amount: bigint;
}

export interface PlaceOrderResult {
  orderId: string;
  txHash: string;
}

// ──────────────────────────────────────────────
// Onramp (Buy) — placeOrder callback for <Checkout/>
// ──────────────────────────────────────────────

/**
 * Submit a buy order through our integrator contract.
 * The <Checkout/> widget calls this with the order context,
 * and we return { orderId, txHash }.
 *
 * In production you would use:
 *   import { parseOrderIdFromReceipt } from '@p2pdotme/widgets';
 *   import { encodeFunctionData, stringToHex } from 'viem';
 */
export async function placeOrder(
  ctx: PlaceOrderContext,
  signer: CheckoutSigner
): Promise<PlaceOrderResult> {
  // TODO: Replace with real contract call once whitelisted
  // const data = encodeFunctionData({
  //   abi: INTEGRATOR_ABI,
  //   functionName: 'userPlaceOrder',
  //   args: [CLIENT, productId, 1n,
  //          stringToHex(ctx.currency.symbol, { size: 32 }),
  //          ctx.currency.circleId, relayPubKey, 0n, 0n],
  // });
  // const { hash } = await signer.sendTransaction({ to: CONTRACTS.INTEGRATOR, data });
  // const receipt = await publicClient.waitForTransactionReceipt({ hash });
  // return { orderId: parseOrderIdFromReceipt(receipt), txHash: hash };

  console.log("[P2PKit] placeOrder called", { ctx, signer: signer.address });

  // Demo: simulate a successful order
  return {
    orderId: `demo-${Date.now()}`,
    txHash: `0x${"a".repeat(64)}`,
  };
}

// ──────────────────────────────────────────────
// Offramp (Cash Out) callbacks for <Cashout/>
// ──────────────────────────────────────────────

/**
 * Pull USDC from the user and place a SELL order.
 * Passed as `placeCashout` to <Cashout/>.
 */
export async function placeCashout(
  amount: bigint,
  signer: CheckoutSigner
): Promise<{ orderId: string; txHash: string }> {
  // TODO: call integrator's userInitiateOfframp
  console.log("[P2PKit] placeCashout called", { amount, signer: signer.address });

  return {
    orderId: `cashout-${Date.now()}`,
    txHash: `0x${"b".repeat(64)}`,
  };
}

/**
 * Deliver the encrypted UPI/payout handle to the merchant.
 * Passed as `deliverUpi` to <Cashout/>.
 */
export async function deliverUpi(
  orderId: string,
  encryptedHandle: string
): Promise<{ txHash: string }> {
  // TODO: call integrator's deliverOfframpUpi
  console.log("[P2PKit] deliverUpi called", { orderId });

  return { txHash: `0x${"c".repeat(64)}` };
}

/**
 * Record the terminal status of a cashout.
 * Passed as `reconcile` to <Cashout/>.
 */
export async function reconcile(
  orderId: string,
  status: "completed" | "cancelled"
): Promise<void> {
  console.log("[P2PKit] reconcile called", { orderId, status });
}

// ──────────────────────────────────────────────
// Payment status
// ──────────────────────────────────────────────

export async function checkPaymentStatus(
  orderId: string
): Promise<{ status: string; amount?: number }> {
  // TODO: Query the subgraph at SUBGRAPH_URL for order status
  console.log("[P2PKit] checkPaymentStatus", { orderId, subgraph: SUBGRAPH_URL });

  return { status: "completed", amount: 5 };
}

// ──────────────────────────────────────────────
// Config export for widgets
// ──────────────────────────────────────────────

export const p2pWidgetConfig = {
  diamondAddress: CONTRACTS.DIAMOND,
  usdcAddress: CONTRACTS.USDC,
  integratorAddress: CONTRACTS.INTEGRATOR,
  subgraphUrl: SUBGRAPH_URL,
  chainId: CHAIN.id,
};
