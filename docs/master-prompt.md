QUEST Lab Full Stack AI Pre-doctoral application, Shivarshi Shivansh, 5 Nov 9:30 pm

# MASTER EXECUTION PROMPT — QUEST Lab Traffic Simulation

## 0. Mission, Operating Mode, and Constraints

You are an autonomous senior interdisciplinary engineering and scientific research team comprising:

- Principal software architect
- Transportation systems and traffic simulation researcher
- Agent-based modeling specialist
- Applied mathematician and algorithm engineer
- Full-stack software engineer
- Interactive visualization and UI/UX designer
- Data engineer (GIS/OSM work is optional and only if time permits)
- QA, performance, security, and DevOps engineer
- Scientific technical writer

Your mission is to **design, implement, validate, document, and deploy a complete agent-based traffic simulation application** that allows users to construct road networks, configure traffic conditions, execute simulations, visualize vehicle movements, and analyze outcomes.

This application, named **Flux** (see §2 for branding), is being developed for the **QUEST Lab Full Stack AI Pre-doctoral selection process**.

The objective is not merely to demonstrate programming ability. The finished application should demonstrate scientific reasoning, credible modeling, systems engineering, thoughtful product design, and the ability to deliver a working computational research tool.

### Mandatory GitHub repository

**Repository:** https://github.com/Wadat-sumi/flux

**Clone URL:** https://github.com/Wadat-sumi/flux.git

**Repository owner:** Wadat-sumi

**Default branch:** main

This is the exclusive repository for the entire project.

All application code, simulation logic, tests, configuration files, documentation, deployment scripts, and related development artifacts must be created or modified within this repository and within the same coding-agent session.

### Non-negotiable application rules

1. All development must happen within **this single continuous Claude Code or Codex session**. Do not use `/clear` or any other command that starts a new session or a new log file. Avoid `--resume` / `--continue` flows that could fork the transcript.
2. The maximum permitted duration is **72 hours**, measured from the actual first prompt to the final commit. **Target a final commit by hour 60** so that there is a buffer. Any commit after hour 72 invalidates the run.
3. Record the actual session start timestamp immediately (use `date` with timezone, and cross-check against the first timestamp in the session `.jsonl` log) and calculate the deadline. Do not silently assume that the timestamp in the required first line equals the actual start time.
4. All source code, test fixtures, scripts, documentation, configurations, and deployment work must be created or performed within this session.
5. All Git operations, including cloning, initialization if necessary, commits, and pushes, must happen within this session.
6. Maintain Git history consistent with the chronological development reflected in the session transcript.
7. Preserve the **raw, unedited session log in `.jsonl` format**. Claude Code stores logs under `~/.claude/projects/`; Codex under `~/.codex/sessions/`. Do **not** commit the session log into the repository; it is still being written during the session and is submitted separately.
8. Never edit, sanitize, rewrite, concatenate, or fabricate the raw session log.
9. Do not try to alter timestamps or Git history to create the appearance of compliance.
10. Do not use another coding agent, separate coding session, or external code-generation workflow for implementation.
11. Do not stop after designing or planning. Execute the complete development lifecycle and deliver the strongest verifiable result within the time limit. The only planned pause is the **UI design gate** in §7.0, where the owner chooses one of three design proposals; the 72-hour clock keeps running during that pause.
12. Commit development progress incrementally to the specified GitHub repository.
13. Push the completed application to the repository and verify that the final commit is present remotely.

You are operating as an implementation agent, not merely as an adviser.

### Operating philosophy

Prioritize, in order:

1. Correct, explainable agent-based simulation.
2. Working end-to-end application.
3. Interactive road network and scenario configuration.
4. Useful and accurate visualizations and metrics.
5. Scientific validation and reproducibility (automated tests and validation suite).
6. Documentation, reliability, and polish.
7. Final public deployment (a **skeleton deployment must be done early**, see §1.5, so deployment risk is retired before the end).
8. Additional features only after the core system works.

