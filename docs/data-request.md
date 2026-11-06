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

The current engine uses simplified passenger-vehicle dynamics and two-axis signal controls. Complex signal phasing, lane-free mixed traffic and empirical multi-class calibration need model extensions before a claim of accurate real-city prediction. TomTom observations help validate speeds/travel times, but its live segment API is not an OD count or signal-controller feed.
