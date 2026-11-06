# Flux testing

Every code commit requires positive/negative/boundary unit tests, integration, performance and security checks. UI commits additionally require production-build browser tests. The current local application passes this gate. Azure verification is separately deferred by the owner.

## Latest verified milestone, 6 November 2026

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
