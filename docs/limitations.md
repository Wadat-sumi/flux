# Flux limitations

Flux is an educational experimentation tool, not a calibrated or validated forecast for infrastructure investment or safety analysis. Synthetic demand and simplified controls demonstrate mechanisms rather than real-city predictions.

- Straight or bounded polyline road geometry; independently editable operational lengths can differ from drawn path length. Imported road compaction preserves geometric arc length.
- Six configurable vehicle classes use named OEM dimensional/speed references, explicitly classified desired-acceleration proxies and uncalibrated braking/following settings. They are not universal class averages or observed Indian fleet parameters. No lane-free filtering, bus stops/dwell, articulated truck turning or powertrain/gradient dynamics. Legacy files without profiles retain the original car model; see vehicle-types.md.
- Static vehicle-aware free-flow shortest paths without adaptive rerouting or destination choice. Explicit profiles exclude lanes narrower than the body and segments without whole-body-plus-gap storage; a long body cannot span several short edges.
- Simplified gap-based lane changes and unrestricted turns from every lane.
- Two-axis symmetric signal timing and conservative exclusive-node intersection reservations, without turning polygons.
- Boundary transfers omit several metres of junction traversal; no swept-body geometry safety guarantee.
- Artificial timeout rejection resolves gridlock and is surfaced in warnings.
- Finite observation horizons censor unfinished trips. Completed-trip averages alone can favor a heavily congested scenario, so active/rejected counts must be shown.
- Browser performance has been measured on one macOS arm64 machine in Chromium with 544–552 on-road agents in straight and curved corridors, and 624–630 in the signal-network case. The benchmark does not guarantee the same FPS on every device, maximum allowed graph or background tab. Rendering and numerical physics are decoupled; overloaded wall-clock playback slows without changing the numerical step.
- Road widths are visually exaggerated. Vehicle solids retain proportional body length/width with bounded display caps; heights are schematic visual assumptions. Decorative blocks are illustrative and may be hidden; they are not GIS geometry.
- Local saves are per browser origin, bounded to 12 scenarios and 4 MB. They do not sync across devices or from localhost to Azure; use JSON export/import.
- Live Azure authentication, infrastructure plan/apply, public deployment and live-host header checks are deferred to the joint review on 6 November 2026. Local QA host checks do not prove Azure enforcement.

No raw session log is committed. The original initial-header requirement is not literally satisfied by the log's environment-context first message; see the progress record.

## Full-stack revision limits

The API/persistence/server-job layer is now implemented, with a local persistent PostgreSQL-compatible database and production pg driver. Server results match the same simplified engine, so moving execution to a backend does not itself improve traffic-model accuracy. One API replica/CPU worker, 20 active queue slots, three/user, 120-second execution cap, bounded history/storage and no consumer password-reset/email-verification workflow are deliberate first-release limits.

Real OSM ingestion and observed OD rate conversion are implemented. Counts are averaged over exposure, not replayed as time-varying bins; 300-node/1000-edge bounds target local corridors. Missing controls/turn restrictions and inter-layer ramp connections require manual review. Indian mixed-vehicle behavior and complex actual signal phases require model extensions and independent empirical validation before accuracy claims.

All real application/deployment secrets must reside in Azure Key Vault; actual identity/network/secret retrieval and rotation remain unverified because Azure review is deferred. TomTom adapter fixtures pass, but no live provider response/entitlement is claimed. Commercial observations are transient. Public report/Kaggle/Snowflake references have not supplied a complete calibrated dataset for the six requested cities. The raw source/permission and original observation periods must be verified before use.

The 120-user test is a short loopback authenticated API workload on one host, not a long-duration soak, browser swarm, parallel-simulation benchmark or cloud sizing guarantee. Container packaging uses the owner-selected manual GitHub Buildah/Podman workflow and GHCR. No Docker is required locally; the Linux image build/smoke/publication and live PostgreSQL/Key Vault/HTTPS checks remain unverified until the owner runs the workflow/deployment.


Roundabouts are composite groups with necessary internal ports/arcs, not an instantaneous single-point junction. Recognition requires a complete tagged directed ring; partial/untagged circles are not automatically assigned roundabout behavior. Entry yielding uses an approximate eight-metre/three-second acceptance window; detailed weaving/conflicts and actual gap calibration remain pending observations. Labels can be hidden without changing the model. Map selection now includes only major motor roads and connected roundabout arcs; omitted local roads can change route coverage and must be considered when interpreting results.
