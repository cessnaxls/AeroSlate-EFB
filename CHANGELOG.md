# AeroSlate EFB 0.7.0

## Flight Finder
- Expanded the airport browser and reduced the import panel to four compact stacked actions.
- Random Flight now selects the row and scrolls it into view.
- Build now generates the requested realistic time-of-day passenger, baggage, and occasional freight load before opening SimBrief.
- Preserved trip scheduling and encrypted GitHub Gist synchronization.

## Navigation and workflow
- Fixed landscape tablet sidebar collapse so the EFB can expand into the released space.
- Added Help, FRAT, Preflight, and Postflight pages.
- Help includes step-by-step private encrypted GitHub Gist setup for trips and records.

## Navlog
- The navlog card is constrained to the available device viewport.
- Added Rows and Columns modes so the navlog scrolls on only one axis at a time.
- The rest of the page remains fixed while the navlog itself scrolls.

## Weather and NOTAMs
- Operational airport groups are collapsible.
- Procedure changes and increased minima take precedence over generic outage words when categorizing a notice.
- Complete source NOTAM text remains grouped by station for the legal briefing.

## Scratchboard
- Rebuilt the scratchpad as four simultaneously available cockpit sheets: Clearance, ATIS, Taxi, and Flight Notes.
- Each sheet autosaves, has its own quick inserts, and can be copied, reset, or cleared independently.
