// Inline zeroAddress to avoid importing viem at module scope (SSR crash prevention)
const zeroAddress = "0x0000000000000000000000000000000000000000" as `0x${string}`;
import { createOrders, createLocalStorageRelayStore } from "@p2pdotme/sdk/orders";
import { createProfile } from "@p2pdotme/sdk/profile";
import { createPrices } from "@p2pdotme/sdk/prices";
import { CONTRACTS, CHAIN, SUBGRAPH_URL } from "./constants";

let _publicClient: any = null;

export function getPublicClient() {
  if (!_publicClient) {
    const { createPublicClient, http } = require("viem");
    const { base } = require("viem/chains");
    _publicClient = createPublicClient({ 
      chain: base, 
      transport: http(CHAIN.rpcUrl) 
    });
  }
  return _publicClient;
}

// We create the SDK instances lazily or export getters because window.localStorage 
// is required for createLocalStorageRelayStore() which is browser-only.
let ordersClient: any = null;
let profileClient: any = null;
let pricesClient: any = null;

export function getP2POrders() {
  if (typeof window === "undefined") return null;
  if (!ordersClient) {
    ordersClient = createOrders({
      publicClient: getPublicClient(),
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
      publicClient: getPublicClient(),
      diamondAddress: CONTRACTS.DIAMOND as `0x${string}`,
      usdcAddress: CONTRACTS.USDC as `0x${string}`,
    });
  }
  return profileClient;
}

