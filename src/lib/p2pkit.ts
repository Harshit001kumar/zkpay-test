import { createPublicClient, http, zeroAddress } from "viem";
import { base } from "viem/chains";
import { createOrders, createLocalStorageRelayStore } from "@p2pdotme/sdk/orders";
import { createProfile } from "@p2pdotme/sdk/profile";
import { createPrices } from "@p2pdotme/sdk/prices";
import { CONTRACTS, CHAIN, SUBGRAPH_URL } from "./constants";

export const p2pPublicClient = createPublicClient({ 
  chain: base, 
  transport: http(CHAIN.rpcUrl) 
});

// We create the SDK instances lazily or export getters because window.localStorage 
// is required for createLocalStorageRelayStore() which is browser-only.
let ordersClient: any = null;
let profileClient: any = null;
let pricesClient: any = null;

export function getP2POrders() {
  if (typeof window === "undefined") return null;
  if (!ordersClient) {
    ordersClient = createOrders({
      publicClient: p2pPublicClient,
      diamondAddress: CONTRACTS.DIAMOND as `0x${string}`,
      usdcAddress: CONTRACTS.USDC as `0x${string}`,
      subgraphUrl: SUBGRAPH_URL,
      relayIdentityStore: createLocalStorageRelayStore(),
    });
  }
  return ordersClient;
}

export function getP2PProfile() {
  if (!profileClient) {
    profileClient = createProfile({
      publicClient: p2pPublicClient,
      diamondAddress: CONTRACTS.DIAMOND as `0x${string}`,
      usdcAddress: CONTRACTS.USDC as `0x${string}`,
    });
  }
  return profileClient;
}

export function getP2PPrices() {
  if (!pricesClient) {
    pricesClient = createPrices({
      publicClient: p2pPublicClient,
      diamondAddress: CONTRACTS.DIAMOND as `0x${string}`,
    });
  }
  return pricesClient;
}

/**
 * Get the max sellable amount in USDC for a given currency (e.g. "INR").
 */
export async function getOfframpLimits(address: `0x${string}`, currency: string) {
  const profile = getP2PProfile();
  const limits = await profile.getTxLimits({
    address,
    currency,
  });
  
  if (limits.isErr()) {
    const causeStr = limits.error.cause ? (limits.error.cause as any).message || String(limits.error.cause) : "No underlying cause";
    throw new Error(`Limits Error (${limits.error.code}): ${causeStr}`);
  }
  
  return limits.value;
}

/**
 * Get the current fiat exchange rate for a given currency.
 * Returns sellPrice (bigint, 6 decimals)
 */
export async function getOfframpPrice(currency: string) {
  const prices = getP2PPrices();
  const cfg = await prices.getPriceConfig({ currency });
  
  if (cfg.isErr()) {
    const causeStr = cfg.error.cause ? (cfg.error.cause as any).message || String(cfg.error.cause) : "No underlying cause";
    throw new Error(`Price Error (${cfg.error.code}): ${causeStr}`);
  }
  
  return cfg.value;
}

/**
 * Prepare a SELL order calldata for batching (Smart Wallets).
 */
export async function prepareOfframpOrder(
  params: {
    userAddress: `0x${string}`;
    currency: string;
    usdcAmount: bigint;
    sellPrice: bigint;
  }
) {
  const orders = getP2POrders();
  
  // Slippage protection: mirror contract math
  const fiatAmountLimit = (params.usdcAmount * params.sellPrice) / 1_000_000n;
  
  const prepared = await orders.placeOrder.prepare({
    orderType: 1, // 1 = SELL
    currency: params.currency,
    user: params.userAddress,
    recipientAddr: zeroAddress,
    amount: params.usdcAmount,
    fiatAmount: fiatAmountLimit,
    fiatAmountLimit,
  });
  
  if (prepared.isErr()) {
    throw prepared.error;
  }
  
  return prepared.value; // Returns { to, data, value }
}

/**
 * Place a SELL order.
 */
export async function placeOfframpOrder(
  walletClient: any, 
  params: {
    userAddress: `0x${string}`;
    currency: string;
    usdcAmount: bigint;
    sellPrice: bigint;
  }
) {
  const orders = getP2POrders();
  
  // Slippage protection: mirror contract math
  const fiatAmountLimit = (params.usdcAmount * params.sellPrice) / 1_000_000n;
  
  const placed = await orders.placeOrder.execute({
    walletClient,
    waitForReceipt: true,
    orderType: 1, // 1 = SELL
    currency: params.currency,
    user: params.userAddress,
    recipientAddr: zeroAddress,
    amount: params.usdcAmount,
    fiatAmount: fiatAmountLimit,
    fiatAmountLimit,
  });
  
  if (placed.isErr()) {
    throw placed.error;
  }
  
  return placed.value;
}

/**
 * Encrypt and deliver the user's UPI ID to the merchant once the order is accepted.
 */
export async function sendPayoutAddress(
  walletClient: any,
  params: {
    orderId: bigint;
    paymentAddress: string;
    merchantPublicKey: string;
  }
) {
  const orders = getP2POrders();
  
  const set = await orders.setSellOrderUpi.execute({
    walletClient,
    waitForReceipt: true,
    orderId: params.orderId,
    paymentAddress: params.paymentAddress,
    merchantPublicKey: params.merchantPublicKey,
    updatedAmount: 0n, // keep original amount
  });
  
  if (set.isErr()) {
    throw set.error;
  }
  
  return set.value;
}

/**
 * Fetch a single order's status by its ID.
 */
export async function getOrderStatus(orderId: bigint) {
  const orders = getP2POrders();
  const res = await orders.getOrder({ orderId });
  
  if (res.isErr()) {
    throw res.error;
  }
  
  return res.value;
}

export async function parseP2PError(error: any) {
  // @p2pdotme/sdk provides these utils
  const { parseContractError, getContractErrorMessage } = await import("@p2pdotme/sdk/orders");
  const code = parseContractError(error.cause || error);
  const message = getContractErrorMessage(code);
  return { code, message };
}
