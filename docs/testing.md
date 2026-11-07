# Flux testing

Every code commit requires positive/negative/boundary unit tests, integration, performance and security checks. UI commits additionally require production-build browser tests. The current local application passes this gate. Azure verification is separately deferred by the owner.

## Initial verified UI milestone, 6 November 2026

Environment: macOS arm64, 10 logical CPUs, 24 GiB RAM, Node 24.12.0, TypeScript 6.0.3, Vite 8.3.6, Playwright 1.64.1. Application tests use full Chromium's new headless mode; the isolated worker tests also pass in Chromium headless shell. No other coding agents were used.

| Check | Result |
|---|---|
| TypeScript / ESLint | Passed. |
| Full headless suite | **131 passed** across eight files; audited gate run 00:08 IST, about 1.07 s total. |
| Unit/invariant cases | 86 engine, boundaries, editor, camera, observations, persistence and audit cases, including ten named scientific requirements. |
| Integration / worker transport | 11 cases, including complete preset observations, comparison, reset and cancellation. |
| Headless performance regression | Passed with 500+ moving agents and a 30+ packed-ticks/s threshold. |
| Core adversarial security | 33 cases; see security.md for exact scope. |
| Production application build | Passed: main JS about 360.9 kB (110.1 kB gzip), CSS 18.5 kB (5.1 kB gzip), module worker 105.6 kB. |
| Application E2E / security / rendering | **21 passed** in 41.0 s; no UI code committed before this gate passed. |
| Isolated real browser worker | **2 passed** in 1.5 s after a successful worker-only production build. |
| Credential-pattern scan | Passed on tracked/nonignored text and all six built text artifacts; paths only, no secret values printed. |
| Dependency audit | Zero known vulnerabilities after the patched minimatch override; rechecked before push. |
| Terraform format / validation | Passed, signed pinned azurerm 4.6.0. No Azure plan/apply run. |

Total distinct automated cases: **154** (131 headless + 21 application browser + 2 isolated browser worker). File counts within the 131: engine 18, boundaries 17, UI model 26, feature audit 25, integration 7, worker 4, performance 1, security 33.

## Browser workflow evidence

The built dist/ artifact is served by a loopback-only QA server that applies the declared Static Web Apps headers. Tests exercise all three mandatory presets, play/pause/speed/step/reset, detailed metrics and conservation, coordinate node creation, elevation-to-ramp semantics, connection, lane changes, road/node deletion, undo, scenario settings, file download/import, saved-library reload, paired experiments and report export, keyboard navigation/dialog Escape, tablet (834×1112) and phone (390×844) layouts without horizontal overflow.

Security browser cases cover stored/imported HTML and instruction strings, absence of attacker-origin requests, malformed/negative/prototype-pollution/oversized imports, storage corruption and recovery, actual inline-script blocking by CSP, declared headers, hidden-file/traversal boundaries, unsafe HTTP methods, JavaScript MIME type and SPA fallback. These are local developer penetration checks, not an independent penetration assessment or proof of Azure configuration.

Paired throughput and travel-time charts share the same numeric scale for each metric; this is asserted in the browser workflow. Their observation horizons are identical.

## Performance evidence

- Headless engine benchmark: 544→599 moving agents, 900 packed steps, 5,451.8 ticks/s and p95 0.2224 ms, recorded in benchmarks/headless.json. This timing includes metrics and snapshot packing.
- Real application corridor benchmark: **544→552 on-road agents**, **60 canvas FPS**, 60.10 measured animation callbacks/s, **30.17 simulation ticks/s**, p95 16.70 ms at 1280×900. Raw data: benchmarks/browser.json.
- Browser thresholds: at least 500 moving agents, at least 50 measured rendering FPS to allow display scheduling jitter around the 60 FPS target, and at least 29.5 simulation ticks/s around the 30 Hz scheduler. The observed result reaches 60 FPS and exceeds 30 ticks/s. These are measurements on this host, not a universal device guarantee.
- The screenshot in screenshots/flux-layered-city.png is a real built-app observation at 60 simulated seconds using seed 42, not the design proposal's example numbers.

## Failures found and resolved

