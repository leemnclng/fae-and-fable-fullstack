import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { API, api, formatDate, type PublicEvent, type Showcase, type SiteContent } from "@/lib/api";
import { Eyebrow, GUTTER, SiteChrome } from "./chrome";
import { LookupForm } from "./lookup-form";
import { Icon } from "@/components/icon";

export const metadata: Metadata = {
  title: "Events | Fae&Fable",
  description: "Weddings, debuts and celebrations captured at the Fae&Fable mirror selfie booth.",
};

export default function EventsPage() {
  return (
    <Suspense fallback={<p className="p-16 text-center text-stone-500">Loading…</p>}>
      <Events />
    </Suspense>
  );
}

async function Events() {
  const [content, live, past] = await Promise.all([
    api<SiteContent>("/content").catch((): SiteContent => ({ settings: {} })),
    api<PublicEvent[]>("/events").catch((): PublicEvent[] => []),
    api<Showcase[]>("/showcases").catch((): Showcase[] => []),
  ]);
  const name = content.settings.businessName || "Fae&Fable";
  const [featured, ...rest] = past;

  return (
    <SiteChrome name={name}>
      {/* Intro */}
      <section className={`pt-32 pb-12 md:pt-44 md:pb-20 ${GUTTER}`}>
        <Eyebrow>Mirror Selfie Booth</Eyebrow>
        <div className="mt-3 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <h1 className="font-display text-6xl leading-[0.9] md:text-9xl">Events</h1>
          <p className="max-w-md text-lg text-stone-600">
            A look back at the celebrations we&apos;ve reflected, plus what&apos;s happening at the mirror right now.
          </p>
        </div>
        <nav aria-label="On this page" className="mt-12 flex flex-wrap gap-x-8 gap-y-3 border-t border-stone-200 pt-6 text-xs uppercase tracking-[0.25em]">
          <JumpLink href="#past" label="Past events" count={past.length} />
          <JumpLink href="#live" label="Live now" count={live.length} />
          <JumpLink href="#gallery" label="Find your gallery" />
        </nav>
      </section>

      {/* Past events: featured + gallery grid */}
      <section id="past" className="scroll-mt-20 pb-20 md:pb-32">
        {!featured ? (
          <div className={GUTTER}>
            <div className="flex aspect-21/9 min-h-64 flex-col items-center justify-center bg-stone-100 text-center">
              <p className="font-display text-3xl md:text-5xl">Our story is just beginning</p>
              <p className="mt-3 text-stone-500">Past events will appear here soon.</p>
            </div>
          </div>
        ) : (
          <>
            <Link href={`/events/${featured.id}`} className={`group grid items-end gap-8 md:grid-cols-12 md:gap-12 ${GUTTER}`}>
              <div className="relative aspect-4/3 overflow-hidden bg-accent md:col-span-8 md:aspect-16/10">
                <Cover showcase={featured} sizes="large" />
              </div>
              <div className="md:col-span-4 md:pb-4">
                <Eyebrow>Latest · {formatDate(featured.eventDate)}</Eyebrow>
                <h2 className="font-display mt-4 text-4xl leading-tight md:text-6xl">{featured.title}</h2>
                {featured.location && <p className="mt-2 text-stone-500">{featured.location}</p>}
                {featured.description && <p className="mt-6 line-clamp-4 text-stone-600">{featured.description}</p>}
                <p className="mt-8 inline-flex items-center gap-3 border-b border-foreground pb-1 text-sm transition-colors group-hover:border-accent-ink group-hover:text-accent-ink">
                  View gallery · {featured.photoCount} {featured.photoCount === 1 ? "photo" : "photos"} <Icon name="arrow-right" />
                </p>
              </div>
            </Link>

            {rest.length > 0 && (
              <ul className="mt-20 grid gap-x-2 gap-y-12 px-2 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((show) => (
                  <li key={show.id}>
                    <Link href={`/events/${show.id}`} className="group block">
                      <div className="relative aspect-4/5 overflow-hidden bg-accent">
                        <Cover showcase={show} />
                        <span className="absolute right-3 bottom-3 rounded-full bg-white/90 px-3 py-1 text-xs backdrop-blur">
                          {show.photoCount} {show.photoCount === 1 ? "photo" : "photos"}
                        </span>
                      </div>
                      <div className="px-2 pt-5 md:px-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-stone-500">
                          {formatDate(show.eventDate)}
                          {show.location && ` · ${show.location}`}
                        </p>
                        <h3 className="font-display mt-2 text-3xl leading-tight transition-colors group-hover:text-accent-ink">{show.title}</h3>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Live public events: guests jump to the upload page */}
      <section id="live" className="scroll-mt-20 border-t border-stone-200 bg-white py-20 md:py-28">
        <div className={`mb-10 flex flex-col gap-6 md:mb-14 md:flex-row md:items-end md:justify-between ${GUTTER}`}>
          <div>
            <Eyebrow className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-ink opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-ink" />
              </span>
              Live now
            </Eyebrow>
            <h2 className="font-display mt-4 text-4xl leading-tight md:text-6xl">At an event today?</h2>
          </div>
          <p className="max-w-md text-stone-600">
            Scan the QR code at the mirror, or choose your event and enter the passcode shown at the booth to share your photos.
          </p>
        </div>

        {live.length === 0 ? (
          <p className={`text-stone-500 ${GUTTER}`}>No events are live right now.</p>
        ) : (
          <ul className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${GUTTER}`}>
            {live.map((event) => (
              <li key={event.slug}>
                <Link
                  href={`/e/${event.slug}`}
                  className="group flex items-center gap-4 border border-stone-200 p-3 transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden bg-accent">
                    {event.cover && <img src={API + event.cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display truncate text-xl">{event.name}</p>
                    <p className="text-sm text-stone-500">{formatDate(event.eventDate)}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 pr-2 text-sm text-accent-ink">Share photos <Icon name="arrow-right" /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Client lookup */}
      <section id="gallery" className={`grid scroll-mt-20 gap-10 border-t border-stone-200 py-20 md:grid-cols-2 md:py-28 ${GUTTER}`}>
        <div>
          <Eyebrow>For clients</Eyebrow>
          <h2 className="font-display mt-4 text-4xl leading-tight md:text-6xl">Booked with us? Find your photos.</h2>
          <p className="mt-4 max-w-md text-stone-600">
            Enter the email you booked with and the client code we sent you. Private galleries stay available for 15 days after your event.
          </p>
        </div>
        <LookupForm />
      </section>
    </SiteChrome>
  );
}

function JumpLink({ href, label, count }: { href: string; label: string; count?: number }) {
  return (
    <a href={href} className="text-stone-600 transition-colors hover:text-foreground">
      {label}
      {count !== undefined && <span className="ml-2 text-stone-500">{String(count).padStart(2, "0")}</span>}
    </a>
  );
}

function Cover({ showcase, sizes }: { showcase: Showcase; sizes?: "large" }) {
  return showcase.cover ? (
    <img
      src={API + showcase.cover}
      alt=""
      loading={sizes === "large" ? "eager" : "lazy"}
      className="h-full w-full object-cover transition duration-700 group-hover:scale-105 motion-reduce:transition-none"
    />
  ) : (
    <span className="font-display absolute inset-0 flex items-center justify-center p-6 text-center text-3xl text-foreground/70">
      {showcase.title}
    </span>
  );
}
