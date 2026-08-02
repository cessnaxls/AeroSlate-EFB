# DispatchLink EFB 0.3

A GitHub/Render-backed, Windows-native and browser EFB for **flight simulation**. The app treats SimBrief as the dispatch/OFP backend, Navigraph as the chart provider, and simulator telemetry as the source of actual flight events. DispatchLink presents the resulting information in one consistent workflow instead of making each page maintain a separate copy of the flight.

> **Simulation and recordkeeping aid.** This is not an approved real-world navigation source, aircraft performance program, operational-control system, or operator-approved FTL compliance system.

## The single-flight workflow

1. **Choose flight** — search the bundled `airports.dat`, paste an FR24 airport or aircraft-history table, filter the parsed real-world flights, and select one.
2. **Dispatch** — DispatchLink preloads SimBrief with the selected flight, UTC schedule, aircraft, registration and OFP preferences. Detailed navlog, NOTAMs, maps and SimBrief Runway Analysis (`tlr=1`) are enabled.
3. **Generate and synchronize** — generate the flight in the in-app SimBrief session. A stable flight ID lets DispatchLink watch for the result and import it automatically. Manual synchronization remains available.
4. **Brief** — the native pages present the imported route, schedule, weights, fuel, weather, NOTAMs, navlog, maps, OFP and runway-analysis material.
5. **Fly** — the local MSFS/X-Plane bridge supplies simulator Zulu time and telemetry. OOOI events can be automatic or entered with **NOW**.
6. **Record** — the cloud logbook and duty drafts mirror the active flight, scheduled times and OOOI times. Synced fields are deliberately read-only so conflicting copies cannot be created.

The FAA registry download/cache system is not present. Airport lookup and IATA-to-ICAO conversion use the supplied `public/data/airports.dat` file.

## SimBrief-backed dispatch and TOLR/TLR

DispatchLink does not use a generic home-built takeoff/landing distance formula. Every generated flight requests SimBrief **Runway Analysis** and presents the returned TLR data or the TLR pages inside the complete OFP.

The active OFP becomes the authoritative source for:

- Flight identity, aircraft, registration and route
- Scheduled OUT/IN and planned block/air time
- Departure/arrival runway selections
- Weights, payload, fuel and fuel-flow figures
- Weather, NOTAMs, navlog and maps
- Runway-analysis/TLR material

The SimBrief workspace stays inside the Windows app. In a normal browser, DispatchLink uses one named provider window so the EFB itself remains open.

## Navigraph architecture

The Windows edition presents the official Navigraph Charts web session inside the app using a persistent provider partition. You authenticate directly with Navigraph; DispatchLink does not receive the provider password or cache Navigraph chart images.

A second adapter remains in the project for a Navigraph-approved simulator-linked Charts API build. It is intentionally gated by `NAVIGRAPH_CHARTS_APPROVED=true` and an active simulator heartbeat.

The document desk supports touch/mouse pen, highlighter, lines, arrows, boxes, text, erase, undo/redo, zoom, night display, multipage PDFs and annotated-image export for SimBrief documents, uploaded charts and approved direct-API images.

## Time propagation

There is one OOOI record per active flight:

- Scheduled OUT/IN: selected FR24 flight, then replaced by the imported SimBrief OFP
- Actual OUT/OFF/ON/IN: simulator Zulu or manual **NOW**
- Block: OUT → IN
- Airborne: OFF → ON
- Logbook actuals: mirrored from OOOI
- Report, duty-on and FDP start: optionally derived from scheduled OUT using a saved lead-time preset
- FDP end: mirrored from actual IN
- Duty-off: optionally derived from actual IN using a saved post-flight preset

Times are stored as `HH:MMz`. Time inputs accept `1234`, `12:34`, or `12:34z` and normalize when committed.

## MSFS and X-Plane bridge

`bridge/dispatchlink_bridge.py` supports:

