# DispatchLink EFB

A GitHub/Render-ready all-in-one electronic flight bag for flight simulation. DispatchLink combines real-world flight discovery, SimBrief dispatch and OFP import, chart/document annotation, simulator telemetry, TOLD worksheets, OOOI automation, a cloud logbook, duty records, weather, fuel, navlog, checklists, and scratchpads in one responsive PWA.

> **Simulation and recordkeeping aid.** Do not use this repository as an approved real-world navigation source, AFM performance program, operational-control system, or substitute for an operator's manuals.

## New integrated workflow

1. Choose a country and large/medium/small airport from the bundled `public/data/airports.dat` file.
2. Open that airport's FR24 page from DispatchLink.
3. Paste an FR24 airport departures/arrivals table or aircraft-history table into Flight Finder.
4. Parse and filter actual scheduled/operated flights, or randomize one.
5. Press **Build in SimBrief**. The SimBrief custom-options page is prepared with route, type, registration, airline/flight number, UTC departure time, and an appropriate OFP layout.
6. Keep DispatchLink open in its original tab. SimBrief is shown in the integrated frame when permitted and always has a reusable named dispatch-window fallback.
7. Generate the plan, then import the latest OFP by SimBrief username or Pilot ID.

The old FAA aircraft-registry download/cache path is not included. Airport lookup and IATA-to-ICAO conversion come directly from the supplied `airports.dat` file.

## Main capabilities

### Flight Finder and SimBrief

- Parses the supplied OpenFlights-style airport rows, including airport name, city, country, IATA, ICAO, coordinates, elevation, UTC offset, and IANA timezone.
- Country and estimated airport-size filters, airport search, and random airport selection.
- FR24 airport-table and aircraft-history parsing based on the supplied DispatchLink behavior.
- Preserves pasted FR24 clocks as UTC/Zulu and stores them as `HH:MMz`; no airport timezone conversion is applied.
- Converts visible two-letter airline flight numbers to three-letter ICAO operators when the pasted page supplies `Code XX / YYY` data, with common regional-carrier fallbacks.
- Aircraft aliases and regional/mainline SimBrief OFP-layout handling.
- SimBrief latest-OFP import, OFP PDF, navlog, weather, NOTAM, fuel, schedule, route, and weights.

### Charts and documents

- Touch/mouse pen, highlighter, line, arrow, box, text, erase, color selection, undo/redo, zoom, night display, multipage PDF rendering, and annotated-image export.
- SimBrief OFP PDFs and flight maps open directly in the chart desk.
- User-supplied PDF/image charts work in standalone mode.
- A reusable standalone window opens the official Navigraph Charts web application while DispatchLink remains running.
- The direct Navigraph Charts API adapter remains protected by developer-approval and virtual-environment gates because Navigraph's current developer license does not permit an unapproved standalone third-party EFB to display Charts API content.

### TOLD worksheet

- Pressure altitude, ISA deviation, density-altitude estimate, headwind/tailwind, and crosswind components.
- Weight, altitude, temperature, wind, runway-slope, and wet-surface correction model.
- Takeoff/landing distance and runway-margin output.
- Saves the aircraft/profile inputs locally.

Enter baseline distances and correction percentages from the applicable AFM/POH or an approved operator performance source. The included values are examples only.

### MSFS and X-Plane bridge

`bridge/dispatchlink_bridge.py` supports:

- Microsoft Flight Simulator through Python-SimConnect.
- X-Plane 11/12 through the native RREF UDP protocol.
- Simulator Zulu time, latitude/longitude, heading, MSL/AGL altitude, ground speed, IAS, vertical speed, on-ground state, parking brake, engines, registration/title, and surface data where exposed.
- The exact TCalc directory/file index math used by the supplied example.
- Secure telemetry posting using `SIM_LINK_TOKEN`.

Example:

```powershell
py -m pip install SimConnect
py bridge\dispatchlink_bridge.py --sim msfs --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

For X-Plane:

```powershell
py bridge\dispatchlink_bridge.py --sim xplane --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

### OOOI and simulator time

- Every manual **NOW** capture uses simulator `HH:MMz` when the bridge is connected; device UTC is the fallback.
- Device-saved automatic presets:
  - OUT: parking brake released and GS over the chosen threshold.
  - OFF: airborne or GS over the takeoff threshold.
  - ON: on ground and GS below the landing threshold.
  - IN: parking brake set and engines stopped.
