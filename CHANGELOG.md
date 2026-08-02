# AeroSlate EFB changelog

## 0.4.1 Free — 2026-08-02

### Free Render deployment

- Changed the Blueprint web-service plan from `starter` to `free`.
- Removed the persistent disk declaration and `DATA_DIR` environment variable.
- Removed server-side record-file storage so the app never implies that Render's ephemeral filesystem is durable.
- Uses Render's automatically supplied `RENDER_EXTERNAL_URL` when `APP_BASE_URL` is not set.
- The Blueprint now requires no database, disk, or payment-backed instance.

### Local-first encrypted records

- Flight and duty entries are written to device storage before any network operation.
- Added per-device append-only SHA-256 audit chains so multiple devices can merge without rewriting previous device chains.
- Added encrypted private GitHub Gist synchronization.
- Ledger encryption uses AES-256-GCM with a PBKDF2-SHA256 derived key and a random salt/IV for every upload.
- The GitHub token and passphrase remain in the client and are not sent to the Render service.
- Added automatic sync after record save, manual sync, cloud pull/merge, encrypted backup export, and backup restore.
- Added local CSV export for both flight and duty records.
- Added a clear local/cloud status and record counts.
- Added optional device-side remembering of the GitHub token/passphrase.

### Compatibility and validation

- Retained the complete AeroSlate 0.4.0 responsive UI, SimBrief, Navigraph workspace, FR24 parser, simulator bridge, OOOI, navlog, weather/NOTAM, fuel, runway-analysis, and native shell functionality.
- TypeScript validation passes.
- Parser regression continues to pass all four supplied FR24 layouts.
- Node/Electron syntax and Python bridge compilation pass.
- `render.yaml` validates as a free service with no disk or `DATA_DIR`.

## 0.4.0 — 2026-08-02

See the previous release for the AeroSlate rebrand, responsive phone/tablet redesign, provider workspaces, active navlog, recursive NOTAM parsing, fuel workflow cleanup, and records/OOOI redesign.
