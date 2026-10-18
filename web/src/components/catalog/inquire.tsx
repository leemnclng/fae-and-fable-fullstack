"use client";

import { useRef } from "react";
import type { Settings } from "@/lib/api";
import { Icon } from "@/components/icon";

/** "Inquire" button: opens the shop's contact options in place, with the product named in the email subject. */
export function InquireButton({
  product,
  settings,
  className = "btn",
  label = "Inquire",
}: {
  product?: string;
  settings: Settings;
  className?: string;
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const subject = encodeURIComponent(product ? `Inquiry: ${product}` : "Inquiry");
  const contacts = [
    settings.email && { label: "Email", value: settings.email, href: `mailto:${settings.email}?subject=${subject}` },
    settings.phone && { label: "Call or text", value: settings.phone, href: `tel:${settings.phone.replace(/\s+/g, "")}` },
    settings.instagram && {
      label: "Instagram",
      value: settings.instagram,
      href: `https://instagram.com/${settings.instagram.replace(/^@/, "")}`,
    },
  ].filter((c): c is { label: string; value: string; href: string } => !!c);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={`cursor-pointer ${className}`}>
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-label={product ? `Ask about ${product}` : "Get in touch"}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-6 text-foreground shadow-2xl backdrop:bg-black/50"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent-ink">Inquire</p>
            <h2 className="font-display mt-1 text-2xl">{product ?? "Get in touch"}</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
          >
            <Icon name="x" />
          </button>
        </div>
        {contacts.length ? (
          <ul className="mt-5 space-y-2">
            {contacts.map((c) => (
              <li key={c.label}>
                <a
                  href={c.href}
                  target={c.label === "Instagram" ? "_blank" : undefined}
                  rel="noreferrer"
                  className="flex flex-col rounded-xl border border-stone-200 px-4 py-3 transition-colors hover:border-accent hover:bg-stone-100"
                >
                  <span className="text-xs uppercase tracking-[0.2em] text-stone-500">{c.label}</span>
                  <span className="break-all font-medium">{c.value}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-stone-600">Contact details coming soon.</p>
        )}
      </dialog>
    </>
  );
}
