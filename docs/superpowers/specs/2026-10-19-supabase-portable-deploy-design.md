# Supabase backend and portable deployment: design

Date: 2026-10-19
App: Fae-Fable. `web/` is Next.js 16 and `api/` is NestJS 12 (ESM, pnpm), both in one git repo.

## Intent

Fae-Fable currently stores everything on the API server's own disk: a `node:sqlite` file plus an uploads folder. That rules out Vercel and any host without a persistent disk.

The owner wants:
- Fae-Fable on **Supabase**: Postgres for the data, Supabase Storage for the photos.
- **Both apps deployed on Vercel first**, as two Vercel projects from the same repo.
- Vercel to be only the first target. The same code must run elsewhere without a rewrite, with **Docker** as the portable path.

## Decided with the owner

- **Separate apps:** web and API stay separate apps and deploy separately (web: Root Directory `web`; API: Root Directory `api`).
- **API on Vercel**, plus a Dockerfile so it can run on any container host.
- **Local development** reuses the Supabase stack TPC-Space already runs on this machine (supabase CLI under Podman, Postgres on `127.0.0.1:54322`, credentials in `TPC-Space/apps/api/.env`). Production credentials are set in Vercel's environment settings by the owner.
- **Fresh data:** start with an empty database. Nothing is migrated from the current SQLite file or uploads folder.
- **Photo size:** guest photos are resized **in the browser** before upload to **2560 px on the longest side, JPEG at 85% quality** (typically 0.8–2 MB), and uploaded **one photo per request**, so every request stays under Vercel's ~4.5 MB request-body limit. The owner accepted that hosts get this copy, not the untouched original; it still prints 4×6 and 5×7 well.
- **Cleanup becomes manual:** no timer and no scheduler.
  - Guest and client links still stop working 15 days after the event (the existing check stays).
  - Data and photos stay stored until the admin deletes them.
  - The admin's events screen lists expired events, each showing how many photos it holds, with a **Delete** button per event and a **Delete all expired** button, each behind a confirm.
- **Admins can extend an expired event:** they edit its date to a later one, the expiry is recomputed, and its guest and client links work again.
  - The API's current refusal of dates whose expiry is already past is removed: it existed only because the old purge would have wiped the event immediately.
  - A date edit that leaves the expiry in the past simply keeps the event expired; nothing is deleted.
- **Videos are removed from the app entirely.**
  - Showcase uploads become photo-only, like guest uploads.
  - All video handling goes: the `isVideo` fields in API responses, video rendering in the web app, and `mp4`/`mov` in the upload allow-list.
- **Production gets its own Supabase project** (its own database and storage). The owner sets its credentials later as environment variables; the backend reads everything it needs from env, documented in `api/.env.example`.

## Builder's calls (mine; the owner can overrule)

- **Database:** plain Postgres through a `DATABASE_URL` connection string, using the `pg` (node-postgres) driver.
  - Nothing in the code depends on Supabase for data, so any Postgres works later.
  - All Fae-Fable tables live in their own Postgres schema, named by `DB_SCHEMA` (default `fae_fable`). Locally that keeps them apart from TPC-Space's tables in the shared database; in production the dedicated project uses the same schema.
  - **Every query names the schema explicitly** (from config) rather than relying on `search_path`, because Supabase's transaction-mode connection pooler, which serverless functions use, may not keep session settings between queries.
- **Schema changes** are numbered SQL files in `api/migrations/`, applied by a `pnpm db:migrate` script that records what has run.
  - Migrations never run at API startup, because a serverless cold start is the wrong place for them.
  - Locally you run the script yourself; in production, as a deploy step or by hand.
