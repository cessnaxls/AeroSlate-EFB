## 0.19.2
- Added a dedicated Training Records tab linked from each qualification requirement.
- Added FAA/EASA regulatory-baseline competency/checking sheets with per-item S/U/W/N/A grading and aircraft/simulator device recording.
- Completing a satisfactory check automatically updates the linked qualification completion/evidence fields and due-date logic.
- Uses current FAA competency/checking-record terminology rather than the retired FAA Form 8410-3.

## 0.19.1
- Reworked Training & Qualification rows into a compact no-horizontal-scroll matrix.
- Regulatory requirement titles and legal-basis columns are now read-only generated values.
- Due dates now calculate automatically from the applicable recurring rule after the completion date is entered.
- FAA Part 121 recurring items use calendar-month expiration logic and the Part 121 eligibility-month framework; rolling aircraft recency stays in the aircraft-currency panel.
- Removed editable interval and due-date controls from baseline legal rows; evidence remains editable and notes are collapsed by default.

## 0.19.0
- Replaced the generic career progression builder with a professional per-aircraft upgrade ladder tied to the active training record.
- Uses fixed industry-style progression titles; users only edit hour thresholds.
- Adds operation-sensitive default thresholds, current time-in-type, remaining hours, and reset-to-defaults.
- Removes game-like custom stages, manual gates, goals, and percentages from career progression.

## 0.18.9
- Added customizable, multi-stage career progression to Records.
- Career stages can contain automatic logbook gates or manual milestones.
- Automatic gates support total time, PIC/SIC, night, instrument, cross-country, landings, approaches, holds, flight count, unique tails/types, plus aircraft/operation/role filters.
- Added stage and overall progress, target dates, current-stage highlighting, and persistent local career plans.

## 0.18.8
- Promoted Aircraft Currency & Recent Experience to a clearly labeled first-class section immediately above the training matrix.
- Strengthened visual treatment so aircraft currency cannot be mistaken for part of the training requirements table.
- Bumped service-worker cache to force the updated Records UI after deployment.

## 0.18.7
- Added aircraft/type currency tracking to each Training & Qualification profile.
- Currency is calculated automatically from saved flight-log records for the selected aircraft and PIC/SIC position, with optional tail-specific filtering.
- Added configurable rolling windows and targets for flights, role hours, day/night landings, approaches, holds, and intercept/track experience.
- Added current/action-needed status, last qualifying flight, and remaining-to-target indicators.

## v0.18.7
- Replaced the generic currency tracker with operator/aircraft/operation/position training and qualification records.
- Added FAA/EASA baseline matrices, editable intervals, completion dates, due dates, evidence and custom requirements.
- Added current/due/expired status summary.
- Clarified that AeroSlate tracks compliance against the user/operator program and does not itself confer regulatory approval.

## v0.18.5
- Added configurable pilot currency tracking from saved flight records, including rolling day/night landing targets and instrument-experience targets.
- Added holding/intercept-track capture to flight records for instrument currency tracking.
- Added a live duty status dashboard with elapsed and remaining duty/FDP, entered hard-stop times, prior-rest comparison, and required-rest completion time.
- Added separate configurable maximum FDP to duty defaults and records.

## v0.18.4
- Added MCC-style custom totals/report builder for Flight and Duty logs.
- Added arbitrary field filters, custom metric operations, unique counts, averages/min/max, and breakdown grouping.
- Existing concise records browser and drill-down remain unchanged.

## v0.18.3
- Rebuilt Flight and Duty history into concise analytics views with live totals, search, date filtering, grouping, and full per-record drill-down.
- Totals recalculate against the current filtered dataset so users can inspect any period, aircraft, registration, role, operation, or duty scheme.

## v0.18.2
- Fixed Navlog ETA accumulation so numeric SimBrief `time_leg` values are always treated as seconds. Short legs can no longer turn into multi-hour ETA jumps.
- ETA now accumulates exact leg seconds and only rounds when formatting the displayed clock, so sub-minute legs still contribute correctly.
- Custom AeroSlate-generated navlogs now store leg times in seconds to match SimBrief/OFP semantics.

## v0.18.1
- Removed the Navlog Rows/Columns scroll selector.
- Navlog now uses one natural two-axis scroll viewport for vertical row scrolling and horizontal column panning.

# v0.18.0
- Rebuilt Aircraft Fuel Profiles around performance tables rather than a single cruise-flow estimate.
- Added cruise performance points by altitude, weight, ISA deviation, TAS and fuel flow.
- Added climb/descent cumulative performance points by altitude, weight, ISA deviation, time, fuel and distance.
- Added default planning weight and per-flight planned takeoff weight; SimBrief imports takeoff weight when available.
- Flight planning now interpolates the nearest performance points for forecast temperature/ISA deviation, altitude and planned weight, with legacy simple values retained only as fallback.

## v0.17.5
- Moved simulator fuel-profile learning to the server so bridge telemetry continues to be recorded while the browser/PWA is backgrounded, suspended, on another tab, or closed.
- Added server learning start/status/stop APIs and reconnectable session status.
- Browser now controls and displays the server-owned learning session instead of being the recorder.

## v0.17.4
- Added SimBrief plan-data import to AeroSlate Flight Planner.
- Imports departure, destination, alternate, route, and available plan metadata into the planner without replacing the selected custom fuel profile.
- The imported route can then be regenerated as a native AeroSlate OFP using the selected profile and current planner weather.

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
