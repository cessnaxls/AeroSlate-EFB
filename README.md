# AeroSlate EFB 0.10.0 — Free Edition

AeroSlate is a Render/GitHub-hosted simulator EFB with SimBrief planning, FR24 paste parsing, trip scheduling, navlog, fuel monitoring, OOOI, records, NOTAM briefing, route weather, and public/official chart integrations.

## Deploy on Render Free

1. Upload this repository to GitHub.
2. In Render, create a Blueprint from the repository.
3. Confirm that `render.yaml` shows `plan: free` and no disk.
4. Deploy.

The free Render filesystem is ephemeral. Trips and records are local-first and can optionally synchronize to an encrypted private GitHub Gist.

## 0.10.0 highlights

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
