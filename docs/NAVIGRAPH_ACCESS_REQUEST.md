# Navigraph developer access request checklist

Send the request to the developer contact listed in the current Navigraph Developer Portal. Verify the address in the portal before sending.

Include:

- Application name: DispatchLink EFB
- Affiliation: personal/open-source flight-simulation project (adjust as appropriate)
- Platform: Render-hosted web backend and MSFS in-process InGame Panel wrapper
- Purpose: personal computer flight simulation only
- Requested access: Charts API and Navigation Data API
- Authentication: Authorization Code Flow with PKCE
- Redirect URI: `https://YOUR-SERVICE.onrender.com/api/navigraph/callback`
- Chart handling: online retrieval only; no chart image storage or offline cache; `Cache-Control: no-store`
- Simulator enforcement: chart routes require a heartbeat from the MSFS panel within the preceding 20 seconds
- End-user requirement: individual Navigraph account and subscription
- Annotation behavior: locally stored vector markup only; chart image content is not stored

Ask Navigraph to confirm whether the hosted-in-panel architecture is approved before changing `NAVIGRAPH_CHARTS_APPROVED` to `true`.
