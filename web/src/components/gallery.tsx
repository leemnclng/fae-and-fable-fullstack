"use client";

import { useRef, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "@/components/icon";
import { NoteFace } from "@/components/note-face";
import type { NoteFont, NoteTemplate } from "@/lib/event-style";
import type { PhotoNote } from "@/lib/api";

type Photo = { id: number; url: string; badges?: string[]; note?: PhotoNote };
type Layout = "masonry" | "grid" | "collage" | "stack";

const LIST: Record<Layout, string> = {
  masonry: "columns-1 gap-2 sm:columns-2 lg:columns-3",
  grid: "grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-6",
  // Photo-wall collage: tight columns, each photo at its own shape
  collage: "columns-2 gap-2 sm:columns-3 xl:columns-4",
  // One photo per row at full width (product pages)
  stack: "columns-1",
};

/**
 * Photo grid + full-screen viewer. Native <dialog> gives focus trapping and Esc-to-close for free.
 * Photos with a note open like a greeting card; `onShare` adds a nudge to share your own.
 */
export function Gallery({
  photos,
  title,
  layout = "masonry",
  onShare,
  noteStyle,
}: {
  photos: Photo[];
  title: string;
  layout?: Layout;
  onShare?: () => void;
  /** The event's note card template and handwriting. */
  noteStyle?: { template?: NoteTemplate; font?: NoteFont };
}) {
  const grid = layout === "grid";
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const current = index === null ? null : photos[index];

  const open = (i: number) => {
    setIndex(i);
    dialog.current?.showModal();
  };
  const step = (delta: number) => setIndex((i) => (i === null ? i : (i + delta + photos.length) % photos.length));

  return (
    <>
      <ul className={LIST[layout]}>
        {photos.map((photo, i) => (
          <li key={photo.id} className={grid ? "aspect-square" : "mb-2 break-inside-avoid"}>
            <button
              type="button"
              onClick={() => open(i)}
              aria-label={`Open photo ${i + 1} of ${photos.length}${photo.badges?.length ? ` (${photo.badges.join(", ")})` : ""}`}
              className={`group relative block w-full cursor-zoom-in overflow-hidden bg-stone-100 ${grid ? "h-full rounded-md" : layout === "collage" ? "rounded-lg" : layout === "stack" ? "rounded-2xl" : ""} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink`}
            >
              <img
                src={photo.url}
                alt=""
                loading="lazy"
                className={`w-full transition duration-500 group-hover:scale-[1.03] motion-reduce:transition-none ${grid ? "h-full object-cover" : ""}`}
              />
              {!!photo.badges?.length && (
                <span className="absolute top-1.5 left-1.5 flex gap-1" aria-hidden>
                  {photo.badges.map((b) => (
                    <span key={b} className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium tracking-wide text-foreground uppercase shadow-sm backdrop-blur">
                      {b}
                    </span>
                  ))}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        aria-label={`${title} photos`}
        onClose={() => setIndex(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
      >
        {current && index !== null && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3 text-sm md:px-6">
              <span aria-live="polite">
                {index + 1} / {photos.length}
              </span>
              <button type="button" autoFocus onClick={() => dialog.current?.close()} className="cursor-pointer rounded-full px-4 py-2 transition-colors hover:bg-white/10">
                Close
              </button>
            </div>
            {/* Clicking the empty area around the photo closes the viewer */}
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 md:px-20"
              onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
            >
              {current.note ? (
                <NoteCard key={current.id} src={current.url} alt={`${title}, photo ${index + 1}`} note={current.note} style={noteStyle} />
              ) : (
                <img key={current.id} src={current.url} alt={`${title}, photo ${index + 1}`} className="max-h-full max-w-full object-contain" />
              )}
              {photos.length > 1 && (
                <>
                  <NavButton label="Previous photo" side="left" onClick={() => step(-1)} />
                  <NavButton label="Next photo" side="right" onClick={() => step(1)} />
                </>
              )}
            </div>
            {onShare && (
              <div className="mx-auto mb-5 flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl bg-white/10 px-5 py-3 text-center text-sm backdrop-blur">
                <span>{current.note ? "Moved? Leave your own photo and note for the couple." : "Loving these? Add yours with a note for the couple."}</span>
                <button
                  type="button"
                  onClick={() => {
                    dialog.current?.close();
                    onShare();
                  }}
                  className="btn cursor-pointer px-5"
                >
                  + Share your photo
                </button>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

function NavButton({ label, side, onClick }: { label: string; side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/25 ${side === "left" ? "left-2 md:left-6" : "right-2 md:right-6"}`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-white stroke-2" aria-hidden>
        <path d={side === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Spread of the hearts that burst out when a card opens (fixed, so renders stay pure)
const HEARTS = Array.from({ length: 14 }, (_, i) => ({
  icon: (i % 3 === 2 ? "sparkle" : "heart") as IconName,
  color: ["text-pink-400", "text-rose-300", "text-amber-200"][i % 3],
  x: `${((i * 73) % 300) - 150}px`,
  r: `${((i * 37) % 90) - 45}deg`,
  left: `${40 + ((i * 29) % 20)}%`,
  delay: `${0.45 + ((i * 17) % 50) / 100}s`,
}));

/**
 * A photo with a guest's note, opened like a greeting card: on wide screens the front swings open on its left hinge
 * and the note sits beside the photo; on phones the whole card flips over to show the note on its back.
 */
function NoteCard({ src, alt, note, style }: { src: string; alt: string; note: PhotoNote; style?: { template?: NoteTemplate; font?: NoteFont } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="perspective-[1600px]">
        <div
          className={`relative transition-transform duration-700 ease-[cubic-bezier(.34,1.3,.64,1)] transform-3d motion-reduce:transition-none ${open ? "max-md:rotate-y-180 md:translate-x-1/2" : ""}`}
        >
          <img src={src} alt={alt} className="block max-h-[calc(100dvh-14rem)] max-w-[calc(100vw-2rem)] rounded-lg object-contain shadow-2xl max-md:backface-hidden md:max-w-[42vw]" />
          {/* The hinged leaf: its inside face holds the note */}
          <div
            className={`pointer-events-none absolute inset-0 origin-left transition-transform duration-1000 ease-[cubic-bezier(.6,.05,.25,1)] transform-3d motion-reduce:transition-none ${open ? "md:-rotate-y-180" : ""}`}
          >
            <div aria-hidden={!open} className={`absolute inset-0 rotate-y-180 backface-hidden ${open ? "pointer-events-auto" : ""}`}>
              <NoteFace note={note} template={style?.template} font={style?.font} className="h-full shadow-2xl" />
            </div>
          </div>
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="animate-wiggle absolute top-4 -right-2 inline-flex cursor-pointer items-center gap-1.5 rounded-l-md bg-[#fff9f4] px-3 py-1.5 text-xs font-medium text-foreground shadow-lg"
            >
              <Icon name="mail" className="h-3.5 w-3.5" /> There&apos;s a note
            </button>
          )}
          {open &&
            HEARTS.map((h, i) => (
              <span
                key={i}
                aria-hidden
                className={`animate-heart pointer-events-none absolute top-3/5 opacity-0 ${h.color}`}
                style={{ left: h.left, animationDelay: h.delay, "--x": h.x, "--r": h.r } as CSSProperties}
              >
                <Icon name={h.icon} filled className="h-5 w-5" />
              </span>
            ))}
        </div>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="btn cursor-pointer px-6">
        {open ? (
          "Close the card"
        ) : (
          <>
            <Icon name="mail" /> Open the card
          </>
        )}
      </button>
    </div>
  );
}