export function getP2PPrices() {
  if (!pricesClient) {
    pricesClient = createPrices({
      publicClient: getPublicClient(),
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

export async function getSellRate(currency: string = "INR"): Promise<bigint> {
  const cfg = await getOfframpPrice(currency);
  return cfg.sellPrice;
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
 * Prepare a PAY order calldata for batching (Smart Wallets).
 */
export async function preparePayOrder(
  params: {
    userAddress: `0x${string}`;
    currency: string;
    usdcAmount: bigint;
    sellPrice: bigint;
    recipientAddr: `0x${string}`;
  }
) {
  const orders = getP2POrders();
  
  const fiatAmountLimit = (params.usdcAmount * params.sellPrice) / 1_000_000n;
  
  const prepared = await orders.placeOrder.prepare({
    orderType: 2, // 2 = PAY
    currency: params.currency,
    user: params.userAddress,
    recipientAddr: params.recipientAddr,
    amount: params.usdcAmount,
    fiatAmount: fiatAmountLimit,
    fiatAmountLimit,
  });
  
  if (prepared.isErr()) {
    throw prepared.error;
  }
  
  return prepared.value;
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

/**
 * Robustly parses the orderId from transaction receipt logs across all P2P protocol event shapes.
 */
export async function parseOrderIdFromReceipt(receipt: any, userAddress?: string): Promise<bigint> {
  if (!receipt || !receipt.logs || !Array.isArray(receipt.logs)) {
    throw new Error("Transaction receipt contains no logs");
  }

  console.log("[p2pkit] Parsing orderId from receipt logs:", receipt.logs);

  const { toEventSelector } = await import("viem");

  // Candidate selectors across Diamond facets (canonical OrderFlowFacet, B2BGatewayFacet, etc.)
  const candidateSelectors = [
    toEventSelector("OrderPlaced(uint256,address,address,uint256,uint8,uint256,(uint256,uint256,uint256,uint256,uint256,address,address,address))"),
    toEventSelector("OrderPlaced(uint256,address,uint256)"),
    toEventSelector("B2BOrderPlaced(uint256,address,address,uint256)"),
    toEventSelector("SellOrderPlaced(uint256,address,uint256,bytes32)"),
    toEventSelector("OfframpOrderPlaced(uint256,address,uint256)"),
    toEventSelector("OrderPlaced(uint256,address,uint256,bytes32,uint256,uint256,uint256)"),
  ];

  const diamondAddress = (CONTRACTS.DIAMOND || "").toLowerCase();
  const usdcAddress = (CONTRACTS.USDC || "").toLowerCase();

  // Strategy 1: Match known topic0 signatures
  for (const log of receipt.logs) {
    if (log.topics && log.topics.length >= 2 && candidateSelectors.includes(log.topics[0])) {
      try {
        const id = BigInt(log.topics[1]);
        if (id > 0n) {
          console.log("[p2pkit] Found orderId via known selector:", id.toString());
          return id;
        }
      } catch {}
    }
  }

  // Strategy 2: Match ANY log emitted by the Diamond contract
  for (const log of receipt.logs) {
    if (log.address && log.address.toLowerCase() === diamondAddress) {
      if (log.topics && log.topics.length >= 2) {
        try {
          const id = BigInt(log.topics[1]);
          if (id > 0n) {
            console.log("[p2pkit] Found orderId from Diamond log topic1:", id.toString());
            return id;
          }
        } catch {}
      }
      if (log.data && log.data.length >= 66) {
        try {
          const id = BigInt("0x" + log.data.slice(2, 66));
          if (id > 0n) {
            console.log("[p2pkit] Found orderId from Diamond log data:", id.toString());
            return id;
          }
        } catch {}
      }
    }
  }

  // Strategy 3: Inspect any non-USDC log that has a valid positive integer in topic1
  for (const log of receipt.logs) {
    if (log.address && log.address.toLowerCase() !== usdcAddress) {
      if (log.topics && log.topics.length >= 2) {
        try {
          const id = BigInt(log.topics[1]);
          if (id > 0n) {
            console.log("[p2pkit] Found orderId from candidate log topic1:", id.toString());
            return id;
          }
        } catch {}
      }
    }
  }

  // Strategy 4: Fallback to Subgraph query for the user's latest placed order
  if (userAddress) {
    try {
      console.log("[p2pkit] Attempting subgraph query fallback for user:", userAddress);
      const query = `
        query GetLatestOrder($user: String!) {
          orders(where: { user: $user }, orderBy: blockTimestamp, orderDirection: desc, first: 1) {
            id
            orderId
          }
        }
      `;
      const res = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          variables: { user: userAddress.toLowerCase() },
        }),
      });
      const data = await res.json();
      const latest = data?.data?.orders?.[0];
      const foundId = latest?.orderId || latest?.id;
      if (foundId) {
        const id = BigInt(foundId);
        console.log("[p2pkit] Found orderId via Subgraph fallback:", id.toString());
        return id;
      }
    } catch (err) {
      console.warn("[p2pkit] Subgraph order lookup failed:", err);
    }
  }

  throw new Error("Failed to get orderId from receipt logs");
}

export async function parseP2PError(error: any) {
  try {
    const errorCode = error?.code || "";
    const errorString = String(error?.message || error?.details || error?.shortMessage || error || "").toLowerCase();
    
    if (errorString.includes("insufficient funds for gas") || errorString.includes("exceeds the balance of the account")) {
      return {
        code: "INSUFFICIENT_GAS_ETH",
        message: "Insufficient ETH for Base network gas. Your wallet currently has 0 ETH. Please send a tiny amount of ETH (~$0.10) to your Base address to execute transactions.",
      };
    }

    if (errorCode === "CIRCLE_SELECTION_FAILED") {
      return {
        code: "CIRCLE_SELECTION_FAILED",
        message: "No merchant liquidity available right now for this amount. Please try again shortly.",
      };
    }
    
    if (errorCode === "RECEIPT_TIMEOUT") {
      return {
        code: "RECEIPT_TIMEOUT",
        message: "Transaction is taking longer than usual to confirm on-chain. Please check your activity history.",
      };
    }
    
    if (errorCode === "ENCRYPTION_FAILED") {
      return {
        code: "ENCRYPTION_FAILED",
        message: "Encryption failed — waiting for merchant to publish acceptance key.",
      };
    }

    if (errorCode === "RELAY_IDENTITY_CORRUPT") {
      return {
        code: "RELAY_IDENTITY_CORRUPT",
        message: "Relay identity session error. Please reconnect your wallet.",
      };
    }

    // Attempt contract revert decoding
    const { parseContractError, getContractErrorMessage } = await import("@p2pdotme/sdk/orders");
    const code = parseContractError(error.cause || error);
    
    if (code === "SELL_ORDER_AMOUNT_EXCEEDS_LIMIT") {
      return {
        code,
        message: "Amount exceeds your current per-transaction limit (100 USDC baseline for India).",
      };
    }

    if (code === "SELL_ORDER_AMOUNT_LIMIT_EXCEEDED") {
      return {
        code,
        message: "Daily offramp limit exceeded. Please try again tomorrow.",
      };
    }

    if (code === "USER_YEARLY_VOLUME_LIMIT_EXCEEDED") {
      return {
        code,
        message: "Yearly protocol volume limit reached.",
      };
    }

    if (code === "SLIPPAGE_EXCEEDED") {
      return {
        code,
        message: "Exchange rate updated on-chain. Please review and confirm again.",
      };
    }

    if (code === "INSUFFICIENT_ALLOWANCE") {
      return {
        code,
        message: "USDC allowance is insufficient for this transaction.",
      };
    }

    if (code === "EXCHANGE_NOT_OPERATIONAL") {
      return {
        code,
        message: "The P2P protocol is temporarily paused for maintenance.",
      };
    }

    const rawErrorString = String(error?.message || error?.details || error || "");
    if (
      rawErrorString.includes("AA21") ||
      rawErrorString.includes("didn't pay prefund") ||
      rawErrorString.includes("sufficient funds to execute the User Operation")
    ) {
      return {
        code: "AA21_PREFUND_REQUIRED",
        message: "Smart Account requires gas: Ensure your Backend Gas Relayer (RELAYER_PRIVATE_KEY) is funded on Render, or send ~$0.05 of ETH on Base directly to your Smart Account.",
      };
    }

    const message = getContractErrorMessage(code) || error?.message || "Transaction failed";
    return { code, message };
  } catch {
    return {
      code: "UNKNOWN",
      message: error?.message || "An unexpected error occurred",
    };
  }
}
