"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { fileUrl, type AdminProduct, type ProductData } from "@/lib/api";
import { useAdmin, type AdminProps } from "../use-admin";
import { Icon } from "@/components/icon";
import { resizeImage } from "@/lib/resize";

type Call = ReturnType<typeof useAdmin>["call"];

const STATUS: Record<AdminProduct["status"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-stone-100 text-stone-600" },
  published: { label: "Published", className: "bg-green-100 text-green-800" },
  changed: { label: "Unpublished changes", className: "bg-amber-100 text-amber-800" },
};
const EMPTY: ProductData = { name: "", type: "mirror", price: "", description: "", inclusions: [], photos: [], visible: true };

/** Uploads one image for the catalog and returns the stored file name. */
export async function uploadImage(call: Call, file: File) {
  const form = new FormData();
  form.set("image", await resizeImage(file));
  return (await call<{ file: string }>("/admin/catalog/uploads", { method: "POST", body: form })).file;
}

/** Mirrors and packages: a reorderable card grid, each opening an editor with draft / publish controls. */
export function ProductsTab(props: AdminProps) {
  const { data, error, call, reload } = useAdmin<AdminProduct[]>("/admin/catalog/products", props);
  const [editing, setEditing] = useState<{ product: AdminProduct | null } | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);

  async function reorder(ids: number[]) {
    await call("/admin/catalog/products/order", { method: "PUT", body: JSON.stringify({ ids }) }).catch(() => {});
    reload();
  }
  const move = (from: number, to: number) => {
    if (!data || to < 0 || to >= data.length) return;
    const ids = data.map((p) => p.id);
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder(ids);
  };

  if (!data) return <p className="text-stone-500">{error || "Loading…"}</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Drag cards (or use the arrows) to set the order they appear in on the site. Edits stay as drafts until you publish them.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {data.map((p, i) => (
          <li
            key={p.id}
            draggable
            onDragStart={() => setDragged(i)}
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={() => dragged !== null && move(dragged, i)}
            onDragEnd={() => setDragged(null)}
            className={`card flex flex-col overflow-hidden p-0 transition ${dragged === i ? "opacity-50" : ""}`}
          >
            <button type="button" onClick={() => setEditing({ product: p })} className="block cursor-pointer text-left">
              {p.draft.photos[0] ? (
                <img src={fileUrl(p.draft.photos[0])} alt="" className="aspect-4/3 w-full object-cover" />
              ) : (
                <div className="aspect-4/3 bg-linear-to-br from-accent to-background" />
              )}
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS[p.status].className}`}>{STATUS[p.status].label}</span>
                  <span className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs capitalize">{p.draft.type}</span>
                  {!p.draft.visible && <span className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs">Hidden</span>}
                </div>
                <p className="font-medium">{p.draft.name}</p>
                {p.draft.price && <p className="text-sm text-accent-ink">{p.draft.price}</p>}
              </div>
            </button>
            <div className="mt-auto flex items-center justify-between border-t border-stone-100 px-4 py-2 text-sm">
              <button type="button" onClick={() => setEditing({ product: p })} className="cursor-pointer text-accent-ink hover:underline">
                Edit
              </button>
              <span className="flex gap-1">
                <button type="button" aria-label={`Move ${p.draft.name} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)} className="btn-ghost px-2 py-0.5">
                  <Icon name="arrow-up" />
                </button>
                <button type="button" aria-label={`Move ${p.draft.name} later`} disabled={i === data.length - 1} onClick={() => move(i, i + 1)} className="btn-ghost px-2 py-0.5">
                  <Icon name="arrow-down" />
                </button>
              </span>
            </div>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setEditing({ product: null })}
            className="flex h-full min-h-48 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 text-stone-600 transition-colors hover:border-accent-ink hover:text-foreground"
          >
            <span className="text-3xl leading-none">+</span>
            Add product
          </button>
        </li>
      </ul>
      {editing && (
        <ProductEditor
          product={editing.product}
          call={call}
          onClose={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function ProductEditor({ product, call, onClose }: { product: AdminProduct | null; call: Call; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState(product);
  const [draft, setDraft] = useState<ProductData>(product?.draft ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof ProductData>(key: K, value: ProductData[K]) => setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const save = async () => {
    const saved = await call<AdminProduct>(current ? `/admin/catalog/products/${current.id}` : "/admin/catalog/products", {
      method: current ? "PUT" : "POST",
      body: JSON.stringify({ draft }),
    });
    setCurrent(saved);
    return saved;
  };
  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={product ? `Edit ${product.draft.name}` : "Add product"}
      className="m-auto max-h-[92dvh] w-[min(96vw,720px)] max-w-none overflow-hidden rounded-2xl bg-background p-0 shadow-2xl backdrop:bg-black/50"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await save();
            close();
          });
        }}
        className="flex max-h-[92dvh] flex-col"
      >
        <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-6 py-4">
          <div>
            <h2 className="font-display text-2xl">{product ? "Edit product" : "Add product"}</h2>
            {current && <p className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs ${STATUS[current.status].className}`}>{STATUS[current.status].label}</p>}
          </div>
          <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-stone-500 hover:bg-stone-100">
            <Icon name="x" />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto p-6">
          <div role="radiogroup" aria-label="Product type" className="flex w-fit rounded-full bg-white p-1 text-sm shadow-sm">
            {(["mirror", "package"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={draft.type === t}
                onClick={() => set("type", t)}
                className={`cursor-pointer rounded-full px-4 py-1.5 capitalize ${draft.type === t ? "bg-foreground text-background" : "text-stone-600"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="block text-sm text-stone-600">
            Name
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} placeholder="Classic Gold" className="input mt-1" />
          </label>
          <label className="block text-sm text-stone-600">
            Price
            <input value={draft.price} onChange={(e) => set("price", e.target.value)} maxLength={60} placeholder="from ₱15,000" className="input mt-1" />
          </label>
          <label className="block text-sm text-stone-600">
            Description
            <textarea value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={3000} rows={4} className="input mt-1" />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm text-stone-600">What&apos;s included</legend>
            {draft.inclusions.map((inc, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={inc}
                  onChange={(e) => set("inclusions", draft.inclusions.map((x, j) => (j === i ? e.target.value : x)))}
                  maxLength={200}
                  aria-label={`Inclusion ${i + 1}`}
                  className="input"
                />
                <button type="button" aria-label={`Remove inclusion ${i + 1}`} onClick={() => set("inclusions", draft.inclusions.filter((_, j) => j !== i))} className="btn-ghost px-3">
                  <Icon name="x" />
                </button>
              </div>
            ))}
            {draft.inclusions.length < 30 && (
              <button type="button" onClick={() => set("inclusions", [...draft.inclusions, ""])} className="btn-ghost">
                + Add inclusion
              </button>
            )}
          </fieldset>

          <div>
            <p className="mb-2 text-sm text-stone-600">Photos (the first one is the cover)</p>
            <PhotoPicker value={draft.photos} onChange={(photos) => set("photos", photos)} upload={(f) => uploadImage(call, f)} max={20} />
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={draft.visible} onChange={(e) => set("visible", e.target.checked)} className="h-4 w-4 accent-accent-ink" />
            Visible on the site
          </label>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-stone-200 bg-white px-6 py-4">
          {current && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                confirm(`Delete "${current.draft.name}"? It is removed from the site immediately.`) &&
                run(async () => {
                  await call(`/admin/catalog/products/${current.id}`, { method: "DELETE" });
                  close();
                })
              }
              className="btn-ghost text-red-600"
            >
              Delete
            </button>
          )}
          {current?.status === "changed" && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                confirm("Throw away your changes and go back to the published version?") &&
                run(async () => {
                  const restored = await call<AdminProduct>(`/admin/catalog/products/${current.id}/discard`, { method: "POST" });
                  setCurrent(restored);
                  setDraft(restored.draft);
                })
              }
              className="btn-ghost"
            >
              Discard changes
            </button>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <span className="ml-auto flex gap-2">
            <button disabled={busy} className="btn-ghost">
              Save draft
            </button>
            <button
              type="button"
              disabled={busy || !draft.name.trim()}
              onClick={() =>
                run(async () => {
                  const saved = await save();
                  await call(`/admin/catalog/products/${saved.id}/publish`, { method: "POST" });
                  close();
                })
              }
              className="btn"
            >
              Publish
            </button>
          </span>
        </footer>
      </form>
    </dialog>
  );
}

