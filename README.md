# AeroSlate EFB 0.5.1 — Free Render Edition

AeroSlate is a responsive, local-first electronic flight bag for **Microsoft Flight Simulator 2020 and X-Plane 11/12**. The hosted service deploys on Render's free web-service plan. SimBrief supplies the dispatch/OFP data, the official Navigraph Charts website is presented as an authenticated provider workspace, and the local simulator bridge supplies live telemetry and simulator Zulu time.

> **Flight-simulation and recordkeeping aid.** AeroSlate is not an approved source for real-world navigation, certified takeoff/landing performance, operational control, or operator flight-time-limit calculations.

## What changed in 0.5.0

This release focuses on fixing the end-to-end pilot workflow rather than adding more disconnected panels:

- The airport catalog is compiled into the app at build time: **7,692 airports across 237 countries**. Country, airport, and random-airport controls no longer depend on a runtime file request.
- The FR24 text box is gone. Copy a supported airport or aircraft-history page and press **Paste & Parse** once.
- Available flights use compact **EQUIP** and **REG** fields; the Source column was removed. On phones the same rows become compact cards instead of a horizontally scrolling table.
- Navigraph Charts, SimBrief Dispatch, SimBrief Tools, and the OFP workspace remain mounted while changing AeroSlate tabs. In the native desktop edition their provider webviews keep the authenticated page loaded rather than recreating it.
- Navlog speeds are stacked and remaining fuel is calculated as a running subtraction beneath each leg burn. Active Navlog now compares actual fuel with planned fuel at every entered checkpoint.
- Weather, important NOTAMs, full NOTAMs, stations, and categories are collapsible.
- Airport/runway/procedure/navaid closures and outages are promoted in red; instrument-procedure amendments are promoted in yellow. Obstacle and tower notices remain in the complete legal briefing set without dominating the operational scan.
- Fuel checkpoint inputs no longer clip in landscape. Elapsed time is entered with separate **HH** and **MM** controls.
- Flight Logs and Duty Logs are separate primary tabs. Duty entries link to a saved flight entry and can auto-attach to the matching active flight.
- The server contains no direct Navigraph Charts API/OAuth implementation. AeroSlate uses the official provider website session instead.

## One active-flight workflow

1. **Find** — select an airport, choose one at random, or copy an FR24 page and press **Paste & Parse**.
2. **Build** — select a flight and send its route, equipment, registration, and schedule into SimBrief.
3. **Generate** — generate the OFP in the SimBrief workspace. AeroSlate watches the stable flight ID and imports the completed plan.
4. **Brief** — the OFP populates route, schedule, weather, NOTAMs, navlog, fuel, runway-analysis inputs, binder documents, and record drafts.
5. **Fly** — the MSFS/X-Plane bridge publishes live data and simulator Zulu. OOOI can be automatic or recorded with **NOW**.
6. **Record** — flight and duty records reuse the authoritative active-flight data instead of requiring duplicate entry.

## Official SimBrief and Navigraph workspaces

### Native desktop application

The Electron edition uses persistent, sandboxed provider webviews:

- **SimBrief Dispatch** stays loaded while moving to another AeroSlate tab.
- **Navigraph Charts** stays authenticated and loaded while viewing the binder, OFP, weather, or live-flight pages.
- **SimBrief Tools** remains a separate persistent runway-analysis workspace and receives OFP-derived prefill values.
- Provider login data is stored in the native provider partition and is not exposed to the React page.
- Provider popups are kept as AeroSlate child windows when possible; unrelated external links open in the system browser.

This is an embedded browser presentation of the providers' own websites. AeroSlate does not scrape credentials, reverse-proxy login pages, remove security headers, or download Navigraph chart sets.

### Render/PWA on iPhone, iPad, and Android

