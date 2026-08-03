# Changelog

## 0.11.6

- Removed the FAA chart catalog, local PDF chart renderer, drawing toolbar, binder, and public chart-source workflow.
- Replaced Charts with a persistent authenticated Navigraph Charts workspace.
- Navigraph stays mounted while changing AeroSlate tabs, preserving the provider session and workspace state.
- Added full-workspace expand, reload, and provider-window controls.
- Added flight-, departure-, destination-, alternate-, and named-chart notes.
- Notes autosave locally by active flight and persist across app restarts.
- AeroSlate stores the annotation text separately and does not cache Navigraph chart images.
- Updated Dashboard, Settings, and data-ownership descriptions to reflect Navigraph-only charts.
