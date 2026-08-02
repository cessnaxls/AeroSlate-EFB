# DispatchLink EFB

A GitHub/Render-ready, SimBrief-first electronic flight bag for personal flight simulation. It combines the operational flight plan, navlog, fuel monitoring, weather/NOTAM briefing, OOOI timing, checklists, scratchpads, documents, and a touch-capable chart annotation desk in one responsive PWA.

> **Simulation only.** Do not use this application or its data for real-world flight planning or navigation.

## Included now

- Latest SimBrief OFP import by username or numeric Pilot ID.
- Flight deck dashboard with route, schedule, aircraft, fuel, weights, payload, weather snapshot, and dispatch-limit alerts.
- Full OFP/PDF desk and ICAO flight-plan copy tool.
- Detailed navlog table.
- Departure, destination, and alternate METAR/TAF/NOTAM briefing from the loaded OFP.
- Manual fuel-progress monitor with expected fuel and variance.
- OOOI time capture, schedule delay, actual block, and flight-time calculations.
- Persistent per-flight generic simulation checklists.
- Persistent clearance, ATIS, and notes scratchpads.
- Progressive web app installation for a full-screen iPad/desktop experience.
- Chart workspace with touch/mouse pen, highlighter, line, arrow, box, text, erase, color selection, undo/redo, zoom, night display, multipage PDF rendering, and annotated-image export.
- Navigraph OAuth, airport chart-list, and PNG proxy adapters, protected by explicit developer-approval and active-simulator gates.
- MSFS in-simulator wrapper source that displays the EFB and keeps the simulator heartbeat active.

## The Navigraph limitation

Navigraph's published developer rules do **not** allow its Charts API in an ordinary standalone browser, desktop app, or physical tablet EFB. Chart API implementations must be part of a virtual flight-simulator environment, charts must be fetched online when displayed, and chart files must not be stored or made available offline.

Therefore:

- the Render/PWA build works immediately with SimBrief and local/SimBrief documents;
- Navigraph chart endpoints remain locked while `NAVIGRAPH_CHARTS_APPROVED=false`;
- after Navigraph approves the simulator-linked design and provides client credentials, the chart integration can be enabled;
- the included MSFS wrapper maintains an active simulator heartbeat and hosts the same EFB interface inside the simulator.

This is an architectural safeguard, not a missing API key workaround.

## Local development

Requirements: Node.js 20 or newer.

```bash
cp .env.example .env
npm install
npm run dev
```

- Vite UI: `http://localhost:5173`
- API/server: `http://localhost:3000`

For a production-style local test:

```bash
npm run build
npm start
```

## Deploy to GitHub and Render

1. Create a new GitHub repository.
2. Upload this project or push it with Git.
3. In Render, choose **New → Blueprint** and select the repository. `render.yaml` creates the web service.
4. Set `APP_BASE_URL` to the final HTTPS Render URL.
5. Leave `NAVIGRAPH_CHARTS_APPROVED=false` until Navigraph approves the integration.
6. Copy the generated `SIM_LINK_TOKEN` into the MSFS wrapper's `config.js`.

The app uses Render's ephemeral process memory for Navigraph OAuth tokens. That is adequate for a personal prototype, but a public multi-user release should replace `tokenStore` with an encrypted persistent session store.

## Navigraph developer setup after approval

Set these Render environment variables:

```text
NAVIGRAPH_CLIENT_ID=...
NAVIGRAPH_CLIENT_SECRET=...
NAVIGRAPH_REDIRECT_URI=https://YOUR-SERVICE.onrender.com/api/navigraph/callback
NAVIGRAPH_CHARTS_APPROVED=true
```

The redirect URI must exactly match the URI registered with Navigraph. The app requests `openid offline_access fmsdata charts`, refreshes expired access tokens, checks the simulator heartbeat before chart access, and sends `no-store` headers for chart content.

## SimBrief behavior

The app retrieves the latest OFP through SimBrief's documented JSON fetcher:

- by username; or
- by numeric Pilot ID.

SimBrief data shapes vary by OFP options. The UI uses defensive field access, so unavailable sections show a clear empty state rather than breaking the page. Enable Detailed Navlog, NOTAMs, and Flight Maps in SimBrief for the richest import.

## Project structure

```text
server/index.mjs                    Express API, OAuth, proxies, sim gate
src/App.tsx                         Main EFB pages and workflow
src/components/ChartWorkspace.tsx  Chart/PDF renderer and annotation engine
src/lib/ofp.ts                      SimBrief normalization helpers
src/lib/demoOFP.ts                  Built-in demonstration flight
public/                             PWA manifest and service worker
msfs-panel/                         In-simulator wrapper source and instructions
render.yaml                         Render Blueprint
```

## Important production improvements

Before publishing broadly, add a persistent encrypted OAuth/session store, user accounts, rate limiting, audit logging, automated tests with captured SimBrief fixtures, and an MSFS package built against the current SDK sample. ForeFlight is a mature certified commercial platform; this repository is a substantial simulation EFB foundation, not a claim of feature or certification parity.