- A 5 veh/h free-flow fixture had no Poisson arrivals before observation; changed to a sparse but populated 60 veh/h long-road fixture with a 35 s acceleration check.
- Initial dependency installation reported ten moderate minimatch-related development-tool findings. A pinned 11.0.1 override removed them; subsequent type/lint/headless/browser gates pass.
- The tsx CLI could not create its sandbox IPC pipe; the benchmark uses node --import tsx successfully.
- Final-tick arrival accounting was tightened and tested against the complete pre-generated schedule.
- Terraform schema validation needs provider IPC. A sandboxed repeat could not start it; unsandboxed format/validate pass without Azure authentication or resource changes.
- Canvas tests exposed a headless-shell GPU/ICU bundle crash. Application tests use the installed full Chromium new-headless channel, preserving the real renderer. No GPU disabling or relaxed performance assertion was used to obtain the result.
- A keyboard test exposed ambiguous implicit dropdown-label matching; explicit inspector labels fixed it. The app keyboard case now passes.
- Clearing corrupt local storage also clears the stale error; recovery is asserted in the security browser case.

## Reproduce

```sh
npm ci
npm run check
npm run benchmark
npm run secrets:check
PLAYWRIGHT_BROWSERS_PATH=.tools/ms-playwright npx playwright install chromium
npm run test:browser-worker
npm run build
npm run test:e2e
```

Individual gates: test:unit, test:integration, test:performance, test:security, test:penetration. The local production server and isolated worker server are started/stopped by Playwright; raw reports and failure traces stay ignored in test-results/. Terraform's ignored local binary is .tools/terraform; format and validate need no Azure credentials.

## Remaining verification

Azure login/subscription, create-only plan/apply, public HTTPS deployment, actual live response headers and live preset/worker/experiment smoke tests await the owner review on 6 November. No local test result is presented as proof of public Azure deployment. Maximum allowed graph/population performance and other browser/device combinations remain unmeasured. See feature-audit.md for the full requirement matrix, newly reproduced regressions, fixes and the second signalized-network performance case.

## Feature audit after the UI milestone

The user requested independent feature verification. The original 120-test gate passed again, then new regressions reproduced stale demand fields after undo, zero-completion averages misreported as zero seconds and a cursor-anchoring error on asymmetric networks. All fixes pass the expanded 154-case gate. Additional checks build and run a network from empty using source/sink/ramp/demand forms, persist signal and all road attributes, execute both infrastructure pairs, cancel a long experiment, pan/fit/drag through real gestures and inspect safety at every numerical tick under several seeds. Corrupt save IDs and multibyte size bounds are covered too. Missing averages export as null.
The added four-road signal case measures 60 FPS with 624–630 on-road agents and 30.16 ticks/s (p95 16.70 ms). The signal fixture warms to 400 s because 300 s yielded only 492 on-road agents; pending source queues do not count toward the 500-agent threshold. See benchmarks/browser-signal.json.

## Full-stack revision gate — 6 November 2026

The owner expanded the app to a full stack, added six-city/TomTom research, required all real application secrets in Key Vault and specifically required performance testing again after backend/UI integration. The earlier 120-user result was preliminary. The final gate ran after the final import-amplification and concurrent-storage cap fixes.

- **219 headless tests in 13 files + 26 built-app browser tests + 2 isolated worker browser tests = 247 distinct passing automated cases.**
- Type checking, lint, full client/server build and source/built-text credential-pattern scan pass.
- Fresh dependency audit: zero reported vulnerabilities.
- Terraform fmt-check and validate pass after full-stack/vault/staged-provisioning changes; no Azure plan/apply occurred.
- Original master prompt snapshot is byte-identical to the attached request. The active prompt explicitly records the owner-authorized revision.
- Compiled backend SHA-256 at the gate: `1ab4475e096a92018ce0a24dc595a57cef15b31460dd3814a5989be26e96d8eb`.

New coverage includes real geography projection/direction/layers, counts/CSV exposure normalization and overlap/route rejection, retained raw data and provenance, real account/session rotation/revocation, cross-owner CRUD, CSRF/origin/content-type/path/body boundaries, SQL/instruction/XSS inertness, concurrent storage caps, isolated server result parity, paired shared demand, timeout/cancellation/restart, vault-only local configuration and production reference intent. The production pg adapter is exercised over a real local PostgreSQL wire connection; runtime role access/schema denial is tested. This is not a live Azure database/TLS certification.

