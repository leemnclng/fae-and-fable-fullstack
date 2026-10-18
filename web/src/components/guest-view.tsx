"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  formatDate,
  type GuestDesign,
  type PanelStyle,
  type WallPhoto,
} from "@/lib/api";
import { Gallery } from "./gallery";
import { Icon } from "@/components/icon";

export type GuestNote = { message: string };
/** The signed-in guest and their photo allowance (limit null = unlimited). */
export type GuestQuota = {
  name: string;
  uploaded: number;
  limit: number | null;
};

export type GuestStep = "passcode" | "upload" | "thanks";

type Props = {
  event: { name: string; eventDate: string };
  design: GuestDesign;
  initialStep: GuestStep;
  /** Resolves when the name + passcode are accepted; throws with a message otherwise. */
  onUnlock: (passcode: string, name: string) => Promise<void>;
  /** Who is sharing and how many photos they have left. */
  guest?: GuestQuota | null;
  /** "Not you?": forget this guest and ask for a name again. */
  onSwitchGuest?: () => void;
  /**
   * Shares the photos (one request each) plus an optional private note, reporting progress 0–1.
   * Resolves with the photos that couldn't be shared; throws only when nothing more can be sent (expired link or session).
   */
  onUpload: (
    files: File[],
    note: GuestNote,
    onProgress: (fraction: number) => void,
  ) => Promise<{ failed: { file: File; reason: string }[] }>;
  /** Everyone's photos once unlocked; null hides the wall (admin switched it off). */
  wall?: WallPhoto[] | null;
  /** Admin preview: fill the phone frame instead of the viewport. */
  framed?: boolean;
};

const DEFAULT_COLOR = "#f4c2c2";

/** Pane templates the admin picks from; shared with the design editor's swatches. */
export const PANELS: Record<PanelStyle, { label: string; className: string }> =
  {
    glass: {
      label: "Glass",
      className: "border border-white/60 bg-white/55 backdrop-blur-xl",
    },
    soft: { label: "Soft", className: "bg-white/75" },
    solid: { label: "Solid", className: "bg-white" },
    tint: {
      label: "Tinted",
      className: "border border-white/50 bg-(--g-soft)/85 backdrop-blur-md",
    },
  };
const MAX_MB = 50;
const ALLOWED = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

/** Readable text color (plum or white) for a button filled with `hex`. */
function inkFor(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#4a1d33" : "#ffffff";
}

type Picked = { file: File; url: string };

