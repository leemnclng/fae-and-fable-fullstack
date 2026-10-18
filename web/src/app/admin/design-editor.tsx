"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { GuestView, PANELS, type GuestStep } from "@/components/guest-view";
import { API, formatDate, type EventItem, type GuestDesign, type PanelStyle } from "@/lib/api";

const STEPS: { key: GuestStep; label: string }[] = [
  { key: "passcode", label: "Passcode" },
  { key: "upload", label: "Upload" },
  { key: "thanks", label: "Thank you" },
];
const SWATCHES = ["#f4c2c2", "#e0457b", "#b5546f", "#c9a227", "#7c9a7e", "#6b7fd7", "#4a1d33", "#1f2937"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Full-screen editor for one event's guest upload page, with a live, clickable phone preview. */
export function DesignEditor({
  event,
  save,
  onClose,
}: {
  event: EventItem;
  save: (form: FormData) => Promise<GuestDesign>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(event.design.title ?? "");
  const [dateText, setDateText] = useState(event.design.dateText ?? "");
  const [hideDate, setHideDate] = useState(!!event.design.hideDate);
  const [message, setMessage] = useState(event.design.message ?? "");
  const [uploadMessage, setUploadMessage] = useState(event.design.uploadMessage ?? "");
  const [thanks, setThanks] = useState(event.design.thanks ?? "");
  const [color, setColor] = useState(event.design.color ?? "#f4c2c2");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreview, setBgPreview] = useState(event.design.background ? API + event.design.background : null);
  const [removeBg, setRemoveBg] = useState(false);
  const [showWall, setShowWall] = useState(event.design.showWall !== false);
  const [showMessages, setShowMessages] = useState(!!event.design.showMessages);
  const [panel, setPanel] = useState<PanelStyle>(event.design.panel ?? "glass");
  const [photoLimit, setPhotoLimit] = useState(event.design.photoLimit?.toString() ?? "");
  const [step, setStep] = useState<GuestStep>("passcode");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  // Free local preview URLs once they're replaced; server URLs need no cleanup
  useEffect(() => () => void (bgPreview?.startsWith("blob:") && URL.revokeObjectURL(bgPreview)), [bgPreview]);

  const design: GuestDesign = { photoLimit: photoLimit === "" ? undefined : Number(photoLimit), title, dateText, hideDate, message, uploadMessage, thanks, color, background: bgPreview, showWall, panel, showMessages };

  async function submit() {
    const form = new FormData();
    Object.entries({ photoLimit, title, dateText, hideDate: String(hideDate), message, uploadMessage, thanks, color, showWall: String(showWall), panel, showMessages: String(showWall && showMessages) }).forEach(([k, v]) => form.set(k, v));
    if (bgFile) form.set("background", bgFile);
    else if (removeBg) form.set("removeBackground", "true");
    setSaving(true);
    setStatus("");
    try {
      const saved = await save(form);
      setBgPreview(saved.background ? API + saved.background : null);
      setBgFile(null);
      setRemoveBg(false);
      setStatus("Saved. Guests see the new design now.");
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={`Design guest page for ${event.name}`}
      className="m-auto h-[min(96dvh,1100px)] w-[min(98vw,1600px)] max-w-none overflow-hidden rounded-2xl bg-background p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      {/* Not a <form>: the live preview renders the guest page, which has its own form, and forms can't nest */}
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-display truncate text-2xl">Design guest page</h2>
            <p className="truncate text-sm text-stone-500">{event.name} · what guests see after scanning the QR</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={event.guestUrl} target="_blank" className="btn-ghost hidden sm:inline-flex">Open live page</a>
            <button type="button" onClick={() => dialog.current?.close()} className="btn-ghost">Close</button>
            <button type="button" onClick={submit} disabled={saving} className="btn">{saving ? "Saving…" : "Save design"}</button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_480px]">
          {/* Settings */}
          <div className="space-y-6 overflow-y-auto p-6">
            <Field label="Headline" hint={`Defaults to the event name, "${event.name}"`}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={event.name} className="input" />
            </Field>
            <Field label="Date line" hint={`Shown under the headline. Defaults to ${formatDate(event.eventDate)}; display only, it doesn't change the event date or when photos are deleted.`}>
              <input
                value={dateText}
                onChange={(e) => setDateText(e.target.value)}
                maxLength={80}
                disabled={hideDate}
                placeholder={formatDate(event.eventDate)}
                className="input disabled:opacity-50"
              />
              <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm text-stone-600">
                <input type="checkbox" checked={hideDate} onChange={(e) => setHideDate(e.target.checked)} className="h-4 w-4 accent-accent-ink" />
                Hide the date line
              </label>
            </Field>
            <Field label="Passcode screen message" hint="The first thing guests read after scanning the QR. Leave empty to use the default shown.">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onFocus={() => setStep("passcode")}
                maxLength={600}
                rows={3}
                placeholder="Snapped something fun at the mirror? Share it with the hosts!"
                className="input"
              />
            </Field>
            <Field label="Upload screen message" hint="Shown above the upload area once the passcode is entered">
              <textarea
                value={uploadMessage}
                onChange={(e) => setUploadMessage(e.target.value)}
                onFocus={() => setStep("upload")}
                maxLength={600}
                rows={3}
                placeholder="Add the photos you took. The hosts will love them."
                className="input"
              />
            </Field>
            <Field label="Thank-you message" hint="Shown after a guest uploads">
              <textarea value={thanks} onChange={(e) => setThanks(e.target.value)} onFocus={() => setStep("thanks")} maxLength={300} rows={2} placeholder="Thank you! Your moments are on their way to the hosts." className="input" />
            </Field>

            <Field label="Accent color" hint="Buttons, upload area and highlights">
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setColor(s)}
                    aria-label={`Use color ${s}`}
                    aria-pressed={color.toLowerCase() === s}
                    style={{ background: s }}
                    className={`h-9 w-9 cursor-pointer rounded-full border-2 transition ${color.toLowerCase() === s ? "scale-110 border-foreground" : "border-white shadow"}`}
                  />
                ))}
                <label className="ml-2 flex items-center gap-2 text-sm text-stone-600">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-stone-300 bg-white" />
                  <span className="font-mono">{color}</span>
                </label>
              </div>
            </Field>

            <Field label="Background photo" hint="Tip: a soft, uncluttered photo of the venue or couple works best">
              <div className="flex items-center gap-4">
                <div className="h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                  {bgPreview && <img src={bgPreview} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="btn-ghost cursor-pointer">
                    {bgPreview ? "Replace" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setBgFile(file);
                        setRemoveBg(false);
                        setBgPreview(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                  {bgPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setBgFile(null);
                        setBgPreview(null);
                        setRemoveBg(true);
                      }}
                      className="btn-ghost text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </Field>

            <Field label="Card style" hint="How the title card and photo wall sit on the background">
              <div
                role="radiogroup"
                aria-label="Card style"
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                style={{ "--g-soft": `color-mix(in srgb, ${color} 22%, white)` } as CSSProperties}
              >
                {(Object.keys(PANELS) as PanelStyle[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={panel === key}
                    onClick={() => setPanel(key)}
                    className={`cursor-pointer rounded-xl border-2 p-1.5 text-sm transition ${panel === key ? "border-foreground" : "border-transparent hover:border-stone-300"}`}
                  >
                    <span
                      className="relative flex h-20 items-center justify-center overflow-hidden rounded-lg bg-cover bg-center"
                      style={{
                        backgroundImage: bgPreview
                          ? `url(${bgPreview})`
                          : `radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, ${color} 55%, white) 0%, #fff7f8 70%)`,
                      }}
                    >
                      <span className={`flex h-12 w-4/5 flex-col items-center justify-center gap-1 rounded-md shadow-md ${PANELS[key].className}`}>
                        <span className="h-1.5 w-1/2 rounded-full bg-foreground/70" />
                        <span className="h-1 w-1/3 rounded-full bg-foreground/30" />
                      </span>
                    </span>
                    <span className="mt-1.5 block">{PANELS[key].label}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Photos per guest" hint="Guests enter their name before sharing; each name can share up to this many photos. Empty = 30, 0 = no limit.">
              <input
                type="number"
                min={0}
                max={1000}
                value={photoLimit}
                onChange={(e) => setPhotoLimit(e.target.value)}
                onFocus={() => setStep("upload")}
                placeholder="30"
                className="input w-32"
              />
            </Field>

            <Field label="Photo wall" hint="After entering the passcode, guests see a live wall of everyone's photos. Unless you turn on notes below, guest names and notes are never shown there; notes go only to the client.">
              <label className="flex w-fit cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" checked={showWall} onChange={(e) => setShowWall(e.target.checked)} className="h-4 w-4 accent-accent-ink" />
                Show guests each other&apos;s photos
              </label>
              {showWall && (
                <label className="mt-3 flex w-fit cursor-pointer items-start gap-3 text-sm">
                  <input type="checkbox" checked={showMessages} onChange={(e) => setShowMessages(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent-ink" />
                  <span>
                    Show guests&apos; notes beside their photos
                    <span className="block text-xs text-stone-500">Only with the client&apos;s OK. Every note shows, including ones written before you turn this on; guests writing new notes are told they may appear.</span>
                  </span>
                </label>
              )}
            </Field>

            <p role="status" className={`text-sm ${status.startsWith("Saved") ? "text-green-700" : "text-red-600"}`}>{status}</p>
          </div>

          {/* Live preview */}
          <div className="flex flex-col items-center gap-4 overflow-y-auto border-t border-stone-200 bg-stone-100 p-6 md:border-t-0 md:border-l">
            <div role="tablist" aria-label="Preview screen" className="flex rounded-full bg-white p-1 text-sm shadow-sm">
              {STEPS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={step === s.key}
                  onClick={() => setStep(s.key)}
                  className={`cursor-pointer rounded-full px-4 py-1.5 transition-colors ${step === s.key ? "bg-foreground text-background" : "text-stone-600 hover:text-foreground"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="h-[740px] w-[370px] shrink-0 overflow-hidden rounded-[2.5rem] border-[10px] border-foreground bg-white shadow-xl">
              <GuestView
                key={step}
                framed
                event={{ name: event.name, eventDate: event.eventDate }}
                design={design}
                initialStep={step}
                // Preview is clickable but never uploads: any passcode works and uploads are simulated
                onUnlock={async () => {
                  await sleep(400);
                  setStep("upload");
                }}
                wall={showWall ? [] : null}
                guest={{ name: "Guest name", uploaded: 0, limit: photoLimit === "" ? 30 : Number(photoLimit) || null }}
                onUpload={async (_files, _note, onProgress) => {
                  for (let p = 0; p <= 1; p += 0.1) {
                    onProgress(p);
                    await sleep(80);
                  }
                }}
              />
            </div>
            <p className="text-center text-xs text-stone-500">Preview only: try it out, nothing is uploaded.</p>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="mb-2 text-xs text-stone-500">{hint}</p>
      {children}
    </div>
  );
}