A normal hosted page cannot force a third-party site to accept an iframe when that provider blocks framing. The PWA therefore keeps a named authenticated provider session open without closing AeroSlate. A compatible native mobile wrapper can present that session in an in-app browser sheet. The full persistent in-pane experience is provided by the Electron desktop build.

## Airport and flight finder

`src/data/airports.catalog.json` is generated from the included `public/data/airports.dat` and bundled directly into the JavaScript application. It provides:

- Country dropdown
- Airport-size filter
- ICAO, IATA, name, city, and country search
- Random airport selection
- Timezone data used by the FR24 parser

The finder supports these FR24 paste layouts:

- Airport desktop table
- Airport compact/mobile page
- Aircraft-history cards
- Aircraft-history desktop table

Copy the complete page text, return to AeroSlate, and press **Paste & Parse**. No pasted source text is retained after parsing.

## SimBrief dispatch and OFP

A selected flight becomes the active flight before an OFP exists. The generated OFP then becomes authoritative for:

- Flight identity, route, equipment, registration, and runways
- STD and STA
- Planned block time calculated as **STA minus STD**, including midnight rollover
- ETE, cruise altitude, cost index, weights, fuel, maps, and TLR content
- METARs, TAFs, navlog, and NOTAMs
- Complete OFP PDF and ICAO `(FPL-...)` message

The SimBrief page automatically polls the selected static flight ID after generation. Imported data is synchronized without closing the provider pane.

## Charts and binder

The Charts tab contains two persistent workspaces:

- **Navigraph** — the official authenticated Navigraph Charts site in the native provider frame.
- **Flight Binder** — SimBrief OFP, returned SimBrief maps/documents, SimBrief Tools, and user-added PDF/image documents.

The document workspace supports pen, highlighter, lines, arrows, rectangles, text, erase, undo/redo, zoom, night display, multiple PDF pages, and annotated-image export. AeroSlate annotations apply to documents loaded in the AeroSlate binder; it does not alter the official Navigraph website.

## Runway analysis

Runway Analysis opens the official SimBrief Tools workspace and derives a prefill package from the active OFP:

- Origin/destination
- Aircraft type and registration
- Departure/arrival runway
- Takeoff, landing, zero-fuel, and block-fuel values
- Departure/arrival wind, temperature, and altimeter

In the Electron provider webview, **Apply OFP values** maps those values to matching provider controls. Any TLR text or document included with the generated OFP is retained beside the tools page. AeroSlate does not invent generic performance corrections.

## Navlog and Active Navlog

The planned navlog includes fix, name, coordinates, airway/procedure, course, leg/remaining distance, altitude/minimum altitude, wind, temperature, time, and fuel.

- TAS, GS, and Mach are stacked in one compact speed cell.
- Fuel remaining starts with takeoff/ramp fuel and subtracts each leg's burn in sequence.
- The remaining value appears in muted text below the leg burn.

Active Navlog adds:

- Actual crossing time
- Actual altitude
- Actual fuel
- Notes and complete/skipped state
- Per-fix actual-versus-planned fuel variance
- Latest fuel-trend status across the flight

## Weather and NOTAM briefing

The briefing uses collapsible sections and keeps the complete imported NOTAM set available.

**Red operational alerts** include detected airport/runway closures, runway or approach-equipment outages, and relevant procedure/navaid unserviceability.

**Yellow operational alerts** include instrument approach, SID, STAR, minima, or procedure amendments that require review.

Tower, crane, and obstacle notices remain searchable in the complete NOTAM set but are not automatically promoted unless the text also contains an airport/runway/procedure operational impact. This changes presentation priority only; it does not discard the notice.

## Fuel monitoring

The Fuel page separates:

1. SimBrief planned ramp, taxi, takeoff, trip, landing, reserve, and alternate fuel.
2. An actual checkpoint with ramp/takeoff/current fuel.
3. Elapsed airborne time entered as separate **HH** and **MM** values or derived from OFF time.
4. Expected fuel now, variance, projected landing fuel, and reserve margin.

