# Supabase Backend + Portable Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Fae-Fable API from `node:sqlite` + local disk to Postgres + pluggable object storage (Supabase Storage or S3), so the same code deploys to Vercel today and to Docker anywhere later.

**Architecture:**
- **Database:** a thin `Pg` wrapper over a `pg` Pool. SQL keeps `?` placeholders and a `$s.` schema prefix, which the wrapper rewrites to `$n` and the configured schema, so queries port nearly verbatim.
- **Files:** go through a `FileStore` interface with `supabase` and `s3` drivers, plus an in-memory fake used only in tests.
- **Uploads:** the browser resizes every image to ≤2560 px JPEG 85% and sends one file per request, under 4 MB.
- **Private photos:** routes keep their access checks, then 302-redirect to signed URLs.
- **Public files:** linked straight from storage.
- **Modules move over one at a time:** each switches to `Pg` + `FileStore` on its own, with sqlite removed last.

**Tech Stack:** NestJS 12 (ESM, pnpm), `pg`, `@supabase/supabase-js`, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, Vitest + supertest, Next.js 16, Docker.

**Spec:** `docs/superpowers/specs/2026-10-19-supabase-portable-deploy-design.md`

## Global Constraints

- **Commit after each task on the branch `supabase-migration`.** Create it from `main` before Task 1. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push and never merge without the owner.
- **New dependencies:** `pg`, `@types/pg`, `@supabase/supabase-js`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. No others.
- **Every query names the schema explicitly** through the `$s.` prefix and never relies on `search_path`. `DB_SCHEMA` must match `/^[a-z_][a-z0-9_]*$/`.
- **Migrations never run at API startup.** They run through `pnpm db:migrate` only.
- **Storage:** `STORAGE_DRIVER` is `supabase` (default) or `s3`, with no disk driver. The service-role key and S3 secrets are API-only; never put them under `NEXT_PUBLIC_*`.
- **Uploads:** each uploaded file is at most **4 MB**, images only (`jpe?g|png|webp|gif|heic|heif`). The browser resizes to **2560 px longest side, JPEG quality 0.85**, and sends **one file per request**.
- **No videos** anywhere: remove `isVideo`, `<video>`, and `mp4|mov`.
- **No scheduler and no automatic purge.** Expired events are deleted only by admin action, and their links still return 410.
- **Fresh data:** no migration from SQLite.
- **API routes and response shapes stay the same** except:
  - public file fields become bare file names (`settings.banner`, showcase `cover` and photo `file`, `design.background`), which the web turns into links with `fileUrl()`;
  - `isVideo` is removed;
  - private photo routes return a 302 redirect.
- **Local secrets:** copy them from `TPC-Space/apps/api/.env` into `Fae-Fable/api/.env` (gitignored). Never print them or commit them.
- **`api/.env` overrides shell env** (`process.loadEnvFile`). Isolated runs must use their own working directory and env, as in the 2026-10-18 incident.

## Review Focus

1. **Signed-URL leakage:** a guest token for event A must never get a redirect to event B's photo, and an expired event's photo routes return 410, not a redirect. → Task 5 test `private photo routes redirect only after access checks`.
2. **Deleting an event must remove every stored file** (photos and design background), not just database rows. → Task 5 test `deleting expired events removes their files`.
3. **HEIC or unreadable images in the browser:** resize falls back to sending the original if it's ≤4 MB, and otherwise shows "This photo couldn't be prepared — try a JPEG or screenshot." → Task 7, Step 4 check.
4. **Partial failure mid-batch:** with one-per-request uploads, a failure on photo 7 of 20 keeps photos 1–6 and reports which failed, rather than silently stopping. → Task 7, Step 4 check.
5. **Schema isolation:** nothing Fae-Fable creates appears outside `DB_SCHEMA` or outside its two buckets. → Task 1 test `migrate creates tables only inside the configured schema`.

---

### Task 1: Postgres layer, migrations, and the test harness

