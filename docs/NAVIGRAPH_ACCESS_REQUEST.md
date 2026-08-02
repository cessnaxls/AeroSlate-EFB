# Navigraph developer access request checklist

Verify the current request process in the Navigraph Developer Portal before submitting.

Include:

- Application: DispatchLink EFB
- Platform: Render-hosted PWA plus an optional MSFS in-game panel and local MSFS/X-Plane bridge
- Purpose: personal/open-source flight-simulation EFB
- Requested access: Charts API and, if needed, Navigation Data API
- Authentication: Authorization Code Flow with PKCE
- Redirect URI: `https://YOUR-SERVICE.onrender.com/api/navigraph/callback`
- End-user requirement: each user authenticates with an eligible Navigraph account/subscription
- Chart handling: online retrieval only, no chart-image persistence or offline cache, `Cache-Control: no-store`
- Annotation handling: locally stored vector markup, separate from chart-image content
- Virtual-environment enforcement: direct chart-image routes require a simulator heartbeat from the local bridge or MSFS panel within the previous 20 seconds
- Standalone behavior: when no virtual-environment link is active, DispatchLink opens Navigraph's official Charts web application in a reusable window and does not call the third-party Charts API

Ask Navigraph to confirm that the virtual-environment architecture is approved before setting `NAVIGRAPH_CHARTS_APPROVED=true`.
