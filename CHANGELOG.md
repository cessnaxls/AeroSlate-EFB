# Changelog

## 0.12.0

- Rebuilt the OFP as a compact one-frame pilot release with route, procedures, schedule, aircraft, weather, fuel, weights, ICAO FPL and remarks.
- Added robust SID/STAR extraction from SimBrief direct fields, navlog procedure legs and route tokens.
- Added safe FIN/SELCAL leaf extraction so nested XML values never display as `[object Object]`.
- Added ISA deviation calculation when SimBrief omits it: OAT minus ISA temperature at planned altitude.
- Added public VATSIM flight-plan verification against both online pilots and prefiled plans.
- Added a direct prompt to open VATSIM prefile when no matching plan is found.
- Added VATSIM ATIS retrieval and public real-world D-ATIS retrieval for departure and destination.
- Added richer NOTAM subject headings that identify the affected runway, taxiway, deicing area, approach equipment, procedure or navaid before the legal text is opened.
- Removed the AeroSlate chart-notes pane and simplified Charts to a clean, persistent Navigraph-only workspace.
