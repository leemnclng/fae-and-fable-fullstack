# Development

## Local Setup

Run commands from the Fae-Fable root unless stated otherwise.

Prerequisites: Node.js 22+, npm, pnpm for the API, and a Postgres + Supabase Storage to point at. Locally this is the Supabase stack TPC-Space already runs (`supabase start`, Postgres on `127.0.0.1:54322`, API on `127.0.0.1:54321`). Fae&Fable keeps to its own schema (`fae_fable`) and buckets (`fae-fable-public`, `fae-fable-private`), so the two apps never see each other's data.

```bash
./scripts/run.sh
```

The runner installs missing dependencies, creates missing env files, runs `pnpm db:bootstrap`, and starts both services. Ctrl+C stops both.

| Service | Local URL | Package manager |
| --- | --- | --- |
| Website | http://localhost:3000 | npm |
| Admin | http://localhost:3000/admin | npm |
| API | http://localhost:4000 | pnpm |

On first setup, edit the admin email/password in `api/.env` before sharing access. The runner generates a random JWT secret when creating this file.

## Configuration

Use `api/.env.example` and `web/.env.example` as the templates; they document every variable. Production values go in the host's environment settings (for example, Vercel project settings), never in git.

| File | Variables |
| --- | --- |
| `api/.env` | `PORT`, `WEB_URL` (comma-separated allowed site addresses; the first is used in links), `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATABASE_URL`, `DB_SCHEMA`, `STORAGE_DRIVER` (`supabase` or `s3`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, bucket names, `S3_*` |
| `web/.env.local` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_FILES_URL` (public bucket base URL) |

- **Locally,** copy `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `TPC-Space/apps/api/.env`, or from `supabase status -o env`.
- **In production,** use the dedicated Supabase project's pooled connection string.
- The service-role key and S3 secrets are API-only; never put them in a `NEXT_PUBLIC_*` variable.

## Database

Schema changes are numbered SQL files in `api/migrations/`; every table name is written `$s.<table>` and runs inside `DB_SCHEMA`.

```bash
cd api && pnpm db:migrate     # applies pending migrations
cd api && pnpm db:bootstrap   # the same, then creates the storage buckets (local setup; once per new Supabase project)
```

- **Never at API startup.** Migrations run from these commands, or from the API's Vercel build in production.
- **Additive only.** A production build migrates before the new version goes live, while the previous version is still serving. So a migration must keep the previous version working: add tables and columns freely, but drop or rename in two releases (stop using it first, remove it next).

## Checks

From `api/`:

```bash
pnpm lint
pnpm test        # unit tests + storage contract tests (Supabase/S3 suites run only when their credentials are set)
pnpm test:e2e
pnpm build
```

From `web/`:

```bash
npm run lint
npm run build
```

The API tests need the local Postgres. Each run creates a throwaway `fae_fable_test_*` schema and drops it afterwards, and the e2e suite keeps files in memory. Passing API checks does not establish that browser flows have been tested.

## Deployment

**Vercel:** two projects from this repo.
- **Website:** Root Directory `web`. Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_FILES_URL`.
- **API:** Root Directory `api`. Vercel's NestJS support runs `src/main.ts` as one function. Set every `api/.env` variable, with `WEB_URL` = the website's address(es).
- **New Supabase project (once):** from your machine, run `pnpm db:bootstrap` in `api/` with the production `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It creates the tables and both storage buckets.
- **Each release:** migrations run automatically. `api/vercel.json` makes the build run `pnpm db:migrate:deploy` after compiling, which migrates only when `VERCEL_ENV=production`, so preview builds never touch the live database. A failed migration fails the build, and the previous version keeps serving.
- **Uploads:** browsers resize photos to ≤2560 px and send one per request, so each request stays under Vercel's ~4.5 MB body limit. The API refuses files over 4 MB.

**Docker:** `api/Dockerfile` and `web/Dockerfile` build standalone images, and `docker-compose.yml` runs both.
- `NEXT_PUBLIC_*` values are build arguments.
- Inside a container, reach the host's local Supabase via `host.docker.internal` (or `host.containers.internal` under Podman).
- Run migrations with `docker run --env-file api/.env fae-fable-api node dist/migrate-cli.js`.

## UI Conventions

- **Icons are SVG, never emoji or symbol characters.**
  - Use the shared `Icon` component in `web/src/components/icon.tsx`, and add a Lucide-style 24px path to it when you need a new icon.
  - Don't use emoji (✉ 💕 👁) or Unicode symbol characters (✕ ✓ ← → ▾ ⠿) as icons, bullets or decoration in buttons, labels or UI copy. They render differently across devices and fonts and ignore the theme colors.
  - Emoji that guests or admins type into their own content (notes, descriptions) are their content and stay as typed.
- An icon-only button needs an `aria-label`; the `Icon` itself is decorative (`aria-hidden`).

## Data and Retention

- **Database:** Postgres, in the `DB_SCHEMA` schema.
- **Files:** object storage. The public bucket holds catalog, showcase, banner and guest-page background images, linked directly. The private bucket holds guest event photos, served only through short-lived signed URLs after the API's access checks.
- **Back up** the database and both buckets together.
- **Retention:** guest and client links stop working 15 days after the event (see [functionality-map.md](context/functionality-map.md)). Nothing is deleted automatically: the admin deletes expired events (and their files) from the admin page, or extends them with a later date.
- **Past-event showcases** are stored separately from live events.

Update [app context](context/README.md) alongside meaningful application changes.
