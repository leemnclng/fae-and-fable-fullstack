# Development

## Local Setup

Run commands from the Fae-Fable root unless stated otherwise.

Prerequisites: Node.js with `node:sqlite` support (the runner checks for Node 22.13+), npm, and pnpm for the API.

```bash
./scripts/run.sh
```

The runner installs missing dependencies, installs pnpm if absent, creates missing environment files, and starts both services. Ctrl+C stops both.

| Service | Local URL | Package manager |
| --- | --- | --- |
| Website | http://localhost:3000 | npm |
| Admin | http://localhost:3000/admin | npm |
| API | http://localhost:4000 | pnpm |

On first setup, edit the admin email/password in `api/.env` before sharing access. The runner generates a random JWT secret when creating this file.

## Configuration

Use `api/.env.example` and `web/.env.example` as the configuration templates.

| File | Variables |
| --- | --- |
| `api/.env` | `PORT`, `WEB_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATA_DIR` |
| `web/.env.local` | `NEXT_PUBLIC_API_URL` |

The API requires `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. `DATA_DIR` defaults to `data`, relative to the API working directory. Keep actual secrets out of documentation.

## Checks

From `api/`:

```bash
pnpm lint
pnpm test:e2e
pnpm build
```

From `web/`:

```bash
npm run lint
npm run build
```

The API end-to-end suite in `api/test/app.e2e-spec.ts` creates a temporary data directory and removes it on teardown. Passing API checks does not establish that browser flows have been tested.

## UI Conventions

- **Icons are SVG, never emoji or symbol characters.**
  - Use the shared `Icon` component in `web/src/components/icon.tsx`, and add a Lucide-style 24px path to it when you need a new icon.
  - Don't use emoji (✉ 💕 👁) or Unicode symbol characters (✕ ✓ ← → ▾ ⠿) as icons, bullets or decoration in buttons, labels or UI copy. They render differently across devices and fonts and ignore the theme colors.
  - Emoji that guests or admins type into their own content (notes, descriptions) are their content and stay as typed.
- An icon-only button needs an `aria-label`; the `Icon` itself is decorative (`aria-hidden`).

## Data and Retention

- Default database: `api/data/app.db`.
- Default file storage: `api/data/uploads/`.
- Back up the database and uploaded files together; use persistent storage when deploying.
- Live events and their uploads expire after the configured retention window; see [functionality-map.md](context/functionality-map.md) for the exact boundary.
- Past-event showcases are stored separately from expiring live events.

Update [app context](context/README.md) alongside meaningful application changes.