A smaller, scientifically sound and fully functional application is preferable to a large, partially implemented application.

Never misrepresent a simplified model as a realistic calibrated traffic simulator.

---

## 1. Preflight, Environment Discovery, and Repository Setup

Before choosing the final technical architecture, inspect the environment.

Determine:

- Operating system, architecture, available CPU and memory.
- Available programming languages and package managers.
- Git availability and configured author identity.
- Network connectivity and package registry access.
- **Whether `git push` to the repository actually works** (authentication available) before relying on it. Verify early with a harmless first commit.
- Available browser testing tools, and whether Playwright browsers can be installed.
- Available deployment tooling and authentication for **Azure**: whether `terraform` and the Azure CLI (`az`) are installed, whether `az account show` succeeds (or a service principal is configured through `ARM_*` environment variables), and which subscription is active. Never print credentials.
- Whether the environment supports long-running local development servers.
- Location of the current session transcript.
- Whether geospatial or traffic datasets are accessible (optional; synthetic demand is the default).

### 1.1 Repository initialization

Use the following repository:

https://github.com/Wadat-sumi/flux

Begin by checking whether this repository is already available in the working environment.

If not, clone it:

```bash
git clone https://github.com/Wadat-sumi/flux.git
cd flux
```

Inspect the existing repository before modifying anything:

```bash
git status
git remote -v
git branch -a
git log --oneline -5
```

- If the repository is empty or has no commits, handle that case gracefully.
- If the repository contains existing commits, note in `docs/progress.md` that they predate the session, and inspect and preserve useful work.
- Do not overwrite existing files without examining them.
- Ensure that the origin remote points to: https://github.com/Wadat-sumi/flux.git

### 1.2 Git workflow

Use meaningful incremental commits representing actual completed milestones.

Recommended milestones:

1. Project initialization, architecture, Terraform scaffold, and skeleton deployment to Azure.
2. Road network and simulation engine.
3. Vehicle movement, routing, and intersections.
4. Flyover and multilane functionality.
5. Interactive network editor.
6. Analytics and comparative experiments.
7. Validation and automated testing.
8. Final Azure deployment and documentation.
9. Final verification.

Rules:

- Do not create artificial commits after implementation simply to simulate a development history.
- Do not rewrite existing history or force-push without explicit authorization.
- Prefer working on `main` unless repository protections or other legitimate constraints require a feature branch.

Before each push:

- Run the appropriate test suite.
- Check for accidentally committed secrets.
- Inspect the Git diff.
- Confirm the intended files are staged.

At the end, verify that the final commit exists on the remote branch and report the SHA.

### 1.3 Missing inputs

- Check whether the owner already provided deployment credentials, required repository settings, or other essential details.
- Ask for genuinely essential missing information in one batched request, rather than repeatedly interrupting implementation.
- Do not request decisions that can be made using reasonable engineering defaults. The one exception is the visual design choice in §7.0, which belongs to the owner.
- Never print credentials, environment secrets, or sensitive authentication details.

### 1.4 Session timebox

Record the actual start time, timezone, and deadline (start + 72 hours), plus the internal target of hour 60.

Maintain a progress file: `docs/progress.md`

Track:

- Completed milestones.
- Current work.
- Blockers.
- Remaining work.
- Actual verification results.
- Deployment status.
- Remaining time relative to the 72-hour deadline.

### 1.5 Deployment strategy (Azure + Terraform)

Deploy Flux as a client-side Vite + React SPA with zero server-side components, hosted on **Azure** and provisioned with **Terraform**. All infrastructure must be defined as code in the repository and created within this session.

**Hosting target: Azure Static Web Apps** (Free tier by default). It suits a static SPA, gives a public HTTPS URL, and needs no servers. Set the Vite `base` option to `'/'`.

**Terraform scripts** live in `infra/terraform/` and must include:

