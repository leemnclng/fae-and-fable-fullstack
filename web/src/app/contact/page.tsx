import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { api, type SiteContent } from "@/lib/api";
import { Eyebrow, GUTTER, SiteChrome } from "../events/chrome";
import { InquireNow } from "@/components/inquire-now";

export const metadata: Metadata = {
  title: "Contact Us | Fae&Fable",
  description: "Book the Fae&Fable mirror selfie booth for your wedding, debut or celebration.",
};

export default function ContactPage() {
  return (
    <Suspense fallback={<p className="p-16 text-center text-stone-500">Loading…</p>}>
      <Contact />
    </Suspense>
  );
}

async function Contact() {
  const { settings } = await api<SiteContent>("/content").catch((): SiteContent => ({ settings: {} }));

  return (
    <SiteChrome settings={settings}>
      <section className={`pt-32 pb-24 md:pt-44 md:pb-40 ${GUTTER}`}>
        <Eyebrow>Contact Us</Eyebrow>
        <h1 className="font-display mt-6 text-4xl leading-tight md:text-7xl">Let&apos;s make your event shine.</h1>
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
          {settings.instagram && <Detail label="Instagram">{settings.instagram}</Detail>}
          {settings.location && <Detail label="Based in">{settings.location}</Detail>}
        </div>
        <InquireNow settings={settings} className="btn mt-12 px-8 py-3 text-base" />
      </section>
    </SiteChrome>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.25em] text-stone-500">{label}</p>
      <p className="mt-1 text-base">{children}</p>
    </div>
  );
}
