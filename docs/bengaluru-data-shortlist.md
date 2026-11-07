# Bengaluru corridor data shortlist

Target selected by the owner, 7 November 2026: **one corridor with 2–4 junctions**. No empirical data in this shortlist has been automatically adopted or loaded into Flux.

| Input | Why Flux needs it | Current lead and remaining gap |
|---|---|---|
| Directional movement/boundary OD counts, preferably classified 5/15-minute bins | Sets vehicle demand and its distribution between entries/exits | [BMRCL Phase 3 double-decker study, May 2025 catalogue resource](https://data.opencity.in/dataset/4f8004a7-f723-4c22-8a8f-db7b530bc22e/resource/b8e7f944-02c8-4487-ad1f-2f56188c88ad): reviewed summary describes classified counts, turning counts and OD surveys. It contains 2024 baseline PCU totals and future scenarios. We still need dated raw vehicle/movement tables for a small set of adjacent sites. PCUs and forecasts are not observed vehicle OD counts. |
| Actual signal stages, allowed movements, day/time schedules and coordination offsets | Reproduces queues, delays and progression between junctions | [BTP-labelled signal timing collection on OpenCity](https://data.opencity.in/dataset/bengaluru-city-traffic-signal-data): public metadata retrieved successfully, 124 PDF resources. One Palmgroove/Richmond sheet was downloaded and visually checked; it has movement diagrams and time-window phase grids. Upload date is 25 November 2025, not a verified controller effective date. Currentness, authority, offsets and reuse permission remain unresolved. |
| Independent observed travel times, throughput and queues for the same corridor/period | Tests predictions against measurements that were not used for fitting | No complete matching independent observation pack verified yet. TomTom estimates can supplement checks after authorized vault access, but are not a replacement for counted movements or measured queues. |
| Verified lanes, widths, legal turns/speeds and vehicle mix | Reviews OSM defaults and supports appropriate capacity/dynamics | OSM supplies the initial topology. Verify geometry locally or against a suitable survey. Classified survey records are needed before mixed-vehicle calibration; the current engine still requires extensions for multiple vehicle classes. |

The source categories follow [Caltrans' microsimulation input guidance](https://dot.ca.gov/programs/transportation-planning/division-of-transportation-planning/state-planning/statewide-modeling/faq). Availability of separate files does not establish a matched calibration dataset.

## Inspected timing document

[Palmgrove and Richmond Circle timing sheet](https://data.opencity.in/dataset/f1146fbc-5208-4991-ac0b-8c1371fc567c/resource/1e5272a4-b119-41d5-943a-39ddf38cad4d/download/dacd5477-8a1b-44bb-a049-778e774e4760.pdf), OpenCity resource `1e5272a4-b119-41d5-943a-39ddf38cad4d`; inspected 7 November 2026. The one-page PDF was rendered and visually checked after extraction. SHA-256: `380259d6be3ec6f5ff14de7760b4a7d5f5d95c9d4be9eab89d3825b5a24c514c`.

The catalogue supplies no license value. The sheet has unequal phase durations, a separate pedestrian phase at Richmond and differing controller labels. Flux's present symmetric two-axis signal model cannot reproduce all of this directly; do not silently omit phases or claim equivalent timings. Raw PDF/text/render files stay in ignored research storage and are not redistributed here. Being paired on one page does not prove that the two sites form our intended corridor.

## Historical fallback

[Bilekahalli intersection research published in 2013](https://www.ijert.org/improvement-of-traffic-operations-in-congested-signalized-intersections-a-case-study-in-bangalore-city) reports video-based traffic collection on 6 March 2013 and publishes movement/geometry/control tables. The publisher labels the article CC BY 4.0. It is a candidate for an explicitly historical reproduction after table/unit checks, not a current Bengaluru forecast or proof of complete data for four adjacent junctions. Do not mix its counts with newer plans and call the result contemporary calibration.

## Recommended selection rule

Start with **two nearby junctions whose count sites and valid timing plans overlap**, then extend toward four when matching observations exist. Check coordinates against the current 50–800 m map import extent; whole BMRCL corridors span far beyond that. Match survey day/time, source definitions, vehicle versus PCU units and permission before importing. Obtain an independent validation period. Expand the engine for the actual asymmetric/multistage control and vehicle classes before making accuracy claims.

The next acquisition priority is the **raw movement-count annex plus an independent travel-time/queue sample for those same sites**. No complete current pack has yet been verified; the timing collection is the strongest newly inspected control-data lead.

## Follow-up: downloaded survey reports, 7 November 2026

The owner asked for the research status after map fixes took priority. Two additional public BBMP reports were downloaded, hashed and text-inspected; the count tables were also rendered and visually checked. Raw PDFs/text/renders and a retrieval manifest remain in ignored `.tools/research/`; no counts were imported into Flux or redistributed as a dataset.

### JC Road: stronger corridor lead

[BBMP Final Feasibility Report, December 2024](https://data.opencity.in/dataset/2c324650-7caa-40b6-82ef-f99509d5b376/resource/be5f1ca6-4252-432b-b32a-caa54db69dd6/download/305c1726-cae5-43dc-81c1-c0ae0db22c92.pdf), 628 PDF pages. JC Road's Table 44 (PDF page 163) reports seven junctions with separate vehicle/PCU totals and morning/evening peak windows. Tables 45–50 (pages 164–166) give segment-level bus/car journey and running speeds in km/h. The report mentions seven signal-phasing surveys, but matching operational stage tables/offsets are not yet established.

Town Hall, the two Corporation Circle count sites and Hudson Circle are a provisional cluster to investigate for the requested 2–4-junction target; map coverage, movements and common intervals still need checking. Individual peak windows differ, so those totals must not be combined as simultaneous demand or split into invented OD movements. Exact observation dates and an independent validation sample remain unresolved. Page 2 requires an independent suitability check and prior written authority from Altinok for another project's use. No permission is claimed.

SHA-256: `c6a0b8b0695a087ba65f65b2f9ffe63c7180b2f4de3ab63f3bc74f6f65d0f8fa`.

### Hebbal–Silk Board: dated survey lead

[BBMP/Rodic Draft DPR, September 2024](https://data.opencity.in/dataset/857af186-36ba-49c3-8f14-fc2ba7e60dc2/resource/b3630dcd-a4e5-4905-b4ea-92195bf5b1d8/download/1041e5a2-5180-4f1f-b841-474febe1680b.pdf), 227 PDF pages. The catalogue filename/title suggests an inception report; the downloaded cover identifies a draft DPR. Table 57 (PDF page 132) identifies August 2024 classified counts, seven junction turning surveys, passenger OD interviews and speed/delay work. Table 62 (page 142, printed page 133) separates daily/peak vehicles and PCUs. Pages 143–144 contain temporal-volume and speed/delay summaries.

These are aggregate summaries, not yet a movement-by-movement boundary OD file or a verified common-period validation pack. A passenger interview survey cannot automatically become vehicle OD counts. Exact days, raw intervals, signal controls and reuse rights still require verification. The survey dates are historical, not current 2026 observations.

SHA-256: `056ae0c14bc1785cbb601fa91fe39ce2c6d8af52b3032c6d3e4ede5276367390`.

Next acquisition target: request/locate the JC Road raw turning-count sheets and valid signal plans for an overlapping nearby junction cluster, establish reuse authority and common survey periods, and obtain independent travel-time/queue observations. The existing engine needs asymmetric signal phases and time-varying/mixed-vehicle extensions where the selected records require them. Real map geometry is available now; default simulation demand remains explicitly synthetic.
