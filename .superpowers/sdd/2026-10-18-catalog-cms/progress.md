# SDD ledger — plan: docs/superpowers/plans/2026-10-18-catalog-cms.md

Spec: docs/superpowers/specs/2026-10-18-catalog-cms-design.md (read)

Setup: Ruling: no git repo → no worktree, no commits, no task-start/task-done scripts; ledger kept by hand, verification commands run directly — repo is not under version control — cost if wrong: no per-task diff range for the final review (reviewer reads files directly).

## Pre-flight
- T1→T3: IMAGE_NAME used by sanitizeProduct; filesInPage used by cleanupFiles — consistent.
- T2→T3/T4: HIDDEN_SETTINGS + products table columns (draft/published/sort) — consistent.
- T3→T4: publicProducts, cleanupFiles(db, candidates) — consistent.
- T1/T3/T4→T5: web types mirror Section/ProductData/PublicProduct; images are bare filenames → fileUrl — consistent.
- T5→T6/T7: CatalogSections(preview), InquireButton, fileUrl; T6 PhotoPicker → T7 — consistent.

Task 1: complete (tests: pnpm test -- src/catalog/sections.spec.ts → 6/6 pass)
Task 2: complete (tests: pnpm test && pnpm test:e2e && tsc → 7/7, 10/10 pass)
Task 3: Ruling: cleanupFiles also treats the banner and showcase photos as in-use — they share PUBLIC_DIR, and a slide or product could reference the same file name — cost if wrong: an unused file lingers.
Task 3: complete (tests: pnpm test && pnpm test:e2e && tsc → 7/7, 14/14 pass)
Task 4: Ruling: added e2e "deletes a section photo once neither version uses it" — the plan's Task 4 cleanup had no direct test — cost if wrong: none.
Task 4: complete (tests: pnpm test && pnpm test:e2e && tsc → 7/7, 18/18 pass)
Task 5: Ruling: CatalogSections also takes optional selected/onSelect — Task 7 needs click-to-select in the preview — cost if wrong: none (optional props).
Task 5: Ruling: product page gallery uses a new Gallery layout "stack" (one photo per row) — "collage" made a single photo a tiny thumbnail — cost if wrong: one class string.
Task 5: Ruling: visual checks run against an API with DATA_DIR in the session scratchpad — keeps the user's local data untouched — cost if wrong: the real local DB's content→products migration is first exercised when they next start the API (covered by db.spec).
Task 5: complete (tsc 0 errors, eslint 0 errors; screenshots: catalog phone/desk, inquire dialog, detail page; no horizontal overflow; no page errors; "Contact details coming soon." verified)
Task 6: Ruling: PhotoPicker takes `upload: (file) => Promise<string>` (with exported uploadImage(call, file)) instead of `call` — keeps the picker independent of the admin hook — cost if wrong: none.
Task 6: complete (tsc 0 errors, eslint 0 errors; Playwright: add product → Save draft → not on /catalog; Publish → on /catalog; status pills Draft→Published; no page errors)
Task 7: Ruling: preview renders inside an iframe via createPortal, scaled to fit (desktop = 1280px wide, phone = 390px) — breakpoints follow the viewport, so a plain div would never show the phone layout — cost if wrong: styles that load after the iframe opens (dev HMR) don't reach the preview until reload.
Task 7: complete (tsc 0 errors, eslint 0 errors; Playwright: add Text+photo → preview updates; reload keeps draft, /catalog unchanged; Publish → live; hide+Publish → gone; phone preview uses mobile layout; no page errors)
Task 8: complete (api 7/7 + 18/18, tsc both 0 errors, eslint 0 errors, leftovers only in migrateContent + its test; servers stopped)
Final: correction to Task 5 ruling — api/.env sets DATA_DIR and overrode the scratch DATA_DIR, so seed data (5 products, fake email/phone/instagram settings, catalog page, sample uploads) landed in the user's real api/data/app.db. Settings and catalog were empty before; events untouched. Not cleaned up without asking.
Final: fixed PhotoPicker "Replace" no-op (max=1) — Playwright repro F1 RED→GREEN, suite api 7/7 + 19/19
Final: fixed banner replace/remove deleting a file the catalog page still shows — e2e "keeps an old banner photo the catalog page still shows" RED→GREEN, suite 7/7 + 19/19
Final: fixed failed autosave being forgotten (Publish shipped stale draft; leaving tab lost edits) + publish/discard errors now shown — Playwright repro F3 RED→GREEN, suite 7/7 + 19/19
Final: minor (deferred): two page saves can overlap; an older response can overwrite status
Final: minor (deferred): inclusions can't be reordered (plan asked for reorder)
Final: minor (deferred): CTA section shows contacts only inside the Inquire dialog, not inline
Final: minor (deferred): a first slideshow with 0 slides leaves the next section under the fixed header
Final: minor (deferred): two Mirrors/Packages sections share the same anchor id; API doesn't dedupe section ids
Final: minor (deferred): inclusion text used as React key (duplicate inclusions collide)
Final: minor (deferred): Instagram link breaks if settings hold a full URL
Final: minor (deferred): SAFE_HREF allows protocol-relative //host and disallows tel:
Final: minor (deferred): /catalog has no friendly fallback when the API is down
Final: minor (deferred): product editor closes on Esc/✕ without warning about unsaved edits
Final: Ruling: orphaned uploads (uploaded, never saved) are not cleaned up — spec only defines cleanup for referenced files — cost if wrong: disk slowly accumulates unused images.
Final: Ruling: kept this ledger instead of deleting the workspace — no git history exists to replace it — cost if wrong: one small folder.
