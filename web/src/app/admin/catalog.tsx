"use client";

import { useState } from "react";
import { PageTab } from "./_catalog/page-builder";
import { ProductsTab } from "./_catalog/products";
import type { AdminProps } from "./use-admin";

const TABS = [
  { key: "products", label: "Products" },
  { key: "page", label: "Page" },
] as const;

/** Catalog CMS: products (mirrors and packages) and the section builder for the /catalog page. */
export function Catalog(props: AdminProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("products");
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Catalog" className="flex w-fit rounded-full bg-white p-1 text-sm shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`cursor-pointer rounded-full px-5 py-1.5 transition-colors ${tab === t.key ? "bg-foreground text-background" : "text-stone-600 hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "products" ? <ProductsTab {...props} /> : <PageTab {...props} />}
    </div>
  );
}
