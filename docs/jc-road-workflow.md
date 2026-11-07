# Using the JC Road corridor in Flux

The Town Hall–Corporation Circle–Hudson Circle area is a **candidate**, not a validated/calibrated dataset already loaded in the app. Public map geometry can be used now. Report junction totals and journey speeds have different roles and cannot all be imported as demand.

## Run a transparent preview now

1. Open **Import from map**, choose Bengaluru and locate the candidate junctions. Draw a 50–800 m section around two nearby junctions first. Confirm that the selected roads, directions, lanes and junctions actually fit; the entire named cluster may exceed the extent limit.
2. Preview the major-road network. Flux creates directed boundary sources and sinks. Inspect them, preserve a mapping between survey approaches and generated node IDs, and export the network JSON. Geometry follows OSM, while inferred widths/speeds/controls need field or authoritative checks.
3. Choose vehicle types/attributes and any synthetic shares. The new named-model reference defaults are not observed Bengaluru fleet measurements. Review short-edge and lane-width fit warnings before including buses/trucks.
4. Use the explicitly labelled synthetic boundary demand for an exploratory local preview. Do not call its traffic counts, queues or travel times observations or calibrated predictions.
5. Choose **Use area on server**, sign in, review the network/mix/demand/duration/seed, then **Run current on server**. For an already loaded network, use **Run on server** beside playback. This starts a fresh simulation at zero on the local Node backend. It does not move live browser agents or deploy to Azure. Download the completed server report to retain inputs, provenance and results.

## Replace synthetic demand when suitable counts arrive

Obtain permitted raw turning/boundary-OD counts for the selected sites and common survey period, together with approach definitions, classifications and actual controls. Junction turning counts may require a documented flow/OD reconstruction; Flux does not currently infer boundary OD from junction totals. Do not invent that reconstruction.

Prepare a UTF-8 CSV using IDs from the exported network:

```csv
origin,destination,count,interval_seconds,observed_at
```

Rows describe **motor-vehicle OD trips**, with a nonnegative integer count, exposure in seconds and observation-start timestamp in ISO UTC. Convert IST to UTC by subtracting 05:30. Do not substitute passenger counts or passenger-car units. Supply a consistent, non-overlapping exposure for each OD pair and check flow conservation/coverage. Keep the original sheets plus the transformation, source, date, units, permission/license and SHA-256.

In the **Server** data workspace choose **Observed OD counts CSV**, select the prepared file, fill in source/license/capture date and import it against the selected network. The importer preserves configured vehicle profiles, replaces demand with `sum(count) × 3600 / sum(exposure_seconds)` for each pair and retains a content hash. It averages observations into constant hourly rates; it does not replay bins or infer class shares. Review the resulting rates/provenance, configure surveyed shares separately, save, then run a fresh server job.

## What the located reports can and cannot do

The [December 2024 BBMP feasibility report](https://data.opencity.in/dataset/2c324650-7caa-40b6-82ef-f99509d5b376/resource/be5f1ca6-4252-432b-b32a-caa54db69dd6/download/305c1726-cae5-43dc-81c1-c0ae0db22c92.pdf) Table 44 (PDF page 163) contains junction-level peak totals in vehicles/PCU. Different sites have different peak windows. These are not the required turning/boundary-OD rows and must not be combined as one simultaneous hour. Tables 45–50 (pages 164–166) provide historical segment bus/car journey and running speeds; after verifying suitability, survey definitions and permission, they could support a historical comparison with matching endpoints/period, not current 2026 validation. Page 2 requires prior written authority for another project's use and an independent suitability check. No reuse authority or ingestion is claimed.

Known report SHA-256: `c6a0b8b0695a087ba65f65b2f9ffe63c7180b2f4de3ab63f3bc74f6f65d0f8fa`. Full source history and the other survey/timing leads are in [the Bengaluru shortlist](bengaluru-data-shortlist.md).

Before any accuracy claim, match actual signal stages/offsets to the common observation period and hold back an independent travel-time/queue sample for validation. Flux currently models two-axis signals; asymmetric/multistage plans need an engine extension rather than an invented equivalent. Classified, time-varying demand, lane-free movement and bus dwell may also require extensions. A synthetic preview and a real-data calibrated model are separate milestones.