**Files:**
- Create:
  - `api/src/pg.ts`: `Pg` provider, `prepareSql`;
  - `api/migrations/001_init.sql`;
  - `api/src/migrate.ts`: `migrate(pg)`;
  - `api/src/migrate-cli.ts`;
  - `api/test/pg-harness.ts`;
  - tests: `api/src/pg.spec.ts`, `api/src/migrate.spec.ts`.
- Modify:
  - `api/src/config.ts`: add `databaseUrl` (required `DATABASE_URL`) and `dbSchema` (`DB_SCHEMA`, default `fae_fable`, validated);
  - `api/package.json`: add `pg`, `@types/pg`, and the script `"db:migrate": "nest build && node dist/migrate-cli.js"`;
  - `api/src/db.ts`: register `Pg` in the global `DbModule` alongside `Db` for now;
  - `api/.env`: add `DATABASE_URL`, copied from TPC-Space's `DATABASE_URL`;
  - `api/.env.example`.

**Interfaces:**
- Produces:
  ```ts
  export function prepareSql(sql: string, schema: string): string; // '?' → $1..$n (outside quoted literals); '$s' → '"<schema>"'
  @Injectable() export class Pg implements OnModuleDestroy {
    readonly schema: string;
    query<T>(sql: string, params?: unknown[]): Promise<T[]>;
    one<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
    exec(sql: string, params?: unknown[]): Promise<{ rowCount: number; rows: { id: number }[] }>; // use "... RETURNING id" when an id is needed
    tx<T>(fn: (q: Pick<Pg, 'query' | 'one' | 'exec'>) => Promise<T>): Promise<T>;
  }
  export async function migrate(pg: Pg): Promise<string[]>; // applies pending files in api/migrations by name order; returns applied names
  // test/pg-harness.ts
  export async function freshSchema(): Promise<{ schema: string; drop: () => Promise<void> }>; // creates fae_fable_test_<random>, sets process.env.DB_SCHEMA, runs migrate
  ```
- **Schema (`001_init.sql`):** Postgres versions of every table in today's `SCHEMA` (`api/src/db.ts`): `settings`, `products`, `events`, `showcases`, `showcase_photos`, `messages`, `photos`, plus `schema_migrations(name text primary key, applied_at timestamptz default now())`.
  - ids are `integer generated always as identity`;
  - `is_public` is `boolean`;
  - `design`, `products.draft` and `products.published` are `jsonb`;
  - `expires_at` and `created_at` are `timestamptz default now()`;
  - `event_date` stays `text` (`YYYY-MM-DD`);
  - foreign keys use `ON DELETE CASCADE` / `SET NULL` as today;
  - the migration also adds `photos.guest_name` and `photos.message_id`.
  - Prefix every table with `$s.`, and start with `CREATE SCHEMA IF NOT EXISTS $s;`. `prepareSql` replaces every `$s` token (followed by `.` or a word boundary) with the quoted schema name.
- **Counts:** cast every `COUNT(*)` to `::int` in queries, so results come back as numbers.

- [ ] **Step 1: Write failing tests.**
  - **`pg.spec.ts`:**
    - `prepareSql('SELECT * FROM $s.events WHERE id = ? AND slug = ?', 'fae_fable')` → `'SELECT * FROM "fae_fable".events WHERE id = $1 AND slug = $2'`;
    - `prepareSql` leaves `'?'` inside single-quoted literals alone (`"SELECT '?' , ?"` → `"SELECT '?' , $1"`);
    - `new Pg()` throws when `DB_SCHEMA` is `"bad-name"`.
  - **`migrate.spec.ts`:** uses `freshSchema()`.
    - **`migrate creates tables only inside the configured schema`:** `information_schema.tables` where `table_schema = schema` lists the 8 tables, and none of those table names appear in schema `public` as a result of this run (compare before/after).
    - Running `migrate` twice returns `[]` the second time.
- [ ] **Step 2: Run and confirm they fail**

  Run: `cd api && pnpm test -- src/pg.spec.ts src/migrate.spec.ts`
  Expected: FAIL, cannot find `./pg.js`.

