# Flux limitations

Flux is an educational experimentation tool, not a calibrated or validated forecast for infrastructure investment or safety analysis. Synthetic demand and simplified controls demonstrate mechanisms rather than real-city predictions.

- Straight road geometry and independently editable operational lengths.
- Homogeneous passenger vehicles with small length/desired-speed variation; no pedestrian, bicycle, transit-stop or heavy-vehicle dynamics.
- Static free-flow shortest paths without adaptive rerouting or destination choice.
- Simplified gap-based lane changes and unrestricted turns from every lane.
- Two-axis symmetric signal timing and conservative exclusive-node intersection reservations, without turning polygons.
- Boundary transfers omit several metres of junction traversal; no swept-body geometry safety guarantee.
- Artificial timeout rejection resolves gridlock and is surfaced in warnings.
- Finite observation horizons censor unfinished trips. Completed-trip averages alone can favor a heavily congested scenario, so active/rejected counts must be shown.
- Browser performance has been measured on one macOS arm64 machine in Chromium with 544–552 moving agents. The benchmark does not guarantee the same FPS on every device, maximum allowed graph or background tab. Rendering and numerical physics are decoupled; overloaded wall-clock playback slows without changing the numerical step.
- Road and vehicle widths are visually exaggerated. Decorative blocks are illustrative and may be hidden; they are not GIS geometry.
- Local saves are per browser origin, bounded to 12 scenarios and 4 MB. They do not sync across devices or from localhost to Azure; use JSON export/import.
- Live Azure authentication, infrastructure plan/apply, public deployment and live-host header checks are deferred to the joint review on 6 November 2026. Local QA host checks do not prove Azure enforcement.

No raw session log is committed. The original initial-header requirement is not literally satisfied by the log's environment-context first message; see the progress record.
