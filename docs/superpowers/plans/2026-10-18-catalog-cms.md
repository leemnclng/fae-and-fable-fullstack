# Catalog CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/catalog` page built from admin-arranged sections (slideshow, mirrors, packages, text + photo, call to action), product detail pages, and an admin CMS where products and the page are edited as drafts and go live only on Publish.

**Architecture:** The API stores products in a new `products` table, with `draft` and `published` JSON per row. The page lives in two `settings` rows (`catalogDraft`, `catalogPublished`), each holding an ordered array of sections, which one pure sanitizer validates. The web renders sections with shared components that both the public pages and the admin's live preview use. The admin gets a Catalog screen with Products and Page tabs.

**Tech Stack:**
- API: NestJS + `node:sqlite`, Vitest, supertest, pnpm (`api/`).
- Web: Next.js 16.4 App Router with `cacheComponents`, React 19, Tailwind v4 (`web/`).

**Spec:** `docs/superpowers/specs/2026-10-18-catalog-cms-design.md`

## Global Constraints

- Fae-Fable is **not a git repository**: skip every commit step and run the verification instead.
- No new dependencies. Reorder sections and products with native HTML drag-and-drop, plus ↑/↓ buttons as the accessible fallback.
- Next 16 differs from older versions: read `web/node_modules/next/dist/docs/` before writing a route. `params` is a `Promise`. Public pages fetch with `api()` inside `<Suspense>`, following `web/src/app/events/[id]/page.tsx`.
- Uploads:
  - use `uploadOptions(() => PUBLIC_DIR, 15, IMAGES_ONLY)`;
  - files are served at `/files/<name>`;
  - the API stores **bare filenames**, and the web builds URLs with `fileUrl(name)`.
- Admin endpoints use `@UseGuards(AdminGuard)`, and admin UI loads data with `useAdmin` (`web/src/app/admin/use-admin.ts`).
- Fonts and colors come from the site theme (`globals.css`). Section backgrounds are only `white | tint | photo`.
- Native `<dialog>` for modals, as in `components/gallery.tsx`.
- Visitors never see drafts. Public endpoints read only `published` data, and `GET /content` must never return `catalogDraft` or `catalogPublished`.
- Deleting a product takes effect at once, after a `confirm()`.
- The slideshow respects `prefers-reduced-motion` (no auto-advance) and has keyboard-usable prev/next/dot buttons with labels.

## Review Focus

1. **A product used by a section is deleted, hidden, or never published.** The section renders the remaining products and the page doesn't break. → Task 4, test `public catalog skips products that are not live`.
2. **A malicious or broken page save** (unknown section type, oversized text, `javascript:` link, 500 sections, image name with `../`). The bad parts are dropped or rejected with 400, never stored. → Task 1 tests.
3. **A photo removed from a draft while the published version still uses it.** The file keeps being served until publish, and is deleted after. → Task 3, test `keeps photos the published version still uses`.
4. **A section or slide with no image.** It shows the accent gradient, never a broken image. → Task 5, Step 6 check.
5. **No contact details in settings.** The Inquire dialog says "Contact details coming soon." rather than showing an empty box. → Task 5, Step 6 check.

---

### Task 1: Section schema and sanitizer (API)

**Files:**
- Create: `api/src/catalog/sections.ts`
- Test: `api/src/catalog/sections.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Background = { background: 'white' | 'tint' | 'photo'; backgroundImage: string | null };
  export type Slide = { image: string | null; heading: string; text: string; buttonLabel: string; buttonHref: string };
  export type Section = { id: string; hidden: boolean } & (
    | { type: 'slideshow'; slides: Slide[]; interval: number }
    | ({ type: 'products'; productType: 'mirror' | 'package'; heading: string; layout: 'grid' | 'carousel' | 'list'; columns: 2 | 3 | 4; showPrices: boolean; pick: 'all' | number[] } & Background)
    | ({ type: 'text'; heading: string; body: string; image: string | null; imageSide: 'left' | 'right' } & Background)
    | ({ type: 'cta'; heading: string; text: string; buttonLabel: string } & Background)
  );
  export const IMAGE_NAME: RegExp; // /^[\w-]+\.(jpe?g|png|webp|gif|heic|heif)$/i
  export function sanitizePage(input: unknown): Section[]; // throws BadRequestException
  export function defaultPage(banner: string | null): Section[];
  export function filesInPage(page: Section[]): string[];
  ```

