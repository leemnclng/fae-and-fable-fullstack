import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { API, api, ApiError, formatDate, type ShowcaseDetail, type SiteContent } from "@/lib/api";
import { Eyebrow, GUTTER, SiteChrome } from "../chrome";
import { Gallery } from "@/components/gallery";
import { Icon } from "@/components/icon";

export default function PastEventPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-16 text-center text-stone-500">Loading…</p>}>
      <PastEvent params={params} />
    </Suspense>
  );
}

async function PastEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [content, show] = await Promise.all([
    api<SiteContent>("/content").catch((): SiteContent => ({ settings: {} })),
    api<ShowcaseDetail>(`/showcases/${id}`).catch((e) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }),
  ]);
  const name = content.settings.businessName || "Fae&Fable";
  const cover = show.photos.find((p) => !p.isVideo);
  const photos = show.photos.map((p) => ({ ...p, url: API + p.url }));

  return (
    <SiteChrome name={name} heroHasImage={!!cover}>
      <section id="top" className="relative flex h-[85svh] min-h-[28rem] items-end overflow-hidden bg-accent">
        {cover && (
          <>
            <img src={API + cover.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/15 to-transparent" />
          </>
        )}
        <div className={`relative w-full pb-24 md:pb-28 ${GUTTER} ${cover ? "text-white" : "text-foreground"}`}>
          <p className="text-xs uppercase tracking-[0.35em]">Past event</p>
          <h1 className="font-display mt-3 max-w-5xl text-5xl leading-[0.95] md:text-8xl">{show.title}</h1>
          <p className="mt-4 text-lg md:text-xl">
            {formatDate(show.eventDate)}
            {show.location && ` · ${show.location}`}
          </p>
        </div>
      </section>

      <section className={`grid gap-10 py-16 md:grid-cols-12 md:py-24 ${GUTTER}`}>
        <dl className="grid grid-cols-3 gap-6 text-sm md:col-span-4 md:grid-cols-1 md:content-start">
          <Fact label="Date" value={formatDate(show.eventDate)} />
          {show.location && <Fact label="Venue" value={show.location} />}
          <Fact label="Moments" value={`${show.photos.length} ${show.photos.length === 1 ? "photo" : "photos"}`} />
        </dl>
        <div className="md:col-span-8">
          <Eyebrow>The story</Eyebrow>
          <p className="font-display mt-4 whitespace-pre-line text-2xl leading-snug md:text-4xl">
            {show.description || `Highlights from ${show.title}, captured at the Fae&Fable mirror.`}
          </p>
        </div>
      </section>

      <section aria-label="Photos" className="px-2 pb-20 md:pb-28">
        {photos.length ? <Gallery photos={photos} title={show.title} /> : <p className={`text-stone-500 ${GUTTER}`}>Photos coming soon.</p>}
      </section>

      <section className={`flex flex-col gap-8 border-t border-stone-200 py-16 md:flex-row md:items-center md:justify-between md:py-20 ${GUTTER}`}>
        <Link href="/events#past" className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-600 transition-colors hover:text-foreground">
          <Icon name="arrow-left" /> All events
        </Link>
        <div className="md:text-right">
          <p className="font-display text-3xl md:text-5xl">Planning something similar?</p>
          <Link href="/#contact" className="btn mt-6 px-8 py-3 text-base">Book the mirror</Link>
        </div>
      </section>
    </SiteChrome>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-stone-200 pt-3">
      <dt className="text-xs uppercase tracking-[0.25em] text-stone-500">{label}</dt>
      <dd className="mt-1 text-base">{value}</dd>
    </div>
  );
}
