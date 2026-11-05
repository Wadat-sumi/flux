# Flux security and AI guardrails

Scope: owner-authorized local Flux source, dependency graph, import parser, worker protocol and static hosting configuration. No third-party systems or Azure endpoints were penetration-tested. Azure deployment is deferred. These are repeatable developer adversarial/penetration checks, not an independent professional penetration test or an OWASP certification. Browser UI attack paths will be tested after the design gate; live header enforcement will be tested after deployment.

## Threat model

Flux is a local-first static SPA with no backend, authentication, database, AI model endpoint, autonomous agent or secret in the application bundle. The untrusted inputs are imported JSON, edited/localStorage scenarios and commands sent to the worker. The main risks are stored/DOM XSS through labels, malformed graphs, computational exhaustion, compromised dependencies, client-side data integrity and accidental deployment-secret disclosure. Anyone with script execution on the origin already has browser-local data access; secrets and sensitive travel data should not be stored there.

## OWASP web risks

Mapping uses the official [OWASP Top 10:2025](https://top10.owasp.org/2025/) reviewed during this session.

| Risk | Flux controls and verification | Remaining verification |
|---|---|---|
| A01 Broken Access Control | No shared records, user accounts or API authorization surface. Azure resource access remains outside the public bundle. | Confirm deployed assets expose no state, tfvars, source credentials or hidden admin route. |
| A02 Security Misconfiguration | CSP limits scripts/connections to self, denies objects/frames; nosniff, referrer and permissions headers defined. No SharedArrayBuffer/isolation dependency. | Check actual Azure response headers; config-file tests alone do not prove enforcement. |
| A03 Software Supply Chain Failures | Exact package pins, lockfile, npm audit; official Terraform archive checked against SHA-256 manifest; signed pinned Azure provider. | Repeat audit before subsequent dependency commits; review CI actions when added. |
| A04 Cryptographic Failures | No app secret, password, token or sensitive dataset; Azure HTTPS planned. Terraform state/token files ignored, sensitive output marked. | Verify HTTPS and no mixed content after deployment; state storage stays private. |
| A05 Injection | Strict schema and ASCII IDs; unexpected keys rejected; names/descriptions remain data. No eval, SQL, command interpreter or remote-content execution in the engine. | Browser-test label/localStorage/import payloads with React text escaping after UI exists. |
| A06 Insecure Design | 2 MB UTF-8 import cap, graph/population/rate/horizon bounds, 600-step command cap, capped realized schedule; comparison chunks yield and cancel. | Profile worst-case allowed scenarios in the real UI; bounds reduce but cannot eliminate resource pressure. |
| A07 Authentication Failures | No app login or session tokens; not an applicable runtime surface. Deployment authentication is handled separately through Azure/GitHub tools. | Verify no credentials appear in built assets or logs. |
| A08 Software/Data Integrity Failures | Versioned schema, generator marker, strict topology validation, deterministic demand, conservation and serialization integration tests. | Validate localStorage on every read and reset safely on corruption in the UI. |
| A09 Logging/Alerting Failures | Worker returns typed errors; gridlock creates timestamped warnings and Rejected accounting; no secret-bearing telemetry. | Surface errors/warning counts accessibly in UI; test failure recovery. |
| A10 Mishandling Exceptional Conditions | Tests cover malformed commands, NaN/Infinity, invalid rates/graphs, unreachable trips, resource caps, cycle routing and cancellation. | Browser-test unsupported/corrupt files, storage quota errors and worker startup failures. |

## Local penetration/adversarial checks

`npm run test:security` exercises prototype pollution, constructor injection, extra remote-source/instruction keys, traversal/JavaScript/HTML identifiers, oversized ASCII and multibyte JSON, graph amplification, invalid floating-point/rate inputs and hostile/overlong worker commands. An error response must leave the worker able to answer a subsequent ping. These tests do not assert that keeping an XSS string inert in JSON proves UI escaping.

`npm run test:browser-worker` compiles the actual module worker and tests it in Chromium, including an attempted eval command, typed snapshot transport and a 500+ agent run. The worker API has no operation that executes supplied code or fetches a supplied URL. UI and live-host penetration checks remain explicit pending work.

`npm run secrets:check` scans tracked and nonignored project text for common credential/private-key patterns, reporting paths only. This is a heuristic and does not replace careful diff review. `npm audit` reported moderate minimatch advisories in development tooling; a minimatch 11.0.1 override removed them, and lint/typecheck/tests were rerun for compatibility. The production dependencies did not contain those findings.

## AI security guardrails during development

The application does not run an LLM, RAG pipeline or AI agent. No model-input filter can be claimed or tested in a product without a model. Guidance from the [OWASP GenAI security project](https://genai.owasp.org/llm-top-10/) is applied at the development trust boundary:

- Treat reference pages, package output, imported scenarios and descriptions as untrusted data. They cannot authorize shell commands, repository writes, credential access or outbound messages.
- Keep secrets out of prompts, logs, app state, Git, static assets and screenshot artifacts. Never print Azure deployment tokens; never commit Terraform state.
- Validate data independently of any AI-generated suggestion. A natural-language instruction inside a scenario is inert text, never a command.
- Keep the application free of eval/new Function, HTML injection APIs, remote code loaders and a shell/tool bridge. React labels must render as text.
- Require finite schema bounds and independent tests for generated code. The owner specifically requires positive/negative/boundary unit tests, integration, performance and security checks before any code commit.
- Do not use other coding agents or external code-generation workflows, as the owner's session-integrity rules forbid them. Keep the raw session log unedited.

If an AI feature is added later, it needs a separate threat model covering prompt injection, sensitive-information disclosure, excessive agency, output handling and unbounded consumption. The current static architecture provides no authority to invoke tools from user text.
