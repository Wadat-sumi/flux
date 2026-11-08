#!/usr/bin/env bash
# macOS Bash 3.2 compatible. One guided command; secrets are entered only in Key Vault.
set +x
set -euo pipefail
umask 077
unset TF_LOG TF_LOG_PATH
for auth_var in ARM_CLIENT_SECRET ARM_CLIENT_CERTIFICATE_PASSWORD ARM_ACCESS_KEY ARM_SAS_TOKEN TF_CLI_ARGS TF_CLI_ARGS_plan TF_CLI_ARGS_apply TF_CLI_ARGS_init; do
  if declare -p "$auth_var" >/dev/null 2>&1 && [ -n "${!auth_var}" ]; then
    printf 'Start a clean terminal without %s; deployment uses reviewed arguments and Azure CLI identity.\n' "$auth_var" >&2
    exit 1
  fi
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WORK="$ROOT/.flux-deploy"
CONFIG="$WORK/config.json"
TF="$ROOT/infra/terraform"
BOOT="$WORK/bootstrap"
REPO='https://github.com/Wadat-sumi/flux'
REGION='centralindia'
REPAIR_NETWORK=false
PLAN_NETWORK=false

fail() { printf '\nStopped: %s\n' "$*" >&2; exit 1; }
ask() {
  printf '%s' "$1" >&2
  IFS= read -r REPLY || fail 'Input ended. Run the same command to resume.'
}
confirm() {
  ask "$1 Type $2 to continue: "
  [ "$REPLY" = "$2" ] || fail 'No changes approved. Run the same command when ready.'
}
browser() { if command -v open >/dev/null 2>&1; then open "$1"; else printf 'Open: %s\n' "$1"; fi; }
cfg() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2],""))' "$CONFIG" "$1"; }
save() {
  python3 -c 'import json,os,sys; p,k,v=sys.argv[1:]; d=json.load(open(p)); d[k]=(v=="true") if k=="bootstrap_complete" else v; t=p+".tmp"; open(t,"w").write(json.dumps(d,indent=2)+"\n"); os.chmod(t,0o600); os.replace(t,p)' "$CONFIG" "$1" "$2"
}
validate_config() {
  python3 - "$1" <<'PY'
import ipaddress,json,re,sys,uuid
try:
 d=json.load(open(sys.argv[1])); allowed={'deployment_id','subscription','app','group','vault','state_group','state_account','operator_ip','ghcr_user','image','phase','execution','revision','schema','bootstrap_complete'}
 if set(d)-allowed: raise ValueError('Unexpected configuration fields; never add secret values.')
 if d.get('schema')!=2 or not isinstance(d.get('bootstrap_complete'),bool): raise ValueError('Invalid deployment schema/checkpoint.')
 patterns={'deployment_id':r'[a-f0-9-]{36}','subscription':r'[a-fA-F0-9-]{36}','app':r'flux-[a-z0-9][a-z0-9-]{0,17}[a-z0-9]','group':r'flux-[a-zA-Z0-9_-]{2,70}','vault':r'flux-[a-z0-9-]{3,19}','state_group':r'flux-[a-zA-Z0-9_-]{2,70}','state_account':r'flux[a-z0-9]{3,20}','ghcr_user':r'[A-Za-z0-9][A-Za-z0-9-]{0,38}','revision':r'[a-f0-9]{40}'}
 for key,pattern in patterns.items():
  if not re.fullmatch(pattern,str(d.get(key,''))): raise ValueError('Invalid '+key)
 for key in ['deployment_id','subscription']: uuid.UUID(d[key])
 if '--' in d['app'] or d['group']==d['state_group']: raise ValueError('Use valid separate application/state resource groups.')
 network=ipaddress.ip_network(d['operator_ip'],strict=True)
 if network.version!=4 or network.prefixlen!=32 or not network.network_address.is_global: raise ValueError('operator_ip must be your public IPv4 /32.')
 if str(d.get('phase','')) not in ['0','1','2','3','4']: raise ValueError('Invalid checkpoint phase.')
 if d.get('image') and not re.fullmatch(r'ghcr\.io/wadat-sumi/flux@sha256:[a-f0-9]{64}',d['image']): raise ValueError('Use the immutable Flux GHCR digest.')
 if int(d['phase'])>=3 and not d.get('image'): raise ValueError('A deployed job requires its image checkpoint.')
 if int(d['phase'])>0 and not d['bootstrap_complete']: raise ValueError('Application requires completed state bootstrap.')
 if int(d['phase'])>=4 and not d.get('execution'): raise ValueError('A deployed app requires its migration execution checkpoint.')
 if d.get('execution') and not re.fullmatch(r'[A-Za-z0-9-]{1,100}',d['execution']): raise ValueError('Invalid migration execution name.')
except (ValueError,KeyError,OSError,TypeError):
 print('Configuration rejected. Check metadata fields, names, UUIDs, public IPv4 /32 and the immutable image. Secret values are not accepted.',file=sys.stderr); sys.exit(1)
PY
}
audit_plan() {
  # JSON may contain sensitive values: stream it to this filter; never print or save it.
  python3 -c '
import json,sys
c=json.load(open(sys.argv[1])); p=json.load(sys.stdin)
group=c["state_group"] if sys.argv[2]=="bootstrap" else c["group"]
prefix=("/subscriptions/"+c["subscription"]+"/resourceGroups/"+group).lower()
vault="https://"+c["vault"]+".vault.azure.net/secrets/"
counts={}
for r in p.get("resource_changes",[]):
 if r.get("mode")=="data": continue
 change=r.get("change",{}); actions=change.get("actions",[])
 if actions not in [["no-op"],["create"],["update"]]: sys.exit("Plan rejected: deletion, replacement or unknown actions are not allowed.")
 old=change.get("before") or {}; identity=old.get("id","").lower()
 if identity and not (identity==prefix or identity.startswith(prefix+"/") or (sys.argv[2]!="bootstrap" and identity.startswith(vault))):
  sys.exit("Plan rejected: an existing resource is outside this deployment scope.")
 for action in actions: counts[action]=counts.get(action,0)+1
print("Plan action counts (no values): "+json.dumps(counts,sort_keys=True))
' "$CONFIG" "${1:-application}"
}

