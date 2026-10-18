# Catalog page and catalog CMS: design

Date: 2026-10-18
App: Fae-Fable (mirror selfie booth business). `web/` is Next.js 16 (App Router, `cacheComponents`), Tailwind v4. `api/` is NestJS on `node:sqlite`, using pnpm.

## Intent

Fae&Fable rents out mirror photo booths. Couples and event planners visit the site to choose a booth. Today the homepage has a flat "Catalog" list (title, description, price, one image), and the admin manages it through one small "Add item" form.

The owner wants two things:

1. **A real catalog page** that shows the different kinds of mirrors the shop offers, plus the packages built around them. It should make visitors want to book, in the same spirit as the guest photo page, which was redesigned to pull guests toward sharing.
2. **A CMS in the admin** where the owner manages the products and *designs* the catalog page: its layout, its look, slideshows, and so on, "anything a good CMS has", without a developer.

## Decided with the owner

- **Editing model: a section builder** (like the Shopify or Squarespace page editors). The owner compared it with "one template with switches" and "free-form drag-anywhere canvas" and picked this one. The page is a vertical stack of ready-made sections. The admin adds, reorders (drag), hides, deletes and configures sections, with a live preview beside the controls. Each section is pre-designed, so the page always looks polished and works on phones.
- **Two halves in Admin → Catalog:**
  - **Products:** the list of everything the shop offers.
  - **Page:** the section builder for the catalog page.
- **Product types:** `mirror` (a kind of booth) and `package` (a bundle, such as "Gold: 3 hrs + album").
- **Each product has:** name, type, several photos, price text (free text such as "₱15,000" or "from ₱9,000", as now), description, a list of what's included, and a visible/hidden switch.
- **Starting section types:**
  - **Slideshow:** large rotating photos. Each slide has an optional heading, text and button (label + link).
  - **Mirrors:** shows mirror products.
  - **Packages:** shows package products.
  - **Text + photo:** a story or about block.
  - **Call to action:** "Book now" heading and button, plus the business's contact details.
- **Per-section settings** (where they apply): heading, layout (grid / carousel / list), column count, show prices on/off, which products to show (all of that type, or a hand-picked list), and background (white / accent tint / photo).
- **Draft and publish, for the page and for products:** edits are saved as a draft, and visitors keep seeing the last published version until the admin clicks **Publish**.
  - This covers the page layout and every product, including its name, price, photos, inclusions and visibility.
  - Each product has its own **Publish** button, and so does the page.
  - A new product stays a draft, invisible to visitors, until it is published for the first time.
- **How visitors ask for something:** every mirror and package has an **Inquire** button. There is no cart and no online payment.

## Builder's calls (my decisions; the owner can overrule them)

- **The catalog becomes its own page at `/catalog`.** The homepage's current Catalog section is removed, and the "Catalog" link in the floating nav (homepage and `/events` chrome) points to `/catalog`. The homepage keeps its banner, about, contact and Events link.
- **Product detail page at `/catalog/[id]`:** a photo gallery (reuse `components/gallery.tsx`), name, price, description, the inclusions list, and an Inquire button. Mirror and package cards on `/catalog` link to it.
- **Inquire** opens a small native `<dialog>` in place, wherever the button is (catalog card or detail page). It lists the contact options from settings that exist:
  - email: a `mailto:` link with the subject prefilled as "Inquiry: <product name>";
  - phone: a `tel:` link;
  - Instagram.

  It doesn't depend on the call-to-action section, so the admin can freely hide or delete that section. No inquiry form or inbox for now.
- **Data model:** a new `products` table. Each row holds a `draft` JSON column (name, type, price, description, inclusions, photos, visible) and a `published` JSON column (`NULL` = never published), plus a `sort` order.
  - Publishing a product copies `draft` into `published`, and **Discard changes** copies it back.
  - Public endpoints read only `published`; the admin and the preview read `draft`.
  - The preview shows draft products, so the admin sees exactly what Publish will produce.
  - Product photos follow the same cleanup rule as section photos: delete a file only once neither `draft` nor `published` refers to it.
  - Deleting a product removes it from the site at once (no draft step for deletes), after a confirm.
  - The admin's product list shows a status on each product: *Draft*, *Published*, or *Published · unpublished changes*.

  The page is stored as JSON. One settings row (`catalogDraft`) holds the draft and one (`catalogPublished`) holds the published version; each is an ordered array of `{ id, type, hidden, settings }` sections. The old `content` table and its admin form and endpoints are removed. A one-off startup migration moves existing `package` rows into `products` as type `package`, drops any `portfolio` rows (the owner asked for everything portfolio-related to go, and none are known to exist), then drops the table.
- **Publish copies the whole draft** into `catalogPublished`. A **Discard draft** action copies the published version back over the draft.
- **Photo cleanup:** a section photo is only deleted from disk once neither the draft nor the published page refers to it. Check this on save, publish and discard.
- **Keep the draft private:** the public `GET /content` currently returns every `settings` row. It must leave out `catalogDraft` and `catalogPublished`. The public catalog is served by its own endpoint, which returns the published page only, and the draft is admin-only.
- **Slideshow and section photos** are uploaded to the existing public files folder, using the same image-only upload rules (`IMAGES_ONLY`, 15 MB).
- **Fresh install default page:** Slideshow (with a placeholder slide that uses the homepage banner if one exists), Mirrors grid, Packages grid, Call to action. The page should look reasonable before the owner touches it.
- **Accent color and fonts** come from the existing site theme (`globals.css`), and sections never pick fonts. The background choice is limited to white / tint / photo, so the look stays consistent.

## Non-goals

- A cart, checkout, booking calendar or online payment.
- An inquiry form, or storing inquiries in the admin.
- A free-form canvas, or per-element positioning.
- Editing the homepage, events pages or guest page with the builder (the catalog page only, for now).
- Multiple catalog pages, version history beyond draft/published, or scheduled publishing.
- Multi-language content.

## Anti-goals (this fails even if it technically works when…)

- The admin can make the page look broken or unreadable on phones.
- Visitors see half-finished edits.
- A visitor can't tell how to ask about a mirror within a few seconds of landing.
- Adding a mirror requires touching code.

## Constraints

- Follow the app's existing patterns:
  - admin sections live in `web/src/app/admin/*.tsx` and use `useAdmin`;
  - API controllers use `AdminGuard`, `uploadOptions`, `removeFile`;
  - e2e tests go in `api/test/app.e2e-spec.ts`;
  - native `<dialog>` for modals;
  - the guest design editor (`admin/design-editor.tsx`) already has a "settings left, live phone preview right" layout worth mirroring.
- Next 16 has breaking changes from older versions: read `web/node_modules/next/dist/docs/` before writing routes. Public pages fetch with `api()` inside `<Suspense>` (see `app/page.tsx`).
- Validate everything server-side:
  - section types and settings against a fixed schema;
  - unknown keys dropped;
  - text length limits;
  - product ids in hand-picked lists must exist (or are silently skipped when rendering).
- Images are served from `/files/…`, as now.
- No new dependencies unless a drag-to-reorder library is clearly worth it. Native HTML drag-and-drop with up/down buttons as the accessible fallback is acceptable.

## Left to the builder

- The exact visual design of each section and the product card, within the site's existing look (Playfair-style display headings, plum/pink palette).
- The slideshow's timing, transitions and controls (it must respect `prefers-reduced-motion` and be keyboard and screen-reader usable).
- How the live preview renders: the same React components as the public page are strongly preferred, with a desktop/phone width toggle.
- How products are reordered within the Products list.
- API endpoint shapes.
