export interface MerchantData {
  type: "upi" | "eth";
  raw: string; // The raw scanned string
  upiId?: string; // e.g. merchant@upi
  name?: string; // e.g. Coffee Shop
  defaultAmount?: string; // e.g. 100
  address?: string; // e.g. 0x123...
}
