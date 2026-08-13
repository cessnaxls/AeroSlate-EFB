## v0.17.2
- Moved IFR/VFR and eastbound/westbound filters inside the Cruise Altitude dropdown dialogue.
- Added the same integrated dropdown dialogue for Alternate Cruise altitude.

## v0.17.1
- Made Aircraft Fuel Profiles collapsible.
- Added aircraft-profile selection directly to Flight Planner.
- Added VFR/IFR and eastbound/westbound cruise-altitude filters with a filtered altitude dropdown.
- Replaced editable default values with gray prompts for new plan/profile fields.
- Restored a dedicated Rows/Columns navlog scroll selector and preserves the current row when changing scroll mode.

## v0.17.0
- Fixed Active Navlog column panning so switching between Rows and Columns preserves the current vertical/horizontal position and horizontal mode remains vertically scrollable.
- Added AeroSlate Flight Planner with manual aircraft fuel profiles and simulator-learned fuel burn observations.
- Added departure, destination, optional alternate, cruise altitude, alternate altitude, route, STD, and callsign planning inputs.
- Added server-side NOAA/NWS Aviation Weather Center METAR, TAF, and U.S. FD winds/temps retrieval for custom planning.
- Custom plans generate an AeroSlate-native OFP and load through the same OFP/navlog/weather/fuel workflow as imported releases.
- Included the current X-Plane bridge parser fix and bumped the service-worker cache.

## v0.16.4
- Top-bar UTC clock now uses live simulator Zulu time while the simulator is linked.
- When the simulator is offline, the top-bar clock automatically falls back to real device/browser UTC.
- Added second-precision simulator Zulu telemetry while preserving existing HH:MM OOOI compatibility.

## v0.16.3
- Made Trip Builder Rig Length dropdown match the Schedule Date field width.
- Kept the right-side Add selected leg and Generate random rig buttons flexible so the row stays balanced.
- Bumped service-worker cache to refresh the frontend after deployment.

## v0.16.2
- Fixed Trip Builder responsive grid so Schedule Date and Rig Length use the same 150 px column on iPad/portrait layouts.

# v0.16.1

- Matched the Schedule date control width to the Rig length dropdown.
- Rotated the route airplane icons to point horizontally right in the top information bar and Trip Builder selected-flight panel.

## 0.16.0

- Rebuilt Trips > Trip Builder with isolated markup and CSS so legacy layout rules cannot overlap or clip the controls.
- Added a dedicated selected-flight summary card and a separate responsive action grid.
- Standardized field labels, control heights, spacing, and responsive wrapping for portrait and landscape.

## 0.15.9
- Rebuilt the Trip Builder frame so the selected-flight summary sits above a clean responsive control grid.
- Prevented date, labels, buttons, and rig controls from overlapping or clipping in portrait and landscape.

## 0.15.8
- Rebuilt Trip Builder controls into a clean aligned grid with consistent labels, heights, spacing, and responsive wrapping.

# Changelog

## 0.15.7
- Matched the Schedule date control width to the Add selected leg button.
- Forced the OFP Route & airports frame to span the exact full content width in landscape.

## v0.15.6
- Rebuilt the Trips > Trip Builder frame into a compact two-workflow layout with a clearer selected-flight summary, consolidated date/add controls, and a space-efficient random-rig panel.
- Improved portrait and narrow-screen responsiveness.

# Changelog

## 0.15.5
- Added 5px more portrait spacing between the arrival airport group and the A/C/REG tile group.
- Renamed Deck to Flight Overview.
- Expanded Route & airports across the full OFP width in landscape.
- Made the four Flight Overview metric tiles equal-width across portrait screens.
- Centered and balanced the Weather and all NOTAMs button.

## 0.15.4
- Moved the A/C and REG tiles closer to the arrival airport in portrait mode.

# AeroSlate EFB v0.15.3

- Added compact grey aircraft type and registration tiles to the top information bar.
- Preserved the responsive Import OFP, STD countdown, UTC clock, sidebar, and Apple safe-area layout.

# AeroSlate EFB 0.15.2

- Replaced the accumulated top-bar overrides with one authoritative responsive layout.
- Keeps flight number, route, Import OFP, STD countdown, scheduled STD, and UTC visible on iPad portrait and landscape.
- Added Apple safe-area spacing and compact sizing for expanded/collapsed sidebars.
- Health endpoint now reports the deployed package version.
- Bumped the service-worker cache to v9.

## 0.15.1
- Bumped the service-worker cache to v8 and automatically removes all older AeroSlate caches during activation.
- Forced immediate service-worker activation and disabled browser caching when checking for service-worker updates.
- Added no-cache response headers for the app shell and service worker so new Render deployments appear promptly.

## 0.15.0
- Rebuilt the top information bar with a live UTC clock, STD countdown, persistent Import OFP control, responsive sizing, and Apple safe-area spacing.

## 0.14.9
- Restored the original AeroSlate top info-bar layout in portrait and landscape.
- Added Import OFP after the Zulu clock in both layouts without redesigning the header.

## 0.14.7
- Restyled the flight information bar to match the supplied reference design.
- Kept the Import OFP button visible in both portrait and landscape layouts.
- Preserved flight number, route, equipment, registration, and Zulu time in one clean row.

## 0.14.0

- Removed the VATSIM profile action entirely.
- Redesigned the sidebar with tighter navigation, quieter active states, and a cleaner collapsed portrait rail.
- Redesigned the top flight bar into a compact flight strip with plain aircraft metadata, an unboxed Zulu/STD timing block, and a restrained Import OFP action.
- Added additional iPad safe-area clearance without splitting the portrait header into multiple rows.

## 0.13.6
- Simplified the top information bar, grouped departure and Zulu timing, and reduced visual weight around aircraft and provider controls.

## 0.13.5
- Show aircraft type and registration in the portrait information bar.
- Stretch the OFP Route & Airports panel across the full available content width.

## 0.13.3
- Restored the OFP as a clear in-app operational briefing instead of an embedded PDF viewer.
- Rebalanced OFP cards for a concise two-column portrait layout.
- Added the AeroSlate logo to the portrait navigation rail.
- Moved VATSIM, Zulu time, and Import OFP into the same professional top row as flight identity.
- Removed the box surrounding the Zulu clock.

## 0.13.2
- Rebuilt OFP PDF output for concise operational presentation.
- Removed XML paths, raw transport metadata, duplicate NOTAM fields, and coverage appendix from crew-facing documents.
- Added aligned fixed-width tables, readable NOTAM summaries, ATIS blocks, flight-profile data, and weight margins.

# Changelog

## 0.13.1 — Complete XML-backed OFP

- Recursively traverses the entire imported SimBrief XML/JSON tree.
- Tracks every nonempty scalar value by its source path.
- Places recognized flight data into professional OFP sections.
- Places every remaining nonempty value into a labeled Supplemental Flight Data appendix.
- Suppresses only credentials, provider transport metadata, duplicate document URLs, and similar non-operational values.
- Adds an XML Coverage Summary showing standard, appendix, and suppressed leaf counts.
- Prevents raw XML tags, JavaScript objects, and `[object Object]` from appearing in the PDF.
- Adds page headers containing flight, route, release, and PDF generation time.
- Adds `PAGE X OF Y` footers.
- Adds ISA deviation to the telex navlog when supplied.
- Keeps the randomized professional telex layout stable for each release.

## 0.14.8
- Restored the app's original compact top information bar in landscape and portrait.
- Added the Import OFP button beside the Zulu clock in both layouts without redesigning the header.
