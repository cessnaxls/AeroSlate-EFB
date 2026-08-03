# AeroSlate EFB 0.11.1 validation

Passed:
- TypeScript project check (`npm run check`)
- FR24 parser regression: all four supported paste formats
- Workflow regression: airport catalog, FAA chart API, route weather, NOTAM priorities, structured TLR
- Node server syntax check
- Electron main/preload syntax checks
- Python bridge byte compilation
- ZIP integrity check

The final Vite bundle could not be executed in this workspace because its internal npm registry does not provide `@vitejs/plugin-react`. GitHub Actions and Render install from their normal registries and run the production build.


## 0.11.1 regression additions

- Verified SimBrief URL includes `pax`, `payload`, documented `cargo`, and encoded `acdata` with `paxwgt` and calculated `bagwgt`.
- Verified no obsolete `freight` URL parameter is emitted.
- Verified random-flight scrolling uses centered alignment.
- Verified chart workspace uses a stable memoized source and cancelable PDF render task.
- Verified portrait drawer ignores a stored landscape-collapse state on first opening.