- [ ] **Step 1: Write the failing tests** in `sections.spec.ts`

```ts
import { BadRequestException } from '@nestjs/common';
import { defaultPage, filesInPage, sanitizePage } from './sections.js';

const products = { id: 'a', type: 'products', productType: 'mirror', heading: 'Mirrors', layout: 'grid', columns: 3, showPrices: true, pick: 'all', background: 'white', backgroundImage: null };

it('keeps a valid page and fills defaults for missing fields', () => {
  const [s] = sanitizePage([{ id: 'a', type: 'cta' }]);
  expect(s).toEqual({ id: 'a', type: 'cta', hidden: false, heading: '', text: '', buttonLabel: 'Inquire', background: 'white', backgroundImage: null });
});
it('drops unknown section types and unknown keys', () => {
  expect(sanitizePage([{ id: 'x', type: 'iframe' }, { ...products, evil: 1 }])).toEqual([{ ...products, hidden: false }]);
});
it('rejects non-arrays, more than 30 sections, and oversized text', () => {
  expect(() => sanitizePage({})).toThrow(BadRequestException);
  expect(() => sanitizePage(Array.from({ length: 31 }, (_, i) => ({ id: `s${i}`, type: 'cta' })))).toThrow(BadRequestException);
  expect(() => sanitizePage([{ id: 'a', type: 'cta', heading: 'x'.repeat(121) }])).toThrow(BadRequestException);
});
it('only allows safe links and plain image names', () => {
  const [s] = sanitizePage([{ id: 'a', type: 'slideshow', slides: [
    { image: '../etc/passwd', buttonHref: 'javascript:alert(1)' },
    { image: 'ok.jpg', buttonHref: '/catalog#mirrors' },
  ] }]);
  expect(s.type === 'slideshow' && s.slides.map((x) => [x.image, x.buttonHref])).toEqual([[null, ''], ['ok.jpg', '/catalog#mirrors']]);
});
it('clamps numbers and enums to allowed values', () => {
  const [s] = sanitizePage([{ ...products, columns: 9, layout: 'masonry', pick: [1, 'two', 3] }]);
  expect(s).toMatchObject({ columns: 3, layout: 'grid', pick: [1, 3] });
});
it('default page uses the banner and lists its files', () => {
  const page = defaultPage('banner.jpg');
  expect(page.map((s) => s.type)).toEqual(['slideshow', 'products', 'products', 'cta']);
  expect(filesInPage(page)).toEqual(['banner.jpg']);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd api && pnpm test -- src/catalog/sections.spec.ts`
Expected: FAIL, "Cannot find module './sections.js'".

- [ ] **Step 3: Implement `sections.ts`**

Values the spec and the tests pin:
- **Limits:** heading 120, slide/cta text 600, text body 3000, button label 40, href 300, slides per slideshow 10, sections 30. Over a limit → `BadRequestException` naming the field.
- **Ids:** a missing id becomes `randomUUID()`; ids are capped at 40 characters.
- **Enum defaults:** layout `grid`, columns `3`, background `white`, imageSide `left`, productType `mirror`, cta buttonLabel `Inquire`.
- **interval:** clamped to 3–15, default 6.
- **Hrefs:** only those starting with `/`, `#`, `https://`, `http://` or `mailto:` are kept; anything else becomes `''`.
- **Images:** names not matching `IMAGE_NAME` become `null`.
- **`pick`:** either `'all'` or an array of positive integers, at most 50.
- **`defaultPage(banner)`:** a slideshow with one slide, then products/mirror "Mirrors", products/package "Packages", and cta "Ready to book?". The slide is image=banner, heading "Our mirrors", text "Reflect the magic of your event", button "See mirrors" → `#mirrors`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd api && pnpm test -- src/catalog/sections.spec.ts`
Expected: PASS, 6 tests.

---

### Task 2: Products table, content migration, private settings (API)

**Files:**
- Modify: `api/src/db.ts`:
  - remove the `content` table from `SCHEMA`;
  - add `products`;
  - call the migration in the constructor.
- Modify: `api/src/content.ts`:
  - delete the `admin/content` CRUD and `ContentRow`/`toDto`;
  - `GET /content` returns `{ settings }` only, without `catalogDraft`/`catalogPublished`.
- Modify: `api/test/app.e2e-spec.ts`: update the "manages public content and settings" test.
- Test: `api/src/db.spec.ts`

**Interfaces:**
- Produces:
  - **`products` table:** `id INTEGER PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0, draft TEXT NOT NULL, published TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.
  - **Migration:** `export function migrateContent(sql: DatabaseSync): void` in `db.ts`. If a `content` table exists, it does the following, then drops `content`:
    - copies each `kind='package'` row to `products` with `draft = published = JSON {name: title, type:'package', price: price ?? '', description, inclusions: [], photos: image ? [image] : [], visible: true}` and the same `sort`;
    - skips `portfolio` rows.
  - **`GET /content`** → `{ settings: Record<string,string> }`, with banner as `/files/<name>` as it is today.
  - **`HIDDEN_SETTINGS`:** `export const HIDDEN_SETTINGS = ['catalogDraft', 'catalogPublished']` from `content.ts`.