/** Ordered photo list with upload, remove and reorder. `max={1}` makes it a single-image field. */
export function PhotoPicker({
  value,
  onChange,
  upload,
  max = 20,
}: {
  value: string[];
  onChange: (files: string[]) => void;
  upload: (file: File) => Promise<string>;
  max?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(files: FileList) {
    setBusy(true);
    setError("");
    const added: string[] = [];
    try {
      // A single-photo field replaces its photo, so it always has room for one
      const room = max === 1 ? 1 : max - value.length;
      for (const f of [...files].slice(0, room)) added.push(await upload(f));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (added.length) onChange(max === 1 ? added.slice(0, 1) : [...value, ...added]);
    }
  }
  const swap = (i: number, j: number) => {
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {value.map((f, i) => (
          <li key={f} className="group relative h-24 w-24 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
            <img src={fileUrl(f)} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 text-white">
              {max > 1 ? (
                <span className="flex">
                  <button type="button" aria-label="Move photo earlier" disabled={i === 0} onClick={() => swap(i, i - 1)} className="cursor-pointer px-1.5 disabled:opacity-30">
                    <Icon name="arrow-left" />
                  </button>
                  <button type="button" aria-label="Move photo later" disabled={i === value.length - 1} onClick={() => swap(i, i + 1)} className="cursor-pointer px-1.5 disabled:opacity-30">
                    <Icon name="arrow-right" />
                  </button>
                </span>
              ) : (
                <span />
              )}
              <button type="button" aria-label="Remove photo" onClick={() => onChange(value.filter((_, j) => j !== i))} className="cursor-pointer px-1.5">
                <Icon name="x" />
              </button>
            </div>
          </li>
        ))}
        {(value.length < max || max === 1) && (
          <li>
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-300 text-xs text-stone-600 hover:border-accent-ink">
              <span className="text-xl leading-none">{busy ? "…" : "+"}</span>
              {busy ? "Uploading" : max === 1 && value.length ? "Replace" : "Add photo"}
              <input
                type="file"
                accept="image/*"
                multiple={max > 1}
                disabled={busy}
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files?.length) add(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
