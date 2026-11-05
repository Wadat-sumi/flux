# Flux

Interactive Agent-Based Traffic Simulation. Build a road network, watch individual journeys unfold, and compare how a flyover, an extra lane or a signal changes traffic.

![Flux, Layered City interface](docs/screenshots/flux-layered-city.png)

Flux runs entirely in your browser: React/TypeScript, a Canvas 2D city view, a standalone deterministic simulation engine and a module Web Worker. There is no application server, account system, analytics or AI endpoint. The owner selected **Layered City (C)** before UI implementation. This is a simplified educational model with synthetic demand, not a calibrated transport planning or safety tool.

## Run locally

Requires **Node 22.12+** (Node 24 recommended), npm, and Python 3 for the isolated worker browser tests.

```sh
npm ci
npm run dev
```

Open the Vite URL printed in the terminal. To inspect the production build with the declared hosting headers:

```sh
npm run build
npm run preview
```

The preview binds only to `127.0.0.1:4173`. Its Node server is a local QA utility; it is not deployed with Flux.

## Explore

- **Simulate:** choose the urban intersection, flyover crossing, bottleneck or explicit ramp preset. Configure demand, duration and seed, then run, pause, step, advance 20 s or change playback speed. Switch between isometric/plan views, pan/zoom/fit, toggle layers or congestion, and expand detailed metrics.
- **Network:** add nodes by clicking or coordinates; set source/sink roles, elevation and signal timing; connect endpoints; edit lanes, road width, length, speed and priority. Differently elevated endpoints create explicit ramps. Delete or undo edits and add/edit origin–destination demand. Editing resets the simulation and route cache.
- **Experiments:** use at-grade/flyover or 1-lane/2-lane pairs, or capture a baseline and modify the network. Both runs receive the baseline's seed, complete arrival schedule and observation duration. Results include active/rejected trips, warnings, aligned charts with shared scales, and exportable reports.
- **Save / Import / Export:** scenarios are validated, versioned JSON with `generator: "Flux"`. Up to 12 saves stay on the current browser origin. Export a scenario to move it to another device or the deployed host. Experiment report JSON is a separate results format, not a scenario import.

Road and vehicle geometry is exaggerated for readability. Layers are explicit; geometric crossings create no implicit connectivity. Completed-trip averages exclude unfinished trips, so always read them alongside active and rejected counts. See [methodology](docs/methodology.md) and [limitations](docs/limitations.md).

## Verify

```sh
npm run check
npm run benchmark
npm run secrets:check
PLAYWRIGHT_BROWSERS_PATH=.tools/ms-playwright npx playwright install chromium
npm run test:browser-worker
npm run build
npm run test:e2e
```

The suite covers positive/negative/boundary unit cases, scientific invariants, integration, browser workflows, local penetration/security checks and real rendered performance. Individual commands include `test:unit`, `test:integration`, `test:performance`, `test:security`, and `test:penetration`. Exact results and environments are in [testing.md](docs/testing.md); raw timing data is in [docs/benchmarks](docs/benchmarks).

## Architecture and deployment

The headless engine separates graph/geometry, cached Dijkstra routing, seeded demand, IDM-based vehicle behavior, simplified lane changes, signals, junction reservations and statistics. It uses a fixed 1/30 s step, separate demand/behavior RNG streams and transferable Float32 snapshots. Rendering never changes physics. See [architecture](docs/architecture.md), [model selection](docs/model-selection.md), [scientific validation](docs/validation.md), and [OWASP-oriented security/AI guardrails](docs/security.md).

Azure Static Web Apps Free infrastructure is defined in [infra/terraform](infra/terraform), with a pinned Azure provider and sensitive deployment-token output. Terraform format and schema validation pass. **No public deployment URL exists yet**: the owner deferred Azure login, plan/apply and live deployment to a joint review on **6 November 2026**. Follow [deployment.md](docs/deployment.md); no other provider has been substituted.

This project is being built for the QUEST Lab Full Stack AI Pre-doctoral selection process in a single continuous Codex session, without other coding agents. The raw session log remains outside Git, unedited. [Progress and timebox](docs/progress.md) record the session-integrity limitations candidly; [the master prompt](docs/master-prompt.md) is preserved byte-for-byte.