detect_ip() {
  for endpoint in https://api.ipify.org https://checkip.amazonaws.com; do
    candidate="$(curl -4 --fail --silent --max-time 10 --proto '=https' --tlsv1.2 "$endpoint" || true)"
    if OPERATOR_IP="$(python3 -c 'import ipaddress,sys
try:
 a=ipaddress.ip_address(sys.argv[1].strip()); assert a.version==4 and a.is_global; print(str(a)+"/32")
except (ValueError,AssertionError): sys.exit(1)' "$candidate")"; then return; fi
  done
  fail 'Could not detect a public IPv4. Check your connection/VPN and rerun; no manual network values are needed.'
}

create_config() {
  detect_ip
  python3 - "$CONFIG" "$SUB" "$OPERATOR_IP" "$(git rev-parse HEAD)" <<'PY'
import json,sys,uuid
p,sub,ip,rev=sys.argv[1:]; uuid.UUID(sub)
deployment=str(uuid.uuid4()); suffix=deployment.replace('-','')[:10]; app='flux-staging-'+suffix
d=dict(schema=2,bootstrap_complete=False,deployment_id=deployment,subscription=sub,app=app,group=app+'-rg',vault='flux-vault-'+suffix,state_group='flux-state-'+suffix+'-rg',state_account='fluxstate'+suffix,operator_ip=ip,ghcr_user='Wadat-sumi',revision=rev,phase='0',image='',execution='')
open(p,'w').write(json.dumps(d,indent=2)+'\n')
PY
}

