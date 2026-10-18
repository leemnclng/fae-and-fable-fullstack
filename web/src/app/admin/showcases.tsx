"use client";

import { useState, type FormEvent } from "react";
import { fileUrl, formatDate, type Showcase, type ShowcaseDetail } from "@/lib/api";
import { resizeImage } from "@/lib/resize";
import { useAdmin, type AdminProps } from "./use-admin";
import { Icon } from "@/components/icon";

export function Showcases(props: AdminProps) {
  const { data: showcases, error, call, reload } = useAdmin<Showcase[]>("/showcases", props);
  const [editing, setEditing] = useState<ShowcaseDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [failed, setFailed] = useState<string[]>([]);

  async function edit(id: number) {
    setEditing(await call<ShowcaseDetail>(`/showcases/${id}`).catch(() => null));
  }

  // onSubmit (not action) so a failed save keeps everything the admin typed
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const fields = Object.fromEntries(["title", "eventDate", "location", "description"].map((k) => [k, String(form.get(k) ?? "")]));
    const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    setSaving(true);
    setFailed([]);
    try {
      let saved = await call<ShowcaseDetail>(editing ? `/admin/showcases/${editing.id}` : "/admin/showcases", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(fields),
      });
      // One resized photo per request keeps each upload under the host's request limit
      const failures: string[] = [];
      for (const [i, photo] of photos.entries()) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
        try {
          const body = new FormData();
          body.set("photo", await resizeImage(photo));
          saved = await call<ShowcaseDetail>(`/admin/showcases/${saved.id}/photos`, { method: "POST", body });
        } catch (err) {
          failures.push(`${photo.name}: ${(err as Error).message}`);
        }
      }
      setFailed(failures);
      // Keep a new post open for retrying if any photo failed; otherwise start a fresh form
      if (editing || failures.length) setEditing(saved);
      else formEl.reset();
      (formEl.elements.namedItem("photos") as HTMLInputElement).value = "";
      reload();
    } catch {
      // error is shown by useAdmin
    } finally {
      setSaving(false);
      setProgress("");
    }
  }

  async function removePhoto(photoId: number) {
    if (!editing || !confirm("Remove this photo from the public page?")) return;
    await call(`/admin/showcases/${editing.id}/photos/${photoId}`, { method: "DELETE" }).catch(() => {});
    edit(editing.id);
    reload();
  }

  async function remove(show: Showcase) {
    if (!confirm(`Delete "${show.title}" and its ${show.photoCount} photos from the public Events page?`)) return;
    await call(`/admin/showcases/${show.id}`, { method: "DELETE" }).catch(() => {});
    if (editing?.id === show.id) setEditing(null);
    reload();
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[380px_1fr]">
      <form key={editing?.id ?? "new"} onSubmit={save} className="card h-fit space-y-3 xl:sticky xl:top-28">
        <h2 className="font-display text-xl">{editing ? "Edit past event" : "Post a past event"}</h2>
        <p className="text-xs text-stone-500">
          Shown on the public Events page until you delete it. It has no guest uploads or client access.
        </p>
        <input name="title" defaultValue={editing?.title} placeholder="Title (e.g. Ana & Ben's Wedding)" required className="input" />
        <label className="block text-sm text-stone-600">
          Event date
          <input name="eventDate" type="date" defaultValue={editing?.eventDate} required className="input mt-1" />
        </label>
        <input name="location" defaultValue={editing?.location} placeholder="Venue / city (optional)" className="input" />
        <textarea name="description" defaultValue={editing?.description} placeholder="The story: theme, highlights, a kind word from the client…" rows={5} className="input" />
        <label className="block text-sm text-stone-600">
          {editing ? "Add more photos" : "Photos"} <span className="text-stone-500">(first photo is the cover)</span>
          <input name="photos" type="file" accept="image/*" multiple className="mt-1 block w-full text-sm" />
        </label>

        {editing && editing.photos.length > 0 && (
          <ul className="grid grid-cols-4 gap-1.5">
            {editing.photos.map((photo, i) => (
              <li key={photo.id} className="group relative aspect-square overflow-hidden bg-stone-100">
                <img src={fileUrl(photo.file)} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute top-1 right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/90 text-xs text-red-600 shadow"
                >
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {progress && <p className="text-sm text-stone-600" role="status">{progress}</p>}
        {failed.length > 0 && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
            {failed.length} {failed.length === 1 ? "photo wasn't" : "photos weren't"} added. Choose {failed.length === 1 ? "it" : "them"} again to retry:
            <ul className="mt-1 list-disc pl-5">
              {failed.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          <button disabled={saving} className="btn flex-1">{saving ? "Saving…" : editing ? "Save changes" : "Publish"}</button>
          {editing && (
            <button type="button" onClick={() => setEditing(null)} className="btn-ghost">
              Done
            </button>
          )}
        </div>
      </form>

      <div>
        {showcases?.length === 0 && <p className="text-stone-500">No past events posted yet.</p>}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {showcases?.map((show) => (
            <li key={show.id} className={`card overflow-hidden p-0 ${editing?.id === show.id ? "ring-2 ring-accent-ink" : ""}`}>
              <div className="aspect-4/3 bg-stone-100">
                {show.cover && <img src={fileUrl(show.cover)} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="space-y-2 p-4">
                <p className="font-medium">{show.title}</p>
                <p className="text-xs text-stone-500">
                  {formatDate(show.eventDate)} · {show.photoCount} photos
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => edit(show.id)} className="btn-ghost px-3 py-0.5 text-xs">Edit</button>
                  <a href={`/events/${show.id}`} target="_blank" className="btn-ghost px-3 py-0.5 text-xs">View</a>
                  <button onClick={() => remove(show)} className="btn-ghost px-3 py-0.5 text-xs text-red-600">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
