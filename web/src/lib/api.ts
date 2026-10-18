export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, { token, ...init }: RequestInit & { token?: string | null } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(API + path, { ...init, headers, cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = res.status === 410 ? "This link has expired." : [data?.message ?? res.statusText].flat().join(", ");
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export type Settings = Partial<Record<"businessName" | "tagline" | "about" | "email" | "phone" | "instagram" | "location", string>> & {
  /** Homepage banner photo URL (path under API), set via its own upload. */
  banner?: string;
};

export type SiteContent = { settings: Settings };

/** Public URL of an uploaded file stored by bare name (catalog photos). */
export const fileUrl = (name: string) => `${API}/files/${name}`;

// Catalog: mirrors api/src/catalog/{sections,products}.ts
export type Background = { background: "white" | "tint" | "photo"; backgroundImage: string | null };
export type Slide = { image: string | null; heading: string; text: string; buttonLabel: string; buttonHref: string };
export type Section = { id: string; hidden: boolean } & (
  | { type: "slideshow"; slides: Slide[]; interval: number }
  | ({
      type: "products";
      productType: "mirror" | "package";
      heading: string;
      layout: "grid" | "carousel" | "list";
      columns: 2 | 3 | 4;
      showPrices: boolean;
      pick: "all" | number[];
    } & Background)
  | ({ type: "text"; heading: string; body: string; image: string | null; imageSide: "left" | "right" } & Background)
  | ({ type: "cta"; heading: string; text: string; buttonLabel: string } & Background)
);
export type SectionType = Section["type"];
export type ProductData = {
  name: string;
  type: "mirror" | "package";
  price: string;
  description: string;
  inclusions: string[];
  photos: string[];
  visible: boolean;
};
export type AdminProduct = { id: number; sort: number; draft: ProductData; published: ProductData | null; status: "draft" | "published" | "changed" };
export type PublicProduct = { id: number } & Omit<ProductData, "visible">;
export type CatalogPage = { draft: Section[]; published: Section[] | null; hasChanges: boolean };
export type PublicCatalog = { sections: Section[]; products: PublicProduct[] };

export type EventItem = {
  id: number;
  name: string;
  clientName: string;
  clientEmail: string | null;
  eventDate: string;
  expiresAt: string;
  passcode: string;
  clientCode: string | null;
  isPublic: boolean;
  design: GuestDesign;
  photoCount: number;
  guestUrl: string;
  clientUrl: string;
  qr: string;
};

/** Admin-chosen look of an event's guest upload page; unset fields fall back to defaults. */
export type PanelStyle = "glass" | "soft" | "solid" | "tint";

export type GuestDesign = {
  /** Max photos per guest name; unset = 30, 0 = unlimited. */
  photoLimit?: number;
  title?: string;
  /** Replaces the formatted event date under the headline (display only). */
  dateText?: string;
  hideDate?: boolean;
  /** Passcode screen intro. */
  message?: string;
  /** Upload screen intro. */
  uploadMessage?: string;
  thanks?: string;
  color?: string;
  background: string | null;
  /** Guests see each other's photos unless this is false. */
  showWall?: boolean;
  /** Notes written after this was turned on appear beside their photos on the wall. */
  showMessages?: boolean;
  /** Look of the title card and gallery pane; unset = glass. */
  panel?: PanelStyle;
};

export type PublicEvent = { name: string; eventDate: string; slug: string; cover: string | null };

export type ClientEvent = { name: string; eventDate: string; expiresAt: string; photoCount: number; clientPath: string };

export type ShowcasePhoto = { id: number; url: string; isVideo: boolean };

/** A photo on the guest wall: anonymous, but flags the viewer's own uploads. */
/** A guest's note shown beside their photo (only when the admin allows notes on the wall). */
export type PhotoNote = { name: string; body: string };
export type WallPhoto = ShowcasePhoto & { mine?: boolean; createdAt?: string; /** shared in the last few minutes */ fresh?: boolean; note?: PhotoNote };

export type Showcase = {
  id: number;
  title: string;
  eventDate: string;
  location: string;
  description: string;
  cover: string | null;
  photoCount: number;
};

export type ShowcaseDetail = Omit<Showcase, "cover" | "photoCount"> & { photos: ShowcasePhoto[] };

export const formatDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, { dateStyle: "medium" });
