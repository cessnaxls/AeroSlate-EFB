# AeroSlate EFB 0.11.2

- Trip buttons now use a persistent logical leg key and remain green independently for every saved leg.
- Trip state survives filters, tab changes, reloads, and later FR24 pastes.
- SimBrief payload and freight URL values are converted from AeroSlate pounds to the kilograms expected by the custom-options endpoint.
- Native form prefill still receives the original pound values.
- Existing trip records are migrated into the persistent green-state index automatically.
