import { Suspense } from "react";
import { CatalogSections } from "@/components/catalog/sections";
import { api, type PublicCatalog, type SiteContent } from "@/lib/api";
import { SiteChrome } from "../events/chrome";

export default function CatalogPage() {
  return (
    <Suspense fallback={<p className="p-16 text-center text-stone-500">Loading…</p>}>
      <Catalog />
    </Suspense>
  );
}

async function Catalog() {
  const [content, catalog] = await Promise.all([
    api<SiteContent>("/content").catch((): SiteContent => ({ settings: {} })),
    api<PublicCatalog>("/catalog"),
  ]);
  const first = catalog.sections[0];
  const heroHasImage = first?.type === "slideshow" && !!first.slides[0]?.image;

  return (
    <SiteChrome settings={content.settings} heroHasImage={heroHasImage}>
      {/* Without a slideshow up top, keep the first section clear of the fixed header */}
      {first?.type !== "slideshow" && <div className="h-16" aria-hidden />}
      <CatalogSections sections={catalog.sections} products={catalog.products} settings={content.settings} />
    </SiteChrome>
  );
}
