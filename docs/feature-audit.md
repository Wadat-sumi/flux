# Flux feature verification

Result: the original local workflows and the owner-authorized **full-stack backend/UI workflows are present and pass verification**, after correcting the edge cases below. Public Azure deployment is not verified; the owner deferred it to a joint review on 6 November 2026. OSM JSON and observed OD CSV ingestion are now implemented; full-city GIS expansion and empirical calibration remain outside the verified corridor scope. The simulator remains a simplified, uncalibrated research demonstration.

## Evidence and scope

Audited the original master-prompt requirements against source, the actual running in-app browser, production-build browser workflows, isolated worker transport, scientific invariants and malformed inputs. The original 120-test gate passed again before extending it. Newly written browser regressions first failed on the old build, then passed with the fixes.

Final full-stack gate: **219 headless tests + 26 built-app browser tests + 2 isolated worker browser tests = 247 distinct passing cases**, plus the repeated 120-user API workload. The earlier frontend audit comprised 154 cases. Type checking, lint and the full production build pass. Test sources: tests/engine.test.ts, tests/boundaries.test.ts, tests/integration.test.ts, tests/worker.test.ts, tests/ui-model.test.ts, tests/feature-audit.test.ts, tests/security.test.ts, tests/performance.test.ts, tests/e2e/ and tests/e2e-worker/.

## Requirement-to-evidence matrix

| Feature | Verified behavior | Evidence |
|---|---|---|
| Flux branding | Wordmark, exact page title, metadata, favicon, README and JSON generator marker | Production build, browser title/exports, source inspection |
| Road graph | Directed roads, lane counts, dimensions, speed/priority, cycles and disconnected destinations | Graph/schema/routing unit tests; per-tick audit invariants |
| Network editor | Add nodes by coordinates and canvas, drag existing nodes, connect endpoints, inspect/change/delete nodes and roads, undo | Existing browser editor case; new empty-network and pan/fit/drag cases |
| Sources/sinks and demand | Set roles, create OD pairs, edit/remove rates, change seed/duration, cap active population | Empty-network browser construction; demand-undo regression; schema/accounting tests |
| Signals | Editable green/yellow/all-red/offset; transfers only on green | UI signal export case and every-transfer engine signal-obedience test |
| Priority/yield and box clearing | Higher-priority simultaneous request wins; no entry without downstream storage | Dedicated T-junction and downstream-storage fixtures |
| Flyovers and ramps | No implicit connectivity at different-layer visual crossings; explicit upward/downward ramps, real completed ramp trips | Grade-separation invariance, routing/schema tests, GUI-built ramp run |
| Car following and lanes | Fixed-step IDM-based motion; positive lane changes and refusal when rear clearance is unsafe | Free-flow checks and new lane-change fixtures |
| Routing | Cached free-flow Dijkstra; cycles terminate; unreachable arrivals rejected | Unit/integration cases, edited-network reload |
| Playback | Run/pause/speed/step/advance/reset, finish and restart | Production app browser cases, worker fake-timer protocol tests |
| Canvas and camera | Isometric/plan modes, pan, cursor-anchored wheel zoom, fit, draggable nodes, layer/decor/congestion controls | In-app inspection; actual pointer tests and camera invariants |
| Congestion/metrics | Explicit speed-ratio legend, queues, pending/active/completed/rejected, speed, delay, waiting, occupancy, travel time and cumulative throughput | Metric definitions, browser detailed panel, conservation checks |
| Save/load | Versioned JSON import/export, bounded validated local saves, reload persistence and corruption recovery | File-download/import and storage browser cases; UTF-8/identity/unit guards |
| Paired experiments | Both infrastructure pairs execute with identical scheduled demand and seeds; shared chart scales; export and cancellation | Browser report checks and headless paired-schedule equality |
| Scientific validation | All ten named requirements pass | tests/engine.test.ts and validation.md |
| Per-tick safety | Signal/ramp/merge cases checked at every numerical step for seeds 0, 42 and 4294967295 | 9 stress cases, 16,200 audited ticks, finite/nonnegative states, same-lane spacing and conservation |
| Gridlock | Deterministic timeout rejection and retained warning; accounting preserved in demand-driven runs | Occupied-cycle fixture and population/conservation tests |
| Responsive/accessibility | Laptop, tablet and phone widths, no horizontal overflow, native labeled forms, keyboard navigation and dialog Escape | Production browser tests; actual accessibility-tree inspection |
| Security/AI guardrails | Hostile imports/labels/storage rejected or inert; no outbound attacker requests, script execution or AI/tool bridge | Core adversarial tests, five production security cases and security.md |
| Performance | Real rendering plus worker and live metrics with 500+ on-road agents in two topologies | Measured browser JSON reports, summarized below |
| Terraform | Container Apps + private PostgreSQL + Key Vault/managed identities/GHCR pull references/migration job, staged off by default; no unused SWA token | fmt/validate, lockfile, source/secret review; Azure plan/apply deferred |
| Azure plan/apply/public URL | **Deferred, not verified** | Owner's instruction; deployment.md joint-review checklist |