- [ ] **Step 3: Implement** `pg.ts`, `001_init.sql`, `migrate.ts`, `migrate-cli.ts` and `pg-harness.ts`, and add the dependencies (`pnpm add pg && pnpm add -D @types/pg`).
- [ ] **Step 4: Run and confirm they pass**

  Run: `cd api && pnpm test && pnpm test:e2e`
  Expected: the new unit tests pass, and the existing 20 e2e tests still pass (still on sqlite).

- [ ] **Step 5: Commit** with the message `feat(api): add Postgres layer and migrations`.

---

### Task 2: FileStore interface and drivers

**Files:**
- Create:
  - `api/src/storage/file-store.ts`: interface and `FILE_STORE` token;
  - `api/src/storage/supabase-store.ts`;
  - `api/src/storage/s3-store.ts`;
  - `api/src/storage/storage.module.ts`: picks the driver from config;
  - `api/test/memory-store.ts`;
  - test: `api/src/storage/file-store.spec.ts`.
- Modify:
  - `api/src/config.ts`: add `storage: { driver, supabaseUrl, serviceRoleKey, publicBucket, privateBucket, s3: {...} }`;
  - `api/.env`: add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from TPC-Space;
  - `api/.env.example`: document every storage variable from the spec.

**Interfaces:**
- Produces:
  ```ts
  export type Bucket = 'public' | 'private';
  export interface FileStore {
    put(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void>;
    remove(bucket: Bucket, keys: string[]): Promise<void>; // missing keys are not an error; [] is a no-op
    publicUrl(key: string): string; // public bucket only
    signedUrl(key: string, opts?: { expiresIn?: number; download?: string }): Promise<string>; // private bucket; default 600 s; download = filename for Content-Disposition
    ensureBuckets(): Promise<void>; // supabase: create both if missing (public bucket public); s3: no-op
  }
  export const FILE_STORE = Symbol('FILE_STORE');
  export function newKey(ext: string): string; // `${randomUUID()}${ext.toLowerCase()}`
  // test/memory-store.ts
  export class MemoryStore implements FileStore { has(bucket: Bucket, key: string): boolean; /* signedUrl → `memory://private/<key>?download=…` */ }
  ```
- **Env defaults:** `STORAGE_DRIVER=supabase`, `SUPABASE_PUBLIC_BUCKET=fae-fable-public`, `SUPABASE_PRIVATE_BUCKET=fae-fable-private`.

- [ ] **Step 1: Write the failing contract test** `file-store.spec.ts`, which runs one shared suite against `MemoryStore` always, `SupabaseStore` when `SUPABASE_URL` is set, and `S3Store` when `S3_ENDPOINT` is set:
  - `put` then `publicUrl` returns a URL ending in `/<key>` that, for real drivers, `fetch` returns 200;
  - `signedUrl` for a private key fetches 200 for real drivers;
  - `remove([key])` makes that fetch 404 or 400;
  - `remove([])` resolves.

  Test keys use the prefix `test/<random>/`, cleaned up in `afterAll`.
- [ ] **Step 2: Run and confirm it fails**

  Run: `cd api && pnpm test -- src/storage`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement** the drivers and `StorageModule` (global, provides `FILE_STORE`), and add the dependencies.
- [ ] **Step 4: Run and confirm it passes**

  Run: `cd api && pnpm test -- src/storage`
  Expected: the memory and Supabase suites pass against the local stack (S3 skipped).

- [ ] **Step 5: Commit** with the message `feat(api): add FileStore with Supabase and S3 drivers`.

---

### Task 3: Port content, banner and catalog to Pg + FileStore

**Files:**
- Modify:
  - `api/src/content.ts`, `api/src/catalog/{products,page,files}.ts`, `api/src/uploads.ts`: replace `uploadOptions` with `imageUpload()` = multer `memoryStorage`, the 4 MB limit and the image-only filter;
  - `api/src/main.ts`: drop `useStaticAssets`;
  - `api/test/app.e2e-spec.ts`: the harness uses `freshSchema()` and `.overrideProvider(FILE_STORE).useValue(store)`; file-existence checks become `store.has('public', name)`.

**Interfaces:**
- Consumes: `Pg`, `FileStore`, `FILE_STORE`, `newKey`, `MemoryStore`, `freshSchema`.
- Produces:
  - `export function imageUpload(): MulterOptions` in `uploads.ts`;
  - `cleanupFiles(pg: Pg, store: FileStore, candidates: string[]): Promise<void>`;
  - `publicProducts(pg: Pg): Promise<PublicProduct[]>`;
  - `GET /content`'s `settings.banner` becomes a bare file name.

- [ ] **Step 1: Update the existing content, banner and catalog e2e tests** to the new harness and to the bare-name banner:
  - `expect(first).toMatch(/^[\w-]+\.jpg$/)` replaces `/files/…`;
  - `store.has('public', first) === false` after replacing it;
  - add `POST /admin/catalog/uploads` with a 5 MB buffer named `big.jpg` → 413 or 400.
- [ ] **Step 2: Run and confirm they fail**

  Run: `cd api && pnpm test:e2e`
  Expected: content and catalog tests FAIL. The showcase and events tests may also fail until Tasks 4–5; note them, don't fix them yet.

- [ ] **Step 3: Port the modules.** Every `this.db.sql.prepare(x).get/all/run` becomes `await this.pg.one/query/exec(x, [...])`. JSON columns go in as objects and come back parsed, so drop `JSON.stringify`/`JSON.parse` around `draft`/`published`/`design`. Status comparison: compare `JSON.stringify` of both parsed values.
- [ ] **Step 4: Run and confirm content and catalog pass**

  Run: `cd api && pnpm test:e2e -t "content|catalog"`
  Expected: PASS.

- [ ] **Step 5: Commit** with the message `refactor(api): content and catalog on Postgres + FileStore`.

---

### Task 4: Port showcases (photo-only, one photo per request)

**Files:**
- Modify: `api/src/showcases.ts`, `api/test/app.e2e-spec.ts`.

**Interfaces:**
- Produces:
  - `POST /admin/showcases` takes JSON with no files;
  - new `POST /admin/showcases/:id/photos` takes multipart `photo` (one file) and returns the showcase detail;
  - `PATCH` stays fields-only;
  - photo DTO is `{ id, file }`, and `cover` is a bare file name;
  - `isVideo` is removed.

- [ ] **Step 1: Update the showcase e2e test:**
  - create the showcase, then add two photos one at a time;
  - `clip.mp4` → 400;
  - deleting a photo makes `store.has('public', file)` false;
  - deleting the showcase removes all its files.
- [ ] **Step 2: Run** `pnpm test:e2e -t showcase` and confirm it FAILS.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:e2e -t showcase` and confirm it PASSES.
- [ ] **Step 5: Commit** with the message `refactor(api): showcases on Postgres + FileStore, photos only`.

