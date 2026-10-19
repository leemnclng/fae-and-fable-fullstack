import {
  Bodoni_Moda,
  Caveat,
  Cinzel,
  Cormorant_Garamond,
  Dancing_Script,
  Great_Vibes,
  Homemade_Apple,
  Kalam,
  Playfair_Display,
  Shadows_Into_Light,
} from "next/font/google";

/*
 * Per-event note card templates and fonts the admin picks in Design guest page.
 * Keys match the API's allow-lists (api/src/events.ts); the first of each is the default.
 * preload: false, so a browser only downloads a font when a page actually uses it.
 */

// next/font needs literal options at each call
const caveat = Caveat({ subsets: ["latin"], display: "swap", preload: false });
const dancingScript = Dancing_Script({ subsets: ["latin"], display: "swap", preload: false });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const homemadeApple = Homemade_Apple({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const shadowsIntoLight = Shadows_Into_Light({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const kalam = Kalam({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const playfairItalic = Playfair_Display({ subsets: ["latin"], style: "italic", display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], display: "swap", preload: false });
const cinzel = Cinzel({ subsets: ["latin"], display: "swap", preload: false });
const bodoni = Bodoni_Moda({ subsets: ["latin"], display: "swap", preload: false });

export const NOTE_TEMPLATES = {
  cream: { label: "Classic cream" },
  letter: { label: "Love letter" },
  lined: { label: "Guestbook page" },
  midnight: { label: "Midnight" },
  polaroid: { label: "Keepsake frame" },
} as const;
export type NoteTemplate = keyof typeof NOTE_TEMPLATES;

/** `scale` evens out how big each handwriting looks at the same font size; `fontStyle` is set where the face is italic-only. */
export const NOTE_FONTS = {
  caveat: { label: "Caveat", family: caveat.style.fontFamily, scale: 1, fontStyle: "normal" },
  "dancing-script": { label: "Dancing Script", family: dancingScript.style.fontFamily, scale: 0.9, fontStyle: "normal" },
  "great-vibes": { label: "Great Vibes", family: greatVibes.style.fontFamily, scale: 1.05, fontStyle: "normal" },
  "homemade-apple": { label: "Homemade Apple", family: homemadeApple.style.fontFamily, scale: 0.62, fontStyle: "normal" },
  "shadows-into-light": { label: "Shadows Into Light", family: shadowsIntoLight.style.fontFamily, scale: 0.9, fontStyle: "normal" },
  kalam: { label: "Kalam", family: kalam.style.fontFamily, scale: 0.8, fontStyle: "normal" },
  "playfair-italic": { label: "Playfair italic", family: playfairItalic.style.fontFamily, scale: 0.75, fontStyle: "italic" },
} as const;
export type NoteFont = keyof typeof NOTE_FONTS;

export const HEADLINE_FONTS = {
  playfair: { label: "Playfair Display", family: playfair.style.fontFamily },
  cormorant: { label: "Cormorant Garamond", family: cormorant.style.fontFamily },
  cinzel: { label: "Cinzel", family: cinzel.style.fontFamily },
  "great-vibes": { label: "Great Vibes", family: greatVibes.style.fontFamily },
  bodoni: { label: "Bodoni Moda", family: bodoni.style.fontFamily },
} as const;
export type HeadlineFont = keyof typeof HEADLINE_FONTS;

/** Inline style for an event's headlines; undefined keeps the site's display font. */
export const headlineStyle = (font?: HeadlineFont) => (font && font !== "playfair" ? { fontFamily: HEADLINE_FONTS[font].family } : undefined);