All five new UI workflows pass on the actual built Node server with isolated persistent PostgreSQL-compatible data: accounts/server saves/session reload; real OSM + explicitly synthetic test-count fixture import and server report; persistent paired results; cancellation/provider configuration; inert labels and phone dialog reachability. Scenario camera/editor/signal/metrics/persistence/security and both rendered 500+ agent cases also pass.

### Final repeated 120-user workload

Measured `2026-11-06T15:46:05.275Z` (UTC) on macOS arm64, 10 logical CPUs / 24 GiB. 120 distinct accounts were seeded with a clearly synthetic password fixture; all 120 sessions were obtained through real simultaneous scrypt password verification (N=131072,r=8,p=1), without bypassing authentication. Each user owns a separate persisted scenario. The 20-second phase mixes reads, updates, history and session checks with 200 ms think time. Then 120 users submit jobs together, API health is checked with a CPU worker active, and admitted jobs are cancelled.

| Measure | Final result |
|---|---:|
| Authenticated users/sessions | 120 |
| Steady measured interval | 20.20 s |
| Successful steady requests | 10963 |
| Mixed request throughput | 542.68/s |
| p50 / p95 / p99 | 13.70 / 25.28 / 35.33 ms |
| Unexpected errors | 0 |
| Simultaneous-login p95 | 5.06 s |
| Job admission | 20 accepted / 100 expected HTTP 429 |
| Concurrent CPU simulation workers | 1 |

Gates declared in scripts/load-test.ts: steady p95 <1 s, p99 <2 s, at least 100 requests/s, no unexpected errors, burst-login p95 <10 s and worker-active health p95 <1 s. All passed. This is a short loopback HTTP workload with filesystem-persistent PGlite, not 120 browsers, 120 simultaneous CPU simulations, a soak test or Azure managed-PostgreSQL sizing evidence. No TomTom/commercial provider calls occurred. Raw evidence: benchmarks/backend-120-users.json.

Live Key Vault identity/firewall/rotation, provider entitlement/coverage, full Docker image build/run/scan, managed PostgreSQL backups/restore, Azure HTTPS/headers and deployment-tier load tests remain pending the joint Azure review. No matched six-city empirical calibration dataset has been acquired; public source research and minimum data needs are documented separately.

Final infrastructure-only cleanup removed the unprovisioned legacy SWA/deployment-token resource after the application gate; Terraform fmt/validate and secret/diff checks passed again. The app runtime source and compiled server hash are unchanged. The native in-app browser also showed **Server connected** in Data & cloud on the running full-stack preview; screenshots/backend-workspace.png records that state without credentials.


## OpenStreetMap selection gate — 7 November 2026

After the owner's map/boundary-terminal request, **255 headless tests in 15 files + 31 built-app browser tests + 2 isolated worker browser tests = 288 distinct passing cases**. Type checking, lint, client/server build, credential-pattern scan and dependency audit (zero reported vulnerabilities) pass. Tests ran before this code commit. Compiled backend SHA-256: `0268855b6268cd3838d6d78eeec9f9745937d0fc290c453d3f84a7570c2ac01f`. Terraform source was unchanged; Azure remains deferred.

Map coverage includes direction/reverse/two-way terminals, exact edges/corners/tangencies, inside dead ends, disconnected/re-entering roads, grade separation, sub-metre point collapse, zero/synthetic demand, deterministic conservation, malformed/injected bounds, response bytes/type/status, fixed host, cache eviction/global/IP quotas/concurrency, anonymous read-only fetch followed by authenticated save/job, all six city shortcuts, drawn/keyboard selection, stale-preview invalidation, provider recovery, phone layout, inert provenance and unobstructed header controls at 1280/1100/1024/852/834/390 pixels. Automated provider/tiles are synthetic fixtures; public services are not called by regression/load tests.

Separate manual live OSM browser verification selected the default 260 m Bengaluru area: 33 nodes, 38 directed roads, two sources and three sinks. Loading and advancing 20 s produced four active trips, zero rejected trips. The historical screenshot in screenshots/osm-area-selection-initial.png records the initial map/terminal preview before the major-road-only profile. This is a connectivity check, not measured traffic calibration. Dense-road label clutter and a tablet header overlap were observed and fixed; the final browser gate includes the accessibility regression.

Rendered performance again passes with 544–552 corridor and 624–630 signal-network agents: 60 FPS and 30.18/30.16 ticks/s, p95 frame 16.70/16.70 ms. The map library is loaded on demand; the main bundle remains about 380 KB minified.

