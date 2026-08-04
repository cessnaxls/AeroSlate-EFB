# 0.12.7

- Replaced component-level fixed colors with semantic theme tokens across the native AeroSlate shell.
- Added centralized surface, control, text, border, accent, success, warning, danger, and shadow variables.
- Preserved provider-owned SimBrief/Navigraph webview colors.

# AeroSlate EFB 0.12.6

- Replaced residual hard-coded native UI colors with full theme-token propagation across every first-party page, card, table, toolbar, metric, form control, NOTAM panel, fuel panel, runway panel, trip planner, and record workspace.
- Made the complete AeroSlate logo and title lockup respond to the active theme with reliable contrast in both light and dark palettes.
- Corrected OFP card geometry so every tile retains rounded outer and top header corners, clean gutters, and matching header/body surfaces.
- Preserved provider-owned iframe/webview rendering while theming the surrounding AeroSlate shells.
- Added stronger light-theme contrast and removed stale navy/black fills that survived theme changes.

## 0.12.6
- Theme every remaining app surface, including trip calendar, utility panes, and the AeroSlate logo.
- Removed residual hard-coded navy, black, and grey fills from light and dark themes.

# 0.12.4

- Replaced colorful themes with restrained light-blue, deep-blue, navy, midnight, black, graphite, slate-grey, and white/ice palettes.
- Applied active theme variables to all major surfaces, controls, tables, cards, drawers, charts, runway analysis, records, and status elements.
- Restored the flat professional sidebar navigation without boxed tabs.
- Fixed settings-grid overlap and narrow-width input clipping.
- Removed duplicated entry-default controls from Flight and Duty log pages; defaults remain centralized in Settings.

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