- **The data layer becomes async:** `node:sqlite` is synchronous and `pg` is not, so every database call becomes `await`ed. This touches most API files (about 50 call sites) but no behavior.
- **Storage goes behind a small interface** (`put`, `remove`, `publicUrl`, `signedUrl`), with two implementations chosen by `STORAGE_DRIVER` (decided with the owner: no plain-folder option):
  - `supabase` (default): Supabase Storage, with two buckets, `fae-fable-public` (catalog photos, showcase photos, banner, guest-page backgrounds) and `fae-fable-private` (guest event photos).
  - `s3`: any S3-compatible service (AWS S3, Cloudflare R2, MinIO), configured with `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`, and an optional `S3_PUBLIC_URL` for public links.
- **Serving files:**
  - Public files are linked straight from storage, so the API no longer serves `/files/`.
  - Private event photos keep their access checks (guest token, client token). Once a check passes, the API **redirects (302) to a short-lived signed URL** instead of streaming the file, because Vercel functions also cap response size at ~4.5 MB and streaming wastes function time.
  - The client's "download" link uses a signed URL that asks the browser to save rather than display.
- **Upload size limits for admins too:** admin uploads (catalog photos, showcase photos, banner, guest-page background) go through the same browser resize, since they share the request limit. The API rejects any single file over **4 MB**.
- **Vercel entry point:** the API exports its Nest app as a serverless handler (Vercel's NestJS support, or a small `api/index.ts` adapter if needed), and `main.ts` keeps `app.listen()` for Docker and local runs. One codebase, two entry points.
- **Docker:**
  - `api/Dockerfile`: a multi-stage build on Node 22 (needs 22.13+) that runs `node dist/main`.
  - `web/Dockerfile`: a standalone Next build.
  - A root `docker-compose.yml` runs both, with Postgres and storage (Supabase or S3) supplied through env.
- **Configuration:**
  - `api/.env` gains `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_DRIVER`, and optional bucket names. `DATA_DIR` is removed.
  - It also gains `DB_SCHEMA` (default `fae_fable`).
  - Locally, the values are copied from TPC-Space's `apps/api/.env`.
  - `api/.env.example` documents all of it, with no real secrets.
- **CORS:** allow a comma-separated list in `WEB_URL`, so Vercel preview URLs can be allowed when wanted.
- **Tests:**
  - The e2e suite runs against real Postgres (the local Supabase DB) in a throwaway schema created per run and dropped afterwards.
  - Storage in tests is an in-memory fake injected by the test setup only (it is not a `STORAGE_DRIVER` option).
  - A small contract test for each real driver runs only when its credentials are present.
  - Existing tests keep their assertions; only the setup changes.
- **Auth is unchanged:** the single env-configured admin with JWTs, plus guest and client tokens.

## Non-goals

- Supabase Auth, Row Level Security, or calling Supabase from the browser for data. The browser only ever talks to the API.
- Direct browser-to-storage uploads (the resize keeps uploads under the limit instead).
- Keeping original-resolution photos.
- A scheduler or cron job of any kind.
- Migrating existing local data.
- Hosting changes beyond Vercel config, Dockerfiles and compose (no Kubernetes, no Terraform).

## Anti-goals (this fails even if it technically works when…)

- Anyone can read private guest photos without passing the existing guest or client checks.
- A guest upload fails because a photo exceeds the request limit. Resizing must handle normal phone photos, including large ones.
- Fae-Fable and TPC-Space can overwrite or see each other's data in the shared local Supabase.
- Moving off Vercel requires code changes rather than configuration.
- Secrets (the service-role key, DB password) end up in git or in the browser bundle.

## Constraints

- Keep the API's routes and response shapes, so the web app changes only where uploads and file URLs change.
- The service-role key is used only by the API.
- Next 16: read `web/node_modules/next/dist/docs/` before changing routes or build output (standalone mode for Docker).

## Left to the builder

- Exact table DDL (port the current SQLite schema to Postgres types; keep JSON columns as `jsonb`).
- How the resize is implemented in the browser (canvas / `createImageBitmap`), including HEIC handling and a clear message when a file can't be read.
- Signed-URL lifetimes, and caching headers on redirects.
- The Vercel config files and the Docker image details.
