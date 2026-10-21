import type { ProductData } from "@/lib/api";
import { formatPrice, saleBadge, salePrice } from "@/lib/sale";

type Priced = Pick<ProductData, "price" | "currency" | "discount" | "saleLabel">;

/** A product price with its currency symbol; on sale, the regular price is struck through beside the sale price. */
export function Price({ product: p, className = "" }: { product: Priced; className?: string }) {
  const regular = formatPrice(p.price, p.currency);
  const sale = salePrice(p.price, p.currency, p.discount);
  if (!sale) return <p className={className}>{regular}</p>;
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${className}`}>
      <s className="text-[0.85em] opacity-55">
        <span className="sr-only">Regular price </span>
        {regular}
      </s>
      <span className="font-semibold">
        <span className="sr-only">Sale price </span>
        {sale}
      </span>
    </p>
  );
}

/** Corner ribbon for a product photo on sale; the parent must be `relative`. */
export function SaleBadge({ product: p }: { product: Priced }) {
  if (!p.discount || !salePrice(p.price, p.currency, p.discount)) return null;
  return (
    <span className="absolute top-3 left-3 z-10 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-accent-ink px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase shadow-md">
      {saleBadge(p.discount, p.saleLabel)}
    </span>
  );
}