- Microsoft Flight Simulator through Python-SimConnect
- X-Plane 11/12 through native RREF UDP
- Simulator Zulu, position, heading, MSL/AGL altitude, IAS, GS and vertical speed
- On-ground, parking-brake and engine state
- Aircraft title and registration
- Total fuel and total weight where available
- Surface type/condition where exposed
- The supplied TCalc directory/file coordinate math

MSFS example:

```powershell
py -m pip install SimConnect
py bridge\dispatchlink_bridge.py --sim msfs --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

X-Plane example:

```powershell
py bridge\dispatchlink_bridge.py --sim xplane --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

## Cloud records

- AES-256-GCM encrypted workspace vaults on the Render persistent disk
- Append-only flight and duty entries
- Typed-name attestation before save
- Chained SHA-256 audit hashes
- CSV and JSON export
- FAA/EASA-oriented record fields and user-selected rule/scheme fields

DispatchLink is **compliance-oriented, not regulator-certified**. The pilot/operator remains responsible for loggability decisions, signatures/endorsements, retention, backups and the applicable company/authority FTL rules.

## Run locally

Requirements: Node.js 20 or later.

```bash
cp .env.example .env
npm install
npm run dev
```

- Web app: `http://localhost:5173`
- API: `http://localhost:3000`

Checks:

```bash
npm run check
npm run build
node --check server/index.mjs
python -m py_compile bridge/dispatchlink_bridge.py
```

## Deploy the backend to Render

1. Push this repository to GitHub.
2. In Render select **New → Blueprint** and choose the repository.
3. `render.yaml` creates the Node service and a persistent disk at `/var/data`.
4. Set `APP_BASE_URL` to the final Render HTTPS URL.
5. Copy the generated `SIM_LINK_TOKEN` into the bridge command.
6. Leave `NAVIGRAPH_CHARTS_APPROVED=false` unless Navigraph approves the direct chart API implementation.

## Windows native app

Development:

```bash
npm install
npm run native:dev
```

Build an installer and portable ZIP:

```bash
npm run native:dist
```

On first packaged launch, enter the HTTPS URL of your Render service. The URL is saved in the Electron user-data directory. It can later be changed from **Connections → Native app shell** or by launching with:

```powershell
DispatchLink.exe --app-url=https://YOUR-APP.onrender.com
```

The native shell keeps separate persistent sessions for:

- DispatchLink itself
- SimBrief and Navigraph provider pages

Provider login popups are opened as child windows inside the app; unrelated links open in the system browser.

## Navigraph direct API setup

Only after approval:

```text
NAVIGRAPH_CLIENT_ID=...
NAVIGRAPH_CLIENT_SECRET=...
NAVIGRAPH_REDIRECT_URI=https://YOUR-SERVICE.onrender.com/api/navigraph/callback
NAVIGRAPH_CHARTS_APPROVED=true
```

See `docs/NAVIGRAPH_ACCESS_REQUEST.md`.

## Important files

```text
bridge/dispatchlink_bridge.py           Local MSFS/X-Plane telemetry bridge
public/data/airports.dat                Supplied airport database
server/index.mjs                        SimBrief proxy, OAuth, telemetry, encrypted records
src/App.tsx                             Main EFB shell and briefing pages
src/lib/flightTimes.ts                  Canonical OOOI/time propagation
src/pages/FlightFinderPage.tsx          Airport search and FR24 parser
src/pages/SimBriefDispatchPage.tsx      Embedded dispatch and OFP watcher
src/pages/RunwayAnalysisPage.tsx        SimBrief TLR presentation
src/pages/OOOIPage.tsx                  Manual/automatic OOOI capture
src/pages/RecordsPage.tsx               Synced logbook and duty records
src/components/ProviderPortal.tsx       Native SimBrief/Navigraph sessions
src/components/ChartWorkspace.tsx       PDF/chart annotation engine
electron/                               Native Windows/macOS/Linux shell
render.yaml                             Render service and persistent disk
```
