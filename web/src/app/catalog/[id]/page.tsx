import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Gallery } from "@/components/gallery";
import { InquireButton } from "@/components/catalog/inquire";
import { PhotoPlaceholder } from "@/components/catalog/section-shell";
import { api, ApiError, fileUrl, type PublicProduct, type SiteContent } from "@/lib/api";
import { Eyebrow, GUTTER, SiteChrome } from "../../events/chrome";
import { Icon } from "@/components/icon";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-16 text-center text-stone-500">Loading…</p>}>
      <Product params={params} />
    </Suspense>
  );
}

async function Product({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [content, product] = await Promise.all([
    api<SiteContent>("/content").catch((): SiteContent => ({ settings: {} })),
    api<PublicProduct>(`/catalog/products/${id}`).catch((e) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }),
  ]);
  const name = content.settings.businessName || "Fae&Fable";
  const photos = product.photos.map((file, i) => ({ id: i, url: fileUrl(file) }));
  const back = product.type === "mirror" ? { href: "/catalog#mirrors", label: "All mirrors" } : { href: "/catalog#packages", label: "All packages" };

  return (
    <SiteChrome name={name}>
      <article className={`grid gap-10 pt-28 pb-16 md:grid-cols-2 md:gap-16 md:pt-32 md:pb-24 ${GUTTER}`}>
        <div>
          {photos.length ? (
            <Gallery photos={photos} title={product.name} layout="stack" />
          ) : (
            <PhotoPlaceholder className="aspect-4/5 rounded-2xl" />
          )}
        </div>
        <div className="md:sticky md:top-28 md:self-start">
          <Link href={back.href} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-foreground">
            <Icon name="arrow-left" /> {back.label}
          </Link>
          <Eyebrow className="mt-6">{product.type === "mirror" ? "Mirror" : "Package"}</Eyebrow>
          <h1 className="font-display mt-3 text-5xl leading-tight md:text-7xl">{product.name}</h1>
          {product.price && <p className="mt-3 text-xl text-accent-ink">{product.price}</p>}
          {product.description && <p className="mt-6 whitespace-pre-line text-lg leading-relaxed text-stone-600">{product.description}</p>}
          {product.inclusions.length > 0 && (
            <>
              <h2 className="mt-8 text-xs uppercase tracking-[0.3em] text-stone-500">What&apos;s included</h2>
              <ul className="mt-3 space-y-2">
                {product.inclusions.map((inc) => (
                  <li key={inc} className="flex gap-3">
                    <Icon name="check" className="mt-1 h-4 w-4 text-accent-ink" />
                    {inc}
                  </li>
                ))}
              </ul>
            </>
          )}
          <InquireButton product={product.name} settings={content.settings} label={`Inquire about ${product.name}`} className="btn mt-10 px-8 py-3 text-base" />
        </div>
      </article>
    </SiteChrome>
  );
}
