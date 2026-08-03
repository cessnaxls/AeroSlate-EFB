# AeroSlate EFB 0.8.0

## Changed
- Rebuilt every Flight Finder row as one aligned table row in portrait and landscape. Route, equipment, registration, schedule, ETE and actions now share a common vertical center.
- The Trip action now saves immediately to the local encrypted ledger and opens Trips; it no longer only navigates to a page with an unsaved candidate.
- Replaced the OFP PDF workspace with a native professional SimBrief briefing containing overview, route, fuel, weights, ICAO FPL and dispatcher remarks.
- Removed FRAT.
- Replaced preflight and postflight checklist pages with timestamped operational activity logs similar to operator activity feeds.
- Replaced Scratchpad with a departure/arrival gate page. It uses OFP gate data first and supports a live AeroDataBox provider adapter when a key is configured.
- Removed Navigraph. Added a public/official chart suite with ChartFox, FAA d-TPP search, per-flight binders and direct chart URLs.
- Added a draggable/zoomable Leaflet route map with SimBrief waypoint overlay, light/dark basemaps and public RainViewer radar where available.
- Tightened the Navlog viewport so only the table scrolls; Rows mode is vertical-only and Columns mode is horizontal-only.