- Configurable sustained-condition delay prevents one-sample triggers.
- Block and airborne time calculations.

### Cloud logbook and duty ledger

- Private workspace key; each workspace is stored as an AES-256-GCM encrypted vault on the server disk.
- Append-only flight and duty records.
- Typed signer name and explicit attestation required before save.
- SHA-256 chained audit hashes for tamper evidence.
- CSV and JSON export endpoints.
- FAA/EASA-oriented fields for aircraft, registration, route, OOOI, total/airborne time, PIC/SIC/co-pilot, dual, instructor, night, instrument, cross-country, landings, approaches, remarks, duty/FDP, sectors, standby, rest, and scheme notes.

No software can truthfully self-declare that a personal logbook is “FAA/EASA certified.” DispatchLink is designed to create a reliable electronic record aligned with the information pilots and operators commonly need under 14 CFR 61.51 and EASA FCL.050/associated AMC. The pilot/operator remains responsible for legal classification, instructor/examiner signatures, retention, backups, authority access, and compliance with the applicable operator-approved FTL scheme.

## Local development

Requirements: Node.js 20 or newer.

```bash
cp .env.example .env
npm install
npm run dev
```

- Vite UI: `http://localhost:5173`
- API/server: `http://localhost:3000`

Production test:

```bash
npm run check
npm run build
npm start
```

## Deploy to GitHub and Render

1. Create a GitHub repository and push this project.
2. In Render choose **New → Blueprint** and select the repository.
3. `render.yaml` creates a Node service plus a 1 GB persistent disk at `/var/data` for encrypted logbook/duty vaults. Persistent disks require a paid Render service; change the plan only if you provide another durable database/storage backend.
4. Set `APP_BASE_URL` to the final HTTPS Render URL.
5. Copy Render's generated `SIM_LINK_TOKEN` into the bridge command.
6. Keep `NAVIGRAPH_CHARTS_APPROVED=false` unless Navigraph approves the direct API architecture and issues credentials.

## Navigraph setup

Standalone users can open the official Navigraph Charts web app from the Charts or Connections page and authenticate there. Direct chart loading into DispatchLink's drawing canvas uses the Charts API and requires Navigraph developer approval.

After approval, configure:

```text
NAVIGRAPH_CLIENT_ID=...
NAVIGRAPH_CLIENT_SECRET=...
NAVIGRAPH_REDIRECT_URI=https://YOUR-SERVICE.onrender.com/api/navigraph/callback
NAVIGRAPH_CHARTS_APPROVED=true
```

See `docs/NAVIGRAPH_ACCESS_REQUEST.md`.

## Project structure

```text
bridge/dispatchlink_bridge.py       Local MSFS/X-Plane telemetry bridge
public/data/airports.dat            Supplied airport database
server/index.mjs                    API, SimBrief, OAuth, telemetry, encrypted records
src/App.tsx                         Main shell and existing EFB pages
src/pages/FlightFinderPage.tsx      Airport randomizer and FR24 parser
src/pages/SimBriefDispatchPage.tsx  Integrated SimBrief handoff
src/pages/ToldPage.tsx              Configurable TOLD worksheet
src/pages/SimPage.tsx               TCalc/live simulator display
src/pages/OOOIPage.tsx              Manual and automatic OOOI capture
src/pages/RecordsPage.tsx           Cloud logbook and duty records
src/components/ChartWorkspace.tsx   PDF/chart renderer and annotation engine
render.yaml                         Render service and persistent disk
```

## Validation completed in this package

- TypeScript strict project check passed.
- Node server syntax check passed.
- Python bridge byte-compilation passed.
- `airports.dat` parser loaded 7,692 valid ICAO airport rows.
- A representative FR24 aircraft-history sample parsed `IND`/`BWI` to `KIND`/`KBWI`, preserved `23:30z`/`01:05z`, calculated `1:35`, converted `WN1234` to `SWA1234`, and generated the expected SimBrief custom URL.

The final Vite bundle could not be executed in this workspace because its internal npm mirror did not contain `@vitejs/plugin-react`. GitHub Actions and Render use their normal npm environment and run both `npm run check` and `npm run build`.
