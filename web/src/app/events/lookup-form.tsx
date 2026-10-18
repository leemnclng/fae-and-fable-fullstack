"use client";

import { useState } from "react";
import { api, formatDate, type ClientEvent } from "@/lib/api";

export function LookupForm() {
  const [events, setEvents] = useState<ClientEvent[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup(form: FormData) {
    setLoading(true);
    setError("");
    try {
      setEvents(await api<ClientEvent[]>("/events/lookup", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }));
    } catch (e) {
      setEvents(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* onSubmit, not action: React resets action forms, which would wipe the email after a wrong code */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup(new FormData(e.currentTarget));
        }}
        className="space-y-4"
      >
        <label className="block text-sm text-stone-600">
          Email you booked with
          <input name="email" type="email" required autoComplete="email" className="input mt-1 py-3 text-base" />
        </label>
        <label className="block text-sm text-stone-600">
          Client code
          <input
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="e.g. K7M2QX"
            className="input mt-1 py-3 font-mono text-base tracking-widest uppercase"
          />
        </label>
        <button disabled={loading} className="btn w-full py-3 text-base sm:w-auto sm:px-10">
          {loading ? "Finding…" : "Find my gallery"}
        </button>
        <p role="alert" className="min-h-5 text-sm text-red-600">{error}</p>
      </form>

      {events && (
        <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
          {events.map((event) => (
            <li key={event.clientPath} className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div>
                <p className="font-display text-2xl">{event.name}</p>
                <p className="text-sm text-stone-500">
                  {formatDate(event.eventDate)} · {event.photoCount} photo{event.photoCount === 1 ? "" : "s"} · available until {formatDate(event.expiresAt)}
                </p>
              </div>
              <a href={event.clientPath} className="btn">Open gallery</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
