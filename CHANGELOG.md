# AeroSlate EFB 0.10.1

## Trip dates
- New legs added from Flight Finder are normalized to ISO calendar dates before storage.
- The itinerary presents dates using the same friendly month/day/year format as Trip Builder.
- Existing valid saved dates are migrated automatically.

## SimBrief payload mapping
- Passenger count is sent to SimBrief's passenger-count field.
- SimBrief payload is now exactly `(passengers × 190 lb) + (bags × 40 lb)`.
- Freight is sent separately to the SimBrief freight field and is not included in payload.
- The same mapping is used by Build buttons, itinerary dispatch, rigs, and calendar dispatch.

## Charts
- Replaced FAA webpage scraping with the official current d-TPP XML metafile.
- Airport diagrams, departures, arrivals, approaches, minimums, hot spots, and visual procedures are grouped cleanly.
- The airport chart set loads automatically when the Charts view is opened.
- Removed unrelated chart-supplement documents from airport search results.
- Refined the chart browser and viewer layout for tablet and phone use.

## NOTAMs and Flight Finder
- Replaced cryptic three-letter alert tiles with plain-language category labels.
- Renamed alert counters to `Critical` and `Procedure changes`.
- Centered Clear flights beneath the other import actions.
