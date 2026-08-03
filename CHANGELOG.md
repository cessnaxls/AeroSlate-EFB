# AeroSlate EFB 0.11.0

## Trips
- Adding a leg in Flight Finder no longer navigates away from the page.
- Added legs retain a green checked Trip button across navigation, reloads, filters, and subsequent FR24 pastes.
- Flight Finder additions enter an Unscheduled Trips queue.
- Unscheduled legs can be assigned individually or randomly distributed over 7, 14, or 30 days.
- Pairing/rig identifiers are preserved while random scheduling, and existing scheduled slots are respected.
- Trip dates display as `Aug. 3, 2026` while remaining stored as ISO dates internally.

## SimBrief payload
- Passenger count is sent to SimBrief's passenger field.
- Payload is exactly passenger count × 190 lb plus bag count × 40 lb.
- Freight is sent separately and is not included in payload.
- AeroSlate stores the generated load and presents it in the OFP briefing so SimBrief defaults do not overwrite the generated bag/payload summary.
- Envoy (`ENY`) now selects the American Airlines (`AAL`) OFP layout.

## Charts
- FAA chart PDFs now open in AeroSlate's annotation workspace.
- Added pen, highlighter, line, arrow, rectangle, text, eraser, undo/redo, zoom, and export through the existing chart workspace.
- Added origin, destination, and alternate airport shortcuts.
- Added full-workspace chart expansion.
- Reworked the chart reload control to prevent clipping on tablets.

## NOTAMs
- Current operational alerts are now collapsible by plain-language category within each airport.
- Repetitive status/category tiles were replaced with concise summaries and expandable legal text.
- The complete legal briefing remains available with current/future/past and category filters.

## Device behavior
- Disabled browser pinch, gesture, wheel, and keyboard page zoom while preserving chart-workspace zoom.
- Portrait flight tables retain full-size Build, Trip, and Tail controls and pan horizontally rather than compressing the actions.