- [ ] **Step 1: Write the failing migration test** in `db.spec.ts`. It uses `new DatabaseSync(':memory:')`: create the old `content` table with one `package` row (with an image) and one `portfolio` row, then run `migrateContent(sql)`. Assert that:
  - `products` has exactly one row;
  - `JSON.parse(draft)` equals `{ name: 'Gold', type: 'package', price: '₱15,000', description: 'd', inclusions: [], photos: ['g.jpg'], visible: true }`;
  - `published` equals `draft`;
  - `content` no longer exists (`SELECT name FROM sqlite_master WHERE name='content'` returns `undefined`);
  - running `migrateContent` a second time doesn't throw.

  Note: `migrateContent` needs `products` to exist, so the test creates it by running the exported `SCHEMA` first. Export `SCHEMA`.

- [ ] **Step 2: Update the e2e content test.** Remove the `/admin/content` calls. Keep the settings and banner assertions. Add a check that `PUT /admin/settings` with `{ catalogDraft: 'x' }` is ignored, and that `(await http.get('/content')).body` equals `{ settings: { businessName: 'Fae&Fable' } }` (banner aside).

- [ ] **Step 3: Run both and confirm they fail**

Run: `cd api && pnpm test -- src/db.spec.ts && pnpm test:e2e`
Expected: the db spec FAILS because `migrateContent` isn't exported. The e2e FAILS on the `/content` shape.

- [ ] **Step 4: Implement** the schema change, `migrateContent` (inside a transaction), the `content.ts` cleanup, and the settings filter.

- [ ] **Step 5: Run and confirm they pass**

Run: `cd api && pnpm test && pnpm test:e2e && npx tsc --noEmit -p .`
Expected: all pass.

---

### Task 3: Products API with draft/publish and photo cleanup

**Files:**
- Create: `api/src/catalog/products.ts`, which holds the product sanitizer and `ProductsController`.
- Create: `api/src/catalog/files.ts`, which holds `cleanupFiles`.
- Modify: `api/src/app.module.ts` to register the controllers from Tasks 3 and 4.
- Test: `api/test/app.e2e-spec.ts`, new `describe`-level `it` blocks.

**Interfaces:**
- Consumes: `IMAGE_NAME`, `filesInPage`, `Section` (Task 1); the `products` table and `HIDDEN_SETTINGS` (Task 2).
- Produces:
  ```ts
  export type ProductData = { name: string; type: 'mirror' | 'package'; price: string; description: string; inclusions: string[]; photos: string[]; visible: boolean };
  export type AdminProduct = { id: number; sort: number; draft: ProductData; published: ProductData | null; status: 'draft' | 'published' | 'changed' };
  export type PublicProduct = { id: number } & Omit<ProductData, 'visible'>;
  export function sanitizeProduct(input: unknown): ProductData; // name required (1–120); price ≤60; description ≤3000; inclusions ≤30 × ≤200; photos ≤20 matching IMAGE_NAME; type default 'mirror'; visible default true
  export function publicProducts(db: Db): PublicProduct[]; // published && published.visible, ORDER BY sort, id
  export function cleanupFiles(db: Db, candidates: string[]): void; // removes each candidate from PUBLIC_DIR unless referenced by catalogDraft, catalogPublished, or any product draft/published
  ```