- `versions.tf`: required Terraform version and a pinned `azurerm` provider version (note that azurerm v4 requires `subscription_id`, supplied through a variable or `ARM_SUBSCRIPTION_ID`).
- `main.tf`: an `azurerm_resource_group` and an `azurerm_static_web_app` (Free SKU by default, tags including `project = "flux"`).
- `variables.tf`: `subscription_id`, `location` (default to a region supported by Static Web Apps, verified against current Azure documentation), `resource_group_name`, `app_name`, `sku_tier`.
- `outputs.tf`: the default hostname/URL, and the deployment token as a **sensitive** output.
- `terraform.tfvars.example`: example values with no real secrets.
- `README` notes in `docs/deployment.md` explaining `terraform init`, `fmt`, `validate`, `plan`, `apply`, and `destroy`.

**Application deployment config:**

- Add `staticwebapp.config.json` to the build output (SPA navigation fallback to `index.html`, correct MIME types for worker and asset files, and basic security headers).
- Deploy the built `dist/` with the Static Web Apps CLI (`swa deploy`) using the deployment token, or through a GitHub Actions workflow that reads the token from a repository secret. Never commit the token.

**Terraform safety rules:**

- Add `.terraform/`, `*.tfstate`, `*.tfstate.*`, `*.tfvars` (except the `.example` file), and crash logs to `.gitignore`. Never commit state files, tfvars with real values, or tokens.
- Run `terraform fmt -check` and `terraform validate` before every commit that touches `infra/`. These work without Azure credentials.
- Run `terraform plan` and `terraform apply` **only if** Azure authentication was verified in the preflight. Use local state, and document that remote state (Azure Storage backend) is recommended for real use.
- Never use `-auto-approve` against anything other than the Flux resource group created by these scripts. Do not modify or destroy any pre-existing Azure resources.
- If Azure credentials are not available, do not stall: finish and validate the Terraform code, record the blocker in `docs/progress.md`, ask for credentials in the single batched request (§1.3), and keep the app deployable by `swa deploy` or CI once credentials exist. Do not silently substitute another hosting provider.

**Other constraints and timing:**

- Do not use SharedArrayBuffer. Communicate with the Web Worker through `postMessage` using transferable typed arrays; this also keeps the app portable.
- **Do a skeleton deployment (hello-world SPA with a worker round trip) to Azure within the first ~24 hours**, so that Terraform and credential issues surface early. Finalize the deployment at the end, and keep Terraform work time-boxed so it does not displace core simulation work.

---

## 2. Product Definition

### Product name and branding

**Flux** — Interactive Agent-Based Traffic Simulation

The project is called **Flux**. The name refers to traffic flow, and it should be used consistently everywhere. The GitHub repository is named `flux`, matching the product name.

Apply the branding in these places:

- **Application UI:** Show the "Flux" wordmark in the header or top bar, with the tagline "Interactive Agent-Based Traffic Simulation" in the header or an about/footer area.
- **Page metadata:** Set the HTML `<title>` to `Flux — Traffic Simulation`, and add a meta description and a simple favicon (e.g., an SVG mark suggesting flowing traffic).
- **Visual identity:** Define a small, consistent set of design tokens (primary and accent colors, typeface, logo wordmark) in one place, such as Tailwind theme config, and reuse them across the UI. The tokens come from the design the owner selects at the §7.0 design gate. Keep the look clean and scientific, not decorative.
- **Documentation:** `README.md` must be titled "Flux", and every file in `docs/` should refer to the product as Flux. Use "Flux" in `docs/master-prompt.md` only as it appears in this prompt, without altering the header line.
- **Scenario files:** Exported JSON should include the app name (e.g., `"generator": "Flux"`) alongside the schema version.
- **Package and deployment:** Use `flux` as the package name in `package.json` where sensible, use `flux` in Azure resource names and tags, and show the name in the deployed page title and the README deployment link.

### Product objective

Build an interactive traffic experimentation platform where users can:

- Create or modify road networks.
- Configure intersections, junctions, flyovers, and roads with different widths and capacities.
- Define where vehicles enter and leave the network.
- Set traffic demand and simulation parameters.
- Execute a vehicle-level agent-based traffic simulation.
- Observe vehicle movements and congestion formation.
- Measure traffic performance.
- Compare infrastructure or traffic-management scenarios.

### Central research question

How do road network topology, road capacity, junction control, and traffic demand influence congestion, travel time, throughput, and queue formation?

The application must help users investigate this question experimentally.

### Primary users

- Transportation researchers and students.
- Urban and transportation planners.
- Engineers studying road network behavior.
- Users experimenting with infrastructure configurations.

The UI should be approachable for a nontechnical user without sacrificing scientific transparency.

---

## 3. Research and Model Selection

Implement a custom, high-performance agent-based simulation engine in TypeScript built from scratch, utilizing lightweight geometry/math utilities where necessary.

### Engine strategy and rationale

- **Custom TypeScript engine vs. SUMO/external frameworks:** Established traffic simulators (such as SUMO) require heavy C++ binaries or Python wrappers (libsumo) that complicate browser deployment on static platforms. A standalone, strongly typed TypeScript simulation core runs natively in browser workers, compiles instantly, and provides maximum transparency for evaluation.
- **Movement core:** A continuous car-following model (such as the Intelligent Driver Model, IDM) or a discrete cell-based approach with explicit lane assignment rules.
- **Performance standard:** The simulation engine must maintain a stable 30+ ticks per second and smooth rendering with at least 500 active vehicle agents running in the browser.

Record decisions and tradeoffs in `docs/model-selection.md`.

---

## 4. Architecture and Technology

Select the stack after inspecting the environment, using these guidelines.

### Preferred stack

**Frontend**

- React
- TypeScript
- Vite
- Tailwind CSS
- Canvas / WebGL rendering layer (e.g., PixiJS, Konva, or HTML5 2D Canvas) for high-performance agent rendering
- Lightweight charting library

**Simulation core**

- Standalone, strongly typed TypeScript simulation core, independent of React.
- **Web Worker architecture:** Run the simulation loop inside a Web Worker communicating via `postMessage` (transferable typed arrays for vehicle state) to ensure the React UI and canvas rendering remain at 60 FPS regardless of simulation step computation load.

### Architectural boundaries

Separate the following modules:

- Road network data model.
- Network topology and geometry.
- Vehicle agent state and behavior.
- Routing.
- Junction and signal control.
- Simulation scheduler.
- Statistics collection.
- Scenario serialization.
- UI state and interaction.
- Rendering and visualization.

Rules:

- Do not embed simulation physics inside React components.
- Do not couple rendering frame rate with the numerical simulation time step.
- Build the simulation engine so it can run headlessly in automated tests.
- Document the architecture using Mermaid diagrams in `docs/architecture.md`.

---

## 5. Road Network Representation and Flyovers

The simulation must support a directed road network with junctions, flyovers, and roads of varying widths and capacities.

### 5.1 Network graph and elevation

Represent the road network as a directed graph containing:

**Nodes**

- Road endpoints, intersections, junctions, entry/exit points, merge/diverge points, ramp connections.
- Explicit elevation mapping: each node and edge must store an explicit `elevation` (or `layer`) property (e.g., ground level = 0, flyover = 1).

**Edges**

- Directed road segments with length, lane count, road width, speed limit, capacity parameters, start/end node references, visual geometry, and elevation level.

**Grade-separation rule:** Collision checks and junction/intersection checks must only evaluate edges sharing the exact same elevation/layer. Two roads crossing in the 2D visual plane at different elevations must pass independently without creating an automatic intersection.

**Ramp rule:** Ramps are the only edges whose endpoints differ in elevation. A ramp connects a lower-layer node to a higher-layer node, and connectivity between layers exists only through explicit nodes and ramp edges. Interaction checks (merging, yielding, signals) apply at those ramp nodes, using the layer of the node where the interaction happens. The network editor must never auto-create a junction at a purely visual crossing of edges on different layers.

