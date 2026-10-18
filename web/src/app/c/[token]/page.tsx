"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { API, api, formatDate } from "@/lib/api";

type Gallery = {
  name: string;
  clientName: string;
  eventDate: string;
  expiresAt: string;
  /** `url` is the API route that checks the client link and redirects to the photo. */
  photos: { id: number; url: string; by: string | null }[];
  /** Private guestbook: only the client sees these. */
  messages: { id: number; name: string; body: string; createdAt: string; photoIds: number[] }[];
};

export default function ClientGalleryPage() {
  const { token } = useParams<{ token: string }>();
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Gallery>(`/client/${token}`).then(setGallery).catch((e) => setError(e.message));
  }, [token]);

  if (error) return <p className="m-auto p-6 text-center text-stone-600">{error}</p>;
  if (!gallery) return <p className="m-auto p-6 text-stone-500">Loading…</p>;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <header className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-accent-ink">Fae&Fable Mirror Booth</p>
        <h1 className="font-display mt-2 text-4xl">{gallery.name}</h1>
        <p className="mt-1 text-stone-500">
          {formatDate(gallery.eventDate)} · {gallery.photos.length} photos
        </p>
        <p className="mt-3 inline-block rounded-full bg-accent/40 px-4 py-1 text-sm text-foreground">
          Download your photos before {formatDate(gallery.expiresAt)}, after that they are permanently deleted.
        </p>
      </header>

      {gallery.messages.length > 0 && (
        <section aria-labelledby="guestbook" className="mb-12">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 id="guestbook" className="font-display text-3xl">Guestbook</h2>
            <p className="text-sm text-stone-500">
              {gallery.messages.length} {gallery.messages.length === 1 ? "note" : "notes"} · only you can see these
            </p>
          </div>
          <ul className="columns-1 gap-4 md:columns-2 lg:columns-3">
            {gallery.messages.map((m) => {
              const photos = gallery.photos.filter((p) => m.photoIds.includes(p.id));
              return (
                <li key={m.id} className="card mb-4 break-inside-avoid">
                  <p className="font-display text-xl leading-snug whitespace-pre-line">&ldquo;{m.body}&rdquo;</p>
                  <p className="mt-3 text-sm text-stone-500">
                    {m.name || "A guest"} · {formatDate(m.createdAt.replace(" ", "T") + "Z")}
                  </p>
                  {photos.length > 0 && (
                    <div className="mt-3 flex gap-1.5">
                      {photos.slice(0, 4).map((p) => (
                        <a key={p.id} href={`#photo-${p.id}`} className="h-14 w-14 overflow-hidden rounded-lg bg-stone-100">
                          <img src={API + p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        </a>
                      ))}
                      {photos.length > 4 && <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-stone-100 text-sm text-stone-500">+{photos.length - 4}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {gallery.photos.length === 0 && <p className="text-center text-stone-500">No photos uploaded yet.</p>}
      <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
        {gallery.photos.map((photo) => (
          <figure key={photo.id} id={`photo-${photo.id}`} className="group relative mb-3 scroll-mt-6 break-inside-avoid overflow-hidden rounded-xl bg-stone-100">
            <img src={API + photo.url} alt="" loading="lazy" className="w-full" />
            {photo.by && (
              <span className="absolute bottom-2 left-2 max-w-[55%] truncate rounded-full bg-black/45 px-2.5 py-1 text-xs text-white backdrop-blur">
                by {photo.by}
              </span>
            )}
            <a
              href={`${API}${photo.url}?download=1`}
              className="absolute right-2 bottom-2 rounded-full bg-white/90 px-3 py-1 text-xs shadow"
            >
              Download
            </a>
          </figure>
        ))}
      </div>
    </main>
  );
}