- **Status rules:**
  - `published === null` → `'draft'`;
  - `JSON.stringify(draft) === JSON.stringify(published)` → `'published'`;
  - otherwise → `'changed'`.
- **Endpoints**, all admin-guarded unless marked public:

  | Method | Path | Body | Returns |
  |---|---|---|---|
  | GET | `/admin/catalog/products` | — | `AdminProduct[]` |
  | POST | `/admin/catalog/products` | `{ draft }` | 201 `AdminProduct` (status `draft`) |
  | PUT | `/admin/catalog/products/:id` | `{ draft }` | `AdminProduct` |
  | POST | `/admin/catalog/products/:id/publish` | — | `AdminProduct` |
  | POST | `/admin/catalog/products/:id/discard` | — | `AdminProduct`; 400 if never published |
  | DELETE | `/admin/catalog/products/:id` | — | `{ ok: true }` |
  | PUT | `/admin/catalog/products/order` | `{ ids: number[] }` | `AdminProduct[]`; sort = index |
  | POST | `/admin/catalog/uploads` | multipart `image` | 201 `{ file: string }` |
  | GET (public) | `/catalog/products/:id` | — | `PublicProduct`, or 404 unless published and visible |

  - Unknown ids return 404.
  - Cleanup runs after PUT, publish, discard and delete. The candidates are the files from the old versions.

- [ ] **Step 1: Write the failing e2e tests.** Names and assertions:
  - **`products stay draft until published`:**
    - POST `{ draft: { name: 'Rose Arch', type: 'mirror', price: '₱18,000' } }` returns `status: 'draft'`;
    - `GET /catalog/products/:id` → 404;
    - publish → `status: 'published'`, and GET returns 200 with `name: 'Rose Arch'` and no `visible` key;
    - PUT `{ draft: { ..., price: '₱20,000', visible: false } }` → `status: 'changed'`, and public GET still has price `'₱18,000'` with 200;
    - publish → public GET 404 (hidden);
    - discard after a further PUT restores the draft to equal `published`.
  - **`validates products`:**
    - POST with `name: ''` → 400;
    - `photos: ['../x.jpg']` → 201 with `photos: []`;
    - POST without auth → 401;
    - POST `/admin/catalog/uploads` with `clip.mp4` → 400 and with `a.jpg` → 201 `{ file: /\.jpg$/ }`;
    - discard on a never-published product → 400.
  - **`keeps photos the published version still uses`:**
    - upload `a.jpg`, create a product with `photos: [file]`, publish;
    - PUT a draft with `photos: []` → `GET /files/<file>` is still 200;
    - publish → `GET /files/<file>` is 404.
  - **`orders and deletes products`:**
    - create two, `PUT order` with the ids reversed → the GET list order is reversed;
    - DELETE the first → the list has 1 and its public GET is 404.

- [ ] **Step 2: Run and confirm they fail**

Run: `cd api && pnpm test:e2e`
Expected: the 4 new tests FAIL with 404s on `/admin/catalog/products`.

- [ ] **Step 3: Implement** `products.ts` and `files.ts`, and register the controllers.

- [ ] **Step 4: Run and confirm they pass**

Run: `cd api && pnpm test && pnpm test:e2e && npx tsc --noEmit -p .`
Expected: all pass.

---

### Task 4: Catalog page API (draft/publish) and the public catalog

