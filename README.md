# AeroSlate EFB 0.11.6 — Navigraph Edition

AeroSlate is a free Render/GitHub-hosted simulator EFB built around SimBrief planning, FR24 flight discovery, trip scheduling, OFP briefing, navlog, fuel monitoring, OOOI, records, and a persistent Navigraph Charts workspace.

## Navigraph Charts

The previous FAA/public chart catalog, PDF renderer, chart binder, and local chart drawing system have been removed. The Charts page now relies exclusively on the official Navigraph Charts application at the current-flight workspace.

- The Electron desktop edition embeds Navigraph directly inside AeroSlate using a persistent provider session.
- The Charts page remains mounted while you use other AeroSlate tabs, so the Navigraph session and workspace are not intentionally reloaded.
- On mobile/PWA builds, AeroSlate attempts an inline provider frame and also offers a persistent in-app/provider-window fallback when browser security blocks framing.
- Reload, expand/restore, notes, and open-provider controls remain inside AeroSlate.

## Persistent chart notes

Because AeroSlate cannot inspect or draw directly over a cross-origin Navigraph webpage, notes are stored separately from the chart image. Notes can be kept for:

- The active flight
- Departure airport
- Destination airport
- Alternate airport
- A manually named chart or procedure

Notes autosave to device local storage and persist across tab changes and app restarts. AeroSlate does not cache or redistribute Navigraph chart images.

## Deploy

Push the project to GitHub and deploy it with the included free `render.yaml`. For the cleanest embedded Navigraph experience, build the included Electron desktop edition with:

```bash
npm install
npm run native:dist
```

The Windows build uses the persistent `aeroslate-providers` Electron session partition, so Navigraph authentication can remain available between launches.

## 0.12.0 operational briefing additions

AeroSlate now verifies the active callsign against the public VATSIM live-data feed, including both connected pilots and prefiled plans. The Weather / NOTAMs page also retrieves VATSIM text ATIS and attempts a public real-world D-ATIS lookup for the departure and destination.

Public real-world D-ATIS feeds can be delayed or unavailable because many are derived from ACARS requests. They are shown as supplemental simulation information. When flying on VATSIM, use the current VATSIM ATIS whenever available.

The OFP page is a compact pilot-release view rather than a PDF replica. It preserves the complete ICAO flight-plan text and dispatcher remarks while keeping the commonly used release, route, procedure, schedule, aircraft, weather, fuel and weight data within the device workspace.
