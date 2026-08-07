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
