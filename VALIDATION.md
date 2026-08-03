# AeroSlate EFB 0.8.0 validation

Passed in the build workspace:
- TypeScript project check (`tsc -b`)
- Node server syntax check
- Electron main-process syntax check
- Four-format FR24 parser regression
- Updated workflow regression for public chart sources, radar map references, NOTAM classification and structured TLR

The final Vite bundle was not executed because this workspace's internal npm registry does not provide `@vitejs/plugin-react`. GitHub Actions and Render install from their normal registry.
