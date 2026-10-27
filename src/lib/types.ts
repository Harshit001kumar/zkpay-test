export type SupportedCurrency = "INR" | "BRL" | "USD";
export type PaymentRailType = "upi" | "pix" | "paypal" | "eth";

export interface CurrencyMeta {
  code: SupportedCurrency;
  symbol: string;
  name: string;
  flag: string;
  country: string;
  provider: "p2pkit" | "peer";
  rail: "UPI" | "Pix" | "PayPal";
  railDescription: string;
  placeholder: string;
  inputLabel: string;
  presets: number[];
  minOrderUsdc: number;
  maxOrderFloorUsdc: number;
}

export interface MerchantData {
  type: PaymentRailType;
  raw: string; // The raw scanned string
  currency?: SupportedCurrency;
  upiId?: string; // e.g. merchant@upi (UPI)
  pixKey?: string; // e.g. CPF, email, phone, or random key (Pix)
  paypalId?: string; // e.g. email or username (PayPal)
  paymentId?: string; // Unified identifier for payment delivery
  name?: string; // Merchant or recipient display name
  defaultAmount?: string; // e.g. 100 or 50.00
  address?: string; // e.g. 0x123... for eth
  pixCity?: string; // Optional Pix city extracted from EMVCo
  pixTxId?: string; // Optional Pix reference txId
}

export const CURRENCY_CONFIGS: Record<SupportedCurrency, CurrencyMeta> = {
  INR: {
    code: "INR",
    symbol: "₹",
    name: "Indian Rupee",
    flag: "🇮🇳",
    country: "India",
    provider: "p2pkit",
    rail: "UPI",
    railDescription: "Google Pay, PhonePe, Paytm, BHIM",
    placeholder: "merchant@okhdfcbank",
    inputLabel: "UPI ID / VPA",
    presets: [100, 250, 500, 1000, 2000],
    minOrderUsdc: 1,
    maxOrderFloorUsdc: 100,
  },
  BRL: {
    code: "BRL",
    symbol: "R$",
    name: "Brazilian Real",
    flag: "🇧🇷",
    country: "Brazil",
    provider: "p2pkit",
    rail: "Pix",
    railDescription: "Nubank, Itaú, Inter, Mercado Pago",
    placeholder: "CPF, phone (+55), email, or Pix key",
    inputLabel: "Pix Key / Chave Pix",
    presets: [10, 25, 50, 100, 250],
    minOrderUsdc: 1,
    maxOrderFloorUsdc: 200,
  },
  USD: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    flag: "🇺🇸",
    country: "United States / Global",
    provider: "peer",
    rail: "PayPal",
    railDescription: "PayPal balance, Venmo, US Banks",
    placeholder: "username@paypal.com or @handle",
    inputLabel: "PayPal Email / Handle",
    presets: [5, 10, 25, 50, 100],
    minOrderUsdc: 1,
    maxOrderFloorUsdc: 500,
  },
};