### Repeated 120-user test after map/UI integration

Measured `2026-11-07T10:31:14.153Z` with the same real-password, distinct-account, filesystem-persistent workload documented above. 11,436 steady requests / 20.20 s = **566.18 requests/s**, p50 **7.41 ms**, p95 **19.43 ms**, p99 **33.22 ms**, **zero unexpected errors**. Simultaneous scrypt-login p95 5.97 s; CPU-worker-active health p95 0.252 ms. Job saturation: twenty accepted, one hundred expected 429 rejections, one CPU worker. All declared thresholds passed. Raw report: benchmarks/backend-120-users.json.

This short loopback API workload excludes external OSM/TomTom calls and is not 120 simultaneous map downloads, 120 browser renderers, 120 CPU simulations, a soak test or evidence of Azure capacity. The new public map endpoint deliberately applies lower provider/conversion quotas; production service sizing and live Azure checks remain pending.


## Major roads, curved geometry and grouped roundabouts — 7 November 2026

**285 headless tests in 16 files + 33 built-app browser cases + 2 isolated worker cases = 320 distinct passing automated cases.** The main full gate passed before the interruption; an additional roundabout save/job parity case passed, then the full 285-case headless gate was repeated on resume. Type/lint/build, source/build credential-pattern scan and dependency audit (zero reported advisories) pass. Runtime source was unchanged between the recorded full performance gate and resumed verification. Compiled backend SHA-256: `c439e2d0ddefef56f411e74517838e7a1fac9f9c10cec24b6597e4680646b026`.

New coverage verifies major-road inclusion and exclusion, private/motorcar restrictions, unrelated non-road data/outside unsupported ways, an 800-shape-point road compacted into one curved road/two terminals, real signals/attribute boundaries, exact simplified cap counts, tiny clipped entry preservation, complete/multi-way/partial roundabouts, curve lengths/positions, group schema abuse, circulating priority over an aged entering vehicle, deterministic conservation/lane separation, JSON/group deletion, server persistence/job parity, one-group browser editing/export/delete/undo, and label toggles without time reset.

The live major-road-only default Bengaluru area on Kasturba Road produced **4 terminals, 2 directed curved roads, 2 sources and 2 sinks**. The current screenshot is screenshots/osm-area-selection.png; the initial broader-road screenshot is preserved separately. Synthetic roundabout tests use a 64-point ring with four approaches: **one group, four connection ports and four curved circulating arcs**, instead of 64 junction stops. The attempted extra native file-chooser demonstration was interrupted while waiting; automated browser verification had already passed. No manual synthetic-fixture demonstration is claimed complete.

The new curved-road browser benchmark held **544–552 on-road agents**, **60 FPS**, **30.17 ticks/s**, p95 frame **16.80 ms**. Straight/signal benchmarks still pass. Evidence: benchmarks/browser-curved.json, browser.json and browser-signal.json.

Repeated full-stack workload measured `2026-11-07T10:56:20.620Z`: **120 distinct real authenticated sessions**, 11,299 steady mixed requests in 20.16 s, **560.40/s**, p50/p95/p99 **9.58/21.87/30.68 ms**, **zero unexpected errors**. Real scrypt-login burst p95 5.18 s; health with a CPU worker active p95 0.296 ms. Twenty jobs admitted, one hundred expected overload 429 responses, one CPU worker. All declared thresholds passed. The workload excludes live OSM/TomTom calls and does not establish 120 browser/map downloads, parallel simulations, long-term soak or Azure sizing. Raw evidence: benchmarks/backend-120-users.json.

On resume, the application was restarted and both frontend / and proxied /api/health returned HTTP 200. Azure deployment and empirical calibration remain pending; no secrets were acquired and no Azure resources were touched.


## Final drawing-interaction regression gate — 7 November 2026

The owner reproduced two UI failures: drawing mode removed Leaflet layout classes and allowed tile overflow, and press-drag still panned rather than selecting. Added failing regressions before each fix. The map class is now static, drawing uses data/cursor state and explicit containment, and pointer capture implements mouse/touch rectangle drawing with live preview while map pan/gesture zoom are disabled. Two-corner clicks still work; successful selection/cancellation restores panning, Escape first cancels drawing, and pointer cancellation releases the gesture.

