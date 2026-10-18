import Link from "next/link";
import type { ReactNode } from "react";
import { FloatingNav } from "../floating-nav";

/** Header, footer and nav shared by /events and /events/[id]. */
export const GUTTER = "px-6 md:px-12";

export function SiteChrome({ name, heroHasImage = false, children }: { name: string; heroHasImage?: boolean; children: ReactNode }) {
  return (
    <main className="flex-1">
      <header className={`fixed inset-x-0 top-0 z-20 flex items-center justify-between bg-background/75 py-4 backdrop-blur ${GUTTER}`}>
        <Link href="/" className="font-display text-xl">{name}</Link>
        <Link href="/#contact" className="btn px-4 py-1.5">Book</Link>
      </header>

      {children}

      <footer className={`flex flex-col gap-3 border-t border-stone-200 pt-6 pb-24 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between ${GUTTER}`}>
        <span>© {name}</span>
        <span>Mirror Selfie Booth</span>
      </footer>

      <FloatingNav
        heroHasImage={heroHasImage}
        links={[
          { href: "/catalog", label: "Catalog" },
          { href: "/events", label: "Events" },
          { href: "/#contact", label: "Contact" },
        ]}
      />
    </main>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs uppercase tracking-[0.35em] text-accent-ink ${className}`}>{children}</p>;
}
