# Flux backend

Flux now has a real application server. Node 24 runs a typed HTTP API and serves the production React build. PostgreSQL persists users, hashed sessions, owner-scoped scenarios, retained raw/normalized imports, job inputs and results. Browser worker simulation remains available for interactive editing.

## Run locally

Install Node 24.12+ and run `npm ci`, then `npm run dev`. This builds the backend and starts API port 3001 plus Vite port 5173 with an /api proxy. Local embedded PostgreSQL persists under ignored `.flux-data/postgres`. The production database driver is pg; PGlite is a local/test convenience, not the Azure storage plan. Copy `.env.example` to ignored `.env` if needed. Backend edits require restarting dev; Vite reloads frontend edits.

For a built same-origin app: `npm run build`, then `npm start` and visit http://127.0.0.1:3001. Stop another process using the same PGlite directory first. Both UI and API are actually served by the Node backend.

Open **Data & cloud** to create a local account, save/load/update/delete server scenarios, import OSM/count files, run or cancel server simulations/paired experiments, inspect job history and download reports. Device saves are separate and do not carry dataset provenance; server saves and reports do. Passwords use scrypt N=131072, r=8, p=1 with per-password salts and constant-time comparison. The preliminary lower-cost local hash format upgrades on successful login. A session lasts 24 hours and can be revoked by logout. No email verification or password reset is implemented; production public registration defaults off. This initial account system is suitable for an owner-controlled research deployment, not a complete consumer identity service.

## HTTP contract

All API bodies are strict JSON and at most 3 MB UTF-8. IDs are server-generated UUIDs. Errors contain a bounded message and request ID, never SQL, stack traces or upstream credential-bearing details. API responses use no-store.

| Method / route | Behavior |
|---|---|
| GET /api/health | Database-backed readiness and registration status |
| GET /api/session | Current user and CSRF token, or user:null |
| POST /api/auth/register, /login | Email/password schema, scrypt verification, rotated session cookie |
| POST /api/auth/logout | Revoke session |
| GET, POST /api/scenarios | List / create owner records (100 max) |
| GET, PUT, DELETE /api/scenarios/:id | Owner-scoped read/update/delete |
| POST /api/import/osm, /demand | Validate input and persist raw + normalized dataset (20 max) |
| GET /api/datasets, /api/datasets/:id | Owner-scoped import history / normalized data |
| GET /api/datasets/:id/raw | Exact original input as inert text/plain |
| DELETE /api/datasets/:id | Delete imported dataset; saved scenario/report snapshots retain their own provenance |
| POST /api/jobs | Submit scenario or scenario+baseline; HTTP 202 |
| GET /api/jobs, /api/jobs/:id | Owner history / status, progress, immutable input and results |
| POST /api/jobs/:id/cancel | Cancel queued/running job |
| DELETE /api/jobs/:id | Delete terminal result; cancel active work first |
| GET /api/providers | TomTom configured flag, no key |
| POST /api/traffic/tomtom | Authenticated, CSRF-protected bounded city/point observation |

Private-record mutation requests require the HttpOnly session cookie plus X-Flux-CSRF from /session. Browser Origin must match PUBLIC_ORIGIN exactly. No permissive CORS or trust in client owner IDs/forwarded IP headers. Programmatic same-origin sessions can use the same cookie/CSRF contract. Status codes include 400 invalid input, 401 no session, 403 forbidden origin/CSRF, 404 absent/foreign record, 409 history/storage cap, 413 size cap, 415 content type, 429 rate/queue admission and 502/503 provider/availability failures.

## Execution and limits

The shared deterministic engine executes inside a separate Node worker thread, with a 256 MB old-generation ceiling and 120-second job timeout. One job runs at once; at most 20 queued/running globally and three per user. Histories retain at most 200 jobs per account until deletion. Comparison uses identical seed, generated arrivals and horizon. Missing completed-trip observations serialize as null.

This first release supports **one API replica**, enforced in Terraform. In-process admission is serialized. Do not scale out without a transactional distributed lease/queue; rolling replacement may interrupt a run, which is explicitly marked failed rather than reported complete. Restart recovery marks interrupted running jobs failed and resumes queued jobs. Closing the browser does not cancel server jobs. Resource bounds reject excess work; 120 API users does not mean 120 parallel simulation workers.

## Production storage

Production requires DATABASE_URL with sslmode=verify-full and a restricted flux_app login. It refuses local embedded storage. The runtime verifies schema version but never runs DDL. The separate migration process (`node dist-server/migrate.mjs`) alone receives BOOTSTRAP_DATABASE_URL and creates/migrates tables and grants runtime CRUD permissions. Administrator credentials never enter the HTTP service. All queries bind parameters. Private Azure PostgreSQL networking and backups are in Terraform. Protect state because sensitive Terraform values still occur there.

## TomTom

All real credentials must originate in Azure Key Vault. In Azure, the platform injects TOMTOM_API_KEY and DATABASE_URL through managed-identity secret references; the FLUX_SECRETS_SOURCE marker records deployment intent, not cryptographic proof of origin. Local real-secret environment injection is rejected. For authorized local access after the joint review, set only non-secret FLUX_KEY_VAULT_URL and FLUX_ENABLE_TOMTOM=true; AzureCliCredential/SecretClient retrieves the provider key. Cloud-database access is separately opt-in through FLUX_USE_CLOUD_DATABASE=true. No Azure credentials or vault calls are needed for local embedded persistence. Absence disables the button and returns an explicit 503. The adapter uses the [documented JSON flow-segment endpoint](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data). Live provider calls have not been verified without an owner-supplied key. Contract tests use clearly synthetic responses, including failures, invalid data, secret-echo attempts and quotas.

One manual point request lies within the chosen Bengaluru/Mumbai/Chennai/Pune/Hyderabad/Delhi region. Limits: 5 seconds, 200 KB, four concurrent upstream calls, ten/user/minute and sixty/server/minute. No arbitrary URLs, redirects, JSONP, browser key, automatic polling or commercial-provider calls during load tests. Response includes km/h and seconds, confidence, closure, returned segment geometry, retrieval time, attribution and hash. Retrieval time is not a source measurement timestamp. Observations are transient and excluded from database/export; no right to retain/reuse commercial traffic data is assumed. Matching a nearest segment to a modeled route/direction remains an explicit analyst task.


## OpenStreetMap selection

`POST /api/maps/osm-area` is a public, read-only geometry request, with exact-origin/content-type checks and strict `{bounds:{south,west,north,east},syntheticRate}` input. It writes no account or database state and needs no session/CSRF secret. Private saves/jobs remain authenticated and CSRF-protected. It returns normalized scenario, source/license/retrieval time/raw-response hash and warnings. The fixed upstream is `https://api.openstreetmap.org/api/0.6/map.json`; callers cannot supply URLs, queries or headers. See [map selection](map-selection.md) for geometry, limits, data retention and traffic assumptions.