Final full gate after these fixes: **285 headless + 36 built-app browser + 2 isolated worker = 323 distinct passing cases**, plus type/lint/build, credential-pattern scan and zero dependency advisories. Desktop/tablet/phone containment and unblocked controls pass. New mouse/touch drawing regressions pass. Native in-app-browser press-drag selected **326 × 256 m** without panning and successfully fetched **4 terminals / 2 major directed roads / 2 sources / 2 sinks**; screenshot: screenshots/map-drag-selection.png.

The latest repeated 120-user workload measured `2026-11-07T11:34:22.985Z` after the final integrated UI/backend build: 11,407 mixed requests / 20.17 s, **565.61/s**, p50/p95/p99 **8.11/18.46/32.63 ms**, **zero unexpected errors**. Actual scrypt-login p95 5.47 s; active-worker health p95 0.236 ms; twenty admitted jobs, one hundred expected overload 429 responses, one worker. All thresholds pass. Raw benchmark files now contain this latest gate's results. External-provider calls, 120 browser renderers, a soak and Azure sizing remain outside this workload.

## Roundabout display and map-to-server review — 7 November 2026

Full gate after the final integrated UI build: **290 headless tests in 17 files + 37 built-app browser cases + 2 isolated worker cases = 329 distinct passing cases**. Type/lint/build, positive/negative/edge unit tests, integration, performance, local penetration/security regressions, credential-pattern scan and dependency audit (zero reported vulnerabilities) pass before code check-in. Backend source is unchanged; compiled SHA-256 remains `c439e2d0ddefef56f411e74517838e7a1fac9f9c10cec24b6597e4680646b026`.

New unit cases verify mapped curved/oval islands, a concave interior anchor, zero-area/absent groups, tiny multilane display caps and no numerical-geometry mutation. Browser coverage verifies map-to-server review before/after sign-in, no automatic submission, a completed persisted job with the exact selected geometry/groups/provenance and the authenticated current-network shortcut. Existing mouse/touch drawing and phone/security regressions pass. Synthetic roundabout screenshot: screenshots/roundabout-geometry.png. The native in-app preview independently showed **Server connected** and the fresh-run review without a submission; screenshot: screenshots/server-run-review.png. No native account credentials were entered.

Rendered corridor/signal/curved workloads again pass at **60 FPS**, approximately **30.17 ticks/s**, with 544–552 / 624–630 / 544–552 on-road agents and p95 frame 16.70 ms. The current 800 m selection cap is unchanged and has not been established as a measured capacity maximum. Larger sparse/dense area limits remain unbenchmarked.

Repeated 120-user workload measured `2026-11-07T11:59:39.892Z`: **120 distinct real authenticated sessions**, **11,475 requests / 20.18 s**, **568.57/s**, p50/p95/p99 **7.27/17.32/30.83 ms**, **zero unexpected errors**. Actual simultaneous scrypt-login p95 **5.57 s**; active-worker health p95 **0.314 ms**. Twenty jobs admitted, one hundred expected overload 429 responses, one CPU worker. All declared thresholds pass. Filesystem-persistent PGlite, 200 ms think time and the mixed read/update/history/session workload are unchanged. This remains a short loopback API test, excluding external providers, 120 browsers/map downloads, concurrent CPU jobs, soak and Azure capacity. Latest raw evidence: benchmarks/backend-120-users.json and browser*.json. Azure review/deployment and empirical calibration remain pending.


## Configurable vehicle types — 7 November 2026

Final gate on the integrated vehicle implementation: **323 headless cases in 19 files + 41 built-app browser cases + 3 isolated worker cases = 367 distinct passing cases**. Positive/negative/edge, integration, local penetration/security, type/lint/build, credential-pattern scan and dependency audit (zero reported vulnerabilities) pass before checking in. The final backend SHA-256 is `be93c5eedb44f2099716b755b4b0aa542e8feccc377a025da92b972962a2ae08`. Terraform/Azure were untouched.

New cases verify each class's dimensions and hard speed cap, unchanged arrival timing across mixtures, identical baseline vehicle assignment across paired networks, zero shares, legacy files, fitting alternate routes, exact/narrow/short segment boundaries including fractional lane division and body-plus-gap sums, length-dependent storage, headway/braking response, mixed-lane gaps/conservation on signals/ramps/bottlenecks/roundabouts, large-gap junction transfer, capacity/unreachable rejection, unavailable per-type report averages, hostile/oversized/invalid profile API inputs, saved server profiles and headless/server parity. Browser cases cover typed decimal editing, single-type attribute changes, export/device restore, invalid shares and braking/reset on a phone, live mixed classes, per-type metrics and retained server jobs/reports. Native preview independently displayed all six generated/active/completed/rejected rows and conservation at 60 s; screenshot: screenshots/vehicle-native-metrics.png. Synthetic geometry/mixes are not field observations.

