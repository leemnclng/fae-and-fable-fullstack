"use client";

import type { ReactNode } from "react";
import type { AdminProduct, Background, Section, SectionType, Slide } from "@/lib/api";
import { PhotoPicker } from "./products";
import { Icon } from "@/components/icon";

type Upload = (file: File) => Promise<string>;

/** Label shown for a section in the builder. */
export function sectionLabel(s: Section) {
  if (s.type === "products") return s.productType === "mirror" ? "Mirrors" : "Packages";
  return { slideshow: "Slideshow", text: "Text + photo", cta: "Call to action" }[s.type];
}

/** Menu entries for "+ Add section"; Mirrors and Packages are both products sections. */
export const NEW_SECTIONS: { label: string; type: SectionType; productType?: "mirror" | "package" }[] = [
  { label: "Slideshow", type: "slideshow" },
  { label: "Mirrors", type: "products", productType: "mirror" },
  { label: "Packages", type: "products", productType: "package" },
  { label: "Text + photo", type: "text" },
  { label: "Call to action", type: "cta" },
];

const EMPTY_SLIDE: Slide = { image: null, heading: "", text: "", buttonLabel: "", buttonHref: "" };

/** A fresh section with the same defaults the API fills in. */
export function newSection(type: SectionType, productType: "mirror" | "package" = "mirror"): Section {
  const base = { id: crypto.randomUUID(), hidden: false };
  const bg: Background = { background: "white", backgroundImage: null };
  switch (type) {
    case "slideshow":
      return { ...base, type, interval: 6, slides: [{ ...EMPTY_SLIDE, heading: "New slide" }] };
    case "products":
      return { ...base, type, productType, heading: productType === "mirror" ? "Mirrors" : "Packages", layout: "grid", columns: 3, showPrices: true, pick: "all", ...bg };
    case "text":
      return { ...base, type, heading: "Our story", body: "", image: null, imageSide: "left", ...bg };
    case "cta":
      return { ...base, type, heading: "Ready to book?", text: "", buttonLabel: "Inquire", ...bg };
  }
}

