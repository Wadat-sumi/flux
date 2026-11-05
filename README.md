# Flux

Interactive Agent-Based Traffic Simulation for the QUEST Lab Full Stack AI Pre-doctoral selection process.

Flux is being built in a single continuous Codex session. The headless TypeScript engine, reproducible scientific validation, transferable Web Worker and validated Azure Terraform scripts are implemented. Application UI work awaits the owner's choice of three [design proposals](docs/design-proposals.md).

See [the execution prompt](docs/master-prompt.md) and [verified progress](docs/progress.md). Public Azure deployment is pending verified Azure authentication. This is an educational experimental model, not a calibrated transport planning tool.

Requires Node 22+ and Python 3 for browser-worker test serving:

```sh
npm ci
npm run check
npm run benchmark
PLAYWRIGHT_BROWSERS_PATH=.tools/ms-playwright npx playwright install chromium
npm run test:browser-worker
```

The core currently passes 80 automated tests and two real Chromium worker tests. The [testing record](docs/testing.md) distinguishes headless performance from pending rendered application measurements. The [methodology](docs/methodology.md) explains movement, signals, lane changes, elevation, capacity and metric definitions; [security](docs/security.md) records OWASP-oriented checks and AI guardrails.

Azure Static Web Apps infrastructure is in infra/terraform. See [deployment instructions](docs/deployment.md). The owner deferred Azure authentication and deployment to a joint review on 6 November 2026. No public deployment URL exists yet.
