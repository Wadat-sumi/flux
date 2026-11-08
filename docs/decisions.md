# Flux decisions

## ADR 001: Browser-native scientific core

Accepted 5 November 2026. Use an independent TypeScript IDM-based engine and module worker. This permits static Azure hosting and direct headless tests. Fixed 1/30 s physics and separate demand/behavior random streams support reproducible comparisons. Simplified control policies and their biases are documented in the methodology.

## ADR 002: Azure infrastructure and credential prerequisite

Accepted 5 November 2026. Use Terraform-pinned azurerm 4.6.0 and Azure Static Web Apps Free in a new dedicated Flux resource group. Disable automatic provider registration. Validate offline; do not run plan/apply before verified Azure authentication. Do not substitute hosting providers.

## ADR 003: Owner-selected visual design

Accepted 5 November 2026. The owner chose C — Layered City (“Lets go with C”) after reviewing exactly three proposals and before application UI code. Use muted isometric geometry and violet vehicles to make flyovers visible, with plan view for precise editing. Tokens, responsive behavior and deliberate dependency choices are recorded in design.md. Azure deployment remains deferred to the joint review on 6 November.

## ADR 004: Owner-authorized full-stack revision

Accepted 6 November 2026. The owner explicitly superseded the original zero-server restriction. Keep the original prompt in master-prompt-original.md and revise the active master prompt. Add a same-origin Node 24/TypeScript HTTP service, PostgreSQL persistence, scrypt passwords, revocable HttpOnly sessions, owner-scoped records and isolated worker-thread jobs. Use PGlite for convenient filesystem-persistent local development and pg over PostgreSQL for Azure. The engine stays shared with the browser worker so deterministic results remain comparable. Never put an administrator database credential in the runtime service; a separate manual migration job grants the restricted flux_app role.

Azure Container Apps serves API and built frontend together to preserve same-origin cookies/CSP. Private-network PostgreSQL, GHCR image pulls using Key Vault-backed credentials, backups and a separate migration job are defined in Terraform. Backend resources are disabled by default because they are billable and Azure review is deferred. One API replica/CPU worker is supported; this is not a horizontally distributed queue. Interrupted runs are marked failed and queued jobs resume.

## ADR 005: Real observations, provider estimates and calibration

Accepted 6 November 2026. Import uploaded OSM JSON without server-side arbitrary URL fetching and retain the exact file and normalized scenario with SHA-256/provenance. Preserve explicit layers and warn about inferred controls/lanes and unsupported turn restrictions. Counts must be documented OD vehicle observations; overlapping intervals and unsupported units/identifiers are rejected. Constant mean rates are an explicit current limitation. Synthetic presets and test counts stay labeled. A public, attributed small Bengaluru road sample contains no assumed traffic.

TomTom is an optional authenticated backend adapter to the documented v4 JSON flow-segment endpoint, whose response supplies speed/travel-time estimates. A matching Orbis v2 JSON segment endpoint was not verified, so no guessed endpoint is used. Restrict geography to the six requested city regions, prohibit arbitrary hosts/redirects, cap time/response size/concurrency/quotas, and never echo upstream errors or credentials. Provider traffic is transient, with attribution and confidence; retention/export needs the appropriate commercial agreement. Current congestion speed is never silently substituted for a legal speed limit or converted into OD demand.

Owner requires a repeated >100-user test after full integration. Use 120 actual password-authenticated HTTP clients, distinct owner records and real loopback persistence, with a stated workload, duration, latency/throughput/error gates and queue saturation. Separately retain rendered 500+ vehicle/30 Hz tests. Neither local performance nor map/provider access proves calibrated real-city accuracy.

## ADR 006: All application secrets in Azure Key Vault

Accepted 6 November 2026 at the owner's explicit direction. This supersedes the earlier shell/environment-value suggestion for local keys. All real provider, database and future application/deployment secrets belong in Azure Key Vault. Azure injects references using managed identities; local optional integrations use authorized Azure CLI identity and the official Key Vault SDK with non-secret vault references. Static plaintext credentials in local environment/configuration are rejected by the server boundary. Authentication password/session hashes remain database records.

Provision Azure in stages: create the project vault first, enter database passwords/TomTom directly through the Portal, then provision the database and derived connection-string secrets. The runtime/migration identities receive separate secret-scoped grants. No TomTom value is a Terraform input or lookup. Database provisioning still puts sensitive database values into protected state, which is never committed. AGENTS.md makes this policy persistent for future work. Live identity/network/rotation checks remain deferred; local contract tests do not certify Azure enforcement.

The final full-stack/vault review removed the unprovisioned legacy SWA resource and deployment-token output; no existing Azure resource was changed. Container Apps now owns the sole planned public origin, avoiding an unused static deployment credential.


## ADR 007: Direction-aware map selection

Accepted 7 November 2026 at the owner's request. Use a lazy-loaded Leaflet map, direct attributed OSM raster tiles and a public read-only, fixed-host backend geometry request. Keep accounts optional for browser simulation, while account-owned saves and server jobs retain authentication/CSRF. Apply bounded selection, response size/time, concurrency, cache and quotas to the new public endpoint. CSP admits only the exact OSM tile image host; script/connect restrictions stay same-origin.

Clip directed roads to the selected rectangle and use separate boundary entry/exit nodes per directed segment. This preserves the existing single-role node schema, both directions of two-way roads, and avoids artificial outside turns. Retain grade separation; internal dead ends are not exits. Only reachable entry/exit pairs get explicitly synthetic starter demand. Document sparse-way API coverage, sub-metre simplification, operational minimum lengths, missing controls/turn restrictions and calibration limits. See map-selection.md.


## ADR 008: Curved roads and composite roundabouts

Accepted 7 November 2026 following frequent importer failures, label clutter and the owner's request for major-road-only map simulation and roundabout entities. Keep the engine's 300-junction/1,000-road bounds; remove irrelevant/outside roads first, preserve curved geometry as bounded edge shape, and compact geometry-only vertices before validation. Do not merge controls, real connections, terminals, grade changes or differing road attributes. Preserve short boundary pieces until compaction and give distinct recovery messages. Bound raw map responses separately at 8 MB/20,000 elements/referenced segments; file uploads remain 2 MB.

A roundabout is a persisted composite entity over a complete tagged directed ring, shown as one editor selection. Its necessary ports/arcs stay in the shared numerical graph and curve geometry, rather than approximating the whole structure as an instantaneous point. This is consistent with retaining graph structure for circulating paths, as described in [SUMO's network documentation](https://sumo.dlr.de/docs/Networks/SUMO_Road_Networks.html). The engine uses explicit simplified entry yielding to circulating traffic. These are not calibrated conflict/weaving rules. Other grouped structures worth future work are signalized junctions, interchanges/flyovers, merges/diverges and toll plazas; see map-selection.md for limits and rationale.
