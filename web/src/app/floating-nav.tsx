"use client";

import { useSyncExternalStore } from "react";

type Link = { href: string; label: string };

const subscribe = (fn: () => void) => {
  addEventListener("scroll", fn, { passive: true });
  addEventListener("resize", fn);
  return () => {
    removeEventListener("scroll", fn);
    removeEventListener("resize", fn);
  };
};

/** Centered text nav floating at the bottom; white over the hero photo, plum over the pink sections. */
export function FloatingNav({ links, heroHasImage }: { links: Link[]; heroHasImage: boolean }) {
  // Snapshot is a string so React can compare it cheaply: "<onPhoto>|<active href>"
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      const heroBottom = document.getElementById("top")?.getBoundingClientRect().bottom ?? 0;
      const onPhoto = heroHasImage && heroBottom > innerHeight - 60;
      // In-page anchors track scroll position; page links (e.g. /events) are active on their page and its sub-pages.
      const active =
        links.findLast((l) => l.href.startsWith("#") && (document.querySelector(l.href)?.getBoundingClientRect().top ?? Infinity) <= innerHeight / 2) ??
        links.find((l) => !l.href.includes("#") && (location.pathname === l.href || location.pathname.startsWith(`${l.href}/`)));
      return `${onPhoto}|${active?.href ?? ""}`;
    },
    () => `${heroHasImage}|`,
  );
  const [onPhoto, active] = snapshot.split("|");
  const photo = onPhoto === "true";

  return (
    <nav aria-label="Sections" className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center md:bottom-6">
      {/* Faint while browsing; full strength on hover or keyboard focus. Touch screens can't hover, so they always get full strength. */}
      <ul className="pointer-events-auto flex gap-6 opacity-30 transition-opacity duration-300 focus-within:opacity-100 hover:opacity-100 motion-reduce:transition-none pointer-coarse:opacity-100 md:gap-8">
        {links.map((link) => {
          const current = link.href === active;
          return (
            <li key={link.href}>
              <a
                href={link.href}
                aria-current={current ? "location" : undefined}
                className={`font-display inline-flex min-h-11 cursor-pointer items-center rounded px-1 text-lg transition-[color,opacity] duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none md:text-2xl ${
                  photo
                    ? "text-white focus-visible:outline-white [text-shadow:0_1px_12px_rgb(0_0_0/0.45)]"
                    : "text-foreground focus-visible:outline-accent-ink [text-shadow:0_0_14px_var(--background)]"
                } ${current ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
              >
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
