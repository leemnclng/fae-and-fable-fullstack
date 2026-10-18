import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/** Catalog page sections: the only shapes the page builder can store. Everything saved goes through sanitizePage. */
export type Background = { background: 'white' | 'tint' | 'photo'; backgroundImage: string | null };
export type Slide = { image: string | null; heading: string; text: string; buttonLabel: string; buttonHref: string };
export type Section = { id: string; hidden: boolean } & (
  | { type: 'slideshow'; slides: Slide[]; interval: number }
  | ({
      type: 'products';
      productType: 'mirror' | 'package';
      heading: string;
      layout: 'grid' | 'carousel' | 'list';
      columns: 2 | 3 | 4;
      showPrices: boolean;
      pick: 'all' | number[];
    } & Background)
  | ({ type: 'text'; heading: string; body: string; image: string | null; imageSide: 'left' | 'right' } & Background)
  | ({ type: 'cta'; heading: string; text: string; buttonLabel: string } & Background)
);

// Bare upload names only, so a stored value can never point outside the public files folder.
export const IMAGE_NAME = /^[\w-]+\.(jpe?g|png|webp|gif|heic|heif)$/i;

const MAX_SECTIONS = 30;
const MAX_SLIDES = 10;
const SAFE_HREF = /^(\/|#|https?:\/\/|mailto:)/i;

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Trimmed string (non-strings become ''); throws 400 when longer than `max`. */
export function str(v: unknown, max: number, field: string): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length > max) throw new BadRequestException(`${field} must be at most ${max} characters`);
  return s;
}
const oneOf = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const image = (v: unknown) => (typeof v === 'string' && IMAGE_NAME.test(v) ? v : null);
const href = (v: unknown) => {
  const s = str(v, 300, 'link');
  return SAFE_HREF.test(s) ? s : '';
};
const background = (o: Obj): Background => ({
  background: oneOf(o.background, ['white', 'tint', 'photo'] as const, 'white'),
  backgroundImage: image(o.backgroundImage),
});

function slide(o: Obj): Slide {
  return {
    image: image(o.image),
    heading: str(o.heading, 120, 'heading'),
    text: str(o.text, 600, 'text'),
    buttonLabel: str(o.buttonLabel, 40, 'button label'),
    buttonHref: href(o.buttonHref),
  };
}

function section(o: Obj): Section | null {
  const base = { id: str(o.id, 40, 'id') || randomUUID(), hidden: o.hidden === true };
  switch (o.type) {
    case 'slideshow': {
      const slides = Array.isArray(o.slides) ? o.slides.filter(isObj) : [];
      if (slides.length > MAX_SLIDES) throw new BadRequestException(`A slideshow can have at most ${MAX_SLIDES} slides`);
      const interval = Number(o.interval);
      return { ...base, type: 'slideshow', slides: slides.map(slide), interval: Number.isFinite(interval) ? Math.min(15, Math.max(3, Math.round(interval))) : 6 };
    }
    case 'products':
      return {
        ...base,
        type: 'products',
        productType: oneOf(o.productType, ['mirror', 'package'] as const, 'mirror'),
        heading: str(o.heading, 120, 'heading'),
        layout: oneOf(o.layout, ['grid', 'carousel', 'list'] as const, 'grid'),
        columns: oneOf(o.columns, [2, 3, 4] as const, 3),
        showPrices: typeof o.showPrices === 'boolean' ? o.showPrices : true,
        pick: Array.isArray(o.pick) ? o.pick.filter((n): n is number => Number.isInteger(n) && (n as number) > 0).slice(0, 50) : 'all',
        ...background(o),
      };
    case 'text':
      return {
        ...base,
        type: 'text',
        heading: str(o.heading, 120, 'heading'),
        body: str(o.body, 3000, 'body'),
        image: image(o.image),
        imageSide: oneOf(o.imageSide, ['left', 'right'] as const, 'left'),
        ...background(o),
      };
    case 'cta':
      return {
        ...base,
        type: 'cta',
        heading: str(o.heading, 120, 'heading'),
        text: str(o.text, 600, 'text'),
        buttonLabel: str(o.buttonLabel, 40, 'button label') || 'Inquire',
        ...background(o),
      };
    default:
      return null;
  }
}

export function sanitizePage(input: unknown): Section[] {
  if (!Array.isArray(input)) throw new BadRequestException('sections must be a list');
  if (input.length > MAX_SECTIONS) throw new BadRequestException(`A page can have at most ${MAX_SECTIONS} sections`);
  return input.filter(isObj).map(section).filter((s): s is Section => s !== null);
}

/** What the catalog shows before the admin has published anything. */
export function defaultPage(banner: string | null): Section[] {
  const bg: Background = { background: 'white', backgroundImage: null };
  const products = { hidden: false, type: 'products', layout: 'grid', columns: 3, showPrices: true, pick: 'all', ...bg } as const;
  return [
    {
      id: 'slideshow',
      hidden: false,
      type: 'slideshow',
      interval: 6,
      slides: [{ image: banner, heading: 'Our mirrors', text: 'Reflect the magic of your event', buttonLabel: 'See mirrors', buttonHref: '#mirrors' }],
    },
    { ...products, id: 'mirrors', productType: 'mirror', heading: 'Mirrors' },
    { ...products, id: 'packages', productType: 'package', heading: 'Packages', background: 'tint' },
    { id: 'cta', hidden: false, type: 'cta', heading: 'Ready to book?', text: 'Tell us about your event and we will help you pick the perfect mirror.', buttonLabel: 'Inquire', ...bg },
  ];
}

/** Every uploaded file a page refers to, for deciding which uploads are safe to delete. */
export function filesInPage(page: Section[]): string[] {
  return page.flatMap((s) => {
    const own = 'backgroundImage' in s ? [s.backgroundImage] : [];
    if (s.type === 'slideshow') return s.slides.map((x) => x.image);
    if (s.type === 'text') return [...own, s.image];
    return own;
  }).filter((f): f is string => !!f);
}