export function GuestView({
  event,
  design,
  initialStep,
  onUnlock,
  onUpload,
  framed,
  wall = null,
  guest = null,
  onSwitchGuest,
}: Props) {
  const color = design.color || DEFAULT_COLOR;
  const [step, setStep] = useState<GuestStep>(initialStep);
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [shared, setShared] = useState<Picked[]>([]);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");
  const [noteSent, setNoteSent] = useState(false);
  const urls = useRef(new Set<string>());
  const sheet = useRef<HTMLDialogElement>(null);
  // Once unlocked with a gallery, the page is just title + photos; sharing happens in a sheet
  const showWall = !!wall && step !== "passcode";

  const openSheet = () => {
    setError("");
    if (step === "thanks") setStep("upload");
    // Admin preview: non-modal so it stays inside the phone frame
    if (framed) sheet.current?.show();
    else sheet.current?.showModal();
  };

  // Free preview object URLs when the page goes away
  useEffect(
    () => () => urls.current.forEach((u) => URL.revokeObjectURL(u)),
    [],
  );

  const style = {
    "--g": color,
    "--g-ink": inkFor(color),
    "--g-soft": `color-mix(in srgb, ${color} 22%, white)`,
  } as CSSProperties;
  const pane = PANELS[design.panel ?? "glass"].className;
  const button =
    "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-(--g) px-6 py-3.5 text-base font-medium text-(--g-ink) shadow-sm transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";

  // Photos this guest can still add, after what's already picked
  const left =
    guest?.limit == null ? Infinity : Math.max(0, guest.limit - guest.uploaded);
  const room = left - picked.length;

  function add(files: FileList | File[]) {
    const list = [...files];
    const valid = list.filter(
      (f) => ALLOWED.test(f.name) && f.size <= MAX_MB * 1024 * 1024,
    );
    const ok = valid.slice(0, Math.max(0, room));
    setSkipped(list.length - valid.length);
    setError(
      ok.length < valid.length
        ? `You can add ${Math.max(0, room)} more ${room === 1 ? "photo" : "photos"}, so we kept the first ${ok.length}.`
        : "",
    );
    setPicked((p) => [
      ...p,
      ...ok.map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        return { file, url };
      }),
    ]);
  }

  async function unlock(passcode: string, name: string) {
    setBusy(true);
    setError("");
    try {
      await onUnlock(passcode, name);
      setStep("upload");
    } catch (e) {
      setError((e as Error).message);
      setShakeKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const { failed } = await onUpload(
        picked.map((p) => p.file),
        { message: note.trim() },
        setProgress,
      );
      const bad = new Set(failed.map((f) => f.file));
      setShared((s) => [...picked.filter((p) => !bad.has(p.file)), ...s]);
      // The note goes out first, so it's sent even when some photos fail
      setNoteSent(!!note.trim());
      setNote("");
      if (failed.length) {
        // Keep only the photos that failed, so retrying never shares the others twice
        setPicked(picked.filter((p) => bad.has(p.file)));
        setError(
          `${failed.length} of ${picked.length} ${picked.length === 1 ? "photo" : "photos"} couldn't be shared: ${failed[0].reason} Tap Share to try ${failed.length === 1 ? "it" : "them"} again.`,
        );
        return;
      }
      setPicked([]);
      setStep("thanks");
    } catch (e) {
      setError((e as Error).message);
      // Expired guest session: ask for the passcode again, keeping their picked files
      if ((e as { status?: number }).status === 401) setStep("passcode");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) add(e.dataTransfer.files);
  };
  const totalMb = picked.reduce((n, p) => n + p.file.size, 0) / 1024 / 1024;
  const hasNote = !!note.trim();
  const shareLabel = picked.length
    ? `Share ${picked.length} ${picked.length === 1 ? "photo" : "photos"}${hasNote ? " & note" : ""}`
    : hasNote
      ? "Send note"
      : "Share";

  const steps = (
    <>
      {step === "passcode" && (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            unlock(
              String(form.get("passcode") ?? ""),
              String(form.get("guestName") ?? "").trim(),
            );
          }}
        >
          <p className="text-stone-600">
            {design.message ||
              "Snapped something fun at the mirror? Share it with the hosts!"}
          </p>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.25em] text-stone-500">
              Your name
            </span>
            <input
              name="guestName"
              required
              maxLength={60}
              defaultValue={guest?.name}
              autoComplete="name"
              placeholder="So the hosts know who shared"
              className="mt-2 w-full rounded-2xl border-2 border-stone-200 bg-white px-4 py-3.5 text-center text-lg outline-none transition-colors focus:border-(--g)"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.25em] text-stone-500">
              Passcode at the booth
            </span>
            <input
              key={shakeKey}
              name="passcode"
              required
              autoComplete="off"
              autoCapitalize="characters"
              aria-invalid={!!error}
              className={`mt-2 w-full rounded-2xl border-2 border-stone-200 bg-white px-4 py-4 text-center font-mono text-2xl tracking-[0.4em] uppercase outline-none transition-colors focus:border-(--g) ${error ? "animate-shake border-red-300" : ""}`}
            />
          </label>
          <button disabled={busy} className={button}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      )}

      {step === "upload" && (
        <div className="mt-4 space-y-3">
          {guest && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
              <span className="text-stone-600">
                Sharing as{" "}
                <strong className="font-medium text-foreground">
                  {guest.name}
                </strong>
                {onSwitchGuest && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => {
                        onSwitchGuest();
                        setStep("passcode");
                      }}
                      className="cursor-pointer text-stone-500 underline underline-offset-2"
                    >
                      Not you?
                    </button>
                  </>
                )}
              </span>
              {guest.limit !== null && (
                <span className="rounded-full bg-(--g)/20 px-3 py-0.5 text-xs">
                  {left} of {guest.limit} photos left
                </span>
              )}
            </div>
          )}
          {picked.length === 0 && (
            <p className="text-stone-600">
              {design.uploadMessage ||
                "Add the photos you took. The hosts will love them."}
            </p>
          )}

          {left === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-stone-300 px-4 py-4 text-sm text-stone-600">
              You&apos;ve shared all {guest?.limit} of your photos. Thank you!
              You can still leave a note for the hosts below.
            </p>
          ) : (
            <>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 text-left transition-colors ${
                  dragging
                    ? "border-(--g) bg-(--g)/15"
                    : "border-stone-300 hover:border-(--g) hover:bg-(--g)/10"
                }`}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--g) text-(--g-ink)"
                  aria-hidden
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6 fill-none stroke-current stroke-2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
                  </svg>
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">
                    {picked.length ? "Add more" : "Choose photos"}
                  </span>
                  <span className="text-xs text-stone-500">
                    Tap or drag here · up to {MAX_MB} MB each
                  </span>
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files) add(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-stone-300 px-4 py-2.5 text-sm transition-colors hover:border-(--g)">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 fill-none stroke-current stroke-2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                </svg>
                Take a photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files) add(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          )}

          {skipped > 0 && (
            <p className="text-xs text-amber-700">
              {skipped} file{skipped > 1 && "s"} skipped (only photos up to{" "}
              {MAX_MB} MB).
            </p>
          )}

          {picked.length > 0 && (
            <>
              <ul className="grid grid-cols-4 gap-1.5">
                {picked.map((p, i) => (
                  <li
                    key={p.url}
                    className="group relative aspect-square overflow-hidden rounded-xl bg-stone-100"
                  >
                    <img
                      src={p.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    {!busy && (
                      <button
                        type="button"
                        aria-label={`Remove ${p.file.name}`}
                        onClick={() => {
                          URL.revokeObjectURL(p.url);
                          urls.current.delete(p.url);
                          setPicked((all) => all.filter((_, j) => j !== i));
                        }}
                        className="absolute top-1 right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/55 text-sm text-white"
                      >
                        <Icon name="x" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-stone-500">
                {picked.length} selected · {totalMb.toFixed(1)} MB
              </p>
            </>
          )}

          {/* Collapsed by default so the photos stay the focus */}
          <details className="group rounded-2xl bg-white/70 p-3 text-left [&[open]>summary]:mb-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-stone-500 [&::-webkit-details-marker]:hidden">
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 fill-none stroke-current stroke-2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M6 10V8a6 6 0 1 1 12 0v2M5 10h14v11H5z" />
              </svg>
              Leave a note for the hosts
              {guest ? `, signed ${guest.name}` : ""}.{" "}
              {design.showMessages
                ? "It may appear beside your photos on the wall."
                : "Only they will see it."}
              <span
                className="ml-auto transition-transform group-open:rotate-180"
                aria-hidden
              >
                <Icon name="chevron-down" />
              </span>
            </summary>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Your wishes for the hosts…"
              aria-label="Message for the hosts"
              className="input resize-none"
            />
          </details>

          {progress !== null && (
            <div
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 overflow-hidden rounded-full bg-stone-200"
            >
              <div
                className="h-full rounded-full bg-(--g) transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}

          <button
            type="button"
            disabled={busy || (picked.length === 0 && !hasNote)}
            onClick={upload}
            className={button}
          >
            {progress !== null
              ? `Uploading… ${Math.round(progress * 100)}%`
              : shareLabel}
          </button>
        </div>
      )}

      {step === "thanks" && (
        <div className="mt-6 space-y-5">
          <span
            className="animate-pop-in mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-(--g) text-(--g-ink)"
            aria-hidden
          >
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8 fill-none stroke-current stroke-[2.5]"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
          </span>
          <p className="font-display text-2xl">
            {design.thanks ||
              "Thank you! Your moments are on their way to the hosts."}
          </p>
          {noteSent && (
            <p className="text-sm text-stone-500">
              Your note was sent privately to the hosts.
            </p>
          )}
          {shared.length > 0 && (
            <>
              <p className="text-sm text-stone-500">
                You&apos;ve shared {shared.length}{" "}
                {shared.length === 1 ? "photo" : "photos"}
                {guest?.limit != null && ` · ${left} left`}
              </p>
              <ul className="flex justify-center -space-x-3">
                {shared.slice(0, 5).map((p) => (
                  <li
                    key={p.url}
                    className="h-14 w-14 overflow-hidden rounded-full border-2 border-white bg-stone-100 shadow"
                  >
                    <img
                      src={p.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            type="button"
            onClick={() => setStep("upload")}
            className={button}
          >
            Share more
          </button>
        </div>
      )}

      <p role="alert" className="mt-3 min-h-5 text-sm text-red-600">
        {step !== "thanks" && error}
      </p>
    </>
  );

  return (
    <div style={style} className={framed ? "relative h-full" : ""}>
      <div className={framed ? "h-full overflow-y-auto" : ""}>
        <div
          className={`relative flex min-h-full flex-col items-center p-4 sm:p-6 ${framed ? "" : `min-h-dvh ${showWall ? "lg:p-8" : "justify-center"}`}`}
        >
          {/* Background: admin photo with a soft scrim, or a gentle wash of the accent color */}
          {design.background ? (
            <>
              <img
                src={design.background}
                alt=""
                className={`${framed ? "absolute" : "fixed"} inset-0 h-full w-full object-cover`}
              />
              <div
                className={`${framed ? "absolute" : "fixed"} inset-0 bg-linear-to-b from-black/30 via-black/20 to-black/50`}
              />
            </>
          ) : (
            <div
              className={`${framed ? "absolute" : "fixed"} inset-0`}
              style={{
                background: `radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, ${color} 55%, white) 0%, #fff7f8 70%)`,
              }}
            />
          )}

          <div
            className={`relative flex w-full flex-col items-center ${showWall && !framed ? "max-w-[1600px]" : ""}`}
          >
            <div
              className={`relative w-full rounded-3xl p-6 text-center shadow-2xl shadow-black/10 sm:p-8 ${pane} ${showWall ? "" : "max-w-md"}`}
            >
              <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">
                Fae&amp;Fable Mirror Booth
              </p>
              <h1 className="font-display mt-3 text-4xl leading-tight wrap-break-word">
                {design.title || event.name}
              </h1>
              {!design.hideDate && (
                <p className="mt-1 text-sm text-stone-500">
                  {design.dateText || formatDate(event.eventDate)}
                </p>
              )}

              {!showWall && steps}
            </div>

            {showWall && wall && (
              <Wall
                photos={wall}
                title={design.title || event.name}
                pane={pane}
                onShare={openSheet}
              />
            )}
          </div>

          {showWall && (
            <button
              type="button"
              onClick={openSheet}
              className="animate-pop-in sticky bottom-4 z-20 mt-6 flex w-full max-w-sm cursor-pointer items-center justify-center gap-2 rounded-full bg-(--g) px-6 py-3.5 font-medium text-(--g-ink) shadow-xl shadow-black/20 transition hover:brightness-95 active:scale-[0.98] motion-reduce:transition-none"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 fill-none stroke-current stroke-2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {left === 0 ? "Leave a note" : "Share your photos"}
            </button>
          )}
        </div>
      </div>

      {showWall && (
        <dialog
          ref={sheet}
          aria-labelledby="share-title"
          onClick={(e) =>
            e.target === e.currentTarget && sheet.current?.close()
          }
          // Admin preview: breakpoints follow the admin's window, not the phone frame, so always use the phone sheet
          className={`${framed ? "absolute" : "fixed sm:items-center sm:p-4"} inset-0 z-30 m-0 h-full max-h-none w-full max-w-none items-end justify-center bg-black/45 p-0 backdrop:bg-transparent open:flex`}
        >
          <div
            className={`animate-pop-in relative max-h-[92%] w-full overflow-y-auto rounded-t-3xl bg-white p-6 text-center shadow-2xl ${framed ? "" : "max-w-md sm:rounded-3xl"}`}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => sheet.current?.close()}
              className="absolute top-3 right-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100"
            >
              <Icon name="x" />
            </button>
            <h2 id="share-title" className="font-display text-2xl">
              Share your photos
            </h2>
            {steps}
          </div>
        </dialog>
      )}
    </div>
  );
}