---

### Task 5: Port events (guest, client, admin), manual cleanup, extend

**Files:**
- Modify: `api/src/events.ts`, `api/test/app.e2e-spec.ts`.

**Interfaces:**
- Produces:
  - **Removed:** `EventsService.onModuleInit`, the purge timer, the client-code backfill, and `isVideo`.
  - **`POST /guest/:slug/photos`:** `FilesInterceptor('photos', 1, imageUpload())`; files are stored at `private` key `events/<eventId>/<newKey>`.
  - **Design background:** `public` key `backgrounds/<newKey>`; `design.background` is the bare key.
  - **Private photo routes** (`GET /guest/:slug/photos/:id?t=`, `GET /client/:token/photos/:id[?download=1]`, `GET /events/:slug/cover`): run the existing checks unchanged, then `res.redirect(302, await store.signedUrl(key, { download }))` with `Cache-Control: private, max-age=300`. `GET /guest/:slug/background` is removed (the background is public now).
  - **`DELETE /admin/events/expired`** → `{ deleted: number; photos: number }`. It deletes every event whose `expires_at <= now()`, its rows (cascade) and its stored files.
  - **`DELETE /admin/events/:id`** also removes the stored files.
  - **`GET /admin/events`** items gain `expired: boolean`.
  - **`PATCH /admin/events/:id` with `eventDate`:** recomputes `expires_at` and no longer refuses past dates.