**Cycles are allowed.** Two-way roads, city blocks, and roundabouts are all cyclic. Graph validation must not reject cycles.

### 5.2 Roads of different widths and capacities

Support at least:

- Single-lane, two-lane, and multi-lane roads.
- Variable speed limits and capacities.
- Directional road segments.

Model lane count as the primary operational input and road width as a geometric (visual) parameter. **Capacity is an emergent result** of lane count, speed limit, IDM parameters, and junction control. If a capacity parameter is exposed to the user (e.g., as a saturation-flow cap), document exactly how the engine uses it in `docs/methodology.md`.

### 5.3 Junctions

Support:

- Simple intersections and T-junctions.
- Signal-controlled intersections and unsignalized priority/yield behavior.
- **Junction-box clearing and deadlock handling:** vehicles must not enter a junction they cannot clear, and the engine must include a deadlock/gridlock detector with a documented resolution (e.g., timeout-based release or rejection with a logged warning).

### 5.4 Flyovers and grade separation

Flyovers are a core requirement:

- Implement true grade-separated connectivity.
- Support elevated road segments, ground-level segments, explicit ramps or level connections, and clear visual differentiation between levels.

Test scenarios for:

- Two roads crossing at the same level connected through a junction.
- Two roads crossing at different levels without connectivity.
- An elevated road connecting to a ground road through a ramp.

---

## 6. Agent-Based Traffic Simulation

Each vehicle exists as an independent agent with its own state and behavior.

### 6.1 Vehicle state

Unique ID, current road segment, lane, position along segment, current speed, desired speed, acceleration, vehicle length, origin/destination, planned route, waiting time, travel time, entry time, status.

### 6.2 Vehicle generation and determinism

Support configurable demand (spawn points, destinations, generation rate, duration, random seed).

Vehicle creation and agent behavior must be strictly reproducible given a fixed seed:

- Use a seeded PRNG (e.g., mulberry32 or sfc32). Never use `Math.random`, `Date.now`, or other non-deterministic sources inside the engine.
- Use a fixed simulation timestep.
- Use **separate RNG streams** for demand generation and driver behavior, and **pre-generate the spawn schedule** (time, origin, destination, vehicle parameters) from the demand seed alone. This guarantees that baseline and modified scenarios with different topologies receive identical demand.

### 6.3 Movement, lanes, and routing

- Implement a coherent car-following model (e.g., IDM) representing vehicle interactions, safe distances, speed limits, and queue formation.
- Implement lane handling for multi-lane roads: lane selection at spawn and before turns, plus at least a simple lane-change rule (e.g., MOBIL-style or a documented simplified rule). Document the rule in `docs/methodology.md`.
- Graph-based shortest-path routing (Dijkstra or A*) using free-flow or estimated travel time.
- Avoid recalculating routes every frame when routes can be cached safely.
- Handle unreachable destinations safely (reject the vehicle and count it as Rejected).

### 6.4 Junction and signal control

- Vehicles approaching junctions obey signal phases (Green, Yellow, Red) or yield rules.
- Fixed-time signal control for the MVP with configurable cycle times.

---

## 7. Interactive Scenario Editor and Presets

### 7.0 UI/UX references and design gate (before any UI code)

**No UI component, layout, or styling code may be written until the design gate is complete.** (Simulation engine, worker, validation, and Terraform work come first, see §13.) This gate applies to everything in §7 and §8.

**Reference material** for visual language, layout, and motion. Use these as inspiration only; do not copy artwork, branding, icons, or assets, and do not recreate them pixel for pixel:

- https://dribbble.com/shots/15608015-Traffic
- https://cdn.dribbble.com/userupload/31623398/file/large-a8a453248ae97c0be9527cb48738afe4.mp4
- https://www.youtube.com/watch?v=BqqQUtikqmw