The layout collapses to one column on narrow portrait devices and retains a two-panel layout on short landscape displays without clipping the checkpoint fields.

## Simulator bridge: MSFS 2020 and XP11/12

The Render service cannot directly discover a simulator on a private LAN. Run `bridge/aeroslate_bridge.py` on the simulator computer. The tablet/phone and simulator computer do not need direct peer discovery; both communicate through the deployed AeroSlate URL.

Microsoft Flight Simulator 2020:

```powershell
py -m pip install SimConnect requests
py bridge\aeroslate_bridge.py --sim msfs --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

X-Plane 11/12:

```powershell
py -m pip install requests
py bridge\aeroslate_bridge.py --sim xplane --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

The bridge supplies supported position, navigation, air-data, ground, aircraft, engine, attitude, environment, fuel, and simulator-time values. User-selected metrics are grouped by purpose and stored on the device.

## OOOI and schedule

Planned STD/STA come from the selected flight and are replaced by the generated OFP when available. Actual OUT/OFF/ON/IN times have one authoritative source:

- Simulator Zulu while linked
- Device UTC as a manual fallback
- User-configurable automatic thresholds/debounce
- Manual **NOW** buttons

Block time is OUT–IN. Airborne time is OFF–ON. The same values flow into the record drafts.

## Separate flight and duty logs

**Flight Logs** contain the flight identity, planned schedule, OOOI, block/airborne time, role, operation, flight rules, creditable-time categories, approaches, landings, remarks, and attestation.

**Duty Logs** contain scheme, role, report/duty/FDP times, sectors, standby, rest, limits, augmentation, notes, and attestation. A duty can be attached through a dropdown to any saved flight log. Saving the active flight first automatically links the duty draft to that new record; otherwise AeroSlate matches date and route when the duty is saved.

Records are local-first. Optional private GitHub Gist sync encrypts the complete ledger in the browser with AES-256-GCM before upload. Render does not store the GitHub token, passphrase, or plaintext records.

## Free Render deployment

The included `render.yaml` requests one free Node web service. It contains no disk, database, Starter instance, or other payment-backed resource.

1. Push the repository to GitHub.
2. In Render choose **New → Blueprint**.
3. Select the repository and deploy.
4. Copy the generated `SIM_LINK_TOKEN` from Render into the bridge command.

Free Render filesystems are ephemeral, so logbook/duty durability is device storage plus optional encrypted Gist synchronization—not the Render filesystem.

## Run locally

Requires Node.js 20 or later.

```bash
cp .env.example .env
npm install
npm run dev
```

Validation:

```bash
npm run check
npm run test:parser
npm run test:workflow
npm run build
node --check server/index.mjs
node --check electron/main.cjs
node --check electron/preload.cjs
python -m py_compile bridge/aeroslate_bridge.py bridge/dispatchlink_bridge.py
```

## Build the native desktop application

```bash
npm install
npm run native:dist
```

The resulting installer/archive is placed in `release/`. GitHub Actions also includes the native build workflow.

## 0.5.1 operational workflow additions

Parsed airport flights now include **Build** and **Tail** actions. Tail opens the matching FR24 aircraft-history page, and **Random tail on FR24** selects a registration from the current list. Copy that aircraft page and use **Paste & Parse** again to switch from an airport schedule to a tail rotation.

The provider destinations are fixed to the official current-flight pages:

- Navigraph Charts: `https://charts.navigraph.com/flights/current`
- SimBrief Tools: `https://dispatch.simbrief.com/tools`
- OFP: the PDF URL supplied by SimBrief under `/ofp/flightplans/`

The planned navlog calculates waypoint ETAs; Active Navlog carries downstream ATA estimates from the latest actual crossing. The pilot-critical NOTAM scan is grouped by airport and promotes only closures, runway/approach-equipment outages, unavailable procedures, and procedure amendments. The complete unmodified NOTAM set remains available below it.
