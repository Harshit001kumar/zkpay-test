/**
 * Pix EMVCo BR Code & Key Parser
 * 
 * Handles parsing and validation of:
 * 1. Brazilian Pix EMVCo QR codes (Dynamic & Static payloads)
 * 2. Raw Pix keys (CPF, CNPJ, Email, Phone, EVP UUID)
 */

export interface ParsedPixData {
  isValid: boolean;
  pixKey?: string;
  merchantName?: string;
  merchantCity?: string;
  amount?: string;
  txId?: string;
  raw: string;
  keyType?: "cpf" | "cnpj" | "email" | "phone" | "evp" | "emvco";
}

/**
 * Validates a Brazilian CPF (11 digits)
 */
export function isValidCpf(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i)) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i)) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10))) return false;

  return true;
}

/**
 * Validates a Brazilian CNPJ (14 digits)
 */
export function isValidCnpj(cnpj: string): boolean {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(clean)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(clean.charAt(i)) * weights1[i];
  }
  let rev = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (rev !== parseInt(clean.charAt(12))) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(clean.charAt(i)) * weights2[i];
  }
  rev = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (rev !== parseInt(clean.charAt(13))) return false;

  return true;
}

/**
 * Validates a Pix EVP (Random Key UUID)
 */
export function isValidEvp(evp: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evp.trim());
}

/**
 * Validates a Brazilian Pix Phone number (+55...)
 */
export function isValidPixPhone(phone: string): boolean {
  const clean = phone.replace(/[^\d+]/g, "");
  // Pix phones are format +55DD9XXXXXXXX or 10-11 digits with country code
  return /^\+55\d{10,11}$/.test(clean) || (/^55\d{10,11}$/.test(clean) && (clean.length === 12 || clean.length === 13));
}

/**
 * Validates standard email address
 */
export function isValidPixEmail(email: string): boolean {
  const clean = email.trim();
  // Ensure it's not a UPI handle like user@okaxis or user@paytm
  if (/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean)) {
    const domain = clean.split("@")[1].toLowerCase();
    const upiHandles = ["okhdfcbank", "okaxis", "oksbi", "okicici", "paytm", "apl", "ybl", "axl", "ibl", "barodampay"];
    if (upiHandles.includes(domain)) return false;
    return true;
  }
  return false;
}

/**
 * Checks whether a raw string is a stand-alone Pix key
 */
export function identifyPixKeyType(val: string): "cpf" | "cnpj" | "email" | "phone" | "evp" | null {
  const trimmed = val.trim();
  if (isValidEvp(trimmed)) return "evp";
  if (isValidCpf(trimmed)) return "cpf";
  if (isValidCnpj(trimmed)) return "cnpj";
  if (isValidPixPhone(trimmed)) return "phone";
  if (isValidPixEmail(trimmed)) return "email";
  return null;
}

/**
 * Parses EMVCo TLV (Tag-Length-Value) dictionary from QR payload
 */
function parseEmvcoTags(payload: string): Record<string, string> {
  const tags: Record<string, string> = {};
  let i = 0;

  while (i < payload.length - 4) {
    const tag = payload.slice(i, i + 2);
    const lenStr = payload.slice(i + 2, i + 4);
    const len = parseInt(lenStr, 10);

    if (isNaN(len) || len < 0) break;

    const value = payload.slice(i + 4, i + 4 + len);
    tags[tag] = value;
    i += 4 + len;
  }

  return tags;
}

/**
 * Parses a Pix QR code or raw key into structured merchant data
 */
export function parsePixData(rawText: string): ParsedPixData {
  const trimmed = rawText.trim();

  // 1. Check for EMVCo BR Code (starts with 000201...)
  if (trimmed.startsWith("000201")) {
    try {
      const tags = parseEmvcoTags(trimmed);

      // Tag 26 is Merchant Account Information for Pix
      let pixKey: string | undefined;
      const tag26 = tags["26"];
      if (tag26) {
        const subTags = parseEmvcoTags(tag26);
        // Sub-tag 00 is GUI (br.gov.bcb.pix)
        // Sub-tag 01 is Chave Pix
        if (subTags["01"]) {
          pixKey = subTags["01"];
        }
      }

      // Tag 54 is Transaction Amount
      const amount = tags["54"] || undefined;
      // Tag 59 is Merchant Name
      const merchantName = tags["59"] ? tags["59"].trim() : undefined;
      // Tag 60 is Merchant City
      const merchantCity = tags["60"] ? tags["60"].trim() : undefined;
      // Tag 62 is Additional Data Field Template (sub-tag 05 is reference/txid)
      let txId: string | undefined;
      if (tags["62"]) {
        const subTags62 = parseEmvcoTags(tags["62"]);
        txId = subTags62["05"] || undefined;
      }

      const isValid = Boolean(pixKey || (tags["26"] && tags["26"].includes("br.gov.bcb.pix")));

      return {
        isValid,
        pixKey: pixKey || trimmed,
        merchantName,
        merchantCity,
        amount,
        txId,
        raw: trimmed,
        keyType: "emvco",
      };
    } catch (e) {
      console.warn("[pixParser] Error parsing EMVCo payload:", e);
    }
  }

  // 2. Check for Direct/Stand-alone Pix Key
  const keyType = identifyPixKeyType(trimmed);
  if (keyType) {
    let cleanKey = trimmed;
    if (keyType === "cpf" || keyType === "cnpj") {
      cleanKey = trimmed.replace(/\D/g, "");
    }

    return {
      isValid: true,
      pixKey: cleanKey,
      raw: trimmed,
      keyType,
    };
  }

  return {
    isValid: false,
    raw: trimmed,
  };
}