Try to actually view each reference. Dribbble pages are JavaScript-rendered and may need a headless browser (e.g., Playwright) to capture a screenshot. The MP4 can be downloaded and sampled into frames if `ffmpeg` is available. The YouTube video may be unreachable from the environment. If a reference cannot be viewed, say so plainly in `docs/design-proposals.md`, do **not** invent or guess what it contains, and ask the owner in the design-gate message to describe it or share screenshots.

**Already verified from the Dribbble shot (owner's session, 5 Nov):** an isometric, clay-render city scene (light grey buildings and roads, soft warm window glow, white zebra crossings and traffic lights) where vehicles (truck, bus, forklift) are the only strongly colored objects, in a lavender/indigo hue. Its published palette is `#282730` (near-black), `#6B6B70`, `#706F8E` (muted violet), `#9D9CA2`, `#CDCACF`. Treat the muted-neutral-plus-one-accent approach and the isometric depth as the visual language to adapt. The MP4 and YouTube references were not yet viewed; view them per the rules above and note only what you can verify.

**Step 1: Study.** Note the visual language you can verify from the references (palette, density, typography, map treatment, vehicle and road rendering, motion, overlays) in `docs/design-proposals.md`.

**Step 2: Propose exactly three distinct design directions**, each different in mood, layout, and rendering style, and each tailored to Flux's needs (network editor, flyover elevation clarity, congestion overlay, metrics dashboard, scenario comparison). Starter concepts, to be adapted to what the references actually show:

1. **Control Room:** a dark, data-dense operations dashboard with a glowing network on a dark canvas, a side panel for scenario controls, and a bottom strip of live charts.
2. **Blueprint Planner:** a light, map-first technical drawing look with thin precise lines, a left toolbar for editing, and a right inspector panel, optimized for planners and for printed comparisons.
3. **Layered City (closest to the Dribbble reference):** a softly stylized, light isometric look with muted grey roads, a single violet accent for vehicles, and elevation as the hero: flyovers drawn with drop shadows, depth offsets and layer toggles, friendly rounded vehicles, and a floating minimal HUD. Note that the simulation stays 2D; the isometric view is a rendering transform of the same state.

Each proposal must include:

- Name and one-paragraph concept, with how it relates to the references.
- Design tokens: color palette (including a colorblind-safe congestion scale), typeface, spacing, corner radius.
- Layout wireframe of the main screen (an annotated ASCII sketch at minimum) and the editor, comparison, and metrics views.
- Canvas visual language: roads and lanes by width, junctions, signals, vehicles, ramps, and how elevation and flyovers are shown.
- Motion and interaction notes (camera, hover, selection, playback controls).
- A lightweight static mockup (a single self-contained HTML or SVG file in `docs/design/`) so the owner can see it.
- Strengths, trade-offs, and implementation cost.

Time-box the whole design gate to about two hours. Accessibility baseline for all three: keyboard-operable controls, sufficient contrast, no meaning conveyed by color alone, and usable on laptop and tablet widths.

**Step 3: Ask the owner to choose.** Present the three proposals with a recommendation in **one batched message** and end the turn, asking for: the choice (A, B, C, or a stated hybrid) and any change requests. Remind the owner that the 72-hour clock is running. If the owner replies "choose for me", use your recommendation.

**Step 4: Record and implement.** Record the selected design and rationale in `docs/decisions.md` (as an ADR) and in `docs/design.md`, then implement the UI strictly according to the chosen design tokens and layout. Any later deviation must be noted in `docs/design.md`.

### 7.1 Network editor

A 2D graph editor enabling users to:

- Add, edit, connect, and delete nodes and road segments.
- Configure lane counts, speed limits, elevation levels, and ramps.
- Set vehicle entry points (sources) and exit points (sinks).

### 7.2 Scenario presets

Ship at least three built-in presets:

- **Scenario A — Signalized urban intersection:** A four-way intersection with signal control and configurable demand.
- **Scenario B — Flyover versus at-grade crossing:** Comparing a grade-separated crossing against an intersection with conflicting movements.
- **Scenario C — Road capacity bottleneck:** A multi-lane approach feeding a narrow road segment demonstrating queue formation under peak demand.

### 7.3 Save and load

- Export/import scenarios as JSON with schema versioning.
- Browser persistence (localStorage) for user-created networks.

---

## 8. Visualization and Dashboard

### 8.1 Simulation canvas

- Smooth 2D rendering of roads, lanes, junctions, flyovers (with visual depth/elevation distinction), traffic signals, and moving vehicles.
- Smooth interpolation between simulation ticks without altering underlying state.
- Camera controls: zoom, pan, fit network to view.

### 8.2 Congestion overlay

Color-code road segments by measured average speed, occupancy, or density with an explicit legend.

### 8.3 Real-time metrics

- Vehicle throughput, average travel time, average vehicle speed, waiting time/delay, queue length, road occupancy, and completed vs. active trip counts.
- Time-series charts for throughput and travel times.

---

## 9. Comparative Experiments and Scientific Validation

### 9.1 Scenario comparison

Ability to run baseline vs. modified scenarios (e.g., at-grade vs. flyover, 1-lane vs. 2-lane bottleneck) under identical traffic demand and random seeds (see §6.2 on separate RNG streams), presenting comparative tabular and visual metrics.

### 9.2 Automated validation suite

Implement automated checks, and document them in `docs/validation.md`, for:

1. **Empty network:** Remains stable with zero vehicles.
2. **Free-flow road:** Vehicles achieve theoretical free-flow speed.
3. **Congested bottleneck:** Queue formation when demand exceeds capacity.
4. **Traffic signal obedience:** Vehicles stop at red signals and proceed on green.
5. **Flyover separation:** No vehicle interaction across different elevations without ramps.
6. **Road connectivity:** No traversing across disconnected segments.
7. **Vehicle safety:** No overlapping vehicles or negative speeds.
8. **Conservation of vehicles:** Generated = Active + Completed + Rejected (vehicles waiting in a spawn queue count as Active or Rejected, and the accounting rule must be documented).
9. **Reproducibility:** Identical results given identical scenario and seed.
10. **Numerical stability:** No NaN coordinates, negative speeds, or invalid states.

---

## 10. Testing, Quality Assurance, and Performance

- **Static checks:** TypeScript type checking, linting, build verification.
- **Unit and integration tests:** Graph connectivity, routing, agent movement, signal transitions, metric collection, JSON schema validation, deadlock handling.
- **End-to-end tests:** Automated browser tests (Playwright or similar) verifying preset loading, simulation playback, network editing, scenario saving, and experiment execution.
- **Performance benchmarks:** Target stable execution with 500+ active agents at 30+ simulation ticks per second.

Record verification results in `docs/testing.md`.

---

## 11. Security and Reliability

- Validate all user-imported JSON scenario files against the schema.
- Reject **malformed** graphs gracefully: dangling node references, duplicate IDs, zero or negative length or lane counts, invalid elevations, and ramps without valid endpoints. **Cyclic topologies are valid and must be accepted.**
- Enforce bounds on agent generation rates and total vehicle counts to prevent memory exhaustion.
- Handle routing on disconnected graphs safely without infinite loops.

---

## 12. Documentation Requirements

Maintain the following structured files in the repository:

- `README.md` (titled "Flux"): Setup, architecture summary, usage, and deployment URL.
- `docs/architecture.md`: Component layout, data flow, Web Worker interface, Mermaid diagrams.
- `docs/model-selection.md`: Engine and movement-model choice, alternatives, and tradeoffs.
- `docs/methodology.md`: Mathematical formulation (car-following model, lane rules, routing, signal logic, capacity semantics, deadlock handling).
- `docs/validation.md`: Scientific validation tests and theoretical behavior comparison.
- `docs/data-sources.md`: Data provenance, synthetic demand policies, optional OSM import notes.
- `docs/testing.md`: Test execution results, E2E checks, performance benchmarks.
- `docs/deployment.md`: Build steps, Azure Static Web Apps hosting configuration, Terraform usage (`init`, `fmt`, `validate`, `plan`, `apply`, `destroy`), required Azure authentication, deployment token handling, and the deployment URL.
- `docs/design-proposals.md` and `docs/design/`: The study of the references, the three design proposals, and their mockups.
- `docs/design.md`: The selected design, tokens, layout, and any later deviations.
- `docs/decisions.md`: Architecture decision records (ADRs), including the design choice.
- `docs/limitations.md`: Scope boundaries and real-world calibration differences.
- `docs/progress.md`: Milestone checklist and time tracking relative to 72 hours.
- `docs/master-prompt.md`: Copy of this execution prompt.

---

## 13. Execution Strategy and Timebox Management

- Total duration: maximum 72 hours; internal target for the final commit is hour 60.
- Maintain incremental progress in `docs/progress.md`.
- Order of work: core simulation logic → Web Worker integration → **Terraform scaffold and skeleton Azure deployment (by ~hour 24)** → **UI design gate (§7.0: three proposals, owner chooses)** → network UI and canvas → metrics and presets → experiments → validation tests → documentation → final Azure deployment and verification.
- If time runs short, cut optional features (OSM import, advanced signal control, extra presets, custom domains or CDN in Terraform) before cutting validation tests or documentation.

---

## 14. Submission and Session Integrity Rules

- **First prompt line rule:** The session's initial prompt must start with exactly:
  `QUEST Lab Full Stack AI Pre-doctoral application, Shivarshi Shivansh, 5 Nov 9:30 pm`
- **Git integrity:** All commits must be made chronologically within this session to https://github.com/Wadat-sumi/flux.git.
- **Session log preservation:** Preserve the raw `.jsonl` transcript file (`~/.claude/projects/` or `~/.codex/sessions/`) unedited. Do not commit it to the repository. At the end, report its path and confirm that a single continuous log file covers the whole session.
- **Final verification:** Confirm final commit SHA, clean working tree, remote branch push, and live Azure deployment URL (and that the Terraform outputs match it) before concluding.

---

## 15. Definition of Done

- [ ] Repository: https://github.com/Wadat-sumi/flux
- [ ] Working application deployed to a public Azure Static Web Apps URL, branded as Flux (UI wordmark, page title, favicon, README, docs, exported JSON).
- [ ] Terraform scripts for Azure in `infra/terraform/` pass `terraform fmt -check` and `terraform validate`, with plan/apply results recorded in `docs/deployment.md` and `docs/progress.md`. No state files, tfvars secrets, or tokens committed.
- [ ] Grade-separated flyover logic (including ramp rule) fully implemented and validated.
- [ ] Web Worker architecture keeping rendering at 60 FPS and simulation at 30+ ticks/sec for 500+ agents.
- [ ] UI design gate completed: three proposals presented before UI work, the owner's choice recorded, and the UI implemented to the chosen design.
- [ ] 3 built-in preset scenarios functional.
- [ ] Comparative scenario experiment workflow verified with identical demand across scenarios.
- [ ] All 10 scientific validation tests automated and passing.
- [ ] Full documentation in `docs/` complete, including `docs/model-selection.md`.
- [ ] Final Git commit made before hour 72 (target hour 60), pushed to origin/main, and verified.
- [ ] Raw session `.jsonl` located and preserved, unedited and uncommitted.

---

## 16. Immediate Execution Instructions

Start now.

1. Acknowledge the constraints and prompt header.
2. Record the start time, timezone, calculated 72-hour deadline, and the hour-60 target.
3. Inspect the environment, tools, git push authentication, and the repository at https://github.com/Wadat-sumi/flux.
4. Create `docs/progress.md` and initialize the project scaffold.
5. Make the first commit and push to verify remote access.

Begin implementation.
