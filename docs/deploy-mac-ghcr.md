# Deploy Flux from macOS: Terraform + Azure CLI + GHCR

Run these commands in the Antigravity terminal against **Wadat-sumi/flux**, on `main`. Your Mac needs Git, Azure CLI and Terraform 1.9–1.x. Container images are built on a manually started GitHub Actions Linux runner with Buildah and smoke-tested with Podman; no local Docker installation/daemon is needed. GHCR stores the OCI image; Azure Container Apps runs it.

Status: the owner’s first Azure apply reached the foundation and reported Network authorization and missing Container Apps subnet-delegation errors. Some resources are already provisioned; retain all protected state/checkpoints. The public application and end-to-end Azure integration are not yet verified. Azure resources, storage and GitHub runner/package usage may incur charges; agree the region, subscription and cost tier before the creation steps.

## Single-command guided deployment

From the Flux checkout on `main`, run:

```sh
bash scripts/deploy-azure.sh
```

The script targets **Central India (`centralindia`)** and runs on macOS Bash 3.2. Prerequisites: Git, Azure CLI, Terraform 1.9–1.x, Python 3 and curl. No local container tool is needed. Read-only local preflight is available with `bash scripts/deploy-azure.sh --check`.

The only infrastructure configuration you enter is the subscription ID. The script generates application/vault/state names, detects your public IPv4 over HTTPS, fixes the private GHCR token owner to Wadat-sumi, and uses Central India. It logs in through Azure CLI when needed, checks regional Container Apps/PostgreSQL SKU metadata, and guides Terraform state bootstrap → foundation → vault metadata readiness → verified GHCR digest → database → migration job/success → application → HTTPS health/frontend. Each saved plan is reviewed before typed approval. Deletions/replacements, foreign-resource updates, foreign existing resource groups, inherited credential/debug/CLI overrides, invalid configuration and mutable images are rejected. The deployment UUID tags its application resource group.

Terraform creates a new state resource group, StorageV2 account, private `tfstate` container and the signed-in operator’s Storage Blob Data Contributor role. Shared keys/anonymous access are disabled; HTTPS/TLS1.2, an exact detected-IP firewall rule, versioning and 30-day Blob/container soft delete are configured. The foundation also grants the operator Key Vault Secrets Officer on the new vault. Your Azure identity must be permitted to create resources and role assignments (for example, subscription Owner). No existing groups are adopted.

Browser tasks remain for entering secrets directly into Key Vault and running/verifying the manual GHCR workflow. The script opens the pages and waits; secret values never enter Bash. The GHCR read token must belong to Wadat-sumi. Copy only the non-secret immutable image digest after checking that the workflow passed for the commit shown by the script. Plan approvals, migration approval and this image verification remain interactive.