/** Settings form for the selected section. Every edit calls onChange with the whole updated section. */
export function SectionForm({
  section,
  onChange,
  products,
  upload,
}: {
  section: Section;
  onChange: (s: Section) => void;
  products: AdminProduct[];
  upload: Upload;
}) {
  const set = (patch: Partial<Section>) => onChange({ ...section, ...patch } as Section);

  switch (section.type) {
    case "slideshow": {
      const slides = section.slides;
      const setSlide = (i: number, patch: Partial<Slide>) => set({ slides: slides.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
      const swap = (i: number, j: number) => {
        const next = [...slides];
        [next[i], next[j]] = [next[j], next[i]];
        set({ slides: next });
      };
      return (
        <div className="space-y-4">
          <Field label={`Change slide every ${section.interval} seconds`}>
            <input type="range" min={3} max={15} value={section.interval} onChange={(e) => set({ interval: Number(e.target.value) })} className="w-full accent-accent-ink" />
          </Field>
          {slides.map((slide, i) => (
            <fieldset key={i} className="space-y-3 rounded-xl border border-stone-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium">Slide {i + 1}</legend>
                <span className="flex gap-1">
                  <button type="button" aria-label={`Move slide ${i + 1} up`} disabled={i === 0} onClick={() => swap(i, i - 1)} className="btn-ghost px-2 py-0.5 text-xs"><Icon name="arrow-up" className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Move slide ${i + 1} down`} disabled={i === slides.length - 1} onClick={() => swap(i, i + 1)} className="btn-ghost px-2 py-0.5 text-xs"><Icon name="arrow-down" className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Remove slide ${i + 1}`} onClick={() => set({ slides: slides.filter((_, j) => j !== i) })} className="btn-ghost px-2 py-0.5 text-xs text-red-600"><Icon name="x" className="h-3.5 w-3.5" /></button>
                </span>
              </div>
              <PhotoPicker value={slide.image ? [slide.image] : []} onChange={(f) => setSlide(i, { image: f[0] ?? null })} upload={upload} max={1} />
              <Text label="Heading" value={slide.heading} max={120} onChange={(heading) => setSlide(i, { heading })} />
              <Text label="Text" value={slide.text} max={600} onChange={(text) => setSlide(i, { text })} multiline />
              <div className="grid grid-cols-2 gap-2">
                <Text label="Button label" value={slide.buttonLabel} max={40} onChange={(buttonLabel) => setSlide(i, { buttonLabel })} />
                <Text label="Button link" value={slide.buttonHref} max={300} placeholder="#mirrors" onChange={(buttonHref) => setSlide(i, { buttonHref })} />
              </div>
            </fieldset>
          ))}
          {slides.length < 10 && (
            <button type="button" onClick={() => set({ slides: [...slides, { ...EMPTY_SLIDE }] })} className="btn-ghost w-full">
              + Add slide
            </button>
          )}
          <p className="text-xs text-stone-500">Links can be a page (/events), a section (#mirrors, #packages) or a full web address.</p>
        </div>
      );
    }
    case "products": {
      const ofType = products.filter((p) => p.draft.type === section.productType);
      const picked = section.pick === "all" ? null : section.pick;
      return (
        <div className="space-y-4">
          <Text label="Heading" value={section.heading} max={120} onChange={(heading) => set({ heading })} />
          <Field label="Layout">
            <Segmented value={section.layout} options={[["grid", "Grid"], ["carousel", "Carousel"], ["list", "List"]]} onChange={(layout) => set({ layout })} />
          </Field>
          {section.layout === "grid" && (
            <Field label="Columns on wide screens">
              <Segmented value={String(section.columns)} options={[["2", "2"], ["3", "3"], ["4", "4"]]} onChange={(c) => set({ columns: Number(c) as 2 | 3 | 4 })} />
            </Field>
          )}
          <Toggle label="Show prices" checked={section.showPrices} onChange={(showPrices) => set({ showPrices })} />
          <Field label="Show">
            <Segmented
              value={picked ? "pick" : "all"}
              options={[["all", `All ${section.productType}s`], ["pick", "Choose…"]]}
              onChange={(v) => set({ pick: v === "all" ? "all" : ofType.map((p) => p.id) })}
            />
          </Field>
          {picked && (
            <ul className="space-y-1 rounded-xl border border-stone-200 bg-white p-2">
              {ofType.length === 0 && <li className="p-2 text-sm text-stone-500">No {section.productType}s yet. Add them in the Products tab.</li>}
              {ofType.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-100">
                    <input
                      type="checkbox"
                      checked={picked.includes(p.id)}
                      onChange={(e) => set({ pick: ofType.filter((q) => (q.id === p.id ? e.target.checked : picked.includes(q.id))).map((q) => q.id) })}
                      className="accent-accent-ink"
                    />
                    {p.draft.name}
                    {p.status === "draft" && <span className="ml-auto text-xs text-stone-500">not published</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <BackgroundField section={section} onChange={set} upload={upload} />
        </div>
      );
    }
    case "text":
      return (
        <div className="space-y-4">
          <Text label="Heading" value={section.heading} max={120} onChange={(heading) => set({ heading })} />
          <Text label="Text" value={section.body} max={3000} onChange={(body) => set({ body })} multiline rows={6} />
          <Field label="Photo">
            <PhotoPicker value={section.image ? [section.image] : []} onChange={(f) => set({ image: f[0] ?? null })} upload={upload} max={1} />
          </Field>
          <Field label="Photo side">
            <Segmented value={section.imageSide} options={[["left", "Left"], ["right", "Right"]]} onChange={(imageSide) => set({ imageSide })} />
          </Field>
          <BackgroundField section={section} onChange={set} upload={upload} />
        </div>
      );
    case "cta":
      return (
        <div className="space-y-4">
          <Text label="Heading" value={section.heading} max={120} onChange={(heading) => set({ heading })} />
          <Text label="Text" value={section.text} max={600} onChange={(text) => set({ text })} multiline />
          <Text label="Button label" value={section.buttonLabel} max={40} onChange={(buttonLabel) => set({ buttonLabel })} />
          <p className="text-xs text-stone-500">The button opens your contact details from Site settings.</p>
          <BackgroundField section={section} onChange={set} upload={upload} />
        </div>
      );
  }
}

function BackgroundField({ section, onChange, upload }: { section: Background; onChange: (patch: Partial<Background>) => void; upload: Upload }) {
  return (
    <Field label="Background">
      <Segmented value={section.background} options={[["white", "White"], ["tint", "Tint"], ["photo", "Photo"]]} onChange={(background) => onChange({ background })} />
      {section.background === "photo" && (
        <div className="mt-2">
          <PhotoPicker value={section.backgroundImage ? [section.backgroundImage] : []} onChange={(f) => onChange({ backgroundImage: f[0] ?? null })} upload={upload} max={1} />
        </div>
      )}
    </Field>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-sm text-stone-600">{label}</p>
      {children}
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  max,
  multiline,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm text-stone-600">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={rows} placeholder={placeholder} className="input mt-1" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} placeholder={placeholder} className="input mt-1" />
      )}
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="flex w-fit flex-wrap rounded-full bg-white p-1 text-sm shadow-sm">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={`cursor-pointer rounded-full px-3 py-1 ${value === key ? "bg-foreground text-background" : "text-stone-600 hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-accent-ink" />
      {label}
    </label>
  );
}