**Files:**
- Create: `api/src/catalog/page.ts`, which holds `CatalogPageController`.
- Modify: `api/src/app.module.ts`
- Test: `api/test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: `sanitizePage`, `defaultPage`, `filesInPage` (Task 1); `publicProducts`, `cleanupFiles`, `AdminProduct` (Task 3).
- Produces:

  | Method | Path | Body | Returns |
  |---|---|---|---|
  | GET | `/admin/catalog/page` | — | `{ draft: Section[]; published: Section[] \| null; hasChanges: boolean }` |
  | PUT | `/admin/catalog/page` | `{ sections }` | same shape |
  | POST | `/admin/catalog/page/publish` | — | same shape |
  | POST | `/admin/catalog/page/discard` | — | same shape; 400 if never published |
  | GET (public) | `/catalog` | — | `{ sections: Section[]; products: PublicProduct[] }` |

  - `GET /admin/catalog/page` uses `draft = stored draft ?? defaultPage(banner)`.
  - On `GET /catalog`:
    - sections are the published page, or `defaultPage(banner)` if the page was never published;
    - hidden sections are filtered out;
    - each products section's `pick` ids are filtered to live products.
  - PUT, publish and discard run `cleanupFiles` on the files from the replaced version.

- [ ] **Step 1: Write the failing e2e tests:**
  - **`page edits stay draft until published`:**
    - `GET /catalog` returns the default section types `['slideshow','products','products','cta']`;
    - PUT `{ sections: [{ id: 'c', type: 'cta', heading: 'Book us' }] }` → `hasChanges: true`, and `GET /catalog` is still the default;
    - publish → `GET /catalog` sections are `[{ id: 'c', type: 'cta', heading: 'Book us', ... }]` and `hasChanges: false`;
    - PUT a hidden section `{ id: 'h', type: 'text', hidden: true }` alongside it, publish → public sections exclude `h`;
    - PUT `{ sections: [{ type: 'cta', heading: 'x'.repeat(121) }] }` → 400;
    - unauthenticated PUT → 401.
  - **`public catalog skips products that are not live`:**
    - publish a page with a products section `pick: [liveId, draftId, 999]`;
    - `GET /catalog` → that section's `pick` equals `[liveId]`, and `products` lists only live, visible products.
  - **`never leaks the draft through /content`:**
    - after a draft PUT, `GET /content` settings has neither key.

- [ ] **Step 2: Run and confirm they fail**

Run: `cd api && pnpm test:e2e`
Expected: the new tests FAIL with 404.

- [ ] **Step 3: Implement `page.ts`** and register it.

- [ ] **Step 4: Run and confirm they pass**

Run: `cd api && pnpm test && pnpm test:e2e && npx tsc --noEmit -p .`
Expected: all pass.

---

### Task 5: Public catalog pages and shared section components (web)

**Files:**
- Modify: `web/src/lib/api.ts`:
  - remove `ContentItem`;
  - set `SiteContent = { settings: Settings }`;
  - add the types mirrored from Tasks 1, 3 and 4 (`Section`, `Slide`, `ProductData`, `AdminProduct`, `PublicProduct`, `CatalogPage = { draft; published; hasChanges }`, `PublicCatalog = { sections; products }`);
  - add `export const fileUrl = (name: string) => \`${API}/files/${name}\``.
- Create, in `web/src/components/catalog/`:
  - `sections.tsx`: `CatalogSections`, which picks a component per section type and is used by the public page and the admin preview;
  - `slideshow.tsx` (`"use client"`);
  - `product-list.tsx`: grid, carousel (horizontal scroll-snap) and list layouts, where each card links to `/catalog/<id>` and has an `InquireButton`;
  - `inquire.tsx` (`"use client"`): `InquireButton`, a native `<dialog>`;
  - `section-shell.tsx`: background white/tint/photo with a scrim, plus an `id` anchor (`mirrors` / `packages` for products sections).
- Create: `web/src/app/catalog/page.tsx` and `web/src/app/catalog/[id]/page.tsx`. Both use `SiteChrome` from `../events/chrome`. The detail page uses `Gallery` with `layout="collage"` and an `InquireButton`.
- Modify:
  - `web/src/app/page.tsx`: remove the Catalog section, `SectionTitle` and `Empty` if unused, and point the nav link at `{ href: "/catalog", label: "Catalog" }`;
  - `web/src/app/events/chrome.tsx`: the same nav link;
  - `web/src/app/events/page.tsx` and `web/src/app/events/[id]/page.tsx`: fallback `({ settings: {} })`.

**Interfaces:**
- Consumes: `GET /catalog`, `GET /catalog/products/:id`, `GET /content` (Tasks 2–4).
- Produces:
  ```ts
  export function CatalogSections(props: { sections: Section[]; products: PublicProduct[]; settings: Settings; preview?: boolean }): JSX.Element;
  export function InquireButton(props: { product?: string; settings: Settings; className?: string; label?: string }): JSX.Element;
  ```
  - `preview` makes links inert (`onClick` preventDefault), so clicks inside the admin preview don't navigate away.
  - `pick: 'all'` shows every product of the section's `productType`. Otherwise it shows the picked ids in that order, skipping missing ones.
  - The **Inquire dialog** lists whichever of these exist: email as `mailto:<email>?subject=` + `encodeURIComponent("Inquiry: " + product)` (no product → "Inquiry"), phone as `tel:`, and Instagram. With none of them, it says exactly "Contact details coming soon."