The small bootstrap Terraform module runs in `.flux-deploy/bootstrap` with protected local state because remote storage does not exist yet. Retain that directory in a protected backup; the script refuses to adopt an existing bootstrap group if its local state is missing. Bootstrap state contains infrastructure metadata and does not request account keys or vault values; all application state/plans, which can contain sensitive database values, use the newly created protected Blob backend. The bootstrap uses ARM management-plane storage resources to avoid the pinned AzureRM storage-account resource’s account-key read path. References: [pinned provider read implementation](https://github.com/hashicorp/terraform-provider-azurerm/blob/v4.6.0/internal/services/storage/storage_account_resource.go), [storage ARM schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.storage/2023-05-01/storageaccounts), [Entra-authenticated Terraform backend](https://developer.hashicorp.com/terraform/language/backend/azurerm).

Non-secret settings/checkpoints and sensitive private Terraform plans live in ignored `.flux-deploy/` with restrictive permissions. Do not commit/share that folder. Rerun the same command from the same commit to resume completed stages; it does not rerun a successful migration or downgrade enabled services. An interrupted/failed run can leave billable resources running for recovery. No automatic rollback/destroy is performed. A failed migration requires fixing the cause and explicitly clearing only its execution checkpoint to retry. After an unclean process kill, inspect a stale `.flux-deploy/lock` before removing it.

Provider registration prints each provider’s status and bounds each status/submission request to 45 seconds. Other providers can continue in `Registering` under Microsoft’s region-by-region guidance. **Microsoft.Network is a stricter gate after the observed DNS authorization failure:** it must reach `Registered` before DNS/VNet operations. The script shows elapsed progress and stops after roughly 10 minutes, retaining state for retry. Registered does not by itself establish that all RBAC/service authorization has propagated; if the same authorization error persists, refresh Azure CLI login and verify subscription/VNet permissions before retrying.

If an older script is silently waiting at provider registration, stop that process with Ctrl+C before pulling the update. A checkpoint with phase 0, no completed bootstrap, no bootstrap state and both resource groups confirmed absent can upgrade to the new commit automatically while preserving its names/identity. Any checkpoint with infrastructure must still resume its original commit; no state is discarded.

The script is locally tested with mocked cloud tools and plan/configuration fixtures. The owner has executed a partial foundation deployment; this recovery patch still requires the next live Azure apply for verification. Production signup and TomTom stay disabled. The detailed manual alternative below remains available for review and recovery; do not mix its manually created state store with the automated bootstrap. An unprovisioned configuration from the previous script is upgraded automatically only after both saved resource groups are confirmed absent. Progressed deployments must resume their original commit. Keep your public egress IPv4 stable during deployment; if detection fails, the script stops before provisioning.

## Recover the failed foundation network apply

For the reported `NotAuthorized` DNS link and `ManagedEnvironmentSubnetDelegationError`, update the checkout and run the explicit recovery mode:

```sh
git pull --ff-only origin main && bash scripts/deploy-azure.sh --repair-network
```

The Container Apps subnet now delegates to `Microsoft.App/environments`; the PostgreSQL subnet keeps its separate delegation. The environment depends on that subnet update. Recovery is restricted to phase 0 with completed bootstrap, retained bootstrap state, no image/migration checkpoint, ancestor source revision, both resource groups carrying the saved deployment UUID and the protected application state carrying the same resource-group anchor. Normal progressed deployments remain pinned to their original commit.

Recovery metadata uses authenticated, read-only `az rest --method get` calls to the exact ARM resource IDs and pinned API versions. Missing-resource responses (`NotFound`, `ResourceNotFound`, `ParentResourceNotFound`) proceed to a reviewed create plan. Authorization, registration/API, CLI and unknown errors stop and print only the fixed resource address, an allowlisted error code and CLI exit number; raw response/error text and credential-bearing URLs are never printed. A generic earlier inspection failure does not establish that permissions are missing. [Azure CLI REST authentication](https://learn.microsoft.com/en-us/cli/azure/use-azure-cli-rest-command).

A private `.flux-deploy/network-repair` copy uses the **same protected remote application state**. Only the exact configured DNS link and environment are inspected. If an object from the failed creation exists outside Terraform state, its ID, terminal provisioning state and VNet/subnet reference must match before an import block is prepared. Imports and ownership-tag updates appear in the saved foundation plan; no import or cloud change happens until plan approval. The tag updates retry failed resources in place. Deletions/replacements, foreign resources and still-changing objects are rejected. No `state rm`, standalone import, destroy, reset or forced replacement is used. A successful foundation apply atomically advances the phase and source revision; failure/decline keeps the old checkpoint.

If foundation recovery completes and a later stage is interrupted, resume with ordinary `bash scripts/deploy-azure.sh`; the recovery flag is restricted to the failed foundation. If Network remains unauthorized after `Registered`, refresh identity with `az login --output none`, confirm the correct subscription and VNet permissions, then rerun the recovery command while phase 0 remains. A plan requesting replacement or metadata that cannot be matched needs review; do not delete resources or state to bypass it. This recovery path is tested locally with fake cloud tools; the owner’s next live apply must verify it against Azure.

## 1. Update and select the Azure subscription

```sh
cd /Users/shivarshi/Desktop/Projects/flux
git status --short
git pull --ff-only origin main
az version
terraform version
az login
az account list --query '[].{Name:name,Subscription:id}' --output table
az account set --subscription '<YOUR-SUBSCRIPTION-ID>'
export ARM_SUBSCRIPTION_ID="$(az account show --query id --output tsv)"
az account show --query '{Name:name,Subscription:id}' --output table
```

Keep any existing local edits; resolve them before pulling rather than resetting them. Subscription IDs/names are configuration, not secret keys. Do not print access tokens or run `az account get-access-token` into logs.

Verify/register the required providers for this subscription with its administrator: `Microsoft.App`, `Microsoft.DBforPostgreSQL`, `Microsoft.Network`, `Microsoft.ManagedIdentity`, `Microsoft.OperationalInsights`, `Microsoft.KeyVault` and `Microsoft.Storage`. Terraform's automatic registration is disabled. Registration is a subscription change; perform it during the joint review. Check region/SKU availability and permissions to create role assignments.

## 2. Create protected remote state

In the Azure Portal, create a **new**, dedicated `flux-` resource group for state, a globally unique lowercase Storage account, and a private Blob container named `tfstate`. Use TLS 1.2+, HTTPS only, anonymous Blob access disabled, shared-key access disabled, encryption, Blob versioning and soft delete. Grant your signed-in operator **Storage Blob Data Contributor** at the storage-account/container scope; management-plane Contributor alone does not grant Blob data access. Allow your approved client network, and wait for RBAC propagation. Keep this state store separate from the application resource group.

Set the three non-secret names in your terminal, substituting the names you created:

```sh
export FLUX_STATE_RG='flux-state-rg'
export FLUX_STATE_ACCOUNT='<YOUR-LOWERCASE-STORAGE-ACCOUNT>'
export FLUX_STATE_CONTAINER='tfstate'

cd /Users/shivarshi/Desktop/Projects/flux/infra/terraform
terraform init \
  -backend-config="resource_group_name=$FLUX_STATE_RG" \
  -backend-config="storage_account_name=$FLUX_STATE_ACCOUNT" \
  -backend-config="container_name=$FLUX_STATE_CONTAINER" \
  -backend-config='key=flux/staging.tfstate' \
  -backend-config='use_azuread_auth=true' \
  -backend-config='use_cli=true'
terraform fmt -check -recursive
terraform validate
terraform test
```

The tests use a mock provider and never contact Azure. Normal plan/apply uses your Azure identity and the protected Blob backend. Do not supply a storage key or SAS token. Terraform state/plans can contain database credentials despite `sensitive` labels; never commit or share them. [HashiCorp backend reference](https://developer.hashicorp.com/terraform/language/backend/azurerm).

## 3. Review the foundation plan

Create an ignored local configuration:

```sh
cp terraform.tfvars.example terraform.tfvars
open -e terraform.tfvars
```

Edit only non-secret settings:

```hcl
subscription_id            = "<YOUR-SUBSCRIPTION-ID>"
location                   = "centralindia"
resource_group_name        = "flux-staging-rg"
app_name                   = "flux-staging"
backend_key_vault_name     = "<YOUR-UNIQUE-FLUX-VAULT-NAME>"
enable_backend             = true
provision_backend_database = false
deploy_backend_app         = false
backend_image              = null
ghcr_private_image         = true
ghcr_username              = "Wadat-sumi"
ghcr_token_secret_name     = "ghcr-read-token"
enable_tomtom              = false
key_vault_admin_ip_rules   = ["<YOUR-PUBLIC-IP>/32"]
```

Replace the example region after checking support/costs. Current accepted values are `centralindia`, `westeurope`, `eastasia`, `centralus`, `eastus2`, `westus2`. Replace all angle-bracket placeholders. `app_name`, resource group and vault must be new; vault names must follow the validated `flux-` prefix. `ghcr_username` is the owner of the pull token, not necessarily the package owner. Find your client IPv4 in the Portal networking panel and allow that exact /32.

Confirm the dedicated application group does **not** already exist:

```sh
az group exists --name flux-staging-rg
```

Expected result: `false`. Stop if it is `true`; choose a fresh group rather than adopting existing resources. Then:

```sh
terraform plan -out=foundation.tfplan
```

Review every proposed resource, region, role and SKU. It must show new Flux resources with **no replacements/deletions or changes to existing resources**. This stage creates the application group, VNet/subnets, DNS, Key Vault, identities, logs and Container Apps environment. It creates no registry/database/app. After the joint cost/plan review, run:

```sh
terraform apply foundation.tfplan
```

Do not use `-auto-approve` or apply a saved plan after changing its configuration. If names are unavailable, stop and re-plan with fresh names.

## 4. Enter secrets directly into Key Vault

In the Portal, an authorized administrator grants your operator **Key Vault Secrets Officer** scoped to this project's vault. The vault firewall must allow your client /32. Enter:

| Secret name | Value entered in Portal |
|---|---|
| `database-admin-password` | Random 24+ character database administration password |
| `database-app-password` | A different random 24+ character application-role password |
| `ghcr-read-token` | GitHub classic PAT with `read:packages` and access to the Flux package |
| `tomtom-api-key` | Optional entitled provider key; keep TomTom disabled until ready |

Create the read-only GitHub PAT in GitHub's token UI, use an appropriate expiry, authorize required SSO and grant that identity read access to the Flux package. Transfer it directly to the vault through the Portal. Do not put it in chat, terminal commands, `.env`, Terraform variables or GitHub repository secrets. [GitHub's registry authentication guidance](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

GitHub Actions publication uses its automatically minted, short-lived job token. There is no long-lived publishing key to configure or copy. The separate Azure pull PAT is stored only in Key Vault. Azure managed identities read that vault reference; they do not directly authenticate to GHCR. Public images can use `ghcr_private_image=false` without a pull token, but package visibility must be an explicit owner decision.

## 5. Build and publish the image from GitHub

In `https://github.com/Wadat-sumi/flux/actions`, select **Verify and publish Flux OCI image → Run workflow → main**. First leave **publish** unchecked for a build/smoke check. Then run with **publish** checked when ready to publish.

The workflow runs the complete app/browser/security/performance gate, including 120 authenticated users, then builds a Linux amd64 OCI image using `Containerfile`. Podman checks non-root startup, a read-only filesystem, frontend and `/api/health` with disposable local persistence. That smoke test does not verify production PostgreSQL or Key Vault networking. It never logs in to/deploys Azure. Failed checks block publication; runner performance must meet the declared thresholds without silently lowering them.

After success, copy the **Verified image** value from the Actions summary:

```text
ghcr.io/wadat-sumi/flux@sha256:<ACTUAL-64-HEX-DIGEST>
```

Use the actual workflow digest, never `latest` or the placeholder. Verify package visibility/read access in GitHub Packages. The Node base is an official Node OCI image mirrored in public ECR; Flux's output registry is GHCR. Buildah/Podman use no Docker daemon. The workflow has a manual trigger only, so pulling/pushing this code does not automatically build, publish or provision anything.

## 6. Provision PostgreSQL

Set `provision_backend_database=true` in `terraform.tfvars`, keeping `backend_image=null` and `deploy_backend_app=false`:

```sh
terraform plan -out=database.tfplan
```

Review that this adds the private database and vault connection references. After review:

```sh
terraform apply database.tfplan
```

Do not display the connection-string secrets. The runtime role and schema are initialized by the next migration stage.

## 7. Create and run the migration job

Set `backend_image` to the actual GHCR digest. Keep `deploy_backend_app=false`.

```sh
terraform plan -out=migration.tfplan
```

Review the job, image digest, secret-scoped identity grants and GHCR vault reference; then:

```sh
terraform apply migration.tfplan
az containerapp job start --resource-group flux-staging-rg --name flux-staging-migrate
az containerapp job execution list \
  --resource-group flux-staging-rg --name flux-staging-migrate \
  --query '[].{Name:name,Status:properties.status}' --output table
```

Wait for the execution to report **Succeeded** before enabling the app. A created job is not proof that migrations ran. If Key Vault sync, GHCR pull, private DNS or database access fails, stop and diagnose the specific boundary. Verify identity/RBAC propagation and the approved network route; do not open the database publicly or weaken the vault firewall to hide a failure. [Microsoft secret-reference guidance](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets), [deployment diagnostics](https://learn.microsoft.com/en-us/azure/container-apps/troubleshoot-deployment-errors).

## 8. Deploy the application and verify

After successful migration, set `deploy_backend_app=true`, keeping the same digest:

```sh
terraform plan -out=application.tfplan
```

Review, then:

```sh
terraform apply application.tfplan
export FLUX_DEPLOYED_URL="$(terraform output -raw backend_url)"
curl --fail --silent --show-error "$FLUX_DEPLOYED_URL/api/health"
open "$FLUX_DEPLOYED_URL"
```

The URL is non-secret. Verify frontend/assets/worker, session cookies, owner isolation, persistence, import provenance, server jobs/cancellation/results and HTTPS security headers. Production signup defaults off: during the joint review, explicitly enable `backend_allow_registration=true` only for the agreed owner signup window, then disable it and re-plan/apply. Do not leave registration public without reviewing abuse/cost controls. Run one authorized TomTom check only after enabling its entitled vault key. Measure the deployed tier separately before claiming cloud capacity.

Keep the single-replica/worker configuration; multiple replicas require a distributed queue/lease design. Traffic-model calibration remains separate from deployment. No destroy command is included: do not delete or import existing resources, and preserve protected state and backups.
