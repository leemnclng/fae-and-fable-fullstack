import type { CSSProperties } from "react";
import type { PhotoNote } from "@/lib/api";
import { NOTE_FONTS, type NoteFont, type NoteTemplate } from "@/lib/event-style";
import { Icon } from "./icon";

/** Paper, ink and accent colours per template. */
const LOOK: Record<NoteTemplate, { paper: string; paperStyle?: CSSProperties; ink: string; accent: string }> = {
  cream: { paper: "bg-[#fff9f4]", ink: "text-foreground", accent: "text-accent-ink" },
  letter: { paper: "bg-[#fde8ea]", ink: "text-foreground", accent: "text-[#b5546f]" },
  lined: {
    paper: "bg-[#fffdf8]",
    // Ruled lines start below the heading, like a notebook page
    paperStyle: { backgroundImage: "repeating-linear-gradient(transparent 0 calc(var(--note-line) - 1px), #e9d9dc calc(var(--note-line) - 1px) var(--note-line))", backgroundPosition: "0 3.5em" },
    ink: "text-[#3b2430]",
    accent: "text-accent-ink",
  },
  midnight: {
    paper: "",
    paperStyle: { background: "radial-gradient(120% 90% at 20% 0%, #5b2742 0%, #2b0f1d 70%)" },
    ink: "text-[#f3d9a4]",
    accent: "text-[#d9b56f]",
  },
  polaroid: { paper: "bg-white", ink: "text-foreground", accent: "text-accent-ink" },
};

/**
 * A guest's note in the event's chosen template and handwriting. The caller positions it (className).
 * `compact` is the small preview used in the admin's template picker.
 */
export function NoteFace({
  note,
  template = "cream",
  font = "caveat",
  compact,
  className = "",
}: {
  note: PhotoNote;
  template?: NoteTemplate;
  font?: NoteFont;
  compact?: boolean;
  className?: string;
}) {
  const look = LOOK[template];
  const { family, scale, fontStyle } = NOTE_FONTS[font];
  const sizes = compact ? "[--note-size:0.8rem] [--note-line:1.05rem]" : "[--note-size:1.5rem] [--note-line:2rem] md:[--note-size:2.25rem] md:[--note-line:2.9rem]";
  const eyebrow = compact ? (
    <>A note from {note.name}</>
  ) : (
    <>
      {/* Phones flip the card to the photo's own size, which can be short: name the writer up top there */}
      <span className="md:hidden">A note from {note.name}</span>
      <span className="max-md:hidden">A note for the couple</span>
    </>
  );
  const body = (
    <p
      className={`mt-3 flex-1 whitespace-pre-line ${look.ink} ${template === "lined" ? "" : "leading-snug"}`}
      style={{ fontFamily: family, fontStyle, fontSize: `calc(${scale} * var(--note-size))`, lineHeight: template === "lined" ? "var(--note-line)" : undefined }}
    >
      {note.body}
    </p>
  );
  const head = <p className={`${compact ? "text-[7px] tracking-[0.25em]" : "text-xs tracking-[0.3em]"} uppercase ${look.accent}`}>{eyebrow}</p>;
  const signature = !compact && <p className={`mt-4 text-sm uppercase tracking-[0.2em] max-md:hidden ${look.accent}`}>— {note.name}</p>;

  return (
    <div className={`relative flex flex-col overflow-hidden rounded-lg text-left ${sizes} ${look.paper} ${className}`} style={look.paperStyle}>
      {template === "midnight" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage: "radial-gradient(#f3d9a4 1px, transparent 1.5px), radial-gradient(#f3d9a4 0.8px, transparent 1.2px)",
            backgroundSize: "70px 80px, 45px 55px",
            backgroundPosition: "10px 20px, 30px 5px",
          }}
        />
      )}
      {template === "polaroid" ? (
        // Keepsake frame: the note sits in a tinted panel, signed in the frame's bottom margin
        <div className={`flex min-h-0 flex-1 flex-col ${compact ? "p-2" : "p-4 md:p-5"}`}>
          <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto rounded bg-[#fdf1f3] ${compact ? "p-2.5" : "p-5 md:p-6"}`}>
            {head}
            {body}
          </div>
          <p className="mt-2 text-center text-[#7d4655]" style={{ fontFamily: family, fontStyle, fontSize: `calc(${scale} * var(--note-size) * 0.75)` }}>
            with love, {note.name}
          </p>
        </div>
      ) : (
        <div className={`relative flex min-h-0 flex-1 flex-col overflow-y-auto ${compact ? "p-3" : "p-6 md:p-8"} ${template === "lined" ? (compact ? "pl-6" : "pl-12 md:pl-16") : ""}`}>
          {head}
          {body}
          {signature}
        </div>
      )}
      {template === "letter" && (
        <>
          <span aria-hidden className={`pointer-events-none absolute rounded-md border-dashed border-[#e7a3ad] ${compact ? "inset-1 border" : "inset-2.5 border-[1.5px]"}`} />
          <span aria-hidden className={`absolute flex items-center justify-center rounded-full bg-[#b5546f] text-[#fde8ea] shadow-[inset_0_0_0_3px_#9c3f59] ${compact ? "right-2 bottom-2 h-4 w-4" : "right-4 bottom-4 h-10 w-10"}`}>
            <Icon name="heart" filled className={compact ? "h-2 w-2" : "h-5 w-5"} />
          </span>
        </>
      )}
      {template === "lined" && <span aria-hidden className={`pointer-events-none absolute top-0 bottom-0 w-[1.5px] bg-[#f1b5c0] ${compact ? "left-4" : "left-8 md:left-11"}`} />}
    </div>
  );
}
