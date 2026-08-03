# AeroSlate EFB 0.5.1

## Flight finder and FR24 tail workflow

- Added a **Tail** action beside **Build** for every parsed flight with a registration.
- Tail actions open the matching FR24 aircraft-history page.
- Added **Random tail on FR24** to select any usable registration from the parsed airport list.
- Tail-history pages can be copied and fed back through the same one-button **Paste & Parse** workflow.

## Flight Deck and provider destinations

- Rebalanced the active-route card in portrait and landscape layouts.
- Centered route distance and separated it from the aircraft icon and route text.
- Renamed **Charts & binder** to **Charts**.
- Charts uses `https://charts.navigraph.com/flights/current`.
- Runway Analysis uses `https://dispatch.simbrief.com/tools`.
- OFP actions use the exact PDF URL returned by SimBrief, including its `ofp/flightplans/<flightplan>.pdf` path.
- Persistent provider panes remain mounted when another AeroSlate tab is selected.

## Navlog

- Condensed the planned navlog to fit without horizontal scrolling in normal portrait and landscape views.
- Retained the most operational columns while hiding only sequence/via/course on the narrowest phone layout.
- Added calculated ETA at every waypoint from scheduled departure and cumulative planned leg time.
- Active Navlog now carries an inline ATA estimate downstream from the latest entered crossing time.
- Replaced the tall checkpoint editor with one line for ATA, NOW, altitude, actual fuel, remarks, completion, and fuel variance.
- Preserved sequential planned-fuel subtraction and active fuel-trend monitoring.

## Weather and NOTAM briefing

- Replaced the broad outage detector with pilot-focused triage.
- Red operational cards are limited to airport/runway/taxiway closures, runway-lighting or approach-equipment outages, and unavailable instrument procedures.
- Yellow cards are reserved for instrument-procedure amendments and revisions.
- Status badges normalize `CLSD` to **CLOSED**, `OOS`/unserviceable text to **Out of service**, and procedure `NA` to **Not applicable**.
- Operational cards are grouped and sorted by airport with critical/amendment counts.
- All original NOTAM text remains available in the complete collapsible set.
- Tower, crane, and obstacle notices are retained but no longer dominate the quick-glance operational panel.

## iPad polish

- Made the full AeroSlate brand/safe-area cap opaque.
- Extended its background to the top and side edge without moving the logo or text.
- Sidebar text can no longer be seen scrolling behind the iPad status bar.

## Validation

- TypeScript project check passed.
- All four exact FR24 parser fixtures passed.
- Airport catalog and workflow regressions passed.
- NOTAM closure/amendment/obstacle prioritization tests passed.
- Node/Electron syntax and both Python simulator bridges passed.
