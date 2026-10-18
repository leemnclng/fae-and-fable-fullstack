/** Lucide-style 24px icon paths. UI icons are always SVG, never emoji or symbol characters (see docs/development.md). */
const PATHS = {
  x: "M18 6 6 18M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  "arrow-up": "M12 19V5M5 12l7-7 7 7",
  "arrow-down": "M12 5v14M19 12l-7 7-7-7",
  "arrow-left": "M19 12H5M12 19l-7-7 7-7",
  "arrow-right": "M5 12h14M12 5l7 7-7 7",
  "chevron-down": "m6 9 6 6 6-6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  "eye-off":
    "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6",
  grip: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  mail: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM3 7l9 6 9-6",
  heart: "M12 21s-7-4.4-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.6-9.5 9-9.5 9z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative by default (aria-hidden): give the surrounding button an aria-label. `filled` fills the shape instead of stroking it. */
export function Icon({ name, className = "h-4 w-4", filled = false }: { name: IconName; className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${filled ? "fill-current stroke-none" : `fill-none stroke-current ${name === "grip" ? "stroke-[3]" : "stroke-2"}`} ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
