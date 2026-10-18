"use client";

import { fileUrl, type PublicProduct, type Section, type Settings } from "@/lib/api";
import { InquireButton } from "./inquire";
import { ProductList } from "./product-list";
import { PhotoPlaceholder, SectionShell } from "./section-shell";
import { Slideshow } from "./slideshow";

/**
 * Renders a catalog page. Used by /catalog and by the admin's live preview, so what the admin sees is what Publish produces.
 * Preview mode makes links inert and lets the admin pick a section by clicking it.
 */
export function CatalogSections({
  sections,
  products,
  settings,
  preview,
  selected,
  onSelect,
}: {
  sections: Section[];
  products: PublicProduct[];
  settings: Settings;
  preview?: boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <>
      {sections
        .filter((s) => !s.hidden)
        .map((s, i) => {
          // The first slideshow doubles as the page hero, so the floating nav knows to turn white over it
          const anchor = s.type === "products" ? (s.productType === "mirror" ? "mirrors" : "packages") : i === 0 && s.type === "slideshow" ? "top" : s.id;
          const body = <SectionBody section={s} anchor={anchor} products={products} settings={settings} preview={preview} />;
          if (!onSelect) return <div key={s.id}>{body}</div>;
          return (
            <div
              key={s.id}
              onClickCapture={() => onSelect(s.id)}
              className={`relative cursor-pointer outline-offset-[-3px] ${selected === s.id ? "outline-3 outline-accent-ink" : "hover:outline-2 hover:outline-accent"}`}
            >
              {body}
            </div>
          );
        })}
    </>
  );
}

function SectionBody({
  section: s,
  anchor,
  products,
  settings,
  preview,
}: {
  section: Section;
  anchor: string;
  products: PublicProduct[];
  settings: Settings;
  preview?: boolean;
}) {
  switch (s.type) {
    case "slideshow":
      return <Slideshow id={anchor} slides={s.slides} interval={s.interval} preview={preview} />;
    case "products":
      return (
        <SectionShell id={anchor} bg={s}>
          {s.heading && <h2 className="font-display mb-10 text-5xl md:mb-14 md:text-7xl">{s.heading}</h2>}
          <ProductList section={s} products={products} settings={settings} preview={preview} />
        </SectionShell>
      );
    case "text":
      return (
        <SectionShell id={anchor} bg={s}>
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
            <div className={`aspect-4/3 overflow-hidden rounded-2xl ${s.imageSide === "right" ? "md:order-2" : ""}`}>
              {s.image ? <img src={fileUrl(s.image)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <PhotoPlaceholder className="h-full w-full" />}
            </div>
            <div>
              {s.heading && <h2 className="font-display text-4xl leading-tight md:text-6xl">{s.heading}</h2>}
              {s.body && <p className="mt-6 whitespace-pre-line text-lg leading-relaxed opacity-85">{s.body}</p>}
            </div>
          </div>
        </SectionShell>
      );
    case "cta":
      return (
        <SectionShell id={anchor} bg={s}>
          <div className="mx-auto max-w-4xl py-8 text-center">
            {s.heading && <h2 className="font-display text-4xl leading-tight md:text-7xl">{s.heading}</h2>}
            {s.text && <p className="mx-auto mt-6 max-w-xl text-lg opacity-85">{s.text}</p>}
            <InquireButton settings={settings} label={s.buttonLabel} className="btn mt-8 px-8 py-3 text-base" />
          </div>
        </SectionShell>
      );
  }
}
