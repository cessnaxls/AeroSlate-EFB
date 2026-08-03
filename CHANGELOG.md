# AeroSlate EFB 0.11.4

- Added a broad SimBrief aircraft BOW/OEW reference catalog with ICAO-family fallbacks.
- SimBrief dispatch now sends the generated passenger count and freight as before, plus `manualzfw`.
- Manual ZFW is calculated as aircraft BOW + passenger weight + baggage weight + freight.
- Removed passenger-weight compensation through `acdata.paxwgt`; normal SimBrief passenger assumptions remain visible while the planning ZFW is forced to the AeroSlate load.
- Added regression coverage for A20N BOW, payload, freight, and manual-ZFW units.

## 0.11.5

- Fixed Binder items so **Open chart** returns to the chart workspace and opens the saved chart immediately.
- Rebuilt the Charts layout with a stable catalog/viewer split on wide screens and a stacked full-width viewer on portrait/tablet widths.
- Prevented chart controls, color controls, reload controls, and titles from being clipped.
- Added a chart-aware NOTAM drawer that matches current airport, runway, procedure, lighting, and approach-equipment notices to the chart being viewed.
- Refined NOTAM facility classification so taxiway and ramp/deicing closures are not mislabeled as runway closures merely because the text references a runway.
- Added dedicated Ramp / deicing NOTAM grouping.
- Corrected Dispatch Overview OFP layout extraction.
- Prevented FIN and SELCAL object values from rendering as `[object Object]`.
- Corrected SID/STAR display so runway identifiers are not mislabeled as procedures.
- Reformatted navlog weather cells as wind direction/speed, OAT, and ISA on distinct lines.