## Issues found and corrected

1. **Demand undo display:** the engine/export reverted a rate from 2200 to 1100, while the uncontrolled input still displayed 2200. The form now remounts on rate changes; the browser test verifies both the field and exported JSON after undo. The live inspector was also observed showing the restored 1100 value.
2. **Missing completed-trip observations:** short experiments displayed 0.0 s when no trips had completed. Live averages and comparison cells now show an em dash; travel-time charts omit pre-completion sentinels and say No completed trips yet. Exported experiment averages/history use JSON null for unavailable observations, while the numerical engine retains finite zero sentinels internally. A genuine measured zero is still shown as zero.
3. **Off-center zoom drift:** zooming an asymmetric 5 km corridor shifted the cursor's world point by 1114 m in the reproduced case. Zoom now operates around the fitted viewport center and pan offset; the same browser placement test preserves the point to within 1 m rounding tolerance. Pan, fit and actual node dragging also pass independent gestures.
4. **Saved-library identity/size validation:** duplicate or malformed save IDs are rejected before they can create ambiguous options. The read limit now counts UTF-8 bytes consistently with the write limit. Invalid data remains recoverable through the existing clear-saves control.
5. **Queue glyph clarity:** shortened the drawn car glyph to 6 m, below the minimum modeled front-bumper spacing (4.2 m minimum body + 2 m gap), so same-lane queue icons stay distinct. This changes drawing only, not physics, demand or results.

## Performance

| Built-app case | On-road agents | Canvas FPS | Numerical ticks/s | p95 frame interval |
|---|---:|---:|---:|---:|
| Long six-lane corridor | 544–552 | 60 | 30.17 | 16.70 ms |
| Four-road signalized network | 624–630 | 60 | 30.16 | 16.70 ms |

Measured at 1280×900 in Chromium on the recorded macOS arm64 host. On-road includes stopped vehicles in physical queues; vehicles pending outside sources are excluded from these population counts. Both cases include real Canvas drawing, transferred snapshots and live metrics. The signal fixture initially had only 492 on-road agents at 300 s, so its warm-up was extended to 400 s; the 500-agent assertion was retained, not lowered. Raw records: benchmarks/browser.json and benchmarks/browser-signal.json.

In the synthetic seed-42, 180 s bottleneck pair, widening the downstream segment changes completed trips from 30 to 61 and the end queue from 48 to 10 under the same arrivals. This is an illustrative model result, not a calibrated real-world capacity forecast.

## Limits on the conclusion

This verification establishes the checked local workflows and invariants, not correctness for every possible input/device. Lane changes and junction reservations are deliberately simplified; vehicle-safety checks are longitudinal within each edge/lane, not full swept-body turning geometry. Road coordinates are illustrative and operational lengths are independently editable. See methodology.md and limitations.md.

