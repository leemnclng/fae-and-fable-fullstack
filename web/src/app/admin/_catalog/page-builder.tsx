"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CatalogSections } from "@/components/catalog/sections";
import { Icon } from "@/components/icon";
import type {
  AdminProduct,
  CatalogPage,
  PublicProduct,
  Section,
  SiteContent,
} from "@/lib/api";
import { useAdmin, type AdminProps } from "../use-admin";
import { uploadImage } from "./products";
import {
  NEW_SECTIONS,
  newSection,
  SectionForm,
  sectionLabel,
} from "./section-forms";

type Call = ReturnType<typeof useAdmin>["call"];

/** Section builder for /catalog: section list, live preview and settings; edits autosave as a draft until Publish. */
export function PageTab(props: AdminProps) {
  const page = useAdmin<CatalogPage>("/admin/catalog/page", props);
  const products = useAdmin<AdminProduct[]>("/admin/catalog/products", props);
  const content = useAdmin<SiteContent>("/content", props);
  if (!page.data || !products.data || !content.data)
    return (
      <p className="text-stone-500">
        {page.error || products.error || "Loading…"}
      </p>
    );
  return (
    <Builder
      initial={page.data}
      products={products.data}
      content={content.data}
      call={page.call}
      error={page.error}
    />
  );
}

