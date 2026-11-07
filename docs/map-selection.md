# Select an OpenStreetMap road section

Open **Map area** in the header. No account or API key is needed for the map and browser simulation; server saves/jobs still require sign-in.

1. Choose Bengaluru, Mumbai, Chennai, Pune, Hyderabad or Delhi. These shortcuts move the map; they are not preloaded city traffic datasets.
2. Pan/zoom to a junction or corridor. Choose **Draw selection**, then click/tap the first and opposite corners. Dragging pans. Alternatively select a 260 m square at the map centre, or enter south/west/north/east under keyboard selection.
3. Keep each side between 50 and 800 m. Set total starter synthetic vehicles/hour (default 900; zero is allowed).
4. Choose **Preview roads & terminals**. Purple roads show the clipped network; green **SOURCE** markers admit traffic, red **SINK** markers remove it. Inspect the assumptions/provenance.
5. Choose **Use area in simulation**, then Run or advance time. Network exposes the generated terminal IDs, OD rates, lanes, speeds and controls for editing. Data & cloud can save the scenario/provenance and run a server job.

## How terminals are assigned

The backend reads public drivable OSM ways with their dependent nodes and expands each way into directed segments. Explicit `oneway=yes/1/true`, reverse `-1`, implicit motorway/roundabout direction and bidirectional roads use the existing importer rules. Roads stay on their mapped elevation layers; coincident geometry never adds a cross-layer junction.

The selected geographic rectangle is projected into a local metre plane. Liang–Barsky clips each directed segment to that rectangle. Its start on the boundary is an entry/source; its end on the boundary is an exit/sink. Two-way roads have separate entry and exit terminal IDs at the same geographic crossing. Those terminals do not connect to each other, so traffic cannot leave the area and return via an artificial outside link. A way that leaves and re-enters becomes separate inside routes. Exact boundary endpoints are terminals; tangencies and boundary-only segments are excluded. Internal dead ends retain junction roles.

Only connected same-layer sub-metre shape points are collapsed before clipping. Clipped pieces shorter than 1 m are omitted; remaining segments use the engine's 10 m minimum operational length. This is a simplified road-network conversion, not survey-grade geometry. Dense networks show one layer badge per layer, plus source/sink labels; the editor still exposes all roads.

Starter demand is **synthetic**. Reachability is checked using directed connectivity. Each eligible entry gets one furthest reachable boundary exit, measured by straight-line separation; the total requested rate is divided evenly across these pairs. Entries with no reachable exit receive no demand. No trips are sent through disconnected geometry. This is a convenient test workload, not an inferred OD matrix. Edit it or replace it with mapped observed OD counts for analysis. Selection with no usable entry-to-exit route fails explicitly.

## Data and service limits

The browser uses locally bundled [Leaflet 1.9.4](https://leafletjs.com/reference-1.9.4.html) and direct standard OSM tiles, with visible attribution, browser caching and a valid referrer. Tiles load only for the current view, without bulk downloads or offline prefetch. Public tiles are best-effort; sustained production usage needs an appropriately provisioned provider under the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

The backend calls only `https://api.openstreetmap.org/api/0.6/map.json`, adding a 100 m buffer before clipping. It identifies Flux, rejects redirects, accepts JSON only, times out after 12 s, and caps the response at 2 MB. Selection is 50–800 m per side; upstream parsing is capped at 3,000 elements/1,000 undirected segments, and the resulting simulation at 300 nodes/1,000 directed roads/100 OD pairs. Smaller selections may be needed in dense areas. Six map requests/IP/minute, thirty/server/minute (including cache hits), two concurrent upstream calls, and four cached raw extracts with five-minute freshness bound public-service and conversion load. These local controls are not a multi-replica quota service.

The [OSM map API](https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_map_data_by_bounding_box:_GET_/api/0.6/map) selects ways with at least one node in the requested box. A very sparse way crossing the entire buffered box with no node inside can be absent. Inspect coverage; importing a complete OSM JSON extract remains available in Data & cloud. A map selection does not automatically create a retained raw-file dataset: raw extracts stay in the bounded process cache; the normalized scenario, source URL, retrieval time, license, hash and warnings can follow server saves/reports. Existing authenticated file imports retain their exact raw file separately.

OSM geometry does **not** supply observed traffic demand, actual signal phases/timings or empirical calibration. Missing lanes/speeds use disclosed defaults. Mapped signals remain priority-controlled until configured. Turn restrictions, conditional access, complex junction geometry and mixed Indian vehicle classes need model/data work before accuracy claims. Unsupported data, unavailable services and oversized/disconnected selections produce recoverable errors.

## Verification

Automated cases cover forward/reverse/two-way crossings, exact borders/corners/tangencies, disconnected entries, internal dead ends, re-entry, grade separation, sub-metre geometry, zero demand, deterministic conservation, invalid/injected/oversized requests, fixed-host transport, cache/quotas/concurrency, HTTP save/job integration and browser workflows. Browser tiles/geometry in automated tests are labelled synthetic fixtures; they do not call public services. A separate manual live Bengaluru check retrieved and previewed 33 nodes/38 directed roads with two sources/three sinks, then advanced the imported simulation to 20 s with four active and zero rejected trips. This verifies integration, not traffic calibration. Full gate and repeat 120-user results are in testing.md.

![Live Bengaluru selection with automatic sources and sinks](screenshots/osm-area-selection.png)
