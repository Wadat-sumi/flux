# Flux testing

Every code commit requires positive/negative/boundary unit tests, integration, performance and security checks. UI commits additionally require production-build browser tests. The current local application passes this gate. Azure verification is separately deferred by the owner.

## Latest verified milestone, 5 November 2026

Environment: macOS arm64, 10 logical CPUs, 24 GiB RAM, Node 24.12.0, TypeScript 6.0.3, Vite 8.3.6, Playwright 1.64.1. Application tests use full Chromium's new headless mode; the isolated worker tests also pass in Chromium headless shell. No other coding agents were used.

| Check | Result |
|---|---|
| TypeScript / ESLint | Passed. |
| Full headless suite | **106 passed** across seven files; latest run 23:23 IST, about 0.98 s total. |
| Unit cases | 61 engine, boundaries, editor, camera and persistence cases, including ten named scientific requirements. |
| Integration / worker transport | 11 cases, including complete preset observations, comparison, reset and cancellation. |
| Headless performance regression | Passed with 500+ moving agents and a 30+ packed-ticks/s threshold. |
| Core adversarial security | 33 cases; see security.md for exact scope. |
| Production application build | Passed: main JS about 359.8 kB (109.8 kB gzip), CSS 18.5 kB (5.1 kB gzip), module worker 105.6 kB. |
| Application E2E / security / rendering | **12 passed** in 27.7 s; no UI code committed before this gate passed. |
| Isolated real browser worker | **2 passed** in 1.4 s after a successful worker-only production build. |
| Credential-pattern scan | Passed on tracked/nonignored text and all six built text artifacts; paths only, no secret values printed. |
| Dependency audit | Zero known vulnerabilities after the patched minimatch override; rechecked before push. |
| Terraform format / validation | Passed, signed pinned azurerm 4.6.0. No Azure plan/apply run. |

Total distinct automated cases: **120** (106 headless + 12 application browser + 2 isolated browser worker). File counts within the 106: engine 18, boundaries 17, UI model 26, integration 7, worker 4, performance 1, security 33.

## Browser workflow evidence

The built dist/ artifact is served by a loopback-only QA server that applies the declared Static Web Apps headers. Tests exercise all three mandatory presets, play/pause/speed/step/reset, detailed metrics and conservation, coordinate node creation, elevation-to-ramp semantics, connection, lane changes, road/node deletion, undo, scenario settings, file download/import, saved-library reload, paired experiments and report export, keyboard navigation/dialog Escape, tablet (834×1112) and phone (390×844) layouts without horizontal overflow.

Security browser cases cover stored/imported HTML and instruction strings, absence of attacker-origin requests, malformed/negative/prototype-pollution/oversized imports, storage corruption and recovery, actual inline-script blocking by CSP, declared headers, hidden-file/traversal boundaries, unsafe HTTP methods, JavaScript MIME type and SPA fallback. These are local developer penetration checks, not an independent penetration assessment or proof of Azure configuration.

Paired throughput and travel-time charts share the same numeric scale for each metric; this is asserted in the browser workflow. Their observation horizons are identical.

## Performance evidence

- Headless engine benchmark: 544→599 moving agents, 900 packed steps, 5,451.8 ticks/s and p95 0.2224 ms, recorded in benchmarks/headless.json. This timing includes metrics and snapshot packing.
- Real application browser benchmark: **544→552 moving agents**, **60 canvas FPS**, 60.10 measured animation callbacks/s, **30.18 simulation ticks/s**, p95 16.80 ms frame interval, at 1280×900 over 4.01 measured seconds. Full worker communication, live metrics and actual Canvas drawing are active. Raw data is in benchmarks/browser.json.
- Browser thresholds: at least 500 moving agents, at least 50 measured rendering FPS to allow display scheduling jitter around the 60 FPS target, and at least 29.5 simulation ticks/s around the 30 Hz scheduler. The observed result reaches 60 FPS and exceeds 30 ticks/s. These are measurements on this host, not a universal device guarantee.
- The screenshot in screenshots/flux-layered-city.png is a real built-app observation at 60 simulated seconds using seed 42, not the design proposal's example numbers.

## Failures found and resolved

- A 5 veh/h free-flow fixture had no Poisson arrivals before observation; changed to a sparse but populated 60 veh/h long-road fixture with a 35 s acceleration check.
- Initial dependency installation reported ten moderate minimatch-related development-tool findings. A pinned 11.0.1 override removed them; subsequent type/lint/headless/browser gates pass.
- The tsx CLI could not create its sandbox IPC pipe; the benchmark uses node --import tsx successfully.
- Final-tick arrival accounting was tightened and tested against the complete pre-generated schedule.
- Terraform schema validation needs provider IPC. A sandboxed repeat could not start it; unsandboxed format/validate pass without Azure authentication or resource changes.
- Canvas tests exposed a headless-shell GPU/ICU bundle crash. Application tests use the installed full Chromium new-headless channel, preserving the real renderer. No GPU disabling or relaxed performance assertion was used to obtain the result.
- A keyboard test exposed ambiguous implicit dropdown-label matching; explicit inspector labels fixed it. All 12 app tests now pass.
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

Azure login/subscription, create-only plan/apply, public HTTPS deployment, actual live response headers and live preset/worker/experiment smoke tests await the owner review on 6 November. No local test result is presented as proof of public Azure deployment. Maximum allowed graph/population performance and other browser/device combinations remain unmeasured.
