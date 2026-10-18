# Functionality Map

Baseline: 2026-10-18, based on the current README and source files. This records implemented behavior, not a fresh runtime acceptance test.

| Area | Route | Current behavior |
| --- | --- | --- |
| Public website | `/` | Displays portfolio, packages, and business/contact information managed by the admin. |
| Event discovery | `/events` | Lists published past-event showcases and active public events; supports private gallery lookup using email and client code. |
| Past-event showcase | `/events/<id>` | Displays the event story and media gallery with a full-screen viewer. |
| Administration | `/admin` | Login; manage client event links, QR codes, guest passcodes, client codes, public listing, guest-page design, showcases, portfolio, packages, and site settings. |
| Guest event page | `/e/<slug>` | Guests enter their name and event passcode to share photos/videos and messages. Admin design settings control text, background, panels, gallery visibility, and upload quota. |
| Client gallery | `/c/<token>` | Private event gallery with downloads. |

## Event Lifecycle

- Guest upload limits default to 30 photos per guest name per event; the admin can change the limit or use zero for unlimited. Names are compared case-insensitively.
- Live links remain valid through the fifteenth full day after the event, using UTC day boundaries.
- Expired links are rejected immediately. Cleanup runs on API startup and hourly, deleting expired event records and their upload directories.
- Past-event showcases are separate records and do not follow live-event expiry.

## Implementation Map

- `web/src/app/`: Next.js pages and admin interfaces.
- `web/src/components/`: shared gallery and guest-page components.
- `web/src/lib/api.ts`: API calls and shared frontend types.
- `api/src/auth.ts`: admin and guest authentication helpers.
- `api/src/events.ts`: event management, guest/client access, messages, media, and expiry.
- `api/src/content.ts` and `api/src/showcases.ts`: public content, settings, and past-event publishing.
- `api/src/db.ts`: SQLite schema and startup schema updates.
- `api/src/uploads.ts`: upload handling and file removal.
