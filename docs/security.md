# Flux security and AI guardrails

Scope: owner-authorized local Flux frontend/backend source, dependencies, PostgreSQL persistence, account/session/ownership boundaries, import parsers, worker execution, TomTom adapter and declared Azure infrastructure. Repeatable developer penetration/adversarial checks are not an independent professional penetration test or an OWASP certification. No third-party endpoint or live Azure system was attacked. TomTom contract fixtures are synthetic and live requests are unverified without vault access/entitlement.

## Threat model and controls

The Node API serves the frontend on the same origin. Accounts, sessions, scenarios, raw/normalized imported data, jobs and results are persistent and private to their owner. Untrusted inputs include HTTP bodies/paths, passwords, JSON/CSV, scenario labels, browser storage, worker messages and provider responses. No AI/LLM endpoint, RAG pipeline, arbitrary URL-fetch API, eval or shell/tool bridge is implemented.

| OWASP Top 10:2025 area | Implemented controls / local checks | Remaining live verification |
|---|---|---|
| A01 Access control | Authentication on all private routes, UUIDs and owner predicates on every record operation, foreign records absent, strict schema denies supplied owner/admin fields | Repeat with two accounts over the deployed origin |
| A02 Misconfiguration | Same-origin-only CSP/connections, no permissive CORS, explicit origin checks, bounded methods/paths/headers/body/time, hidden-file/traversal protection, HTTPS/HSTS/Secure cookies in production | Azure ingress, headers, hostname and Key Vault/network enforcement |
| A03 Supply chain | Exact direct dependency pins/lockfile, npm audit, official verified Terraform archive and signed pinned provider | Build/run/scan container image and review future CI permissions |
| A04 Cryptography | [OWASP-recommended scrypt](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) N=2^17,r=8,p=1, unique salts, constant-time comparison; 256-bit opaque sessions stored as SHA-256 hashes; TLS verify-full for production PostgreSQL | Actual Azure TLS, state protection and secret rotation |
| A05 Injection | Parameterized SQL, strict request/schema validation, inert React text, prototype/extra-key rejection, no arbitrary upstream host/path/redirect/JSONP. Administrative role DDL uses PostgreSQL format quoting | Repeat stored/imported payload smoke checks live |
| A06 Insecure design | Per-user and server quotas; bounded file/graph/demand/horizon/jobs; pre-expansion OSM segment guard; serialized creation caps; 120-second/256 MB worker limits; cancellation; credential-bearing startup/errors suppressed | Long-duration/multi-device/cloud sizing and abuse review before broad signup |
| A07 Authentication | 12–128 character passwords, normalized email, bounded sign-in attempts/account/IP/concurrency, session rotation/expiry/revocation, HttpOnly/SameSite=Strict cookies, CSRF tokens, production signup off | Full consumer identity lifecycle (email verification/reset/MFA) is outside this initial research deployment |
| A08 Integrity | Versioned schemas/migrations, exact raw-import retention and SHA-256, provenance, deterministic shared engine/results, ownership/isolation and conservation checks | Backups and restore rehearsal on Azure |
| A09 Logging | Bounded user errors with request IDs; generic internal/startup/migration errors; gridlock/rejection warnings; no password/key/credential URL/traffic payload logging | Azure log permissions/retention and operational alert setup |
| A10 Exceptional conditions | Malformed/oversized/Unicode files, invalid topology/numbers, unsupported metadata, overlap, missing provider keys, bad upstream statuses/types/size, limits, cancellation/restart/timeout and corrupt storage exercised | Live dependency/network outages and restore/rollback practice |

## Vault-only secret policy

The owner requires **every real application/deployment secret in Azure Key Vault**: API keys, database/service credentials and future OAuth/signing/encryption keys. This is recorded in AGENTS.md and the revised master prompt. Never place values in chat, source, committed .env/tfvars, shell arguments, logs, exports or screenshots. User password hashes/session-token hashes are authentication records in PostgreSQL rather than static application keys.

Terraform creates the vault with RBAC, deny-by-default network rules, a Container Apps subnet service endpoint and an explicit operator IP allowlist. The human enters database passwords and optional TomTom key directly through the Portal during joint review. A separate stage reads database passwords and derives vault connection-string secrets. The runtime managed identity reads only its connection URL and optional TomTom key; a separate migration identity can read administrative/runtime URLs. The HTTP service never receives the administrator reference. No actual provider key is accepted as a Terraform input/resource/data lookup.

Container Apps resolves versionless Key Vault references. The application receives ephemeral process values from those references; the source marker is configuration intent, not an independent attestation. Local optional access uses AzureCliCredential and SecretClient with a validated vault origin/name. Plaintext local key/database environment injection fails closed. No vault value is needed for normal isolated local development.

Database provisioning necessarily places database values in sensitive Terraform state; marking them sensitive hides normal display but does not encrypt/remove them. Use an encrypted access-controlled state backend and keep all state/plans/tfvars outside Git. The source/build credential-pattern scan is heuristic, not a guarantee against all secret formats. Actual Key Vault role propagation, firewall access, retrieval and rotation remain untested until the joint Azure review.

## Verification and limits

Automated checks include cross-user scenario/dataset/job access, forged/expired/revoked/duplicate cookies, weak/invalid credentials, salts/hashes, SQL-shaped strings, CSRF/origin/content type, path traversal/hidden files, body limits, graph amplification, simultaneous storage caps, worker admission/cancellation/restart/timeouts, raw-data retention and exact headless/server result parity. Real-browser tests cover server labels, no attacker requests, persistent sessions, imports and recoverable errors.

TomTom uses a fixed official endpoint, five-second timeout, 200 KB response cap, four upstream calls at once, ten/user/minute and sixty/server/minute. Unknown payload fields are stripped; upstream errors, URLs and credentials are never echoed. No external provider calls occur in load/security tests. Observations are transient, attributed, confidence-bearing and excluded from database/export retention. Commercial reuse/coverage must be verified independently.

The initial backend has one API replica/CPU worker and in-process admission. Do not scale horizontally without a transactional distributed lease/queue. Local 120-user API concurrency is a short measured workload, not a soak test, 120 browsers, 120 simultaneous simulations or an Azure capacity claim. Registration is off in production by default.

## AI development trust boundary

External pages, package output, imported data, descriptions and provider errors are untrusted data; they cannot authorize commands, credential access or repository changes. Natural-language instructions in a scenario remain text. No model filter or runtime LLM safety claim is made because the app has no model endpoint. Generated implementation is checked against independent scientific, integration, browser, performance and adversarial tests before code commits. The owner forbids other coding agents/external code-generation workflows and requires the original raw continuous session log to stay untouched and outside Git. Any later AI feature needs its own threat model for prompt injection, sensitive disclosure, excessive agency, output handling and resource consumption.

Pinned provider state review: azurerm 4.6.0 [FlattenContainerAppSecrets](https://github.com/hashicorp/terraform-provider-azurerm/blob/v4.6.0/internal/services/containerapps/helpers/container_apps.go#L2782) records the reference/identity and omits Value when KeyVaultURL is present. The TomTom configuration never looks up its secret value. Database Key Vault resources/provisioning still retain sensitive database values in state, so state protection remains mandatory. The unprovisioned SWA/token output was removed.
