# AeroSlate EFB 0.4.2 Free

AeroSlate is a GitHub/Render-backed electronic flight bag for **flight simulation** that is configured to deploy on Render's free web-service plan. It uses SimBrief as the dispatch and OFP backend, Navigraph as the chart/navigation provider, and the local simulator bridge as the source of live flight data and actual event times.

> **Simulation and recordkeeping aid.** AeroSlate is not an approved real-world navigation source, certified aircraft-performance program, operational-control system, or operator-approved flight-time-limitations system.

## One active-flight workflow

1. **Find** — search the bundled `airports.dat`, choose a random airport, or paste a supported Flightradar24 airport/aircraft-history page.
2. **Dispatch** — AeroSlate prepares SimBrief with the flight, schedule, aircraft, registration, detailed navlog, NOTAM, map, and runway-analysis preferences.
3. **Generate** — generate the OFP in the embedded SimBrief provider workspace. AeroSlate watches the stable flight ID and imports the completed plan.
4. **Brief** — OFP, route, weather, all imported NOTAMs, active navlog, fuel, charts, binder documents, and SimBrief Tools use the same active-flight record.
5. **Fly** — MSFS/X-Plane telemetry supplies live data and simulator Zulu. OOOI can be captured automatically or with **NOW**.
6. **Record** — actual OOOI values and computed block/airborne time flow into local-first logbook and duty drafts. Optional encrypted GitHub Gist sync keeps the ledger available across devices without a paid Render disk.

The FAA aircraft-registry downloader/cache is not included. Airport lookup and IATA-to-ICAO conversion use `public/data/airports.dat`.

## Responsive phone and tablet UI

The web/PWA interface supports:

- iPhone and Android portrait/landscape layouts
- iPad and Android-tablet portrait/landscape layouts
- iOS safe-area padding below the status bar and above the home indicator
- Compact sticky top bar, slide-out tablet navigation, and a phone bottom tab bar
- Touch-sized controls and 16 px form fields to prevent unwanted iOS zoom
- Scrollable metric strips, tables, chart tools, provider controls, and NOTAM filters
- Landscape-phone layouts that preserve working height

Install the PWA through **Add to Home Screen** for the best full-screen mobile layout.

## AeroSlate identity

The application title, shell, installer metadata, PWA manifest, service-worker cache, native setup screen, server responses, records export names, and simulator bridge now use **AeroSlate EFB**. New 192 px and 512 px slate/wing icons are included under `public/icons/`.

Legacy DispatchLink settings and data keys are read during migration so existing flights, provider URL, OOOI times, and drafts are not discarded.

## SimBrief workspace and OFP

The Electron edition displays SimBrief Dispatch and SimBrief Tools inside AeroSlate using a persistent provider webview. Provider login data remains in the provider partition and is not exposed to the React application.

The imported OFP is authoritative for:

- Flight identity, aircraft, registration, route, and runways
- STD and STA
- **Planned block time calculated as STA minus STD**, including midnight rollover
- ETE, cruise altitude, cost index, weights, fuel, and maps
- METARs, TAFs, detailed navlog, and NOTAMs
- Runway-analysis/TLR material

The ICAO flight-plan copier recursively reads the JSON produced from SimBrief XML and extracts the complete `(FPL-...)` message rather than copying an object representation or unrelated text.

## SimBrief Tools runway analysis

The Runway Analysis page loads:

```text
https://dispatch.simbrief.com/tools
```

The active OFP supplies origin, destination, aircraft, registration, departure/arrival runways, takeoff/landing/ZFW values, block fuel, winds, temperatures, and altimeters. In the native provider webview AeroSlate applies those values to matching controls after the tool loads. A manual **Apply OFP values** control remains available if the provider page changes or a value needs to be reapplied.

AeroSlate does not create generic aircraft-performance values. Imported SimBrief TLR text/documents remain available beside the interactive tool.

## Navigraph and provider framing

### Electron desktop edition

The official authenticated Navigraph Charts web application is displayed in AeroSlate’s provider webview with a persistent session. SimBrief Dispatch and SimBrief Tools use the same native pattern. Login popups remain child windows of AeroSlate; unrelated external links open in the system browser.

### Browser/PWA and mobile

