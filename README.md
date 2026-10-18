# Fae&Fable – Mirror Selfie Booth

| App | Stack | Port |
|-----|-------|------|
| `web/` | Next.js 16 (App Router, Tailwind) | 3000 |
| `api/` | NestJS 12, SQLite (`node:sqlite`), local file uploads | 4000 |

## Run

```bash
./scripts/run.sh   # installs deps + creates env files on first run, starts api + web, Ctrl+C stops both
```

Or manually:

```bash
cd api && cp .env.example .env   # set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
pnpm install && pnpm start:dev
cd web && cp .env.example .env.local && npm install && npm run dev
```

Tests: `cd api && pnpm test:e2e`

## Pages

- `/` – public portfolio, packages, contact (content managed in admin)
- `/events` – past-event gallery (posted from admin, permanent), live public events for guests to upload to, and client gallery lookup (email + client code)
- `/events/<id>` – one past event: cover, story, photo grid with full-screen viewer
- `/admin` – admin login → **Client links** (create event, QR, guest passcode, client code, links, list on /events), **Past events** (publish showcase posts with photos), **Portfolio & packages**, **Site settings**
- `/e/<slug>` – guest page the QR opens; passcode → upload photos/videos
- `/c/<token>` – client's private gallery with downloads

Event links and all uploaded files are deleted automatically 15 days after the event date (the API checks hourly; expired links return "expired" immediately).

Data lives in `api/data/` (`app.db` + `uploads/`). Back it up, and put it on a persistent volume when deploying.

## Documentation

See [docs/README.md](docs/README.md) for setup notes and living app context: functionality, progress, changes, issues, and implementation decisions.
