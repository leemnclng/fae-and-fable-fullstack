"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { fileUrl, type PublicProduct, type Section, type Settings } from "@/lib/api";
import { InquireButton } from "./inquire";
import { PhotoPlaceholder } from "./section-shell";
import { Icon } from "@/components/icon";

type ProductsSection = Extract<Section, { type: "products" }>;

// Static class names so Tailwind sees them
const COLUMNS = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" } as const;

/** Products the section shows: every product of its type, or the hand-picked ones in that order (missing ones skipped). */
export function sectionProducts(section: ProductsSection, products: PublicProduct[]) {
  if (section.pick === "all") return products.filter((p) => p.type === section.productType);
  return section.pick.flatMap((id) => products.filter((p) => p.id === id && p.type === section.productType));
}

export function ProductList({
  section,
  products,
  settings,
  preview,
}: {
  section: ProductsSection;
  products: PublicProduct[];
  settings: Settings;
  preview?: boolean;
}) {
  const items = sectionProducts(section, products);
  const noun = section.productType === "mirror" ? "mirrors" : "packages";
  if (!items.length) return <p className="text-lg opacity-70">More {noun} coming soon. Message us for details.</p>;

  const card = (p: PublicProduct, variant: "card" | "row") => (
    <ProductCard key={p.id} product={p} showPrice={section.showPrices} settings={settings} preview={preview} variant={variant} />
  );
  if (section.layout === "list") return <div className="divide-y divide-current/15">{items.map((p) => card(p, "row"))}</div>;
  if (section.layout === "carousel")
    return (
      <div className="-mx-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-4 md:-mx-12 md:px-12">
        {items.map((p) => (
          <div key={p.id} className="w-[80%] shrink-0 snap-start sm:w-[45%] lg:w-[30%]">
            {card(p, "card")}
          </div>
        ))}
      </div>
    );
  return <div className={`grid gap-x-6 gap-y-12 sm:grid-cols-2 ${COLUMNS[section.columns]}`}>{items.map((p) => card(p, "card"))}</div>;
}

function ProductCard({
  product: p,
  showPrice,
  settings,
  preview,
  variant,
}: {
  product: PublicProduct;
  showPrice: boolean;
  settings: Settings;
  preview?: boolean;
  variant: "card" | "row";
}) {
  const photo = p.photos[0];
  const image = photo ? (
    <img src={fileUrl(photo)} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105 motion-reduce:transition-none" />
  ) : (
    <PhotoPlaceholder className="h-full w-full" />
  );
  const details = (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <ProductLink id={p.id} preview={preview} className="font-display text-2xl md:text-3xl hover:underline">
          {p.name}
        </ProductLink>
        {showPrice && p.price && <p className="shrink-0 text-accent-ink">{p.price}</p>}
      </div>
      {p.description && <p className="mt-2 line-clamp-2 opacity-80">{p.description}</p>}
      {p.inclusions.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {p.inclusions.slice(0, 4).map((inc) => (
            <li key={inc} className="flex gap-2">
              <Icon name="check" className="mt-1 h-4 w-4 text-accent-ink" />
              {inc}
            </li>
          ))}
          {p.inclusions.length > 4 && <li className="opacity-70">+ {p.inclusions.length - 4} more</li>}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <InquireButton product={p.name} settings={settings} className="btn px-5" />
        <ProductLink id={p.id} preview={preview} className="btn-ghost border-current/30">
          Details
        </ProductLink>
      </div>
    </>
  );

  if (variant === "row")
    return (
      <article className="group flex flex-col gap-5 py-8 sm:flex-row">
        <ProductLink id={p.id} preview={preview} className="block aspect-4/3 overflow-hidden rounded-xl sm:w-64 sm:shrink-0" label={p.name}>
          {image}
        </ProductLink>
        <div className="flex-1">{details}</div>
      </article>
    );
  return (
    <article className="group">
      <ProductLink id={p.id} preview={preview} className="block aspect-4/5 overflow-hidden rounded-xl" label={p.name}>
        {image}
      </ProductLink>
      <div className="mt-5">{details}</div>
    </article>
  );
}

/** Link to a product's page; inert inside the admin preview so clicks there never navigate away. */
function ProductLink({ id, preview, className, label, children }: { id: number; preview?: boolean; className?: string; label?: string; children: ReactNode }) {
  const block = (e: MouseEvent) => preview && e.preventDefault();
  return (
    <Link href={`/catalog/${id}`} onClick={block} aria-label={label} className={className}>
      {children}
    </Link>
  );
}
