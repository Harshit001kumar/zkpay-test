import { formatUnits } from "viem";

/**
 * Truncates (floors) a token amount or balance strictly to 2 decimal places
 * without rounding up.
 * 
 * Example:
 *  - 1.116 -> "1.11"
 *  - 1.110 -> "1.11"
 *  - 1.1   -> "1.10"
 *  - 0     -> "0.00"
 */
export function truncateTo2Decimals(val: number | string | bigint | undefined | null): string {
  if (val === undefined || val === null) return "0.00";

  let str = "";
  if (typeof val === "bigint") {
    str = formatUnits(val, 6);
  } else if (typeof val === "number") {
    if (isNaN(val) || val <= 0) return "0.00";
    str = val.toString();
  } else {
    str = val.trim();
  }

  if (!str || str === "0") return "0.00";

  // Handle scientific notation (e.g. 1e-5)
  if (str.includes("e") || str.includes("E")) {
    const num = Number(str);
    if (isNaN(num) || num <= 0) return "0.00";
    str = num.toFixed(6);
  }

  const parts = str.split(".");
  const integerPart = parts[0] || "0";
  let decimalPart = parts[1] || "";

  // Strictly take first 2 digits without rounding up
  decimalPart = decimalPart.slice(0, 2).padEnd(2, "0");

  return `${integerPart}.${decimalPart}`;
}

/**
 * Returns a floored number to 2 decimal places.
 * 
 * Example:
 *  - 1.116 -> 1.11
 *  - 1116000n -> 1.11
 */
export function floorTo2Decimals(val: number | string | bigint | undefined | null): number {
  return parseFloat(truncateTo2Decimals(val));
}