Azure authentication, create-only plan/apply, HTTPS deployment, actual live-host headers and public smoke tests remain unperformed by agreement. Full-city GIS expansion, adaptive routing/signals, empirical calibration and an independent professional penetration assessment remain outside the implemented scope. Bounded OSM/observed-demand ingestion is implemented. Session-eligibility limitations are recorded candidly in progress.md; this report does not certify them away.

The live editor screenshot in screenshots/audit-editor.png records the restored demand inspector. The original static design proposals remain unchanged.

## Full-stack expansion verification

Accounts/session restore/revocation, owner-scoped server scenarios/datasets/jobs, retained raw imports/provenance, real OSM projection, observed OD rate conversion, separate server workers, deterministic/paired results, progress/cancellation/timeout/restart and report downloads pass unit/integration/browser checks. All real integration secrets are vault-derived; no live secrets are needed by local persistence/tests. Database role permissions and the production pg driver are exercised locally. Terraform now includes private PostgreSQL, Container Apps, GHCR pull references, Key Vault and separate runtime/migration identities with staged provisioning.

The final 120-user run follows complete backend/UI integration and final boundary fixes: 10,963 mixed requests, 542.68 requests/s, p95 25.28 ms, zero unexpected errors over 20.20 s; 120 real scrypt logins had p95 5.06 s. Admission accepts 20 jobs and returns 100 expected overload rejections while one CPU worker runs. Exact scope/host and metrics are in testing.md and benchmarks/backend-120-users.json. This does not establish cloud capacity or calibrated traffic accuracy.

The six-city data review found public references and Kaggle/Snowflake candidates but no verified complete matched observation package. TomTom live calls require the agreed Key Vault/entitlement review. Missing signal timing/classified counts and independent validation remain explicit data gaps. See backend.md, deployment.md, real-data-sources.md and data-request.md.


## OpenStreetMap area selection — 7 November 2026

Implemented Map area with six-city shortcuts, interactive/keyboard rectangle selection, live fixed-host OSM geometry, directional clipping and automatic entry sources/exit sinks. Two-way roads use separate terminals; internal dead ends, exact borders/corners, tangencies, disconnected entries, re-entry and layers are covered. Preview markers and synthetic-rate selection feed the existing browser and authenticated server simulations. Main/city/header controls remain accessible on tablet/phone; dense networks avoid repeated layer badges. See map-selection.md for steps, retention and model/provider limits.

Final gate: 288 automated cases pass, including local penetration/security, browser/worker and rendered-performance checks; repeated 120 real authenticated API users produced zero unexpected errors. Public provider availability, sparse-way coverage, actual counts/signal stages, mixed-vehicle calibration and Azure deployment remain explicit limits rather than completed accuracy claims.


## Import/structure refinement and resumed delivery — 7 November 2026

Major-road filtering, topology-aware shape compaction before unchanged final graph limits, retained short clipped entries and specific errors address frequent map failures. Simulation and map-marker label controls work without changing traffic/time. Complete tagged roundabouts are first-class editable groups with validated port/arc membership, curved geometry, simplified circulating priority, JSON/server persistence, group edits/delete/undo; partial rings stay ordinary roads. An 800-point geometry and 64-point roundabout regression demonstrate the node-budget reduction without discarding shape.

Latest validation: 320 distinct passing cases, including the new grouped roundabout server/headless parity case; 500+ curved-road render test and repeated 120-authenticated-user load pass. Native live major-road map import is verified. The optional native synthetic-file demonstration was interrupted; its equivalent automated browser edit/export/undo case passed. Other composite types (signals, interchanges, merges/diverges, toll plazas) remain suggestions. Data calibration, richer mixed traffic/phases and the joint Azure review remain pending.


Drawing follow-up: reproduced class replacement/tile overflow and pan-on-draw, then fixed static Leaflet container ownership, containment and pointer-based mouse/touch rectangle drawing. Live native drag and generated-road preview verified; final full gate is 323 passing cases plus the repeated 120-user API workload.