provider_cli() {
  # Avoid an unbounded Azure CLI --wait and never expose CLI/debug payloads.
  python3 - "$1" "$2" "${3:-45}" <<'PY'
import subprocess,sys
action,namespace,limit=sys.argv[1:]; limit=max(1,min(45,int(limit)))
args=['az','provider',action,'--namespace',namespace,'--only-show-errors']
args+=['--query','registrationState','--output','tsv'] if action=='show' else ['--output','none']
try: result=subprocess.run(args,capture_output=True,text=True,timeout=limit)
except subprocess.TimeoutExpired: sys.exit('Azure provider request timed out. Check connectivity and rerun; registration may continue in Azure.')
if result.returncode: sys.exit('Azure provider request failed. Check Azure CLI login, subscription permissions and connectivity, then rerun.')
if action=='show':
 status=result.stdout.strip()
 if status not in ['Registered','Registering','NotRegistered','Unregistering']: sys.exit('Azure returned an unexpected provider registration state. Check provider status in the Portal.')
 print(status)
PY
}

wait_network_registration() {
  started="$(date +%s)"
  while [ "$status" = Registering ]; do
    elapsed=$(( $(date +%s) - started ))
    [ "$elapsed" -lt 600 ] || fail 'Microsoft.Network is still registering after 10 minutes. Wait for Azure to finish, then rerun the same command; state is retained.'
    printf 'Microsoft.Network: Registering (%ss elapsed); waiting for authorization before DNS/VNet operations.\n' "$elapsed"
    sleep 5
    remaining=$(( 600 - $(date +%s) + started ))
    [ "$remaining" -gt 0 ] || fail 'Microsoft.Network registration wait reached 10 minutes. Rerun after Azure finishes; state is retained.'
    [ "$remaining" -le 45 ] || remaining=45
    status="$(provider_cli show Microsoft.Network "$remaining")"
  done
  [ "$status" = Registered ] || fail 'Microsoft.Network did not become Registered. Check provider registration, Azure login and subscription permissions before retrying.'
}

case "${1:-}" in
  --help|-h)
    printf 'Usage: bash scripts/deploy-azure.sh [--check | --diagnose-network | --plan-network-repair | --repair-network | --check-config FILE | --audit-plan FILE]\nRun without flags for guided Central India deployment. --diagnose-network reads registration/permission metadata only. --plan-network-repair saves an owned foundation recovery plan without login, registration or apply; local edits are allowed for review. --repair-network reviews and applies recovery of an owned failed foundation. --audit-plan reads Terraform JSON from stdin.\n'
    exit 0 ;;
  --check-config) validate_config "${2:?Configuration path required}"; exit 0 ;;
  --audit-plan) CONFIG="${2:?Configuration path required}"; validate_config "$CONFIG"; audit_plan; exit 0 ;;
  --diagnose-network) validate_config "$CONFIG"; command -v az >/dev/null 2>&1 || fail 'Azure CLI is required for read-only diagnostics.'; python3 "$ROOT/scripts/prepare-network-repair.py" diagnose "$CONFIG" -; exit 0 ;;
  --plan-network-repair) REPAIR_NETWORK=true; PLAN_NETWORK=true ;;
  --repair-network) REPAIR_NETWORK=true ;;
  ''|--check) ;;
  *) fail 'Unknown argument; use --help.' ;;
esac

for tool in git az terraform python3 curl; do command -v "$tool" >/dev/null 2>&1 || fail "Install $tool first; no container tool is needed on this Mac."; done
cd "$ROOT"
case "$(git remote get-url origin)" in
  https://github.com/Wadat-sumi/flux|https://github.com/Wadat-sumi/flux.git|git@github.com:Wadat-sumi/flux.git) ;;
  *) fail 'Run only in the authorized Wadat-sumi/flux checkout.' ;;
esac
[ "$(git branch --show-current)" = main ] || fail 'Use the main branch.'
terraform version -json | python3 -c 'import json,sys; v=json.load(sys.stdin)["terraform_version"]; p=tuple(int(x) for x in v.split("-")[0].split(".")); sys.exit(0 if (1,9,0)<=p<(2,0,0) else "Terraform 1.9–1.x is required.")'
az version --output none
if [ "${1:-}" = --check ]; then printf 'Local prerequisites pass. Target: Central India (centralindia). No login or cloud changes performed.\n'; exit 0; fi
[ "$PLAN_NETWORK" = true ] || [ -z "$(git status --porcelain)" ] || fail 'Keep local edits safe; commit/stash them before deployment. Use --plan-network-repair to review a failed foundation with local fixes before committing.'
[ ! -L "$WORK" ] || fail 'The deployment directory must not be a symlink.'
mkdir -p "$WORK"
chmod 700 "$WORK"
mkdir "$WORK/lock" 2>/dev/null || fail 'Another deployment or a stale lock exists in .flux-deploy/lock; inspect it before retrying.'
trap 'rmdir "$WORK/lock" 2>/dev/null || true' EXIT
trap 'printf "\nInterrupted. Resources may still be running; rerun the same command to resume.\n" >&2; exit 130' INT TERM

