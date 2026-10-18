"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { fileUrl, type Slide } from "@/lib/api";
import { GUTTER, PhotoPlaceholder } from "./section-shell";

/** Full-width rotating hero. Pauses on hover/focus and never auto-advances under reduced motion. */
export function Slideshow({ id, slides, interval, preview }: { id: string; slides: Slide[]; interval: number; preview?: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const current = Math.min(index, Math.max(0, count - 1));

  useEffect(() => {
    if (count < 2 || paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), interval * 1000);
    return () => clearInterval(timer);
  }, [count, interval, paused]);

  if (!count) return null;
  const go = (i: number) => setIndex((i + count) % count);
  const inert = (e: MouseEvent) => preview && e.preventDefault();

  return (
    <section
      id={id}
      aria-roledescription="carousel"
      aria-label="Highlights"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative flex h-[85svh] min-h-[28rem] scroll-mt-16 items-end overflow-hidden bg-accent"
    >
      {slides.map((s, i) => (
        <div
          key={i}
          aria-hidden={i !== current}
          className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${i === current ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {s.image ? (
            <>
              <img src={fileUrl(s.image)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/15 to-transparent" />
            </>
          ) : (
            <PhotoPlaceholder className="absolute inset-0" />
          )}
          <div className={`absolute inset-x-0 bottom-0 pb-24 md:pb-28 ${GUTTER} ${s.image ? "text-white" : "text-foreground"}`}>
            {s.heading && <h2 className="font-display max-w-4xl text-5xl leading-[0.95] md:text-8xl">{s.heading}</h2>}
            {s.text && <p className="mt-4 max-w-xl text-lg md:text-2xl">{s.text}</p>}
            {s.buttonLabel && s.buttonHref && (
              <a href={s.buttonHref} onClick={inert} tabIndex={i === current ? 0 : -1} className={`btn mt-6 px-8 py-3 text-base ${s.image ? "" : "bg-white"}`}>
                {s.buttonLabel}
              </a>
            )}
          </div>
        </div>
      ))}

      {count > 1 && (
        <div className={`absolute right-0 bottom-8 flex items-center gap-2 ${GUTTER}`}>
          <SlideButton label="Previous slide" onClick={() => go(current - 1)} d="M15 6l-6 6 6 6" />
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === current}
              onClick={() => go(i)}
              className={`h-2 cursor-pointer rounded-full bg-white transition-all ${i === current ? "w-6" : "w-2 opacity-60"}`}
            />
          ))}
          <SlideButton label="Next slide" onClick={() => go(current + 1)} d="M9 6l6 6-6 6" />
        </div>
      )}
    </section>
  );
}

function SlideButton({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/25 backdrop-blur transition-colors hover:bg-white/40"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-white stroke-2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </button>
  );
}
