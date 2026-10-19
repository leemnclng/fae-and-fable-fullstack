import Link from "next/link";
import type { ReactNode } from "react";
import { FloatingNav } from "../floating-nav";
import { Wordmark } from "@/components/wordmark";
import { InquireNow } from "@/components/inquire-now";
import type { Settings } from "@/lib/api";

/** Header, footer and nav shared by the public pages other than the homepage. */
export const GUTTER = "px-6 md:px-12";

export function SiteChrome({ settings, heroHasImage = false, children }: { settings: Settings; heroHasImage?: boolean; children: ReactNode }) {
  const name = settings.businessName || "Fae&Fable";
  return (
    <main className="flex-1">
      <header className={`fixed inset-x-0 top-0 z-20 flex items-center justify-between bg-background/75 py-4 backdrop-blur ${GUTTER}`}>
        <Link href="/" aria-label={`${name} home`}>
          <Wordmark name={name} className="h-9 w-auto md:h-11" />
        </Link>
        <InquireNow settings={settings} />
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
          { href: "/contact", label: "Contact" },
        ]}
      />
    </main>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs uppercase tracking-[0.35em] text-accent-ink ${className}`}>{children}</p>;
}
