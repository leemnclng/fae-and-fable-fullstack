# Decisions

## 2026-10-18 — Use a living app-context folder

- Decision: Follow Print-MS's `docs/context/` pattern, with an index, functionality map, progress log, change log, issues log, and decisions.
- Rationale: Keep project context discoverable and maintain the same documentation habit across applications.
- Impact: Meaningful future changes should update the relevant context files.

## Existing Implementation Baseline — Recorded 2026-10-18

These choices are observed in the current code; their original decision dates and discussions are not recorded here.

- **Separate frontend and API:** Next.js serves the website; NestJS handles authentication, content, events, and uploads. Each has its own dependencies and environment file.
- **Local persistence:** SQLite stores structured data and the API stores files under its data directory. Deployments need persistent storage and backups of both the database and uploads.
- **Separate live events and showcases:** Guest/client event records expire; published past-event showcases remain outside that cleanup lifecycle.
- **UTC retention boundary:** Live event access lasts through the fifteenth full day after the event. Request-time expiry checks enforce access before physical cleanup runs.
