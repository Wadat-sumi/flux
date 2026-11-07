# Flux full-stack completion plan

Owner-authorized scope revision, 6 November 2026. Azure provisioning stays deferred to the joint review. Preserve original requirements separately and keep the raw transcript untouched. Do not use other coding agents. Run required tests before any code commit.

- [x] Record revised full-stack requirements and preserve the original master prompt.
- [x] Implement typed HTTP API, account registration/login/logout and secure revocable sessions.
- [x] Add durable PostgreSQL migrations, owner-scoped scenarios, dataset provenance and job/result records.
- [x] Run simulation and paired jobs in isolated threads, with progress, cancellation, admission limits, timeouts and restart recovery.
- [x] Import real OSM roads and observed OD count CSV, validate units/topology, retain source/license/time/hash and disclose assumptions.
- [x] Connect frontend to accounts, server saves, data imports, execution/history and report downloads.
- [x] Extend Azure Terraform and container packaging for frontend + backend + private PostgreSQL.
- [x] Add and run positive, negative, boundary, integration and browser regressions for the full stack.
- [x] Run local penetration/security checks for authentication, ownership, CSRF, injection, uploads, traversal and resource exhaustion.
- [x] Performance-test **more than 100 concurrent authenticated users**, using 120 distinct accounts/sessions; measure reads/writes, job admission, overload, p50/p95/p99, throughput and unexpected errors. State the workload, duration and host; distinguish active API users from concurrent CPU simulations.
- [x] Repeat existing rendered 500+ vehicle/30 Hz checks and scan dependencies/source/build artifacts.
- [x] Update architecture/data/security/deployment/audit documentation and prepare tested changes for commit/push. Delivery SHA is reported after Git verification.
- [ ] Joint Azure login, cost/plan review, provisioning, deployment and public HTTPS smoke/security verification.

Real data is not the same as a calibrated model: imported map geometry supplies topology; observed OD counts supply demand. Unsupported turn restrictions/controls and inferred defaults must be reported. No fabricated counts may be labeled observed.

Owner follow-up: the first 120-user measurement is preliminary. Repeat performance testing after the complete backend/UI integration is operational, before committing; record the final implementation/revision and distinguish fixture-tested TomTom behavior from live provider capacity.

Final local gate: 247 automated cases pass plus the repeated 120-user test after all integration/boundary fixes. Real secrets are exclusively Key Vault-derived; AGENTS.md records the permanent project policy. No secret values were acquired or provisioned.

- [ ] Acquire matched classified counts/turning observations, actual signal stages/timings and independent travel-time/queue measurements for a selected corridor; extend/calibrate/validate the model before real-city accuracy claims. The six-city online source review and minimum data request are complete.


Owner follow-up, 7 November: add interactive OSM area selection, automatic direction-aware boundary sources/sinks and a runnable synthetic starter demand. Implementation and positive/negative/edge, HTTP/security and browser checks completed; final performance evidence is recorded in testing.md. Map geometry does not complete the pending empirical-calibration task.


- [x] Fix frequent map failures with major-road filtering, shape compaction before final limits, retained short boundary entries and actionable errors.
- [x] Add simulation/map annotation toggles without resetting traffic.
- [x] Persist/edit complete tagged roundabouts as composite groups; retain curved arcs/ports and simplified circulation priority.
- [x] Test schema/geometry/priority, server save/job parity, browser editing/undo and 500+ curved-road performance; repeat the 120-user API workload. Latest evidence is in testing.md.
- [x] Agree on the initial data target: Bengaluru corridor with 2–4 junctions.
- [ ] Select the exact nearby junctions from overlapping source coverage and acquire matched demand, controls and independent validation observations with verified permission and dates. Other structure entity types are suggestions, not completed work.

- [x] Fix map drawing overflow and press-drag panning; verify mouse/touch selection, containment and cancellation before the final tested commit.
