# MSFS simulator-link panel source

This folder is the **in-simulator wrapper source**, not a prebuilt Community package. Navigraph says Charts API credentials can only be granted to an application running in-process in a flight simulator; their restrictions also describe detachable/networked virtual gauges used with an active simulator as an acceptable pattern.

## Build workflow

1. Enable Developer Mode in MSFS and install the current MSFS SDK.
2. Start with the SDK's current InGame Panel / toolbar-panel sample. The exact package metadata changes with SDK releases, so do not reuse an old `layout.json` blindly.
3. Copy `source/html_ui/InGamePanels/AeroSlateEFB` into the sample's corresponding `html_ui/InGamePanels` asset directory.
4. Copy `config.js.example` to `config.js` and enter:
   - your deployed Render URL;
   - the same `SIM_LINK_TOKEN` configured on Render.
5. Point the sample panel's HTML entry to `AeroSlateEFB/AeroSlateEFB.html`.
6. Build the package in the MSFS Project Editor and install its built output in the Community folder.
7. Open the panel while in a flight. It sends a heartbeat every five seconds and displays the hosted AeroSlate EFB in the simulator panel.

## Navigraph approval

Before setting `NAVIGRAPH_CHARTS_APPROVED=true`, email Navigraph's developer team with the application architecture, platform, requested Charts API and Navigation Data API access, OAuth flow, and redirect URI. Do not enable the chart endpoints without their approval and credentials.

The wrapper intentionally does not store or cache Navigraph chart images. The server responds to chart image requests with `Cache-Control: no-store`.
