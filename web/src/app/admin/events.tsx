"use client";

import { useState } from "react";
import { formatDate, type EventItem, type GuestDesign } from "@/lib/api";
import { DesignEditor } from "./design-editor";
import { useAdmin, type AdminProps } from "./use-admin";

export function Events(props: AdminProps) {
  const { data: events, error, call, reload } = useAdmin<EventItem[]>("/admin/events", props);
  const [saving, setSaving] = useState(false);
  const [designing, setDesigning] = useState<EventItem | null>(null);

  async function create(form: FormData) {
    setSaving(true);
    try {
      await call("/admin/events", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
      await reload();
    } catch {
      // error is shown by useAdmin
    } finally {
      setSaving(false);
    }
  }

  async function reschedule(event: EventItem, eventDate: string) {
    await call(`/admin/events/${event.id}`, { method: "PATCH", body: JSON.stringify({ eventDate }) });
    await reload();
  }

  async function togglePublic(event: EventItem) {
    await call(`/admin/events/${event.id}`, { method: "PATCH", body: JSON.stringify({ isPublic: !event.isPublic }) }).catch(() => {});
    reload();
  }

  async function remove(event: EventItem) {
    if (!confirm(`Delete "${event.name}" and all ${event.photoCount} uploaded photos? This cannot be undone.`)) return;
    await call(`/admin/events/${event.id}`, { method: "DELETE" }).catch(() => {});
    reload();
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[360px_1fr]">
      <form action={create} className="card h-fit space-y-3 xl:sticky xl:top-28">
        <h2 className="font-display text-xl">New client event</h2>
        <input name="name" placeholder="Event name (e.g. Ana & Ben's Wedding)" required className="input" />
        <input name="clientName" placeholder="Client name" required className="input" />
        <input name="clientEmail" type="email" placeholder="Client email (optional)" className="input" />
        <label className="block text-sm text-stone-600">
          Event date
          <input name="eventDate" type="date" required className="input mt-1" />
        </label>
        <input name="passcode" placeholder="Guest passcode (blank = auto)" className="input" />
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input name="isPublic" type="checkbox" value="true" className="h-4 w-4 accent-accent-ink" />
          List on the public Events page
        </label>
        <p className="text-xs text-stone-500">Links and photos are deleted automatically 15 days after the event date.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={saving} className="btn w-full">{saving ? "Creating…" : "Create links"}</button>
      </form>

      <div className="grid gap-4 2xl:grid-cols-2">
        {events?.length === 0 && <p className="text-stone-500">No events yet.</p>}
        {events?.map((event) => (
          <article key={event.id} className="card flex flex-col gap-5 sm:flex-row">
            <div className="shrink-0 text-center">
              <img src={event.qr} alt={`Guest QR for ${event.name}`} className="h-40 w-40 rounded-lg border border-stone-200" />
              <a href={event.qr} download={`${event.name}-qr.png`} className="mt-2 inline-block text-xs underline">Download QR</a>
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-xl">{event.name}</h3>
                  <p className="text-stone-500">
                    {event.clientName}
                    {event.clientEmail && ` · ${event.clientEmail}`}
                  </p>
                  <Reschedule event={event} onSave={(date) => reschedule(event, date)} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setDesigning(event)} className="btn-ghost">Design guest page</button>
                  <button onClick={() => remove(event)} className="btn-ghost text-red-600">Delete</button>
                </div>
              </div>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  Guest passcode: <span className="rounded bg-stone-100 px-2 py-0.5 font-mono tracking-widest">{event.passcode}</span>
                </span>
                <span title="Client enters this with their email on the Events page to find their gallery">
                  Client code: <span className="rounded bg-stone-100 px-2 py-0.5 font-mono tracking-widest">{event.clientCode ?? "—"}</span>
                </span>
                <span className="text-stone-500">{event.photoCount} photos</span>
              </p>
              {!event.clientEmail && <p className="text-xs text-stone-500">Add a client email to let the client find this event on the Events page.</p>}
              <label className="flex w-fit cursor-pointer items-center gap-2">
                <input type="checkbox" checked={event.isPublic} onChange={() => togglePublic(event)} className="h-4 w-4 accent-accent-ink" />
                Listed on public Events page
              </label>
              <LinkRow label="Guest upload link (QR)" url={event.guestUrl} />
              <LinkRow label="Client gallery link" url={event.clientUrl} />
              <p className="text-xs text-stone-500">Expires {formatDate(event.expiresAt)}</p>
            </div>
          </article>
        ))}
      </div>
      {designing && (
        <DesignEditor
          event={designing}
          onClose={() => setDesigning(null)}
          save={async (form) => {
            const design = await call<GuestDesign>(`/admin/events/${designing.id}/design`, { method: "PUT", body: form });
            reload();
            return design;
          }}
        />
      )}
    </div>
  );
}

/** Shows the event date with an inline date picker to move it; links expire 15 days after the new date. */
function Reschedule({ event, onSave }: { event: EventItem; onSave: (date: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!editing) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-2 text-stone-600">
        Event date: <span className="font-medium text-foreground">{formatDate(event.eventDate)}</span>
        <button type="button" onClick={() => setEditing(true)} className="cursor-pointer text-xs text-accent-ink underline underline-offset-2">
          Reschedule
        </button>
      </p>
    );
  }

  return (
    <form
      className="mt-2 space-y-1"
      onSubmit={async (e) => {
        e.preventDefault();
        const date = String(new FormData(e.currentTarget).get("eventDate"));
        if (date === event.eventDate) return setEditing(false);
        setBusy(true);
        setError("");
        try {
          await onSave(date);
          setEditing(false);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input name="eventDate" type="date" defaultValue={event.eventDate} required autoFocus aria-label="New event date" className="input w-auto py-1.5" />
        <button disabled={busy} className="btn px-4 py-1.5 text-xs">{busy ? "Saving…" : "Save date"}</button>
        <button type="button" onClick={() => setEditing(false)} className="btn-ghost px-3 py-1 text-xs">Cancel</button>
      </div>
      <p className="text-xs text-stone-500">Links and photos will be kept until 15 days after the new date.</p>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <div className="flex items-center gap-2">
        <a href={url} target="_blank" className="truncate text-accent-ink underline">{url}</a>
        <button
          type="button"
          className="btn-ghost shrink-0 px-3 py-0.5 text-xs"
          onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
