import { Suspense, type ReactNode } from "react";
import { api, fileUrl, type SiteContent } from "@/lib/api";
import { FloatingNav } from "./floating-nav";

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
  const { settings } = await api<SiteContent>("/content").catch(
    (): SiteContent => ({ settings: {} }),
  );
  const name = settings.businessName || "Fae&Fable";
  const hero = settings.banner;

  return (
    <main className="flex-1">
      <header
        className={`fixed inset-x-0 top-0 z-20 flex items-center justify-between bg-background/75 py-4 backdrop-blur ${GUTTER}`}
      >
        <a href="#top" className="font-display text-xl">
          {name}
        </a>
        <a href="#contact" className="btn px-4 py-1.5">
          Book
        </a>
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
            <a
              href="#contact"
              className={`btn w-fit px-8 py-3 text-base ${hero ? "" : "bg-white"}`}
            >
              Book the mirror
            </a>
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

      {/* Contact: oversized call to action */}
      <section id="contact" className={`scroll-mt-16 py-24 md:py-40 ${GUTTER}`}>
        <p className="text-xs uppercase tracking-[0.35em] text-accent-ink">
          Book the mirror
        </p>
        <h2 className="font-display mt-6 text-4xl leading-tight md:text-7xl">
          Let&apos;s make your event shine.
        </h2>
        {settings.email && (
          <a
            href={`mailto:${settings.email}`}
            className="font-display mt-8 block break-all text-[9vw] leading-none underline decoration-accent decoration-2 underline-offset-8 md:text-[6vw]"
          >
            {settings.email}
          </a>
        )}
        <div className="mt-12 grid gap-6 text-sm sm:grid-cols-3">
          {settings.phone && (
            <Detail label="Phone">
              <a href={`tel:${settings.phone}`}>{settings.phone}</a>
            </Detail>
          )}
          {settings.instagram && (
            <Detail label="Instagram">{settings.instagram}</Detail>
          )}
          {settings.location && (
            <Detail label="Based in">{settings.location}</Detail>
          )}
        </div>
      </section>

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
          { href: "#contact", label: "Contact" },
        ]}
      />
    </main>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.25em] text-stone-500">
        {label}
      </p>
      <p className="mt-1 text-base">{children}</p>
    </div>
  );
}