- [ ] **Step 1: Read** `web/node_modules/next/dist/docs/` on dynamic routes and `cacheComponents`. Note the `params` Promise and `notFound()` usage.
- [ ] **Step 2: Update the types in `api.ts`**, then run `cd web && npx tsc --noEmit -p .` and fix every compile error it lists (the homepage, the events pages, `admin/catalog.tsx`). For now, stub `admin/catalog.tsx` to render `<p>Catalog editor coming in the next step.</p>`; Task 6 replaces it.
- [ ] **Step 3: Build the components and the two routes.** The slideshow:
  - auto-advances every `interval` s, pausing on hover and focus, and never under `prefers-reduced-motion`;
  - has prev/next buttons labeled "Previous slide" / "Next slide" and dot buttons labeled "Go to slide N".
- [ ] **Step 4: Typecheck and lint**

Run: `cd web && npx tsc --noEmit -p . && npx eslint src`
Expected: 0 errors.

- [ ] **Step 5: Start both servers and seed data.**
  - Start the servers: `cd api && pnpm start:dev` and `cd web && npx next dev`, both in the background.
  - Use the admin API with curl (log in via `POST /auth/login` using the `.env` admin credentials) to:
    - create and publish one mirror with a photo, one mirror without a photo, and one package with 3 inclusions;
    - leave the page unpublished, so `/catalog` shows the default page.
- [ ] **Step 6: Screenshot `/catalog` and `/catalog/<id>`** at 390×844 and 1280×800 with the Playwright from `/Users/leemaneclang/myworkspace/App-Projects/TPC-Space/node_modules/playwright`. Save the script and output in the session scratchpad. Check by eye:
  - the photo-less mirror shows the accent gradient, not a broken image (Review Focus 4);
  - the Inquire dialog opens and lists the contacts;
  - with all contact settings cleared, the dialog shows "Contact details coming soon." (Review Focus 5);
  - nothing scrolls horizontally on the phone screenshots except the carousel.

---

### Task 6: Admin Products tab

**Files:**
- Modify: `web/src/app/admin/catalog.tsx` so it becomes the Catalog shell: tabs **Products | Page**, with Products the default.
- Create: `web/src/app/admin/_catalog/products.tsx`, which holds `ProductsTab`.
- Modify: `web/src/app/admin/page.tsx`: set the catalog section's description to "Mirrors, packages and the catalog page. Changes go live when you publish."

**Interfaces:**
- Consumes: the Task 3 endpoints; `AdminProduct`, `ProductData`, `fileUrl` (Task 5).
- Produces: `export function ProductsTab(props: AdminProps): JSX.Element`, and `export function PhotoPicker(props: { value: string[]; onChange: (files: string[]) => void; call: ...; max?: number }): JSX.Element`. `PhotoPicker` uploads through `POST /admin/catalog/uploads`, and Task 7 reuses it with `max={1}` for single images.

- [ ] **Step 1: Build the list.** Show a card grid with:
  - the first photo, name, type chip, and price;
  - a status pill: **Draft** / **Published** / **Unpublished changes**;
  - drag-to-reorder plus ↑/↓ buttons, which call `PUT /admin/catalog/products/order`;
  - an **+ Add product** card.
- [ ] **Step 2: Build the editor.** It is a native `<dialog>` with these fields:
  - name, type (Mirror/Package segmented control), price, description;
  - inclusions as an editable list (add/remove/reorder rows);
  - `PhotoPicker` (multiple; reorder; remove);
  - a "Visible on the site" switch.

  Footer buttons:
  - **Save draft**: PUT, or POST for a new product.
  - **Publish**: save, then publish.
  - **Discard changes**: only when the status is `changed`.
  - **Delete**: after `confirm('Delete "<name>"? It is removed from the site immediately.')`.
