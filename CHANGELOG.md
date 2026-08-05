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
