# AeroSlate EFB 0.10.0

## Flight Finder
- Keeps Build, Trip, and Tail at their full landscape size in portrait mode.
- Uses a horizontally scrollable fixed-width table instead of compressing or stacking row actions.
- Shows a temporary green check next to Trip after a successful save.
- Retains the fading “Leg added to trip” notification.

## Trips
- Random rig generation is independent of the currently selected Flight Finder row.
- Generated 1–5 leg rigs appear as a preview with Regenerate and Accept controls.
- Calendar days open an expanded day schedule with 30-minute Zulu tick marks.
- Scheduled legs appear as time-positioned blocks and can be dispatched from the day view.
- Local trip storage remains primary; Gist synchronization is optional.

## NOTAMs
- Replaced the dense alert wall with a ForeFlight-inspired route-station selector and focused alert list.
- Displays only currently active operational alerts in the initial panel.
- Preserves every imported NOTAM in the complete legal briefing.
- Keeps Current, Future, Past, All, category, station, and text filters.
- Shows concise plain-language headlines and expandable original legal text.

## Maps and weather
- Added reflectivity radar, satellite imagery, infrared cloud phase, and cloud-top temperature layers.
- Added independent opacity and aviation-layer controls.
- Added model-based icing screening at sampled route fixes.
- Icing checks use each fix’s planned altitude and estimated crossing time, and only mark points where forecast temperature and moisture/cloud criteria overlap.
- Dark map and dark controls remain the default.

## Charts
- Added an integrated FAA d-TPP chart API proxy.
- US airport diagrams, departures, arrivals, approaches, and minimums can be browsed and opened inside AeroSlate.
- Official FAA PDFs can be added directly to the flight binder.
- Worldwide official/public AIP PDF links can still be added manually because no single unrestricted global procedure-chart API exists.
