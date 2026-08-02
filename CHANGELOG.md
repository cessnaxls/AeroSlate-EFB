# AeroSlate EFB 0.4.0

## Identity and layout

- Renamed the application, UI, PWA, native shell, server service, exports, bridge, and build metadata to AeroSlate EFB.
- Added a new slate/wing application mark and 192/512 px tile icons.
- Added iOS safe-area handling so the header clears the clock, Wi-Fi, and battery indicators.
- Added responsive phone/tablet portrait and landscape layouts.
- Added a phone bottom tab bar, tablet slide-out navigation, outside-tap menu dismissal, and landscape-phone height optimization.
- Increased touch targets and prevented unwanted iOS form zoom.
- Simplified the dashboard and grouped navigation into Plan, Brief, Fly, Record, and System.
- Removed Checklists from the app workflow.

## Provider workspaces

- Added persistent in-app Electron webviews for official SimBrief Dispatch, SimBrief Tools, and Navigraph Charts sessions.
- Added provider child-window handling and isolated provider session storage.
- Added mobile-native in-app-browser support when a compatible wrapper is present, with a named-window PWA fallback.
- Added OFP-value application to matching SimBrief Tools controls.
- Updated Binder links to the complete SimBrief OFP, returned map documents, Navigraph Charts, and SimBrief Tools.

## Flight data

- Fixed planned block time so it is calculated as STA minus STD with midnight rollover.
- Reworked ICAO flight-plan extraction from SimBrief XML-to-JSON structures and copy-to-clipboard behavior.
- Expanded navlog columns and added a persistent ForeFlight-style Active Navlog.
- Added recursive complete-OFP NOTAM extraction, operational classification, an important-NOTAM panel, and full categorized filtering.
- Reorganized fuel into plan flow, actual checkpoint, and fuel-trend sections; removed the appearance of hardcoded aircraft limits.
- Replaced the visible TCalc debug presentation with configurable, purpose-grouped live simulator metrics.
- Rebuilt OOOI, logbook, and duty layouts with clearer hierarchy and dropdowns where appropriate.
- Automated scratchpad template insertion for each active flight.
- Changed notifications to auto-dismiss with a visible countdown bar.

## Compatibility

- Migrates legacy DispatchLink backend URLs, OFPs, provider settings, finder selections, OOOI values, and drafts where applicable.
- Retains the legacy simulator bridge file temporarily while adding `bridge/aeroslate_bridge.py`.

# DispatchLink EFB 0.3.1

- Added automatic detection for four FR24 paste layouts: airport desktop table, airport compact/mobile, aircraft-history cards, and aircraft-history table.
- Fixed airport navigation tabs being mistaken for the operational table heading.
- Added 12-hour clock parsing, local-versus-UTC detection, airport-timezone conversion, compact date inference, midnight rollover, concatenated aircraft parsing, and duplicate-row enrichment.
- Added exact parser regression fixtures and CI execution.

# DispatchLink EFB 0.3.0

- Reorganized the product around one active-flight workflow.
- Added stable-ID SimBrief OFP watching and automatic synchronization.
- Replaced generic TOLD estimates with SimBrief Runway Analysis/TLR presentation.
- Added Electron provider sessions, authoritative time propagation, duty offsets, live telemetry, and native build workflows.