The initial sandboxed full run could not open local listeners (EPERM); the rerun with loopback permissions passed. The expanded isolated-worker suite exposed the installed headless shell's known ICU/GPU bundle crash. Its configuration now uses full Chromium, matching application tests; all three isolated worker cases passed without disabling graphics. The three vehicle browser cases were repeated to improve screenshot framing. Final review then found a fractional width/storage exact-fit rounding case: a 1e-9 m tolerance and regression were added, followed by a complete successful 323/41/3 gate rerun. No runtime implementation changed after that final gate.

The added mixed, curved-road browser workload held **529–535 moving agents**, **60 FPS**, **30.17 numerical ticks/s**, p95 frame **16.70 ms** at 1280×900. It uses a synthetic 40/20/10/10/10/10 car/two-wheeler/auto/LCV/bus/truck mix. Existing straight, signal and curved cases still pass (544–552 / 624–630 / 544–552 agents, 60 FPS/~30.16–30.18 ticks/s). Reports: benchmarks/browser-mixed.json and browser*.json. Both 500+ default and mixed isolated-worker snapshots remain finite and conserve arrivals; mixed packed dimensions/type indices are verified across the actual transfer boundary.

Repeated full-stack workload measured `2026-11-07T15:43:02.775Z` after integration: **120 distinct real authenticated sessions**, **11,499 requests / 20.20 s**, **569.23/s**, p50/p95/p99 **6.44/17.32/38.20 ms**, **zero unexpected errors**. Each owned scenario and submitted CPU job includes six vehicle profiles with the explicitly synthetic mix. Scrypt-login p95 **5.24 s**; worker-active health p95 **0.699 ms**. Twenty accepted jobs, one hundred expected overload 429 responses, one CPU worker. All thresholds pass. This is the 20 s, 200 ms think-time, read/update/history/session loopback workload with filesystem-persistent PGlite, not 120 browsers/map downloads, 120 simultaneous CPU simulations, a soak test or Azure sizing. Raw evidence: benchmarks/backend-120-users.json.

The dev app was restarted with this backend build; frontend and proxied API are healthy. Default profiles remain illustrative; classified observations, lane-free behaviour, bus stops, richer signals and empirical calibration remain pending. Details: vehicle-types.md.


## Published vehicle references and schematic shapes — 7 November 2026

Final integrated gate: **331 headless tests in 19 files + 42 application-browser tests + 3 isolated-worker tests = 376 distinct passing cases**. Type/lint/build, positive/negative/edge unit tests, integration, local penetration/security checks, credential-pattern scan and dependency audit (zero vulnerabilities) passed before check-in. Backend SHA-256: `8bc239bdd1df25a47e7a5622cd837133949e676130b36f6760612b400f6b68d7`. Raw brochures/research remain ignored; all ten catalogue SHA-256 values independently matched the retrieved source bytes. The relevant manufacturer PDF pages were rendered and visually checked.

Coverage now verifies reference footprints and km/h conversion without loss of millimetres, auditable source metadata/acceleration categories, optional shape/revision validation and hostile values, preservation of old/custom profiles until explicit reset, six distinct bounded silhouettes, shape overrides through packed snapshots, server save/job/headless parity, source disclosure, precise UI values, custom-shape persistence and mobile form fit. A focused setup initially encountered sandbox loopback EPERM; rerunning with local networking passed. Browser discovery exposed Node's JSON import-attribute requirement; explicit `with { type: "json" }` imports fixed it before the final full gate. No runtime code changed after that successful gate.

The mixed curved-road workload rendered **566–572 moving vehicles at 60 FPS**, **30.18 ticks/s**, p95 frame **16.70 ms** at 1280×900. Straight/signal/curved cases also passed with 544–552 / 624–630 / 544–552 agents, 60 FPS and approximately 30.16–30.18 ticks/s. The actual browser-worker transfer checks verify the 13-field protocol including body-shape indices. Native preview confirmed the Starbus reference, 12.05 × 2.6 m, 70 km/h, desired acceleration 1.2 and schematic footprint; screenshot: screenshots/vehicle-reference-native.png.

