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