function Builder({
  initial,
  products,
  content,
  call,
  error,
}: {
  initial: CatalogPage;
  products: AdminProduct[];
  content: SiteContent;
  call: Call;
  error: string;
}) {
  const [sections, setSections] = useState(initial.draft);
  const [meta, setMeta] = useState({
    hasChanges: initial.hasChanges,
    published: initial.published,
  });
  const [selected, setSelected] = useState<string | null>(
    initial.draft[0]?.id ?? null,
  );
  const [saveState, setSaveState] = useState<
    "saved" | "pending" | "saving" | "error"
  >("saved");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [dragged, setDragged] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Section[] | null>(null);

  async function flush() {
    window.clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return true;
    pending.current = null;
    setSaveState("saving");
    try {
      const saved = await call<CatalogPage>("/admin/catalog/page", {
        method: "PUT",
        body: JSON.stringify({ sections: next }),
      });
      setMeta({ hasChanges: saved.hasChanges, published: saved.published });
      setSaveState("saved");
      return true;
    } catch {
      // Keep the edits pending (newer ones win) so Publish and leaving the tab retry them; no timer, so no retry loop
      pending.current ??= next;
      setSaveState("error");
      return false;
    }
  }

  // Save anything still pending when the admin leaves the tab
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(next: Section[]) {
    setSections(next);
    pending.current = next;
    setSaveState("pending");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 800);
  }
  const replace = (s: Section) =>
    update(sections.map((x) => (x.id === s.id ? s : x)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    next.splice(to, 0, ...next.splice(from, 1));
    update(next);
  };

  async function publish() {
    setBusy(true);
    try {
      if (!(await flush())) return;
      const result = await call<CatalogPage>("/admin/catalog/page/publish", {
        method: "POST",
      });
      setMeta({ hasChanges: result.hasChanges, published: result.published });
    } catch {
      // error is shown by useAdmin
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    if (!confirm("Throw away your draft and go back to the published page?"))
      return;
    window.clearTimeout(timer.current);
    pending.current = null;
    setBusy(true);
    try {
      const result = await call<CatalogPage>("/admin/catalog/page/discard", {
        method: "POST",
      });
      setSections(result.draft);
      setMeta({ hasChanges: result.hasChanges, published: result.published });
      setSaveState("saved");
      setSelected(result.draft[0]?.id ?? null);
    } catch {
      // error is shown by useAdmin
    } finally {
      setBusy(false);
    }
  }

  // The preview shows drafts so the admin sees exactly what publishing will produce
  const previewProducts: PublicProduct[] = products.flatMap(
    ({ id, draft: { visible, ...data } }) => (visible ? [{ id, ...data }] : []),
  );
  const current = sections.find((s) => s.id === selected) ?? null;
  const status = {
    saved: meta.hasChanges
      ? "Draft saved · not published yet"
      : "Published · up to date",
    pending: "Unsaved changes…",
    saving: "Saving…",
    error: "Couldn't save the draft",
  }[saveState];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p
          role="status"
          className={`text-sm ${saveState === "error" ? "text-red-600" : "text-stone-500"}`}
        >
          {status}
          {/* Any failed save, publish or discard; cleared by the next successful call */}
          {error && <span className="text-red-600"> · {error}</span>}
        </p>
        <div
          role="radiogroup"
          aria-label="Preview size"
          className="ml-auto flex rounded-full bg-white p-1 text-sm shadow-sm"
        >
          {(["desktop", "phone"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={device === d}
              onClick={() => setDevice(d)}
              className={`cursor-pointer rounded-full px-4 py-1 capitalize ${device === d ? "bg-foreground text-background" : "text-stone-600"}`}
            >
              {d}
            </button>
          ))}
        </div>
        <a href="/catalog" target="_blank" className="btn-ghost">
          View live page
        </a>
        {meta.published && meta.hasChanges && (
          <button
            type="button"
            disabled={busy}
            onClick={discard}
            className="btn-ghost"
          >
            Discard draft
          </button>
        )}
        <button
          type="button"
          disabled={busy || (!meta.hasChanges && saveState === "saved")}
          onClick={publish}
          className="btn"
        >
          {busy ? "Working…" : "Publish"}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        {/* Section list */}
        <div className="card flex flex-col gap-2 p-3 xl:h-[calc(100dvh-260px)] xl:min-h-[520px] xl:overflow-y-auto">
          <p className="px-1 text-sm font-medium">Sections</p>
          <ol className="space-y-1.5">
            {sections.map((s, i) => (
              <li
                key={s.id}
                draggable
                onDragStart={() => setDragged(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragged !== null && move(dragged, i)}
                onDragEnd={() => setDragged(null)}
                className={`flex flex-wrap items-center gap-x-1 rounded-lg border px-2 py-1.5 text-sm ${selected === s.id ? "border-accent-ink bg-stone-100" : "border-stone-200 bg-white"} ${dragged === i ? "opacity-50" : ""}`}
              >
                <span aria-hidden className="cursor-grab text-stone-400">
                  <Icon name="grip" />
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(s.id)}
                  className={`min-w-0 flex-1 cursor-pointer truncate py-0.5 text-left ${s.hidden ? "text-stone-400 line-through" : ""}`}
                >
                  {sectionLabel(s)}
                </button>
                {/* Actions on their own row so names never truncate in the narrow column */}
                <span className="flex basis-full justify-end">
                  <IconButton
                    label={
                      s.hidden
                        ? `Show ${sectionLabel(s)}`
                        : `Hide ${sectionLabel(s)}`
                    }
                    onClick={() => replace({ ...s, hidden: !s.hidden })}
                  >
                    <Icon name={s.hidden ? "eye-off" : "eye"} />
                  </IconButton>
                  <IconButton
                    label={`Move ${sectionLabel(s)} up`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <Icon name="arrow-up" />
                  </IconButton>
                  <IconButton
                    label={`Move ${sectionLabel(s)} down`}
                    disabled={i === sections.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <Icon name="arrow-down" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${sectionLabel(s)}`}
                    onClick={() => {
                      if (!confirm(`Delete the ${sectionLabel(s)} section?`))
                        return;
                      update(sections.filter((x) => x.id !== s.id));
                      if (selected === s.id) setSelected(null);
                    }}
                  >
                    <Icon name="x" />
                  </IconButton>
                </span>
              </li>
            ))}
          </ol>
          {sections.length < 30 && (
            <details className="group mt-1">
              <summary className="btn-ghost w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                + Add section
              </summary>
              <div className="mt-1 space-y-1 rounded-lg border border-stone-200 bg-white p-1">
                {NEW_SECTIONS.map((n) => (
                  <button
                    key={n.label}
                    type="button"
                    onClick={(e) => {
                      const s = newSection(n.type, n.productType);
                      update([...sections, s]);
                      setSelected(s.id);
                      e.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                    }}
                    className="block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-stone-100"
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </details>
          )}
          <p className="mt-auto px-1 pt-2 text-xs text-stone-500">
            Drag to reorder. Click a section in the preview to edit it.
          </p>
        </div>

        {/* Live preview */}
        <PreviewFrame device={device}>
          {sections.some((s) => !s.hidden) ? (
            <CatalogSections
              sections={sections}
              products={previewProducts}
              settings={content.settings}
              preview
              selected={selected}
              onSelect={setSelected}
            />
          ) : (
            <p className="p-16 text-center text-stone-500">
              The page is empty. Add a section to get started.
            </p>
          )}
        </PreviewFrame>

        {/* Settings for the selected section */}
        <div className="card p-4 xl:h-[calc(100dvh-260px)] xl:min-h-[520px] xl:overflow-y-auto">
          {current ? (
            <>
              <h2 className="font-display mb-4 text-xl">
                {sectionLabel(current)}
              </h2>
              <SectionForm
                section={current}
                onChange={replace}
                products={products}
                upload={(f) => uploadImage(call, f)}
              />
            </>
          ) : (
            <p className="text-sm text-stone-500">
              Select a section to edit its settings.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-xs text-stone-500 hover:bg-stone-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

const DEVICE_WIDTH = { desktop: 1280, phone: 390 };

/**
 * Renders the preview inside an iframe so the page's responsive breakpoints follow the simulated device width,
 * scaled down to fit the column. Styles and font classes are copied from the admin page.
 */
function PreviewFrame({
  device,
  children,
}: {
  device: "desktop" | "phone";
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const width = DEVICE_WIDTH[device];
  const scale = Math.min(1, size.width / width);

  return (
    <div
      ref={box}
      className="relative h-[70dvh] min-h-[520px] overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 xl:h-[calc(100dvh-260px)]"
    >
      <iframe
        title="Catalog page preview"
        srcDoc="<!doctype html><html><head></head><body></body></html>"
        onLoad={(e) => {
          const doc = e.currentTarget.contentDocument;
          if (!doc) return;
          document.head
            .querySelectorAll('link[rel="stylesheet"], style')
            .forEach((n) => doc.head.appendChild(n.cloneNode(true)));
          doc.documentElement.className = document.documentElement.className;
          doc.body.className = "min-h-full bg-background text-foreground";
          setBody(doc.body);
        }}
        style={{
          width,
          height: size.height / scale,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          left: Math.max(0, (size.width - width * scale) / 2),
        }}
        className="absolute top-0 border-0 bg-background"
      />
      {body && createPortal(children, body)}
    </div>
  );
}
