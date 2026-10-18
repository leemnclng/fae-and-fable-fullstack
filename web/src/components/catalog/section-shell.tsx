import type { ReactNode } from "react";
import { fileUrl, type Background } from "@/lib/api";

export const GUTTER = "px-6 md:px-12";

/** Section wrapper: white, accent tint, or a photo behind a dark scrim (photo with no image falls back to tint). */
export function SectionShell({ id, bg, children }: { id: string; bg: Background; children: ReactNode }) {
  const photo = bg.background === "photo" && bg.backgroundImage;
  const tone = photo ? "text-white" : bg.background === "white" ? "bg-white" : "bg-accent/35";
  return (
    <section id={id} className={`relative scroll-mt-16 overflow-hidden py-16 md:py-24 ${tone}`}>
      {photo && (
        <>
          <img src={fileUrl(photo)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/50" />
        </>
      )}
      <div className={`relative ${GUTTER}`}>{children}</div>
    </section>
  );
}

/** Stand-in for a missing photo, so an image slot never shows as broken. */
export function PhotoPlaceholder({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`bg-linear-to-br from-accent via-stone-100 to-background ${className}`} />;
}