An ordinary website cannot force another provider’s authenticated site into an iframe when the provider blocks framing. AeroSlate therefore:

- Uses the embedded provider webview in Electron
- Uses an in-app browser overlay when hosted in a compatible mobile native wrapper
- Uses a named provider window as the web/PWA fallback so AeroSlate itself remains open

AeroSlate does not reverse-proxy provider login pages, intercept provider passwords, remove provider security headers, or cache Navigraph chart images.

The custom chart-image API adapter remains gated for a separately approved simulator-context implementation. See `docs/NAVIGRAPH_ACCESS_REQUEST.md`.

## Flight binder and chart desk

The Binder links directly to:

- Complete SimBrief OFP PDF
- SimBrief map documents returned with the OFP
- Official Navigraph Charts workspace
- Official SimBrief Tools
- User-uploaded PDF/image documents

The document workspace supports pen, highlighter, line, arrow, rectangle, text, erase, undo/redo, zoom, night display, multiple PDF pages, and annotated-image export.

## Navlog and active navlog

The planned navlog includes:

- Fix and coordinates
- Airway/direct segment
- Magnetic course
- Leg and remaining distance
- Planned altitude
- TAS/GS/Mach when supplied
- Wind and OAT
- Leg and cumulative time
- Leg and remaining fuel

**Active Navlog** adds persistent actual crossing time, actual altitude, actual fuel, remarks, and completion status. **NOW** enters the current UTC crossing time.

## Weather and NOTAMs

The Weather page displays origin, destination, and alternate METAR/TAF blocks. NOTAM extraction recursively searches the complete imported OFP rather than only airport weather objects.

Important notices are promoted into a separate operational box, including detected:

- Runway closures/restrictions
- Approach, SID, STAR, ILS, RNAV, RNP, or minima changes
- Airport/aerodrome closure language
- Critical navaid outages
- TFR/airspace restrictions
- Obstacles and cranes

All remaining imported NOTAMs remain available and can be filtered by runway, procedure, airport, airspace, navaid, or other.

## Fuel page

The fuel page separates three ideas:

1. **SimBrief plan flow** — ramp minus taxi equals takeoff; takeoff minus trip burn equals planned landing fuel.
2. **Actual checkpoint** — enter actual ramp/takeoff/current fuel or copy current fuel from simulator telemetry.
3. **Trend** — compare actual fuel with the simple SimBrief average-burn trend and project landing fuel over the remaining planned ETE.

Minimum-takeoff fuel, tank capacity, and average flow appear only when returned by the OFP. AeroSlate labels whether flow came directly from SimBrief or was derived as trip fuel divided by ETE.

## Configurable simulator data

Run `bridge/aeroslate_bridge.py` on the simulator PC. The Live page groups user-selected SimConnect/X-Plane values into:

- Flight
- Position
- Aircraft state
- Fuel and mass

The TCalc directory/file display was removed from the UI. The bridge may retain compatibility calculations internally, but AeroSlate presents only operational live data. Metric selections are stored on the device.

MSFS example:

```powershell
py -m pip install SimConnect requests
py bridge\aeroslate_bridge.py --sim msfs --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

X-Plane example:

```powershell
py -m pip install requests
py bridge\aeroslate_bridge.py --sim xplane --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

The legacy `bridge/dispatchlink_bridge.py` remains temporarily for existing shortcuts.

## OOOI, logbook, and duty

OOOI is the authoritative source of actual times:

- OUT — gate departure
- OFF — airborne
- ON — touchdown
- IN — gate arrival
- Block — OUT to IN
- Airborne — OFF to ON

Scheduled STD/STA come from the selected flight and are replaced by the imported OFP. Simulator Zulu is used while linked; device UTC is the fallback. Automatic thresholds and debounce are saved locally.

The records page uses grouped sections and dropdowns for crew role, operation, flight rules, regulation/scheme, and duty role. Synced identity/schedule/OOOI fields are read-only. Entries are saved to the device first with typed-name attestation and per-device SHA-256 audit chains. Optional cloud sync encrypts the complete ledger in the browser with AES-256-GCM and PBKDF2 before writing it to a private GitHub Gist. The GitHub token and encryption passphrase are never sent to Render. CSV and encrypted-backup export are included.

