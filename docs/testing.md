# Flux testing

The owner requires positive/negative/boundary unit tests, integration tests, performance tests and security/penetration checks to run before code is committed. Browser UI tests will additionally gate UI commits after the design choice. Current evidence applies to the headless engine, schema, worker and Terraform, not to an application UI or live Azure deployment.

## Verified on 5 November 2026

Environment: macOS arm64, 10 logical CPUs, 24 GiB RAM, Node 24.12.0. Exact dependencies are locked. No other coding agents were used.

| Command | Result |
|---|---|
| `npm run typecheck` | Passed, TypeScript 6.0.3. |
| `npm run lint` | Passed, ESLint 10.14.0 with TypeScript rules. |
| `npm test` | 80 tests passed across six files; latest full run 22:46 IST, about 0.94 s total. |
| `npm run test:unit` | Included in full run: 35 engine/boundary cases, including ten named scientific requirements. |
| `npm run test:integration` | Included in full run: 11 integration/transport cases. |
| `npm run test:performance` | Included in full run: 500+ moving agents, 30+ packed ticks/s threshold passed. |
| `npm run test:security` | Included in full run: 33 adversarial/security cases. See security.md for scope. |
| `npm run build:worker` | Passed; actual module worker production bundle 132.07 kB (33.23 kB gzip). |
| `npm run test:browser-worker` | 2 Chromium tests passed in 3.2 s; real ping/pong, rejected eval command, typed snapshots, 500+ agents, finite state, conservation and reset. |
| `npm run benchmark` | 544→599 moving agents over 900 measured steps; 5,451.8 packed ticks/s, p95 0.2224 ms. See benchmarks/headless.json. |
| `npm audit` after patched override | 0 known vulnerabilities reported at installation. |
| `npm run secrets:check` | Passed heuristic credential scan without printing secret values. |
| `terraform init -backend=false -input=false` | Passed, signed azurerm 4.6.0 provider and lockfile. |
| `terraform fmt -check` | Passed. |
| `terraform validate` | Passed. |

Test counts by file: engine 18; boundaries 17; integration 7; worker 4; performance 1; security 33. Total 80.

## Failures found and resolved

- The first free-flow fixture used a 5 veh/h Poisson arrival process and happened to generate no vehicles before observation; the assertion failed. The fixture now uses a sparse but populated 60 veh/h long road, while retaining seed determinism and a 35 s acceleration check.
- The initial npm dependency graph reported ten moderate minimatch-related findings in development tooling. A pinned 11.0.1 minimatch override resolved them; type/lint/full tests and the real worker browser tests passed afterward.
- The tsx command-line runner could not create its IPC pipe in the sandbox. The benchmark now uses `node --import tsx`, which runs successfully inside the sandbox.
- Horizon accounting was tightened so arrivals up to the final tick are included, with an integration assertion that completed observations account for the full pre-generated schedule.
- Terraform provider schema validation requires a local plugin IPC socket. A sandboxed repeat could not start that socket; validation is run outside the sandbox without resource authentication or modification.

## Reproduce

```sh
npm ci
npm run check
npm run benchmark
npm run secrets:check
PLAYWRIGHT_BROWSERS_PATH=.tools/ms-playwright npx playwright install chromium
npm run test:browser-worker
```

The browser worker test starts and stops a loopback-only Python HTTP server. Raw Playwright reports are ignored under test-results/. Terraform can use the ignored local binary at `.tools/terraform` or an installed compatible version. It does not require Azure credentials for format/validate.

## Pending evidence

No full application build is claimed: there is intentionally no app entry/UI before owner design approval. Pending browser flows are preset loading, play/pause/step, node/road/ramp editing, import/export, localStorage handling, experiments, keyboard/tablet accessibility, stored/DOM XSS payloads, runtime header enforcement, 500-agent canvas FPS and responsiveness. Azure login, plan/apply, skeleton/final deployment and live security checks are deferred to the owner review on 6 November. A headless benchmark and blank-page worker integration do not establish rendered application FPS.
