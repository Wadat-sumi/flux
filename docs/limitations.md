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
- Browser performance and 60 FPS rendering have not yet been measured. A headless benchmark is distinct evidence.
- Application UI, editor, browser persistence and live Azure deployment are pending the required design choice and deployment credentials.

No raw session log is committed. The original initial-header requirement is not literally satisfied by the log's environment-context first message; see the progress record.
