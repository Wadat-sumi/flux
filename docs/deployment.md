# Flux deployment

Status: **not deployed**. The owner deferred Azure login and deployment to a joint review on 6 November 2026. Azure CLI is absent and no Azure credential variables were found during preflight. No subscription authentication, plan or apply has occurred. No other provider has been substituted.

Flux is a built static Vite/React SPA ready for Azure Static Web Apps, using `base: '/'`, module workers and transferable buffers. There are no deployed server components. `public/staticwebapp.config.json` is copied to `dist/` by Vite and provides navigation fallback, MIME types and security headers. The approved Layered City UI and real browser worker round trip are implemented and tested. Azure deployment awaits the joint authentication review.

## Provisioning

Terraform 1.9.8 was downloaded from the official HashiCorp release host into the ignored `.tools/` directory and verified against the published SHA-256 manifest. The provider is pinned to azurerm 4.6.0. This is a deliberate known-version pin, not a claim to use the latest release. Provider auto-registration is disabled to avoid subscription-wide mutations; `Microsoft.Web` must already be registered by the subscription owner.

Authenticate locally using Azure CLI (`az login`, then `az account show`) or a least-privilege service principal through `ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`, `ARM_TENANT_ID`, `ARM_SUBSCRIPTION_ID`. Do not paste secrets into chat or Git. Select the intended subscription explicitly. The provider's subscription ID comes from `subscription_id` or `ARM_SUBSCRIPTION_ID`.

From `infra/terraform/`:

```sh
terraform init
terraform fmt -check
terraform validate
terraform plan -out=flux.tfplan
terraform apply flux.tfplan
terraform output -raw url
```

Run plan/apply only after verified authentication. Inspect the plan: it must create only the new Flux resource group and its Static Web App. Check that the resource group name does not already exist. Never import, modify or destroy existing resources. Free is the default SKU; do not select Standard without the owner's cost decision. No `-auto-approve` is necessary.

West Europe is used in Microsoft's [official serverless lab](https://github.com/microsoft/hands-on-lab-serverless/blob/main/docs/workshop.md) and the [pinned provider example](https://registry.terraform.io/providers/hashicorp/azurerm/4.6.0/docs/resources/static_web_app), checked during this session. The presumed Microsoft Learn Terraform quickstart URL could not be fetched and is not relied on as evidence. Static assets are globally distributed; see [Azure's region explanation](https://learn.microsoft.com/en-us/azure/static-web-apps/faq#how-do-i-ensure-my-app-is-deployed-to-a-specific-azure-region).

Local Terraform state contains the deployment token even though the output is sensitive. State, variable files, plans and crash logs are ignored. Use a protected Azure Storage backend for production, with state locking and access control. Only the provider lock file belongs in Git.

## Deploy application

After UI implementation and verification:

```sh
npm ci
npm run check
npm run build
```

Use the official Azure Static Web Apps CLI, keeping the token in an environment variable rather than a shell argument or committed file, as supported by the [official CLI reference](https://learn.microsoft.com/en-us/azure/static-web-apps/static-web-apps-cli):

```sh
SWA_CLI_DEPLOYMENT_TOKEN="$(terraform -chdir=infra/terraform output -raw deployment_token)" npx @azure/static-web-apps-cli deploy dist --env production
```

Do not enable shell tracing. Alternatively use an Azure Static Web Apps GitHub Actions deployment with its token stored only in a GitHub Actions secret. Verify the public URL, worker asset MIME type and ping/pong, SPA fallback, three presets and final commit SHA. Compare the deployed hostname to Terraform's output.

## Teardown

Only for the resources created by this project, inspect `terraform plan -destroy`, then run `terraform destroy` interactively. Never target pre-existing resources. No teardown has been run.

## Verification record

- Terraform 1.9.8, `init -backend=false -input=false`: passed; signed azurerm 4.6.0 installed and lockfile generated.
- `terraform fmt -check`: passed.
- `terraform validate`: passed ("The configuration is valid").
- Azure authentication: unavailable.
- Plan/apply: not run, authentication prerequisite unmet.
- Skeleton/final URL: unavailable.
- Full application production build: passed. Browser tests serve dist/ on a local QA host with the declared headers; SPA fallback, JavaScript MIME type, CSP execution blocking and hidden-file/method boundaries pass locally. These results must be repeated against the real Azure URL after deployment.

## Joint review on 6 November

1. Verify Azure CLI login and the intended subscription without printing tokens.
2. Verify Microsoft.Web registration and that the dedicated Flux resource group does not exist.
3. Run init/fmt/validate, review a create-only plan, then apply only those new Flux resources.
4. Build and deploy dist/ using the sensitive token in an environment variable; record only the public hostname/URL.
5. Verify live HTTPS, worker startup, three presets, ramp behavior, imported scenarios, paired results and actual response headers. Check the URL against Terraform outputs.
6. Record results, run the required tests/security scan before the final commit, push and verify the remote SHA and clean tree. Leave the raw continuous session log outside Git.
