# Flux architecture

```mermaid
flowchart LR
  Import[Scenario JSON / presets] --> Schema[Zod validation]
  Editor[React network editor] --> Schema
  Schema --> Worker[Module Web Worker]
  Worker --> Demand[Pre-generated seeded demand]
  Worker --> Engine[Fixed-step TypeScript engine]
  Demand --> Engine
  Engine --> Graph[Graph / cached Dijkstra]
  Engine --> Control[Signals / junction reservations]
  Engine --> Stats[Statistics / 1 Hz history]
  Engine --> Pack[Float32Array snapshot]
  Pack -->|postMessage transfer| Canvas[Canvas isometric / plan renderer]
  Stats -->|message| Metrics[React dashboard / paired charts]
```

`src/model` owns schemas and import/export bounds. `src/scenarios` constructs validated synthetic networks. `src/engine` separates PRNG, demand, graph/geometry, vehicle law, signal control, statistics, scheduler and experiments. `src/worker/protocol.ts` defines a typed command/response boundary; `runtime.ts` injects transport for tests; `simulation.worker.ts` binds it to browser globals.

The worker schedules fixed numerical steps at 30 Hz wall-clock intervals. Playback multipliers process 1/2/4/8 numerical steps per interval; under load wall-clock playback slows rather than changing physical dt. Render interpolation will use requestAnimationFrame independently and will never feed positions back to the engine. No SharedArrayBuffer is used.

Snapshots contain nine Float32 fields per agent: ID, edge index, lane, position, speed, x, y, heading, elevation. Each message transfers the snapshot's ArrayBuffer; the engine's authoritative vehicle objects remain intact. Metrics and history are structured-cloned. `ping/pong`, load/play/pause/step and chunked paired comparison are implemented. Comparison yields between 150-step chunks; loading a new scenario cancels an old comparison by generation ID. Errors become typed error responses.

`src/ui` owns camera projection/inversion, interactive Canvas rendering, validated editor operations, a bounded localStorage library, SVG charts and the React workspace. The owner approved C before these files were created. Isometric geometry is a drawing transform of the same graph; source/sink roles, ramps and topology are edited through native forms as well as gestures. Scene changes reload the worker and invalidate cached routes. Comparison charts share numeric scales and time horizons.

The original static architecture was superseded by the owner-authorized full-stack revision on 6 November. The following server boundary now complements browser simulation. `scripts/serve-dist.mjs` is a loopback-only production QA server that applies staticwebapp.config.json headers for browser tests. It is not a deployed server component. The real app has been tested with 500+ moving agents while collecting worker metrics and rendering; see the browser benchmark and testing record. Live Azure verification is deferred.


## Full-stack server boundary

```mermaid
flowchart LR
  Browser[React + Canvas + browser worker] -->|same-origin cookie + CSRF| API[Node TypeScript API]
  API --> Accounts[Account and ownership checks]
  API --> SQL[Parameterized PostgreSQL storage]
  API --> Import[Bounded OSM / observed OD CSV validation]
  Import --> SQL
  API --> Queue[Bounded persistent job records]
  Queue --> Thread[Isolated CPU worker thread]
  Thread --> Shared[Same deterministic simulation engine]
  Shared --> Results[Progress and immutable results]
  Results --> SQL
  API --> TT[Fixed-host TomTom adapter]
  Vault[Azure Key Vault] -->|managed identity / secret references| API
  TT --> Transient[Attributed transient traffic observations]
```

server/database.ts provides the shared PostgreSQL schema/migration and local PGlite/production pg adapters. server/app.ts owns HTTP boundaries, sessions/CSRF and owner-scoped persistence. server/jobs.ts bounds admission, progress, timeouts, cancellation and restart handling; simulation-job.ts runs the same engine independently of the event loop. One API replica/CPU worker is supported. The queue is not a distributed scheduler.

server/imports.ts retains source data and normalization warnings. server/secrets.ts retrieves local integration credentials from Key Vault using authorized developer identity; Azure resolves managed-identity references. The migration job has a separate identity and administrator connection reference; the HTTP service receives only its restricted runtime connection and optional provider key. Browser code never contacts the provider or receives credentials. Authentication password/session hashes remain in the application database.

The production Node service serves frontend assets and API on one origin, preserving strict CSP and cookie/CSRF rules. scripts/qa-server.mjs launches that actual compiled service with an isolated persistent test database for browser tests. scripts/serve-dist.mjs remains only an explicitly named legacy static preview utility. Azure plan/apply, container image and live vault/network checks remain pending joint review.
