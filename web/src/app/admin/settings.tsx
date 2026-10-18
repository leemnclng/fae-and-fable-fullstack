"use client";

import { useState } from "react";
import { fileUrl, type Settings, type SiteContent } from "@/lib/api";
import { useAdmin, type AdminProps } from "./use-admin";
import { resizeImage } from "@/lib/resize";

const FIELDS: { key: keyof Settings; label: string; multiline?: boolean }[] = [
  { key: "businessName", label: "Business name" },
  { key: "tagline", label: "Hero tagline" },
  { key: "about", label: "About", multiline: true },
  { key: "email", label: "Contact email" },
  { key: "phone", label: "Contact phone" },
  { key: "instagram", label: "Instagram handle" },
  { key: "location", label: "Service area / location" },
];

export function SettingsForm(props: AdminProps) {
  const { data, error, call, reload } = useAdmin<SiteContent>("/content", props);
  const [saved, setSaved] = useState(false);

  async function save(form: FormData) {
    setSaved(false);
    try {
      await call("/admin/settings", { method: "PUT", body: JSON.stringify(Object.fromEntries(form)) });
      await reload(); // before React resets the form to defaultValues
      setSaved(true);
    } catch {
      // error is shown by useAdmin
    }
  }

  async function banner(file: File | null) {
    const form = new FormData();
    // If the browser can't shrink it, send it as is and let the API's size limit explain
    if (file) form.set("image", await resizeImage(file).catch(() => file));
    try {
      await call("/admin/banner", file ? { method: "PUT", body: form } : { method: "DELETE" });
      await reload();
    } catch {
      // error is shown by useAdmin
    }
  }

  if (!data) return <p className="text-stone-500">{error || "Loading…"}</p>;
  const current = data.settings.banner;

  return (
    <div className="max-w-5xl space-y-6">
      <section className="card space-y-3">
        <div>
          <h2 className="font-display text-xl">Homepage banner</h2>
          <p className="text-sm text-stone-500">The full-screen photo at the top of the homepage. Without one, the banner uses the accent color.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="aspect-video w-64 overflow-hidden rounded-lg border border-stone-200 bg-accent">
            {current && <img src={fileUrl(current)} alt="Current homepage banner" className="h-full w-full object-cover" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="btn-ghost cursor-pointer">
              {current ? "Replace photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) banner(file);
                }}
              />
            </label>
            {current && (
              <button type="button" onClick={() => confirm("Remove the homepage banner photo?") && banner(null)} className="btn-ghost text-red-600">
                Remove
              </button>
            )}
          </div>
        </div>
      </section>

      <form action={save} className="card grid gap-x-6 gap-y-4 md:grid-cols-2">
        {FIELDS.map(({ key, label, multiline }) => (
          <label key={key} className={`block text-sm text-stone-600 ${multiline ? "md:col-span-2" : ""}`}>
            {label}
            {multiline ? (
              <textarea name={key} defaultValue={data.settings[key]} rows={5} className="input mt-1" />
            ) : (
              <input name={key} defaultValue={data.settings[key]} className="input mt-1" />
            )}
          </label>
        ))}
        {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
        <div className="flex items-center gap-3 md:col-span-2">
          <button className="btn">Save settings</button>
          {saved && <span className="text-sm text-green-700">Saved</span>}
        </div>
      </form>
    </div>
  );
}
