# Change Log

## 2026-10-20

- Added: multiple admin accounts. Admins page to add/remove admins and change your own password (`003_admins.sql`).
- Changed: guest uploads limited per device (default 1) and one photo at a time, with a race-safe server check (`002_photo_device.sql`).
- Added: Contact Us page, configurable Facebook link for "Inquire now", homepage previews of each page, per-event note card templates and fonts.
- Changed: production migrations run in the API's Vercel build (`db:migrate:deploy`); buckets via one-time `db:bootstrap`.

## 2026-10-18

- Added: documentation index, local development guide, and living app-context files.
- Added: project README link to the documentation index.

Earlier features are summarized in [functionality-map.md](functionality-map.md); their original implementation dates have not been reconstructed.
