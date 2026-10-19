import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { api, fileUrl, formatDate, type PublicCatalog, type Showcase, type SiteContent } from "@/lib/api";
import { Icon } from "@/components/icon";
import { PhotoPlaceholder } from "@/components/catalog/section-shell";
import { FloatingNav } from "./floating-nav";
import { Wordmark } from "@/components/wordmark";
import { InquireNow } from "@/components/inquire-now";

export default function Home() {
  return (
    <Suspense
      fallback={<p className="p-16 text-center text-stone-500">Loading…</p>}
    >
      <Site />
    </Suspense>
  );
}

const GUTTER = "px-6 md:px-12";

async function Site() {
  const [{ settings }, catalog, showcases] = await Promise.all([
    api<SiteContent>("/content").catch((): SiteContent => ({ settings: {} })),
    api<PublicCatalog>("/catalog").catch((): PublicCatalog => ({ sections: [], products: [] })),
    api<Showcase[]>("/showcases").catch((): Showcase[] => []),
  ]);
  // Mirrors first, then packages, as on the catalog page
  const products = [...catalog.products].sort((a, b) => (a.type === b.type ? 0 : a.type === "mirror" ? -1 : 1)).slice(0, 3);
  const name = settings.businessName || "Fae&Fable";
  const hero = settings.banner;

  return (
    <main className="flex-1">
      <header
        className={`fixed inset-x-0 top-0 z-20 flex items-center justify-between bg-background/75 py-4 backdrop-blur ${GUTTER}`}
      >
        <a href="#top" aria-label={`${name}, back to top`}>
          <Wordmark name={name} className="h-9 w-auto md:h-11" />
        </a>
        <InquireNow settings={settings} />
      </header>

      {/* Full-screen hero */}
      <section
        id="top"
        className="relative flex h-svh items-end overflow-hidden bg-accent"
      >
        {hero && (
          <>
            <img
              src={fileUrl(hero)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/55 via-black/10 to-transparent" />
          </>
        )}
        <div
          className={`relative w-full pb-28 md:pb-32 ${GUTTER} ${hero ? "text-white" : "text-foreground"}`}
        >
          <p className="text-xs uppercase tracking-[0.35em] md:text-sm">
            Mirror Selfie Booth
          </p>
          <h1 className="font-display mt-3 whitespace-nowrap text-[14vw] leading-[0.85] md:text-[11vw]">
            {name}
          </h1>
          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <p className="max-w-xl text-lg md:text-2xl">
              {settings.tagline || "Reflect the magic of your event"}
            </p>
            <InquireNow
              settings={settings}
              className={`btn w-fit px-8 py-3 text-base ${hero ? "" : "bg-white"}`}
            />
          </div>
        </div>
      </section>

      {/* Big statement */}
      {settings.about && (
        <section className={`py-24 md:py-40 ${GUTTER}`}>
          <p className="text-xs uppercase tracking-[0.35em] text-accent-ink">
            About
          </p>
          <p className="font-display mt-6 max-w-6xl whitespace-pre-line text-3xl leading-tight md:text-6xl">
            {settings.about}
          </p>
        </section>
      )}

      {/* Quick views of the other pages, each with a way through */}
      <Preview eyebrow="Catalog" title="Mirrors & packages" href="/catalog" tint>
        {products.length ? (
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/catalog/${p.id}`} className="group block">
                  <div className="aspect-4/5 overflow-hidden bg-accent">
                    {p.photos[0] ? (
                      <img src={fileUrl(p.photos[0])} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105 motion-reduce:transition-none" />
                    ) : (
                      <PhotoPlaceholder className="h-full w-full" />
                    )}
                  </div>
                  <p className="mt-4 text-xs uppercase tracking-[0.25em] text-stone-500">{p.type === "mirror" ? "Mirror" : "Package"}</p>
                  <h3 className="font-display mt-1 text-2xl transition-colors group-hover:text-accent-ink md:text-3xl">{p.name}</h3>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500">Our mirrors and packages are coming soon.</p>
        )}
      </Preview>

      <Preview eyebrow="Events" title="Celebrations we've reflected" href="/events">
        {showcases.length ? (
          <ul className="grid gap-x-2 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {showcases.slice(0, 3).map((show) => (
              <li key={show.id}>
                <Link href={`/events/${show.id}`} className="group block">
                  <div className="relative aspect-4/5 overflow-hidden bg-accent">
                    {show.cover ? (
                      <img src={fileUrl(show.cover)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105 motion-reduce:transition-none" />
                    ) : (
                      <span className="font-display absolute inset-0 flex items-center justify-center p-6 text-center text-3xl text-foreground/70">{show.title}</span>
                    )}
                  </div>
                  <p className="mt-4 text-xs uppercase tracking-[0.25em] text-stone-500">
                    {formatDate(show.eventDate)}
                    {show.location && ` · ${show.location}`}
                  </p>
                  <h3 className="font-display mt-1 text-2xl transition-colors group-hover:text-accent-ink md:text-3xl">{show.title}</h3>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500">Past events will appear here soon. At an event today? You can share your photos there.</p>
        )}
      </Preview>

      <Preview eyebrow="Contact Us" title="Let's make your event shine." href="/contact" tint>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <InquireNow settings={settings} className="btn w-fit px-8 py-3 text-base" />
          {settings.email && (
            <a href={`mailto:${settings.email}`} className="break-all text-lg underline decoration-accent decoration-2 underline-offset-4">
              {settings.email}
            </a>
          )}
        </div>
      </Preview>

      {/* pb-24 keeps the footer text clear of the floating nav */}
      <footer
        className={`flex flex-col gap-3 border-t border-stone-200 pt-6 pb-24 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between ${GUTTER}`}
      >
        <span>© {name}</span>
        <span>Mirror Selfie Booth</span>
      </footer>

      <FloatingNav
        heroHasImage={!!hero}
        links={[
          { href: "/catalog", label: "Catalog" },
          { href: "/events", label: "Events" },
          { href: "/contact", label: "Contact" },
        ]}
      />
    </main>
  );
}

/** A homepage teaser for another page: heading, a few items, and "See more". */
function Preview({ eyebrow, title, href, tint, children }: { eyebrow: string; title: string; href: string; tint?: boolean; children: ReactNode }) {
  return (
    <section className={`py-20 md:py-28 ${tint ? "bg-white" : ""} ${GUTTER}`}>
      <div className="mb-10 flex flex-col gap-4 md:mb-14 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-accent-ink">{eyebrow}</p>
          <h2 className="font-display mt-4 text-4xl leading-tight md:text-6xl">{title}</h2>
        </div>
        <SeeMore href={href} label={eyebrow} />
      </div>
      {children}
    </section>
  );
}

function SeeMore({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={`See more: ${label}`} className="inline-flex w-fit shrink-0 items-center gap-3 border-b border-foreground pb-1 text-sm transition-colors hover:border-accent-ink hover:text-accent-ink">
      See more <Icon name="arrow-right" />
    </Link>
  );
}
