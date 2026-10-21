/** Currencies the admin can pick, with their symbols (keys mirror api/src/catalog/products.ts). */
export const CURRENCIES = { PHP: "₱", USD: "$" } as const;
export type Currency = keyof typeof CURRENCIES;

const PLAIN = /^\d+(\.\d+)?$/;

/** "15000" → "₱15,000". Prices saved as free text before the currency picker show as typed. */
export function formatPrice(price: string, currency: Currency = "PHP") {
  if (!PLAIN.test(price)) return price;
  return CURRENCIES[currency] + Number(price).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** The formatted price after `discount` percent off, or null when there's no sale. Whole amounts round to whole units. */
export function salePrice(price: string, currency: Currency = "PHP", discount: number | undefined) {
  if (!discount || !PLAIN.test(price)) return null;
  const factor = price.includes(".") ? 100 : 1;
  return formatPrice(String(Math.round((Number(price) * (100 - discount) * factor) / 100) / factor), currency);
}

/** The first amount in an old free-text price ("from ₱15,000" → "15000"), so the editor can start from it. */
export const plainAmount = (price: string) => (PLAIN.test(price) ? price : (price.match(/\d[\d,]*(?:\.\d+)?/)?.[0].replace(/,/g, "") ?? ""));

/** Badge text: the admin's label with the percent, or just the percent. */
export const saleBadge = (discount: number, label?: string) => (label ? `${label} · ${discount}% off` : `${discount}% off`);
