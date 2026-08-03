# AeroSlate EFB 0.9.0

## Operational corrections
- Procedure `NA` is displayed as **Not authorized**, not “Not applicable.”
- Improved ICAO flight-plan extraction from nested SimBrief XML/JSON and multiline `(FPL-...)` content.
- Empty/object TLR obstacle values no longer render as `[object Object]`.
- Added ISA deviation to every navlog waypoint when SimBrief supplies it.

## Interface
- Flight number in the top flight bar now matches the route airport typography.
- Structured takeoff and landing analysis panels display side-by-side when space permits.
- Runway surface conditions are title-cased.
- Portrait flight rows use the same compact height as landscape rows.
- Flight Finder now filters by free text, airline ICAO code, and equipment.
- Preflight and postflight tabs were removed.

## OFP
- Rebuilt the plaintext OFP as a professional operational briefing.
- Added dispatch identity, schedule/profile, route and airports, aircraft/configuration, weather snapshot, fuel, weights/load, ICAO FPL, and operational remarks without a PDF dependency.

## Map and charts
- Dark map is the default.
- Added compact radar enable/disable and opacity controls.
- Added an optional aviation-tile overlay configured through `VITE_OPENAIP_TILE_URL`.
- Retained official/public chart binder support.

## Trips
- Added 1–5 leg connected random rig generation from parsed schedules.
- Added a month-style trip planner.
- Each calendar trip can be dispatched directly to SimBrief with its stored randomized payload.
