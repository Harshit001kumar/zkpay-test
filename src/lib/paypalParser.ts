/**
 * PayPal Link & Recipient Parser
 * 
 * Handles parsing and validation of:
 * 1. paypal.me links (with optional amounts, e.g. paypal.me/alice/25)
 * 2. Raw PayPal email addresses
 * 3. PayPal usernames (@handle)
 */

export interface ParsedPayPalData {
  isValid: boolean;
  paypalId?: string; // username or email
  name?: string;
  defaultAmount?: string;
  raw: string;
}

export function parsePayPalData(rawText: string): ParsedPayPalData {
  const trimmed = rawText.trim();
  if (!trimmed) return { isValid: false, raw: "" };

  // 1. PayPal.me URLs (e.g. https://www.paypal.com/paypalme/alice/25 or paypal.me/alice)
  const paypalMeMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?paypal\.(?:me|com\/paypalme)\/([a-zA-Z0-9._-]+)(?:\/(\d+(?:\.\d{1,2})?))?/i);
  if (paypalMeMatch) {
    const handle = paypalMeMatch[1];
    const amount = paypalMeMatch[2];

    return {
      isValid: true,
      paypalId: handle,
      name: handle.charAt(0).toUpperCase() + handle.slice(1),
      defaultAmount: amount,
      raw: trimmed,
    };
  }

  // 2. Standalone @handle (e.g. @alice_pay)
  if (trimmed.startsWith("@") && /^[a-zA-Z0-9._-]{3,30}$/.test(trimmed.slice(1))) {
    const handle = trimmed.slice(1);
    return {
      isValid: true,
      paypalId: handle,
      name: handle.charAt(0).toUpperCase() + handle.slice(1),
      raw: trimmed,
    };
  }

  // 3. PayPal Email Address
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (emailRegex.test(trimmed)) {
    // Exclude Indian UPI handles
    const upiHandles = ["okhdfcbank", "okaxis", "oksbi", "okicici", "paytm", "apl", "ybl", "axl", "ibl", "barodampay"];
    const domain = trimmed.split("@")[1].toLowerCase();
    if (!upiHandles.includes(domain)) {
      const username = trimmed.split("@")[0];
      return {
        isValid: true,
        paypalId: trimmed,
        name: username.charAt(0).toUpperCase() + username.slice(1),
        raw: trimmed,
      };
    }
  }

  return {
    isValid: false,
    raw: trimmed,
  };
}