Repeated workload at `2026-11-07T16:16:52.061Z`: **120 distinct authenticated users**, filesystem-persistent PGlite, synthetic six-class 40/20/10/10/10/10 profiles, real scrypt logins, 20 s read/update/job-list/session mix at 200 ms think time, job-admission burst and worker-health checks. **11,431 requests / 20.15 s = 567.40/s**, p50/p95/p99 **6.57/20.87/48.18 ms**, **zero unexpected errors**. Login p95 **5.60 s**, worker-active health p95 **1.32 ms**; **20 accepted jobs, 100 expected overload 429s, one CPU worker**. All declared thresholds passed. This is loopback API concurrency, not 120 browsers, simultaneous CPU simulations, a soak, provider traffic or Azure sizing. Evidence: benchmarks/backend-120-users.json and browser*.json.

The local dev app was restarted with the tested backend; frontend and proxied health endpoint return HTTP 200. New references are representative models and uncalibrated dynamics proxies, not city observations. The JC Road workflow documents map preview, permitted OD preparation/import, fresh server execution and remaining calibration/control gaps. Azure remains deferred.


## Suggested mixed defaults and 3D vehicles — 7 November 2026

Final full gate: **344 headless cases in 19 files + 44 app-browser cases + 3 isolated-worker cases = 391 distinct passing cases**, plus type/lint/build, integration, local penetration/security regressions, credential scan and dependency audit (zero vulnerabilities). Backend SHA-256: `f849222a8ac4184527f7d456043d7c14b299ea19f63a26b7b231fbe9a394ba18`. No runtime implementation changed after the successful final gate.

New coverage checks the complete 30/50/12/4/2/2 default mix and all six seeded classes, OSM import defaults/provenance, positive/negative/edge solid geometry, finite normals/coordinates, bounded schematic heights/footprints, all six models at four road orientations in plan/isometric views, low-detail 3D solids, wheel/body drawing passes, depth ordering and unchanged traffic physics under appearance edits. Browser cases verify all six rendered previews, suggested-share restoration preserving custom attributes, old saved profiles, default mix export/reload and real canvas polygons. Screenshots: vehicle-3d-*.png, mixed-traffic-3d.png and mixed-traffic-3d-native.png.

The first full run found an old roundabout check hardcoded to a 2 m gap for every class. With the new mixed default, two-wheelers correctly use their configured 1 m gap. The check now groups each lane and verifies each follower's own gap to 1e-6 m, then the complete gate was rerun successfully. Projection tests also exposed height-dependent ordering in plan view; its depth order now follows height. Source-context retrieval used the archived October 2019 DULT draft after the obsolete 2020 URL failed; its registered-vehicle composition is qualitative context only, never adopted as observed road-flow shares. Raw PDF remains ignored; source/date/license status/SHA-256 are in traffic-mix.json.

Final 500+ built-app workloads at 1280×900 retained **60 FPS** and approximately **30 ticks/s**. Suggested default mix: **594–603 moving agents**, **30.18 ticks/s**, p95 frame **16.80 ms**, 603 visible solid sprites / 7277 shaded faces at measurement end. Heavier synthetic 40/20/10/10/10/10 mix: **566–572 agents**, **30.17 ticks/s**, p95 frame **16.80 ms**. Straight, signal and curved legacy-load cases also pass. Evidence: benchmarks/browser-default-mix.json and browser*.json.

Repeated 120-user test at `2026-11-07T16:45:19.463Z`: 120 distinct real authenticated users, filesystem-persistent PGlite, real scrypt logins, six-profile heavy synthetic mix, 20 s read/update/job-list/session workload with 200 ms think time, job admission and CPU-worker health/cancellation. **11,373 requests / 20.18 s = 563.53/s**, p50/p95/p99 **6.35/29.63/52.97 ms**, **zero unexpected errors**. Login p95 **5.76 s**, worker-active health p95 **0.80 ms**; **20 jobs accepted, 100 expected overload 429s, one worker**. All declared thresholds passed. This is loopback API concurrency, not 120 browsers/CPU simulations, a soak, external-provider throughput or Azure sizing. The default mix separately passes map-to-server retention/execution and the rendered benchmark.
