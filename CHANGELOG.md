# AeroSlate EFB 0.5.0

## Flight Finder

- Compiled the complete `airports.dat` catalog into the application bundle: 7,692 airports in 237 countries.
- Removed the runtime dependency that left country and airport lists blank after deployment.
- Added reliable country, airport-size, search, and random-airport workflows.
- Removed the persistent paste textarea.
- Added one-button **Paste & Parse** clipboard import for all four supported FR24 layouts.
- Removed the Source column from Available Flights.
- Renamed Aircraft and Registration columns to **EQUIP** and **REG**.
- Reworked narrow-screen rows into compact cards so the table does not require horizontal scrolling.

## Persistent provider workspaces

- Removed the direct Navigraph Charts API/OAuth implementation and related server routes/configuration.
- Uses the official Navigraph Charts website as the chart provider session.
- Keeps SimBrief Dispatch, Navigraph Charts, SimBrief Tools, and OFP workspaces mounted when changing AeroSlate tabs.
- Keeps Navigraph loaded when switching between Navigraph and the AeroSlate binder.
- Keeps the OFP PDF loaded when switching between document and summary views.
- Retains a persistent Electron provider partition for authenticated SimBrief and Navigraph sessions.
- Simplified web/PWA fallback messaging and retained a named provider session instead of replacing AeroSlate.

## Navlog and fuel trend

- Stacked TAS, GS, and Mach in a compact waypoint-speed cell.
- Calculates planned remaining fuel sequentially by subtracting each leg burn from the prior total.
- Displays remaining fuel in muted text below Fuel Leg.
- Added actual-versus-planned fuel variance to Active Navlog.
- Added current Active Navlog fuel-trend status.

## Weather and NOTAMs

- Made weather, individual weather stations, operational NOTAMs, complete NOTAMs, and station groups collapsible.
- Added red priority for relevant airport/runway/procedure/navaid closures and unserviceability.
- Added yellow priority for instrument-procedure and minima amendments.
- Retains tower, crane, obstacle, and other notices in the complete briefing without promoting obstacle-only text to the operational-alert panel.
- Retains category filters and recursive OFP NOTAM extraction.

## Fuel

- Rebuilt the checkpoint layout to prevent clipping on landscape phones and tablets.
- Split elapsed airborne time into separate HH and MM fields.
- Preserved automatic elapsed time from OFF while allowing manual HH:MM entry.
- Clarified plan, checkpoint, trend, projection, and reserve sections.

## Records

- Added separate primary navigation destinations for Flight Logs and Duty Logs.
- Added a saved-flight dropdown to the duty editor.
- Saving a flight attaches the active duty draft to the new flight record.
- Saving an unattached duty attempts an exact date/route match before leaving it unattached.
- Preserved local-first encrypted Gist synchronization, audit hashes, exports, and attestations.

## Server and deployment

- Server runtime now reports official-provider-session mode only.
- Removed direct Navigraph credentials, sessions, chart endpoints, and Render environment variables.
- Kept the Render Blueprint on the free plan with no disk or database.
- Removed visible TCalc debugging fields from the telemetry allowlist while retaining operational live data.

## Validation

- Added workflow regression tests for the bundled airport catalog, one-button parser UI, responsive flight columns, persistent provider pages, separate record modules, and NOTAM priority logic.
- Retained exact parser regression coverage for all four supplied FR24 formats.