/** Live gallery of everyone's photos. Photos only: guest names and notes never appear here. */
function Wall({
  photos,
  title,
  pane,
  onShare,
}: {
  photos: WallPhoto[];
  title: string;
  /** Pane template classes, matching the title card. */
  pane: string;
  onShare: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const mineCount = photos.filter((p) => p.mine).length;
  const shown = (filter === "mine" ? photos.filter((p) => p.mine) : photos).map(
    (p) => ({
      ...p,
      badges: [...(p.fresh ? ["New"] : []), ...(p.mine ? ["You"] : [])],
    }),
  );
  const chip = (active: boolean) =>
    `cursor-pointer rounded-full px-3.5 py-1.5 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-(--g) ${
      active
        ? "bg-foreground text-background"
        : "bg-white text-stone-600 hover:text-foreground"
    }`;

  return (
    <section
      aria-labelledby="moments-title"
      className={`relative mt-4 w-full rounded-3xl p-3 shadow-xl shadow-black/10 sm:p-6 ${pane}`}
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-stone-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--g) opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-(--g)" />
            </span>
            Live gallery
          </p>
          <h2
            id="moments-title"
            className="font-display mt-1 text-3xl leading-none sm:text-4xl"
          >
            Moments{" "}
            <span className="align-top text-base text-stone-500 sm:text-lg">
              {photos.length}
            </span>
          </h2>
        </div>
        {photos.length > 0 && (
          <div
            role="group"
            aria-label="Show photos"
            className="flex gap-1 rounded-full bg-stone-100 p-1"
          >
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
              className={chip(filter === "all")}
            >
              All
            </button>
            <button
              type="button"
              aria-pressed={filter === "mine"}
              onClick={() => setFilter("mine")}
              className={chip(filter === "mine")}
            >
              Yours{" "}
              {mineCount > 0 && <span className="opacity-70">{mineCount}</span>}
            </button>
          </div>
        )}
      </div>

      {shown.length > 0 ? (
        <>
          <Gallery photos={shown} title={title} layout="collage" onShare={onShare} />
          <p className="mt-4 text-center text-xs text-stone-500">
            Tap a photo to view it full screen · updates live
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-stone-200 px-6 py-10 text-center">
          <div className="grid grid-cols-3 gap-1.5 opacity-80" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <span
                key={i}
                className="h-10 w-10 rounded-lg bg-(--g)/25 sm:h-12 sm:w-12"
                style={{ opacity: 1 - i * 0.12 }}
              />
            ))}
          </div>
          <div>
            <p className="font-display text-2xl">
              {filter === "mine" ? "You haven't shared yet" : "No moments yet"}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {filter === "mine"
                ? "Your photos will show up here, marked as yours."
                : "Be the first! Every guest's photos appear here as they're shared."}
            </p>
          </div>
          <button
            type="button"
            onClick={onShare}
            className="cursor-pointer rounded-full bg-(--g) px-6 py-3 font-medium text-(--g-ink) shadow-sm transition hover:brightness-95"
          >
            Share {filter === "mine" ? "a" : "the first"} moment
          </button>
        </div>
      )}
    </section>
  );
}
