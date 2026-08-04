# 0.12.10

- Removed flight and duty entry-default controls from the Flights and Duty tabs.
- Flight and duty defaults and opening totals remain managed exclusively from Settings.
- Runtime log-entry initialization still reads the saved Settings values.

## 0.12.9

- Moved each active-navlog fuel variance directly below the planned remaining fuel value in the Fuel column.
- Removed the detached variance label from the active-entry controls.


## 0.12.8
- Removed the remaining Clear flights button surface so it is a true inline text action.
- Reflowed Trip Builder into a compact portrait control deck.
- Rebuilt the OFP release sheet with balanced cards, larger load figures, and a two-column tablet layout.
- Restored a visible Zulu clock in portrait and matched the VATSIM and Import OFP controls.
- Removed sidebar divider artifacts and kept the portrait icon rail clean.
- Documented persistent authenticated provider sessions and kept all user-entered connection and logbook settings in Settings.
# Changelog

## 0.12.6
- Rebuilt portrait navigation as a permanent icon rail with a blurred overlay drawer.
- Removed the separate portrait bottom tab bar.
- Restored flat, professional sidebar navigation rows.
- Kept Import OFP and VATSIM status controls visible in portrait layouts.
- Replaced the logo with a dedicated AeroSlate airliner mark.
- Reduced the theme set to neutral blue, slate, graphite, and light palettes.
- Routed cards, fields, tables, controls, navigation, and runway/OFP surfaces through theme variables.
- Prevented Settings fields and logbook-default panels from overlapping.
- Increased OFP load-sheet value size and balanced release-card dimensions.

# AeroSlate EFB 0.12.3

- Removed the unused VATSIM CID setting.
- Expanded VATSIM prefile parameters to include required speed, fuel endurance, equipment, transponder and wake category fields.
- Rebuilt the OFP as a readable scrollable pilot release.
- Applied ten full application color palettes instead of logo-only accents.
- Reflowed runway-analysis results for tablet and portrait readability.

## 0.12.3
- Propagated all ten themes through cards, controls, tables, status panels, OFP, records, NOTAMs, trips, and runway-analysis surfaces.
- Enlarged OFP load-sheet figures and balanced release cards into a consistent two-column scrollable layout.
- Added extensive logbook and duty defaults plus opening/carry-forward totals in Settings.
- Improved VATSIM prefile mapping with raw ICAO FPL, legacy-compatible fields, PBN/NAV/DAT/SUR, registration, operator, performance, EET, SELCAL, equipment, wake, time, speed, and fuel endurance.

## 0.12.5
- Added a persistent portrait icon rail with every app section available as an icon.
- Added a six-item bottom workflow bar: Home, Find, Trips, Dispatch, OFP, and More.
- Reworked the portrait drawer so the visible rail shows the actual navigation icons rather than an empty strip.
- Preserved the blurred app backdrop while the full sidebar is open.

## 0.12.6
- Replaced the bulky Alert NOTAM airport buttons with a compact station rail using an accent marker and count badges.
- Made the navlog Rows/Columns selection persistent and unmistakable with `aria-pressed` state and theme-aware active styling.