if [ "$PLAN_NETWORK" = true ]; then
  [ -f "$CONFIG" ] || fail 'A retained failed-foundation checkpoint is required for a recovery plan.'
  validate_config "$CONFIG"
  [ "$(az account show --query id --output tsv 2>/dev/null)" = "$(cfg subscription)" ] || fail 'Recovery planning requires an existing Azure CLI login in the saved subscription. No login or account change was attempted.'
elif ! az account show --output none >/dev/null 2>&1; then az login --output none; fi
if [ -f "$CONFIG" ] && [ "$(cfg schema)" != 2 ]; then
  # The previous prompt-only version may have saved an unprovisioned config.
  # Never discard a checkpoint or adopt manually created resources.
  [ "$(cfg phase)" = 0 ] || fail 'An older deployment already progressed. Resume its original commit for review; no state will be discarded.'
  SUB="$(cfg subscription)"
  python3 -c 'import sys,uuid; uuid.UUID(sys.argv[1])' "$SUB" || fail 'Invalid saved subscription ID.'
  az account set --subscription "$SUB"
  for key in group state_group; do
    old_group="$(cfg "$key")"
    [ -n "$old_group" ] || fail 'The older configuration is incomplete; retain it for review.'
    [ "$(az group exists --name "$old_group" --output tsv | tr '[:upper:]' '[:lower:]')" = false ] || fail 'Older resources exist. Keep the previous checkpoint/state and resume its original commit; nothing will be adopted.'
  done
  mv "$CONFIG" "$WORK/config.previous.$(date +%s).json"
  create_config
elif [ ! -f "$CONFIG" ]; then
  printf '\nFlux deployment: Central India, GHCR, private PostgreSQL and Key Vault. Azure/GitHub usage can incur charges.\n'
  az account list --query '[].{Name:name,Subscription:id}' --output table
  ask 'Azure subscription ID: '; SUB="$REPLY"
  python3 -c 'import sys,uuid
try: uuid.UUID(sys.argv[1])
except ValueError: sys.exit("Enter a valid Azure subscription UUID.")' "$SUB"
  create_config
