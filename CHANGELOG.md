# AeroSlate EFB 0.9.1

## Trip planner reliability

- Fixed Trip entries not appearing after they were added from Flight Finder.
- Trips now refresh immediately when the shared ledger changes.
- Added an explicit schedule-date control and selectable calendar dates.
- Added duplicate protection, itinerary removal, dispatch actions, and live itinerary counts.
- Connected-rig generation now always produces the requested 1–5 legs. It uses matching parsed connections when available and generates a continuous simulator itinerary when the current paste does not contain onward flights.
- The planner automatically opens the month containing the selected flight.
- Calendar entries are selectable and dispatchable.

## Flight Finder

- Build, Trip, and Tail remain side by side in portrait mode.
- Removed the stray collapsed-sidebar label remnant.

## Active Navlog

- Removed the fuel-pump glyph from inside the actual-fuel field.
- Corrected the active checkpoint grid so ALT and FUEL no longer overlap.

## NOTAM effective-time filtering

- Added Current, Future, Past, and All filters.
- The initial pilot-critical scan now shows current or undated operational NOTAMs.
- Parses standard NOTAM B) and C) YYMMDDHHMM validity fields and PERM endings.
- Full legal briefing content remains retained in the complete imported set.