- [ ] **Step 1: Update and add the e2e tests:**
  - **Port** every existing events/guest/client/wall/notes test to the harness. Photo GETs that expected 200 now expect 302, with a `Location` starting `memory://private/events/`.
  - **`private photo routes redirect only after access checks`:**
    - no token → 401;
    - another event's guest token → 401;
    - a client token for another event → 404;
    - after setting the event's `expires_at` to the past (via `PATCH eventDate` to 20 days ago), the guest and client photo routes → 410.
  - **`deleting expired events removes their files`:**
    - two events, one moved to the past with two photos and a background;
    - `DELETE /admin/events/expired` → `{ deleted: 1, photos: 2 }`;
    - the `store.has` checks for those three keys are false;
    - the live event is untouched.
  - **`admins can extend an expired event`:**
    - PATCH to a past date → 200 and `expired: true`;
    - guest `GET /guest/:slug` → 410;
    - PATCH to today → `expired: false`, and the guest page is 200 again.
- [ ] **Step 2: Run** `pnpm test:e2e` and confirm the events tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test && pnpm test:e2e && npx tsc --noEmit -p .` and confirm all PASS.
- [ ] **Step 5: Commit** with the message `refactor(api): events on Postgres + FileStore; manual cleanup and extend`.

---

### Task 6: Remove sqlite; Vercel entry, Docker, CORS list

**Files:**
- Delete: the `Db` class and `SCHEMA` in `api/src/db.ts` (keep `DbModule` exporting `Pg`), `api/src/db.spec.ts`, and `DATA_DIR`/`uploadsDir` from config.
- Create:
  - `api/src/serverless.ts`: Vercel handler (read Vercel's current NestJS docs first, via WebFetch `https://vercel.com/docs/frameworks/backend/nestjs`, and follow them);
  - `api/vercel.json` if the docs require it;
  - `api/Dockerfile`, `web/Dockerfile`, `docker-compose.yml`, `.dockerignore` files.
- Modify:
  - `api/src/main.ts`: `enableCors({ origin: config.webUrls })`, where `webUrls` comes from comma-separated `WEB_URL`;
  - `web/next.config.ts`: `output: "standalone"`;
  - `docs/development.md`: the Configuration table, Supabase local setup, `db:migrate`, the Vercel two-project setup and Docker.

**Interfaces:**
- Produces: `config.webUrls: string[]`. `GET /` on the API returns `{ ok: true }` as a health check.

- [ ] **Step 1: Write the failing e2e test** `CORS allows each configured web origin`: with `WEB_URL="http://a.test,http://b.test"`, a request with `Origin: http://b.test` gets `access-control-allow-origin: http://b.test`, and `http://c.test` gets no allow-origin header.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement**, then delete sqlite and run `grep -rn "node:sqlite\|DATA_DIR\|uploadsDir\|isVideo\|mp4" api/src web/src`. Expected: no output.
- [ ] **Step 4: Verify the builds:**
  - `cd api && pnpm test && pnpm test:e2e && pnpm build` → all pass;
  - `docker build -t ff-api api && docker build -t ff-web --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 web` → both succeed (use `podman` if `docker` is absent).
- [ ] **Step 5: Commit** with the message `chore: remove sqlite; add Vercel entry, Dockerfiles, CORS list`.

---

### Task 7: Web: resize + one-per-request uploads, public file URLs, no videos, expired-events admin

