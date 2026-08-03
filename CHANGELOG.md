# AeroSlate EFB 0.9.2

## Trip planner repaired

- Replaced the trip planner's dependency on the asynchronous audit ledger with a dedicated local-first itinerary store.
- `Trip` now writes the selected flight immediately, updates the itinerary counter, and opens Trips without requiring GitHub Gist.
- `Add single leg` and `Generate connected rig` use the same reliable storage path.
- Existing trip records in the audit ledger are migrated into the local planner automatically.
- Audit-ledger and Gist copies are written after the local save; a cloud/audit failure can no longer prevent the planner from working.
- Added visible error notifications instead of silent failures.
- Calendar entries, dispatch, deletion, duplicate protection, and 1–5 leg rigs remain supported.

## Flight Finder portrait controls

- Build, Trip, and Tail remain side by side at every responsive breakpoint.
- Flight results remain straight, single-line table rows in portrait and landscape.
- Narrow devices pan the table horizontally instead of converting rows into tall cards.

## NOTAM briefing redesign

- Operational cards now lead with a concise plain-language headline.
- Effective dates are displayed separately in a compact line.
- Original legal NOTAM text is retained under an expandable Full legal text control.
- Complete NOTAMs remain grouped by station and searchable, but no longer display every raw coded block by default.
- Current, Future, Past, and All effective-time filters remain available.
