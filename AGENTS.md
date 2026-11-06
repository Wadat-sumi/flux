# Flux project instructions

- All application/deployment secrets (provider API keys, database credentials, OAuth client secrets, signing/encryption keys and future service credentials) belong in **Azure Key Vault**. Use managed identities and Key Vault references. Local integrations must retrieve real secrets from the vault using authorized developer identity; do not ask for keys in chat or paste them into shell commands.
- Never commit real secret values, `.env` files, Terraform state/plans/tfvars, local database files or the raw session JSONL. Templates contain names/references only. Never print secrets or credential-bearing URLs in logs, errors, reports or screenshots. Terraform sensitive values can still occur in state; keep state protected and outside Git.
- User passwords are scrypt hashes and session bearer tokens are hashed in the application database; these authentication records are not static application keys to copy into Key Vault.
- Before checking in code, run positive/negative/edge unit tests, integration, performance, browser and penetration/security checks. Repeat the >100-user performance test after the complete backend/UI integration is operational; use at least 120 distinct authenticated users and publish the workload and measured limits.
- Preserve the single continuous session and original raw log. Do not use other coding agents, separate coding sessions or external code-generation workflows.
- Azure login/provisioning/deployment stays deferred to the owner's joint review. Do not apply Terraform, incur cloud costs or modify pre-existing resources before that review.
- Work only in https://github.com/Wadat-sumi/flux.git. The owner authorized incremental tested commits/pushes to main. Do not force-push or rewrite history.
- Keep real observations, provider estimates, synthetic fixtures and calibration claims distinct. Retain source, date, units, license and SHA-256. Never fabricate missing traffic counts or signal timings.