- [ ] **Step 3: Typecheck and lint**

Run: `cd web && npx tsc --noEmit -p . && npx eslint src/app/admin`
Expected: 0 errors.

- [ ] **Step 4: Click through it.** Log in at `/admin` with Playwright, using a token from `POST /auth/login` and the localStorage key `TOKEN_KEY` from `admin/page.tsx`. Create a product, Save draft, and check that `/catalog` doesn't show it. Publish, and check that `/catalog` shows it. Screenshot the Products tab at 1280×800.

---

### Task 7: Admin Page builder with live preview

**Files:**
- Create: `web/src/app/admin/_catalog/page-builder.tsx`, which holds `PageTab`.
- Create: `web/src/app/admin/_catalog/section-forms.tsx`, which holds one settings form per section type.
- Modify: `web/src/app/admin/catalog.tsx` to wire in the Page tab.

**Interfaces:**
- Consumes:
  - `GET/PUT /admin/catalog/page`, plus publish and discard (Task 4);
  - `GET /admin/catalog/products`, for the drafts in the preview and the product picker;
  - `GET /content`, for settings;
  - `CatalogSections` with `preview`, which gets draft products mapped to `PublicProduct` with visible ones only (Task 5);
  - `PhotoPicker` (Task 6).
- Produces: `export function PageTab(props: AdminProps): JSX.Element`

- [ ] **Step 1: Lay out the screen in three columns**, mirroring `admin/design-editor.tsx`:
  - **Left: the section list.** Each row has a drag handle, the type label ("Slideshow", "Mirrors", "Packages", "Text + photo", "Call to action"), a 👁 hide toggle, ↑/↓ buttons and a delete button. Below the list is **+ Add section**, a menu of the five types; "Mirrors" and "Packages" both create a products section with that `productType`.
  - **Middle: the live preview.** It renders `CatalogSections` from local state, with a Desktop/Phone width toggle (Phone = 390px wide frame).
  - **Right: the settings form** for the selected section.

  Clicking a section in the preview selects it.
- [ ] **Step 2: Build the section forms.**
  - **Slideshow:** a slides list (add/remove/reorder; per slide: `PhotoPicker max={1}`, heading, text, button label, button link) and an interval slider (3–15 s).
  - **Products:** heading; layout (Grid/Carousel/List); columns (2/3/4, hidden for list); a show prices switch; "Show: All <type>s / Choose…", where Choose shows that type's product checkboxes in order; background.
  - **Text + photo:** heading; body; image; image side; background.
  - **Call to action:** heading; text; button label; background.
  - **Background control (shared):** White / Tint / Photo; Photo shows `PhotoPicker max={1}`.
- [ ] **Step 3: Build saving.**
  - Edits update local state at once, which drives the preview.
  - The draft autosaves with `PUT /admin/catalog/page` 800 ms after the last change, and the header shows "Saving…" / "Draft saved".
  - Header buttons: **Publish** (flushes the pending save first), **Discard draft** (when `hasChanges` and published ≠ null, after a confirm), and **View live page** (`/catalog`, new tab).
  - A 400 from the API shows its message, keeps local state, and doesn't loop retrying.
- [ ] **Step 4: Typecheck and lint**

Run: `cd web && npx tsc --noEmit -p . && npx eslint src`
Expected: 0 errors.

- [ ] **Step 5: Click through it** with Playwright:
  - add a Text + photo section and type a heading → the preview updates;
  - reload → the draft persists, and `/catalog` is unchanged;
  - Publish → `/catalog` shows it;
  - hide it, Publish → it's gone from `/catalog`.

  Screenshot the Page tab at 1280×800 and phone preview mode.

---

### Task 8: Final verification

- [ ] **Step 1: Run the full suite**

Run: `cd api && pnpm test && pnpm test:e2e && npx tsc --noEmit -p . && cd ../web && npx tsc --noEmit -p . && npx eslint src`
Expected: all tests pass; 0 type errors; 0 lint errors (warnings existed before this work).

- [ ] **Step 2: Check for leftovers**

Run: `grep -rn -i "portfolio\|admin/content\|ContentItem" api/src api/test web/src`
Expected: nothing, except `migrateContent` and its test.

- [ ] **Step 3: Stop the servers** this plan started (ports 3000 and 4000).
