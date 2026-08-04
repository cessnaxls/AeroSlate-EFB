# AeroSlate EFB 0.13.1

AeroSlate is a GitHub/Render-ready electronic flight bag for flight simulation. This release introduces a complete XML-backed operational flight plan generator.

## Complete SimBrief OFP ingestion

The OFP generator recursively reads the entire imported SimBrief XML/JSON tree. Every nonempty scalar value is accounted for in one of three ways:

1. **Standard operational section** — recognized flight, route, aircraft, fuel, load, weather, navlog, NOTAM, ATC, TLR, and remarks data.
2. **Supplemental Flight Data** — nonempty values for which AeroSlate does not yet have a dedicated operational layout.
3. **Suppressed metadata** — credentials, internal provider transport data, and duplicate document URLs that do not belong in a pilot OFP.

The PDF includes an XML Coverage Summary with the exact counts for all three categories.

## PDF presentation

- Multipage, scrollable telex-style PDF
- Stable randomized professional format per flight release
- Page header with flight, route, release, and generation time
- Page numbering
- Properly labeled tables and sections
- No raw XML tags
- No JavaScript object rendering
- No `[object Object]`
- Download, print, and separate-window controls

## Development checks

```bash
npm install
npm run check
npm run test:parser
npm run test:workflow
npm run build
```