AeroSlate is **compliance-oriented, not regulator-certified**. The pilot/operator remains responsible for loggability, signatures/endorsements, retention, backups, and the applicable operator/authority rules.

## Scratchpad

Clearance, ATIS, and notes templates are inserted automatically for each new active flight. Existing saved text is never overwritten. Each tab supports copy, restore template, and clear.

## Supported FR24 paste formats

The parser automatically recognizes:

- Airport desktop table
- Airport compact/mobile cards
- Aircraft-history cards
- Aircraft-history desktop table

It accepts 12/24-hour times, detects local-versus-UTC source text, converts local schedules through `airports.dat` timezones, infers compact dates/midnight rollover, handles blank flight numbers, normalizes airline codes, and merges duplicate rows from airport/history sources.

```bash
npm run test:parser
```

## Run locally

Requires Node.js 20 or later.

```bash
cp .env.example .env
npm install
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000`

Validation commands:

```bash
npm run check
npm run test:parser
npm run build
node --check server/index.mjs
node --check electron/main.cjs
node --check electron/preload.cjs
python -m py_compile bridge/aeroslate_bridge.py
```

## Deploy to Render for free

The included `render.yaml` requests one **free** Node web service and does not request a disk, database, or paid instance.

1. Push this repository to GitHub.
2. In Render choose **New → Blueprint**.
3. Select the repository and deploy the Blueprint.
4. Render generates `SESSION_SECRET` and `SIM_LINK_TOKEN` automatically.
5. Copy the generated `SIM_LINK_TOKEN` into the simulator bridge command.
6. Keep `NAVIGRAPH_CHARTS_APPROVED=false` unless Navigraph has separately approved direct Charts API access.

Render automatically supplies the public service URL through `RENDER_EXTERNAL_URL`, so the Blueprint does not ask for `APP_BASE_URL`. A free service can sleep when idle, so the first request after inactivity can take longer. Simulator telemetry requests keep the service active while flying.

### Free cloud logbook setup

AeroSlate does not store records on Render's ephemeral filesystem. On the **Records** page:

1. Create a GitHub fine-grained personal access token with **Gists: Read and write**.
2. Enter the token and an encryption passphrase of at least 12 characters.
3. Select **Create cloud vault**. AeroSlate creates a private Gist and stores its ID on the device.
4. Keep **Sync after each saved entry** enabled for automatic synchronization.
5. Use **Encrypted backup** periodically as an independent copy.

The private Gist contains only encrypted ciphertext. Losing the encryption passphrase makes the cloud vault unrecoverable. The device-local ledger remains the primary copy until browser/app storage is cleared.

## Native desktop app

Development:

```bash
npm install
npm run native:dev
```

Installer/ZIP:

```bash
npm run native:dist
```

At first launch enter the Render URL. It is stored in `aeroslate-native.json` and can later be changed from **Connections & App** or with:

```powershell
"AeroSlate EFB.exe" --app-url=https://YOUR-APP.onrender.com
```

## Important files

```text
bridge/aeroslate_bridge.py               Local MSFS/X-Plane telemetry bridge
electron/                                Native provider-webview shell
public/data/airports.dat                 Airport database
public/icons/                             AeroSlate PWA/installer identity
server/index.mjs                         SimBrief proxy, OAuth, and simulator telemetry
src/App.tsx                              Responsive AeroSlate shell
src/lib/ofp.ts                           OFP/FPL/block/NOTAM interpretation
src/lib/flightTimes.ts                   Canonical OOOI propagation
src/pages/FlightFinderPage.tsx           Airport search and FR24 parser
src/pages/NavlogPage.tsx                 Planned and active navlog
src/pages/WeatherPage.tsx                Weather and categorized NOTAMs
src/pages/FuelPage.tsx                   Plan/checkpoint/trend fuel workflow
src/pages/RunwayAnalysisPage.tsx         Embedded SimBrief Tools workflow
src/pages/RecordsPage.tsx                Local-first logbook/duty and encrypted Gist sync
src/lib/cloudLedger.ts                   Audit chains, encryption, merge, Gist synchronization
src/components/ProviderPortal.tsx        SimBrief/Navigraph provider sessions
src/components/ChartWorkspace.tsx        PDF/image annotation desk
```
