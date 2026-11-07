# Minimum observations for a Flux corridor

Start with one named corridor or junction in Bengaluru, Mumbai, Chennai, Pune, Hyderabad or Delhi. A representative observed hour is enough for the first bounded experiment; it does not establish city-wide accuracy. Multiple periods and an independent validation day are needed for calibration/validation claims.

1. Location, endpoints/map coordinates, number of directional lanes, legal speeds and permitted movements. OSM can supply an initial map; actual lane/turn details need review.
2. Dated directional counts and turning movements, preferably 5- or 15-minute bins. State units explicitly: vehicles and passenger-car units (PCU) are different. Vehicle classifications (two-wheelers, three-wheelers, cars, buses, trucks) are valuable for Indian mixed traffic.
3. Actual signal stages, compatible movements, green/yellow/all-red durations and time of day; offsets if multiple junctions are modeled. State when timing changes or actuation occurs.
4. Same-period measured travel time between named endpoints and/or observed maximum/average queues for validation. Keep independent measurements out of parameter fitting.

The currently implemented count importer accepts **observed origin-to-destination motor-vehicle trips**:

```csv
origin,destination,count,interval_seconds,observed_at
```

Use source/sink IDs from the current Flux network. Count is a nonnegative integer in vehicles; interval_seconds is positive; observed_at is an ISO UTC timestamp (convert IST by subtracting 05:30). The importer converts counts to a constant mean rate over the supplied observation exposure; it does not currently replay time-varying bins. Do not reinterpret a station/screen-line total as an OD matrix except for a verified single-route corridor with explicit mapping. Do not enter forecast or synthetic counts as observed.

Also provide the survey source, permission/license, capture/observation date and any aggregation rules. CSV/spreadsheets or clearly labeled report tables can support preparation, but report reuse permission must be checked. No raw personal GPS identifiers are needed.

The current engine supports six configurable lane-based vehicle classes and two-axis signal controls. Profiles/shares are assumptions until fitted to observations. Complex signal phasing, lane-free mixed traffic, bus stops and empirical multi-class calibration need further work before real-city accuracy claims. TomTom observations help validate speeds/travel times, but its live segment API is not an OD count or signal-controller feed.


## Current dataset decision — 7 November 2026

The owner selected a Bengaluru corridor with 2–4 junctions as the first dataset target. Exact junctions and a common observation period still need matching. The recommended first pack is one matched corridor/time period: movement or boundary OD counts for demand, actual signal plans where applicable, and independent travel-time/queue observations for validation. Use 5/15-minute classified bins when available; the current importer averages them into constant rates, so time-varying replay remains an extension. For a roundabout, add circulating headway/accepted-gap observations to calibrate the currently approximate entry-yield rule. Vehicle-class observations are now needed to fit the new configurable profiles/shares; they do not establish lane-free behaviour, bus stops or empirical calibration.

These requirements align with [Caltrans' microsimulation data guidance](https://dot.ca.gov/programs/transportation-planning/division-of-transportation-planning/state-planning/statewide-modeling/faq), which identifies geometry, controls, classified flows, queues, travel times and trip demand. The existing six-city source review is a starting catalogue, not proof that a complete matching pack has been obtained. Inspect observation year, coordinates, direction/movement definitions, vehicle versus PCU units, collection method, license and source hash before adoption.


Current source candidates and adoption gaps are in [the Bengaluru shortlist](bengaluru-data-shortlist.md). BTP-labelled timing PDFs have now been inspected, but their metadata upload date is not proof of present controller settings. Do not mix them with historical counts and describe the result as current calibration.
