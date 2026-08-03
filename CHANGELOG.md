# AeroSlate EFB 0.6.0

## Navigation and layout
- Shortened sidebar labels and reduced their visual weight.
- Added a persistent landscape sidebar-collapse control; the choice is stored locally.
- Kept the full drawer behavior on phones and narrow tablets.
- Simplified the Flight Finder layout and aligned every parsed-flight column with fixed table geometry.
- Increased spacing around Build, Trip, and Tail actions.
- Made the navlog intentionally horizontally scrollable so data remains readable instead of being compressed to unusable sizes.

## Global flight parsing
- Bundled 983 IATA/ICAO airline-code records, exceeding the requested 500-airline target.
- Retained page-provided `Code XX / YYY` mappings as the highest-priority source.
- Expanded registration parsing for N-numbers and global registrations including broad hyphenated formats such as VQ-, VP-, RA-, UR-, 9H-, and similar prefixes.
- Normalized parsed flights into chronological order, including multi-day and midnight-rollover schedules.

## Trips and dispatch loads
- Added a Trips module reachable from Flight Finder and the sidebar.
- Trips are stored in the existing local-first ledger and can synchronize through the free encrypted private GitHub Gist vault.
- Scheduled trips can be dispatched directly to SimBrief.
- Passenger loads are randomized by local departure-time band when the source paste supplied local time.
- Passenger weight is 190 lb each; bag count is 80–100% of passenger count at 40 lb each.
- Freight appears on approximately 17.5% of dispatches and never exceeds 25% of passenger-plus-bag weight.

## NOTAM briefing
- Preserved the complete imported SimBrief NOTAM set for legal review.
- Added pilot-friendly FAA-style categories for airport, runway, taxiway, lighting, procedure, navaid, communications, obstacle, airspace, and services.
- `U/S` is presented as **Unserviceable**; `OOS` is presented as **Out of service**.
- Procedure `NA` / Not applicable items are yellow review items rather than red outages.
- Procedure visibility/minima increases are yellow operational changes, not equipment outages.
- Closures and actual runway/procedure/equipment unavailability remain red.

## Runway analysis and scratchpad
- Removed the raw plaintext “Generated OFP runway-analysis section” panel.
- Added parsed takeoff and landing result cards with runway dropdowns based on the returned SimBrief TLR content.
- Kept SimBrief Tools embedded as the authoritative interactive workspace.
- Added a Taxi scratchpad and simplified scratchpad actions and template behavior.

## Validation
- TypeScript 5.8.3 project check passed.
- Exact four-format FR24 parser regression passed.
- Workflow and NOTAM-priority regression passed.
- Node/Electron syntax checks passed.
- MSFS and X-Plane bridge Python compilation passed.