fi
validate_config "$CONFIG"
SUB="$(cfg subscription)"; APP="$(cfg app)"; GROUP="$(cfg group)"; VAULT="$(cfg vault)"
STATE_GROUP="$(cfg state_group)"; STATE_ACCOUNT="$(cfg state_account)"; DEPLOY_ID="$(cfg deployment_id)"
OPERATOR_IP="$(cfg operator_ip)"; PHASE="$(cfg phase)"
[ "$PLAN_NETWORK" = true ] || az account set --subscription "$SUB"
export ARM_SUBSCRIPTION_ID="$SUB" ARM_USE_CLI=true
if [ "$REPAIR_NETWORK" = true ]; then
  [ "$PHASE" = 0 ] && [ "$(cfg bootstrap_complete)" = True ] && [ -s "$BOOT/terraform.tfstate" ] && [ -z "$(cfg image)" ] && [ -z "$(cfg execution)" ] || fail 'Network repair is restricted to a failed foundation with retained bootstrap state and no database/image/application stage.'
  git merge-base --is-ancestor "$(cfg revision)" HEAD || fail 'The saved deployment commit is not an ancestor of this checkout.'
  for group in "$GROUP" "$STATE_GROUP"; do
    [ "$(az group show --name "$group" --query tags.fluxDeploymentId --output tsv)" = "$DEPLOY_ID" ] || fail 'Network repair requires both resource groups to belong to this deployment.'
  done
  TF="$WORK/network-repair"
  [ ! -L "$TF" ] || fail 'The recovery working directory must not be a symlink.'
  mkdir -p "$TF/tests"
  cp "$ROOT"/infra/terraform/*.tf "$ROOT/infra/terraform/.terraform.lock.hcl" "$TF/"
  cp "$ROOT"/infra/terraform/tests/*.tftest.hcl "$TF/tests/"
  rm -f "$TF/network-recovery.import.tf"
  printf 'Preparing a reviewed network repair. Existing state and resource names are retained; no deletion/replacement is permitted.\n'
elif [ "$(cfg revision)" != "$(git rev-parse HEAD)" ]; then
  # A provider-registration interruption precedes any Terraform resources. Allow
  # a script fix only after proving that this checkpoint has no infrastructure.
  [ "$PHASE" = 0 ] && [ "$(cfg bootstrap_complete)" = False ] && [ ! -e "$BOOT/terraform.tfstate" ] && [ ! -e "$BOOT/terraform.tfstate.backup" ] || fail 'The checkout changed after infrastructure work began. For a failed phase-0 foundation, use --plan-network-repair, then --repair-network after review. Otherwise resume its original commit; no checkpoint will be discarded.'
  for group in "$GROUP" "$STATE_GROUP"; do
    [ "$(az group exists --name "$group" --output tsv | tr '[:upper:]' '[:lower:]')" = false ] || fail 'The checkout changed and resources already exist. Resume its original commit; nothing will be adopted or discarded.'
  done
  save revision "$(git rev-parse HEAD)"
  save image ''
  save execution ''
  printf 'Updated the unprovisioned checkpoint to this commit; resource names and deployment identity are preserved.\n'
fi
printf '\nSubscription: %s\nRegion: %s\nApplication: %s\nResource group: %s\n' "$SUB" "$REGION" "$APP" "$GROUP"
printf 'Generated state group: %s\nGenerated state account: %s\nDetected operator: %s\nGHCR token owner: Wadat-sumi\n' "$STATE_GROUP" "$STATE_ACCOUNT" "$OPERATOR_IP"

# Verify provider registrations; the owner reviews any required subscription change.
for provider in Microsoft.App Microsoft.DBforPostgreSQL Microsoft.Network Microsoft.ManagedIdentity Microsoft.OperationalInsights Microsoft.KeyVault Microsoft.Storage; do
  printf 'Checking %s registration...\n' "$provider"
  status="$(provider_cli show "$provider")"
  if [ "$status" = NotRegistered ]; then
    [ "$PLAN_NETWORK" = false ] || fail 'A required provider is not registered. Plan-only recovery never registers providers; review registration separately.'
    confirm "Register $provider in this subscription?" REGISTER
    printf 'Submitting %s registration (request timeout: 45 seconds)...\n' "$provider"
    provider_cli register "$provider"
    status="$(provider_cli show "$provider")"
  fi
  if [ "$provider" = Microsoft.Network ] && [ "$status" = Registering ]; then wait_network_registration; fi
  case "$status" in
    Registered) printf '%s: Registered.\n' "$provider" ;;
    Registering) printf '%s: Registering; continuing without waiting for all Azure regions.\n' "$provider" ;;
    Unregistering) fail "$provider is unregistering. Wait for that operation to finish before retrying." ;;
    *) fail "$provider registration is not ready. Check its status and rerun; no resources will be provisioned yet." ;;
  esac
done
az provider show --namespace Microsoft.App --query "resourceTypes[?resourceType=='managedEnvironments'].locations | [0]" --output json |
  python3 -c 'import json,sys; a=json.load(sys.stdin); sys.exit(0 if any(str(x).replace(" ","").lower()=="centralindia" for x in (a or [])) else "Container Apps Central India availability could not be confirmed.")'
az postgres flexible-server list-skus --location "$REGION" --output json |
  python3 -c 'import json,sys; d=json.load(sys.stdin); values=[]
def walk(x):
 if isinstance(x,dict):
  for v in x.values(): walk(v)
 elif isinstance(x,list):
  for v in x: walk(v)
 elif isinstance(x,str): values.append(x)
walk(d)
sys.exit(0 if "Standard_B1ms" in values else "The B1ms development SKU could not be confirmed in Central India; stop and review the tier/quotas.")'

exists="$(az group exists --name "$GROUP" --output tsv | tr '[:upper:]' '[:lower:]')"
if [ "$exists" = true ]; then
  marker="$(az group show --name "$GROUP" --query tags.fluxDeploymentId --output tsv)"
  [ "$marker" = "$DEPLOY_ID" ] || fail 'The application resource group already exists and is not owned by this deployment. Nothing will be adopted or modified.'
elif [ "$PHASE" -gt 0 ]; then
  fail 'Checkpointed resources are absent. Inspect protected state before continuing.'
fi

# Bootstrap the state store using a separate, private local Terraform state.
# AzAPI uses management-plane requests without listing account keys or reading secrets.
state_exists="$(az group exists --name "$STATE_GROUP" --output tsv | tr '[:upper:]' '[:lower:]')"
if [ "$state_exists" = true ]; then
  [ "$(az group show --name "$STATE_GROUP" --query tags.fluxDeploymentId --output tsv)" = "$DEPLOY_ID" ] || fail 'The state resource group belongs to another deployment; nothing will be adopted.'
  [ -s "$BOOT/terraform.tfstate" ] || fail 'Bootstrap state is missing. Restore .flux-deploy from its protected backup before proceeding.'
elif [ "$(cfg bootstrap_complete)" = True ]; then
  fail 'The checkpointed state resource group is absent; inspect bootstrap state before continuing.'
fi
if [ "$(cfg bootstrap_complete)" != True ]; then
  mkdir -p "$BOOT"
  cp "$ROOT/infra/bootstrap/main.tf" "$BOOT/main.tf"
  cp "$ROOT/infra/bootstrap/.terraform.lock.hcl" "$BOOT/.terraform.lock.hcl"
  python3 - "$CONFIG" "$BOOT/runtime.tfvars.json" <<'PY'
import json,sys
c=json.load(open(sys.argv[1])); d={k:c[v] for k,v in dict(subscription_id='subscription',deployment_id='deployment_id',resource_group_name='state_group',storage_account_name='state_account',operator_ip='operator_ip').items()}
open(sys.argv[2],'w').write(json.dumps(d,indent=2)+'\n')
PY
  cd "$BOOT"
  terraform init -input=false
  terraform validate
  plan="$WORK/state-bootstrap.tfplan"
  terraform plan -input=false -var-file="$BOOT/runtime.tfvars.json" -out="$plan"
  terraform show -json "$plan" | audit_plan bootstrap
  hash_before="$(shasum -a 256 "$plan" | cut -d' ' -f1)"
  confirm "Create the protected Central India state store for $APP?" "APPLY-$APP"
  [ "$hash_before" = "$(shasum -a 256 "$plan" | cut -d' ' -f1)" ] || fail 'The bootstrap plan changed after review.'
  terraform apply -input=false "$plan"
  save bootstrap_complete true
fi

# Inspect only storage metadata, then wait for Entra RBAC/data-plane propagation.
az storage account show --name "$STATE_ACCOUNT" --resource-group "$STATE_GROUP" --output json |
  python3 -c 'import json,sys; s=json.load(sys.stdin); ok=s.get("location")=="centralindia" and s.get("allowSharedKeyAccess") is False and s.get("allowBlobPublicAccess") is False and s.get("enableHttpsTrafficOnly") is True and s.get("minimumTlsVersion")=="TLS1_2" and s.get("networkRuleSet",{}).get("defaultAction")=="Deny"; sys.exit(0 if ok else "State storage must be in Central India, disable shared keys/public blobs, require HTTPS/TLS1.2 and restrict networks.")'
az storage account blob-service-properties show --account-name "$STATE_ACCOUNT" --resource-group "$STATE_GROUP" --output json |
  python3 -c 'import json,sys; s=json.load(sys.stdin); sys.exit(0 if s.get("isVersioningEnabled") and s.get("deleteRetentionPolicy",{}).get("enabled") and s.get("containerDeleteRetentionPolicy",{}).get("enabled") else "Enable state Blob versioning and Blob/container soft delete first.")'
state_ready=false
for attempt in $(seq 1 60); do
  if az storage container show --account-name "$STATE_ACCOUNT" --name tfstate --auth-mode login --query properties.publicAccess --output tsv 2>/dev/null |
  python3 -c 'import sys; sys.exit(0 if sys.stdin.read().strip().lower() in ["","none"] else "The tfstate container must be private.")'
  then state_ready=true; break; fi
  printf 'Waiting for state-store RBAC/network propagation...\n'
  sleep 5
done
[ "$state_ready" = true ] || fail 'State access is not ready. Check subscription role-assignment permissions/network access and rerun to resume.'

cd "$TF"
terraform init -input=false -reconfigure \
  -backend-config="resource_group_name=$STATE_GROUP" \
  -backend-config="storage_account_name=$STATE_ACCOUNT" \
  -backend-config='container_name=tfstate' -backend-config="key=flux/$DEPLOY_ID.tfstate" \
  -backend-config='use_azuread_auth=true' -backend-config='use_cli=true'
terraform fmt -check -recursive
terraform validate
terraform test
if [ "$REPAIR_NETWORK" = true ]; then
  terraform show -json | python3 "$ROOT/scripts/prepare-network-repair.py" state "$CONFIG" "$WORK/network-repair-addresses.json"
  python3 "$ROOT/scripts/prepare-network-repair.py" imports "$CONFIG" "$TF/network-recovery.import.tf" "$WORK/network-repair-addresses.json"
  terraform validate
fi

stage() {
  target="$1"; name="$2"
  [ "$(cfg phase)" -lt "$target" ] || { printf 'Already complete: %s\n' "$name"; return; }
  python3 - "$CONFIG" "$WORK/runtime.tfvars.json" "$target" <<'PY'
import json,sys
c=json.load(open(sys.argv[1])); n=int(sys.argv[3]); d={'subscription_id':c['subscription'],'location':'centralindia','resource_group_name':c['group'],'app_name':c['app'],'backend_key_vault_name':c['vault'],'deployment_id':c['deployment_id'],'enable_backend':True,'provision_backend_database':n>=2,'deploy_backend_app':n>=4,'backend_image':c['image'] if n>=3 else None,'ghcr_private_image':True,'ghcr_username':c['ghcr_user'],'ghcr_token_secret_name':'ghcr-read-token','enable_tomtom':False,'key_vault_admin_ip_rules':[c['operator_ip']]}
d.update(backend_allow_registration=False,backend_database_sku='B_Standard_B1ms',tomtom_secret_name='tomtom-api-key',grant_operator_secret_access=True)
open(sys.argv[2],'w').write(json.dumps(d,indent=2)+'\n')
PY
  plan="$WORK/$name.tfplan"
  printf '\nReview the %s plan and its costs.\n' "$name"
  terraform plan -input=false -var-file="$WORK/runtime.tfvars.json" -out="$plan"
  terraform show -json "$plan" | audit_plan
  hash_before="$(shasum -a 256 "$plan" | cut -d' ' -f1)"
  if [ "$PLAN_NETWORK" = true ]; then
    printf '\nRecovery plan prepared: %s\nSHA-256: %s\nNo Terraform apply, login, provider registration or checkpoint update was performed. After reviewing and committing the fixes, run bash scripts/deploy-azure.sh --repair-network to prepare and approve a fresh plan.\n' "$plan" "$hash_before"
    exit 0
  fi
  confirm "Apply this saved $name plan for $APP?" "APPLY-$APP"
  [ "$hash_before" = "$(shasum -a 256 "$plan" | cut -d' ' -f1)" ] || fail 'The saved plan changed after review.'
  terraform apply -input=false "$plan"
  python3 - "$CONFIG" "$target" "$(git rev-parse HEAD)" "$REPAIR_NETWORK" <<'PY'
import json,os,sys
p,phase,revision,repair=sys.argv[1:]; d=json.load(open(p)); d['phase']=phase
if repair=='true' and phase=='1': d['revision']=revision
t=p+'.tmp'; open(t,'w').write(json.dumps(d,indent=2)+'\n'); os.chmod(t,0o600); os.replace(t,p)
PY
}

stage 1 foundation
printf '\nTerraform granted your operator Key Vault Secrets Officer on %s. In Azure Portal, enter distinct 24+ character database-admin-password and database-app-password, plus ghcr-read-token (read:packages only, owned by Wadat-sumi). Enter values only in the Portal.\n' "$VAULT"
browser "https://portal.azure.com/#resource/subscriptions/$SUB/resourceGroups/$GROUP/providers/Microsoft.KeyVault/vaults/$VAULT/secrets"
while :; do
  ask 'Press Enter after entering the three Key Vault secrets: '
  ready=true
  for secret in database-admin-password database-app-password ghcr-read-token; do
    enabled="$(az keyvault secret list --vault-name "$VAULT" --query "[?name=='$secret'].attributes.enabled | [0]" --output tsv 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)"
    [ "$enabled" = true ] || { printf 'Metadata not ready: %s. Check the secret, operator role and approved IP.\n' "$secret"; ready=false; }
  done
  [ "$ready" = true ] && break
done

if [ -z "$(cfg image)" ]; then
  printf '\nRun the GHCR workflow on main with publish checked. Wait for success, verify its source commit is %s, then copy the immutable image from its summary. The workflow runs the required tests before publication.\n' "$(cfg revision)"
  browser "$REPO/actions/workflows/ghcr.yml"
  ask 'Verified ghcr.io/wadat-sumi/flux@sha256:... image: '
  image="$REPLY"
  python3 -c 'import re,sys; sys.exit(0 if re.fullmatch(r"ghcr\.io/wadat-sumi/flux@sha256:[a-f0-9]{64}",sys.argv[1]) else "Invalid immutable image reference.")' "$image"
  confirm 'Confirm the GitHub verification/build/smoke run succeeded for this checkout.' VERIFIED
  save image "$image"
fi
stage 2 database
stage 3 migration

if [ "$(cfg phase)" -lt 4 ]; then
  execution="$(cfg execution)"
  if [ -z "$execution" ]; then
    confirm "Start the administrative migration job for $APP?" MIGRATE
    execution="$(az containerapp job start --resource-group "$GROUP" --name "$APP-migrate" --query name --output tsv)"
    save execution "$execution"
    validate_config "$CONFIG"
  fi
  succeeded=false
  for attempt in $(seq 1 120); do
    status="$(az containerapp job execution list --resource-group "$GROUP" --name "$APP-migrate" --query "[?name=='$execution'].properties.status | [0]" --output tsv)"
    case "$status" in
      Succeeded) succeeded=true; break ;;
      Failed|Stopped|Degraded) fail 'Migration failed. Inspect its safe diagnostics; no application will be enabled. Clear only the execution checkpoint after fixing the cause to explicitly retry.' ;;
    esac
    printf 'Migration status: %s\n' "${status:-starting}"
    sleep 5
  done
  [ "$succeeded" = true ] || fail 'Migration wait timed out; rerun to keep watching the same execution.'
fi
stage 4 application
url="$(terraform output -raw backend_url)"
python3 -c 'import sys,urllib.parse; u=urllib.parse.urlparse(sys.argv[1]); sys.exit(0 if u.scheme=="https" and not u.username and not u.password and u.hostname and u.hostname.startswith(sys.argv[2]+"-api.") and u.hostname.endswith(".azurecontainerapps.io") and not u.query and not u.fragment else "Unexpected application URL.")' "$url" "$APP"
healthy=false
for attempt in $(seq 1 36); do
  if curl --fail --silent --max-time 10 "$url/api/health" | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("status")=="ok" else 1)' 2>/dev/null; then healthy=true; break; fi
  sleep 5
done
[ "$healthy" = true ] || fail 'HTTPS health verification did not pass. Rerun to verify again; no resources are deleted.'
curl --fail --silent --show-error --max-time 15 "$url/" >/dev/null
printf '\nFlux is healthy: %s\nProduction signup and TomTom remain disabled. Keep .flux-deploy private and retain protected state/backups.\n' "$url"
browser "$url"
