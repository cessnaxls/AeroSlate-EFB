# AeroSlate EFB 0.9.2 — Free Edition

AeroSlate is a local-first, Render-free-tier EFB for flight simulation with SimBrief planning, FR24 schedule parsing, structured TLR, active navlog, simulator telemetry, records, trips, public charts, and an interactive route/radar map.

## 0.9 highlights

- Correct `NA` procedure status: **Not authorized**.
- More reliable complete ICAO `(FPL-...)` extraction.
- Comprehensive plaintext OFP briefing.
- ISA deviation in the navlog.
- Side-by-side structured takeoff and landing TLR.
- Dark adjustable radar map and optional aviation tile layer.
- Flight filters, compact portrait rows, 1–5 leg rig generation, and month planner.
- Preflight and postflight tabs removed.

## Deploy on Render free

The included `render.yaml` uses the free web-service plan and no persistent disk. Push the project to GitHub and create or refresh a Render Blueprint.

## Charts and map

AeroSlate no longer uses Navigraph. The Charts page provides:
- ChartFox worldwide flight-simulation chart directory
- Official FAA d-TPP search for US terminal procedures
- A flight-specific binder for official/public chart PDF and AIP URLs
- A draggable and zoomable route map using OpenStreetMap/CARTO tiles
- SimBrief navlog route overlay
- RainViewer public weather-radar tiles when available

Chart coverage, currency and redistribution rights remain controlled by each publishing authority. Always verify effective dates.

## Live gate lookup

The Gates page always reads any terminal/gate fields included in the current SimBrief OFP. Optional live gate lookup can be enabled by adding this Render environment variable:

```text
AERODATABOX_RAPIDAPI_KEY=your_key
```

Without a provider key, AeroSlate clearly reports that live gate data is unavailable and offers the current flight-status page instead. Gate assignments are dynamic and may change at any time.

## Trip storage

Pressing **Trip** in Flight Finder saves immediately to the same local encrypted ledger used by Flight Logs and Duty Logs. Configure the private GitHub Gist vault in Flight Logs to synchronize trips and records between devices.

## Simulator bridge

MSFS uses the included SimConnect bridge. X-Plane 11/12 uses the included UDP/RREF bridge. Run the bridge on the simulator computer and point it at the Render URL using the same `SIM_LINK_TOKEN` configured on Render.

## Chart data note

AeroSlate can present and bind chart PDFs from official/public sources. The FAA publishes current U.S. terminal procedures as downloadable d-TPP PDFs. Worldwide coverage requires separate public AIP catalogs or a licensed chart API; there is no single unrestricted worldwide chart API bundled with AeroSlate. An optional aviation map-tile URL can be configured with `VITE_OPENAIP_TILE_URL`.


## 0.9.2 operational fixes

The trip calendar now refreshes from the shared local ledger, schedules flights on a selected date, generates continuous 1–5-leg rigs, and exposes dispatch/removal controls. Flight row actions remain horizontal on portrait displays.

NOTAMs now support Current, Future, Past, and All effective-time views. Standard B)/C) validity timestamps are parsed where present; undated items remain visible in Current so the complete briefing is not accidentally hidden.

The Active Navlog actual-fuel field no longer contains an overlapping icon.


## Trip planner

Trips are saved locally first and do not require GitHub Gist or an internet connection. The Trip button, Add single leg, and connected-rig generator all write to the same itinerary store. AeroSlate then copies records into the audit ledger and optional encrypted Gist in the background. Existing ledger trips are migrated automatically.

