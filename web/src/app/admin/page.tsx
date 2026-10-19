"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useStoredValue } from "@/lib/storage";
import { Catalog } from "./catalog";
import { Events } from "./events";
import { SettingsForm } from "./settings";
import { Showcases } from "./showcases";
import { Wordmark } from "@/components/wordmark";

const TOKEN_KEY = "ff_admin_token";

// Lucide-style 24px stroke icons
const ICONS = {
  events: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01",
  showcases: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 15l5-5 4 4 3-3 6 6M15 9h.01",
  catalog: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  site: "M7 17 17 7M7 7h10v10",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
} as const;

const SECTIONS = {
  events: { label: "Client links", description: "Create events, share QR codes and passcodes, and send clients their private gallery." },
  showcases: { label: "Past events", description: "Publish highlights from finished events on the public Events page." },
  catalog: { label: "Catalog", description: "Mirrors, packages and the catalog page. Changes go live when you publish." },
  settings: { label: "Site settings", description: "Homepage banner and business details shown across the public site." },
} as const;
type Section = keyof typeof SECTIONS;

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0 fill-none stroke-current stroke-[1.75]`} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function AdminPage() {
  const [token, setToken] = useStoredValue(TOKEN_KEY);
  // Remember the open section across refreshes
  const [stored, setSection] = useStoredValue("ff_admin_section", "session");
  const section: Section = stored && stored in SECTIONS ? (stored as Section) : "events";

  // stable identity: useAdmin reloads whenever this changes
  const logout = useCallback(() => setToken(null), [setToken]);

  if (!token) {
    return <Login onLogin={setToken} />;
  }

  const props = { token, onUnauthorized: logout };
  const navItem = (active: boolean) =>
    `flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent-ink ${
      active ? "bg-accent/50 font-medium text-foreground" : "text-stone-600 hover:bg-stone-100 hover:text-foreground"
    }`;

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <aside className="sticky top-0 z-20 flex shrink-0 flex-col border-b border-stone-200 bg-white lg:h-dvh lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-6">
          <div>
            <Wordmark className="h-10 w-auto lg:h-auto lg:w-full" />
            <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-stone-500">Admin</p>
          </div>
          <button onClick={logout} className={`${navItem(false)} lg:hidden`} aria-label="Log out">
            <Icon d={ICONS.logout} />
          </button>
        </div>
        <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
          {(Object.keys(SECTIONS) as Section[]).map((key) => (
            <button key={key} onClick={() => setSection(key)} aria-current={section === key ? "page" : undefined} className={navItem(section === key)}>
              <Icon d={ICONS[key]} />
              {SECTIONS[key].label}
            </button>
          ))}
        </nav>
        <div className="hidden space-y-1 border-t border-stone-200 p-3 lg:block">
          <a href="/" target="_blank" className={navItem(false)}>
            <Icon d={ICONS.site} />
            View site
          </a>
          <button onClick={logout} className={`${navItem(false)} w-full`}>
            <Icon d={ICONS.logout} />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 bg-background/80 px-4 py-5 backdrop-blur md:px-8 lg:sticky lg:top-0 lg:z-10">
          <div>
            <h1 className="font-display text-2xl md:text-3xl">{SECTIONS[section].label}</h1>
            <p className="mt-1 text-sm text-stone-500">{SECTIONS[section].description}</p>
          </div>
          <a href="/" target="_blank" className="btn-ghost lg:hidden">View site</a>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          {section === "events" && <Events {...props} />}
          {section === "showcases" && <Showcases {...props} />}
          {section === "catalog" && <Catalog {...props} />}
          {section === "settings" && <SettingsForm {...props} />}
        </main>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [error, setError] = useState("");

  async function submit(form: FormData) {
    try {
      const { token } = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form)),
      });
      onLogin(token);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form action={submit} className="card w-full max-w-sm space-y-4">
        <h1 className="font-display text-2xl">Admin login</h1>
        <input name="email" type="email" placeholder="Email" required className="input" autoComplete="username" />
        <input name="password" type="password" placeholder="Password" required className="input" autoComplete="current-password" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn w-full">Log in</button>
      </form>
    </main>
  );
}
