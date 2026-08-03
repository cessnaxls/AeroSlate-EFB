# AeroSlate EFB 0.11.4

- Added a broad SimBrief aircraft BOW/OEW reference catalog with ICAO-family fallbacks.
- SimBrief dispatch now sends the generated passenger count and freight as before, plus `manualzfw`.
- Manual ZFW is calculated as aircraft BOW + passenger weight + baggage weight + freight.
- Removed passenger-weight compensation through `acdata.paxwgt`; normal SimBrief passenger assumptions remain visible while the planning ZFW is forced to the AeroSlate load.
- Added regression coverage for A20N BOW, payload, freight, and manual-ZFW units.