**Files:**
- Create: `web/src/lib/resize.ts`.
- Modify:
  - `web/src/lib/api.ts`: `fileUrl(name)` uses `NEXT_PUBLIC_FILES_URL`; remove `isVideo` from types;
  - `web/src/app/e/[slug]/page.tsx`: the guest `onUpload` loops one file per request and aggregates progress;
  - `web/src/components/guest-view.tsx`: shows per-file failures;
  - `web/src/app/admin/_catalog/products.tsx` (`uploadImage` resizes);
  - `web/src/app/admin/settings.tsx` (banner);
  - `web/src/app/admin/design-editor.tsx` (background resize; preview via `fileUrl`);
  - `web/src/app/admin/showcases.tsx` (create, then upload photos one at a time; photo-only input);
  - `web/src/app/admin/events.tsx` (an "Expired" section: photo counts, Delete, Delete all expired, extend via the existing date edit);
  - remove the `<video>` branches in `components/gallery.tsx`, `app/c/[token]/page.tsx`, `app/events/[id]/page.tsx` and `admin/showcases.tsx`;
  - switch every `API + <public file>` to `fileUrl(...)`: `app/page.tsx` (hero), `events/page.tsx` and `events/[id]/page.tsx` (covers), and `e/[slug]/page.tsx` (background);
  - `web/.env.example` adds `NEXT_PUBLIC_FILES_URL`.

**Interfaces:**
- Consumes: the API changes from Tasks 3–6.
- Produces: `export async function resizeImage(file: File, maxSide = 2560, quality = 0.85): Promise<File>` in `web/src/lib/resize.ts`.
  - It decodes with `createImageBitmap`, scales so the longest side ≤ `maxSide` (never upscales), and re-encodes with `canvas.toBlob('image/jpeg', quality)` to `<name>.jpg`.
  - If decoding fails and `file.size ≤ 4 MB`, it returns the original. Otherwise it throws `new Error("This photo couldn't be prepared — try a JPEG or screenshot.")`.

- [ ] **Step 1: Implement `resize.ts`**, then run `cd web && npx tsc --noEmit -p .`. Expected: 0 errors.
- [ ] **Step 2: Update all the call sites listed above.** Run `grep -rn "isVideo\|<video\|API + " web/src`. Expected: only `API + ` uses for private photo URLs (`p.url`) remain.
- [ ] **Step 3: Lint and build**

  Run: `cd web && npx eslint src && npm run build`
  Expected: 0 errors, and the build succeeds.

- [ ] **Step 4: Check it in a browser** against the local Supabase stack. Run the API from a scratch working directory with an explicit env and a `DB_SCHEMA=fae_fable_check` schema migrated with `pnpm db:migrate`, then drop that schema after; run the web on separate ports. Use Playwright from `TPC-Space/node_modules/playwright`, and check:
  - the guest uploads three 4000×3000 JPEGs, and each stored object is ≤2560 px and <4 MB (check via signed URL plus image dimensions);
  - a forced failure on photo 2 (route-intercept a 500) keeps photos 1 and 3 and shows which one failed (Review Focus 4);
  - an unreadable 5 MB `.heic` (random bytes) shows the "couldn't be prepared" message (Review Focus 3);
  - the catalog photo, banner, background and showcase uploads all render from storage URLs;
  - the admin expired section deletes an expired event, and extending brings a guest link back.
- [ ] **Step 5: Commit** with the message `feat(web): resize uploads, storage URLs, expired-events admin; drop videos`.

---

### Task 8: Local wiring and final verification

- [ ] **Step 1:** `cd api && pnpm db:migrate` against the real local schema `fae_fable` (this creates the buckets too). Expected: it lists `001_init.sql` as applied.
- [ ] **Step 2:** Run the full suite: `cd api && pnpm test && pnpm test:e2e && npx tsc --noEmit -p . && cd ../web && npx tsc --noEmit -p . && npx eslint src && npm run build`. Expected: everything passes.
- [ ] **Step 3:** Check isolation: `psql "$DATABASE_URL" -c "\dn"` shows `fae_fable` and no leftover `fae_fable_test_*` schemas, and TPC-Space's tables are untouched (compare the table counts in `public` before and after).
- [ ] **Step 4:** Stop every server this plan started (by PID; never the owner's servers on 3000/4000) and commit any doc updates.
