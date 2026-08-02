# DispatchLink EFB 0.3.1

- Added automatic detection for four FR24 paste layouts: airport desktop table, airport compact/mobile, aircraft-history cards, and aircraft-history table.
- Fixed airport navigation tabs being mistaken for the operational table heading.
- Added 12-hour clock parsing and normalization.
- Added local-versus-UTC source detection.
- Added per-airport local-to-Zulu conversion using `airports.dat` IANA timezones.
- Added compact schedule date inference and midnight rollover detection.
- Added parsing for concatenated compact aircraft/type/registration strings.
- Corrected compact US N-number extraction so airline-name letters are not consumed.
- Added blank-flight-number handling using the registration as the dispatch callsign.
- Added duplicate-row enrichment between airport pages and aircraft history.
- Added parser format/time badges, conversion warnings, and raw pasted-time tooltips.
- Added an exact regression fixture and `npm run test:parser`; GitHub CI and native builds now run it.

# DispatchLink EFB 0.3.0

- Reorganized the product around one active-flight workflow.
- Added stable-ID SimBrief OFP watching and automatic synchronization.
- Replaced generic TOLD estimates with SimBrief Runway Analysis/TLR presentation.
- Added Windows-native Electron provider sessions for SimBrief and Navigraph.
- Added first-launch Render backend configuration and in-app backend switching.
- Made scheduled and OOOI fields authoritative and read-only in downstream records.
- Added flexible Zulu-time entry normalization.
- Added configurable report lead and post-flight duty offsets.
- Corrected duty/FDP semantics and added separate duty/FDP calculations.
- Migrates draft times, records, checklists, fuel and scratchpads when a draft flight becomes a generated OFP.
- Added live simulator fuel/weight telemetry fields.
- Added GitHub Actions workflow for Windows installer/ZIP generation.
