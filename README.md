# AeroSlate EFB 0.10.1 — Free Edition

AeroSlate is a Render/GitHub-hosted simulator EFB with SimBrief planning, FR24 paste parsing, trip scheduling, navlog, fuel monitoring, OOOI, records, NOTAM briefing, route weather, and public/official chart integrations.

## Deploy on Render Free

1. Upload this repository to GitHub.
2. In Render, create a Blueprint from the repository.
3. Confirm that `render.yaml` shows `plan: free` and no disk.
4. Deploy.

The free Render filesystem is ephemeral. Trips and records are local-first and can optionally synchronize to an encrypted private GitHub Gist.

## 0.10.1 highlights

### Portrait flight actions
The flight table keeps Build, Trip, and Tail side by side at their full button size. Narrow devices pan the fixed-width table horizontally rather than shrinking or stacking controls.

### Trip rigs and day planner
The Trips page can generate an independent random 1–5 leg connected rig from the current parsed flight pool. The preview can be regenerated or accepted. Selecting a calendar day opens a 30-minute Zulu day view with scheduled legs positioned by time.

### Pilot-focused NOTAMs
The first NOTAM panel is a quick operational scan organized by route station. It shows current closures, unavailable equipment, and procedure/minima changes. The complete imported legal briefing remains available below with effective-time, type, station, and text filters.

### Weather layers
The route map includes:

- RainViewer reflectivity radar
- NASA GIBS true-color satellite imagery
- NASA GIBS infrared cloud phase
- NASA GIBS cloud-top temperature
- Optional aviation tiles via `VITE_OPENAIP_TILE_URL`
- Route icing screening using Open-Meteo pressure-level temperature, humidity, and cloud data

The icing display is an advisory model screen matched to planned route altitude and crossing time. It is not an approved aviation forecast or dispatch product.

### Integrated FAA charts
AeroSlate now exposes server endpoints that retrieve the current FAA d-TPP catalog for a US airport and proxy the selected official PDF into the in-app chart viewer.

- `/api/charts/faa?airport=KMIA`
- `/api/charts/pdf?url=<official FAA PDF URL>`

Outside the United States, add official state-AIP or other legally public chart URLs to the binder. There is no single unrestricted worldwide procedure-chart API.

## Optional environment values

```env
PORT=3000
SIM_LINK_TOKEN=change-me
VITE_OPENAIP_TILE_URL=
AERODATABOX_RAPIDAPI_KEY=
```

## Development

```bash
npm install
npm run check
npm run test:parser
npm run test:workflow
npm run build
npm start
```


## 0.10.1 operational corrections

- Trip dates are normalized and displayed consistently regardless of whether a leg was added from Flight Finder or Trip Builder.
- SimBrief dispatch sends passenger count to `pax`, passenger-plus-bag weight to `payload`, and freight weight to `freight`.
- FAA charts are loaded from the official current d-TPP XML catalog and grouped by actual chart type.
- NOTAM alert tiles use plain-language category names.


## 0.11.1 load and chart behavior

AeroSlate sends passenger count as `pax`, freight as SimBrief's documented `cargo` field, and applies passenger/bag assumptions through `acdata`. The requested passenger-plus-baggage total is also retained as the manual payload hint and in AeroSlate remarks. In the native desktop shell, AeroSlate additionally fills the visible SimBrief Passenger, Payload, and Freight controls after the page loads.

The FAA chart PDF is rendered once per selected chart/page. Drawing occurs on a separate persistent canvas, so pen strokes, highlights, and shapes do not reload the chart document.


## SimBrief payload handling in 0.11.3

AeroSlate no longer sends the undocumented `payload` or `manualpayload` URL fields. It uses the documented `pax`, `cargo`, and `acdata.paxwgt` inputs instead. Freight is sent as thousands of pounds, and passenger weight is adjusted to offset SimBrief's standard baggage allowance so the visible SimBrief Payload matches AeroSlate's generated passenger-plus-baggage total.

## SimBrief manual ZFW dispatch

AeroSlate sends the generated passenger count with `pax`, freight with `cargo`, and the calculated zero-fuel weight with SimBrief's documented `manualzfw` input. The calculation is:

```text
manual ZFW = aircraft BOW + (passengers × 190 lb) + (bags × 40 lb) + freight
```

The app includes a broad ICAO aircraft BOW/OEW reference catalog and family fallbacks. These are generic planning values; airline-specific interiors and individual airframes can differ.
