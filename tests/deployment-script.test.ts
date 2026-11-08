import { afterEach, expect, test } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  copyFileSync,
  symlinkSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const source = resolve("scripts/deploy-azure.sh"),
  dirs: string[] = [];
const config = {
  schema: 2,
  bootstrap_complete: false,
  deployment_id: "11111111-1111-4111-8111-111111111111",
  subscription: "22222222-2222-4222-8222-222222222222",
  app: "flux-test",
  group: "flux-test-rg",
  vault: "flux-vault-test",
  state_group: "flux-state-rg",
  state_account: "fluxstatetest",
  operator_ip: "8.8.8.8/32",
  ghcr_user: "Wadat-sumi",
  revision: "a".repeat(40),
  phase: "0",
  image: `ghcr.io/wadat-sumi/flux@sha256:${"a".repeat(64)}`,
  execution: "",
};
function temp() {
  const p = mkdtempSync(join(tmpdir(), "flux-deploy-test-"));
  dirs.push(p);
  return p;
}
function fixture(patch: object = {}) {
  const dir = temp(),
    path = join(dir, "config.json");
  writeFileSync(path, JSON.stringify({ ...config, ...patch }));
  return path;
}
function run(args: string[], input?: string) {
  return spawnSync("bash", [source, ...args], { encoding: "utf8", input });
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
test("Mac Bash script has valid syntax and read-only help", () => {
  expect(spawnSync("/bin/bash", ["-n", source]).status).toBe(0);
  expect(run(["--help"]).stdout).toContain("Central India");
  expect(run(["--check-config", fixture()]).status).toBe(0);
});
test.each([
  { image: "ghcr.io/wadat-sumi/flux:latest" },
  { image: `other.test/flux@sha256:${"a".repeat(64)}` },
  { operator_ip: "0.0.0.0/0" },
  { operator_ip: "192.168.1.1/32" },
  { operator_ip: "SENTINEL_SECRET" },
  { ghcr_user: "ghp_SENTINEL_SECRET" },
  { app: "flux-test--app" },
  { app: "flux-" + "a".repeat(22) },
  { phase: "-1" },
  { phase: "99" },
  { group: "flux-state-rg" },
  { subscription: "-".repeat(36) },
  { password: "SENTINEL_SECRET" },
  { execution: "name'; malicious" },
  { bootstrap_complete: "true" },
  { schema: 999 },
  { phase: "1", bootstrap_complete: false },
])("unsafe configuration %j is rejected without echoing values", (patch) => {
  const result = run(["--check-config", fixture(patch)]);
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).not.toContain("SENTINEL_SECRET");
});
function plan(actions: string[], id?: string) {
  return JSON.stringify({
    resource_changes: [
      {
        mode: "managed",
        change: {
          actions,
          before: id ? { id, value: "SENTINEL_SECRET" } : null,
          after: { value: "SENTINEL_SECRET" },
        },
      },
      {
        mode: "data",
        change: { actions: ["read"], after: { value: "SENTINEL_SECRET" } },
      },
    ],
  });
}
test.each(
  [["delete"], ["delete", "create"], ["create", "delete"], ["forget"]].map(
    (actions) => ({ actions }),
  ),
)("plan rejects destructive actions %j", ({ actions }) => {
  const result = run(["--audit-plan", fixture()], plan(actions));
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).not.toContain("SENTINEL_SECRET");
});
test("plan permits scoped changes and hides secret-bearing JSON", () => {
  for (const id of [
    undefined,
    `/subscriptions/${config.subscription}/resourceGroups/${config.group}/providers/Microsoft.KeyVault/vaults/${config.vault}`,
    `https://${config.vault}.vault.azure.net/secrets/database-runtime-url/version`,
  ]) {
    const result = run(
      ["--audit-plan", fixture()],
      plan(id ? ["update"] : ["create"], id),
    );
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain("SENTINEL_SECRET");
  }
  const foreign = run(
    ["--audit-plan", fixture()],
    plan(["update"], "/subscriptions/foreign/resourceGroups/production"),
  );
  expect(foreign.status).not.toBe(0);
});

function mockedDeployment(
  options: {
    foreign?: boolean;
    foreignState?: boolean;
    destructive?: boolean;
    fresh?: boolean;
    badIp?: boolean;
    legacy?: boolean;
    missingState?: boolean;
    rbacDelay?: boolean;
    failedMigration?: boolean;
    providerMode?: string;
    revisionChanged?: boolean;
    progressed?: boolean;
    repair?: boolean;
    existingDns?: boolean;
    existingEnvironment?: boolean;
    badRepairReference?: boolean;
    badRepairStatus?: boolean;
    repairInspectionFailure?: boolean;
    absentResponse?: string;
    dirty?: boolean;
    loggedOut?: boolean;
    wrongSubscription?: boolean;
  } = {},
) {
  const root = temp();
  for (const name of [
    "scripts",
    "infra/terraform",
    "infra/terraform/tests",
    "infra/bootstrap",
    ".flux-deploy",
    "bin",
  ])
    mkdirSync(join(root, name), { recursive: true });
  copyFileSync(source, join(root, "scripts/deploy-azure.sh"));
  copyFileSync(
    resolve("scripts/prepare-network-repair.py"),
    join(root, "scripts/prepare-network-repair.py"),
  );
  for (const file of readdirSync(resolve("infra/terraform")).filter(
    (f) => f.endsWith(".tf") || f === ".terraform.lock.hcl",
  ))
    copyFileSync(
      resolve("infra/terraform", file),
      join(root, "infra/terraform", file),
    );
  copyFileSync(
    resolve("infra/terraform/tests/ghcr.tftest.hcl"),
    join(root, "infra/terraform/tests/ghcr.tftest.hcl"),
  );
  for (const file of ["main.tf", ".terraform.lock.hcl"])
    copyFileSync(
      resolve("infra/bootstrap", file),
      join(root, "infra/bootstrap", file),
    );
  if (!options.fresh) {
    const c: Record<string, unknown> = { ...config };
    if (options.repair) {
      c.bootstrap_complete = true;
      c.image = "";
    }
    if (options.progressed) {
      c.phase = "1";
      c.bootstrap_complete = true;
    }
    if (options.legacy) {
      delete c.schema;
      delete c.bootstrap_complete;
    }
    writeFileSync(join(root, ".flux-deploy/config.json"), JSON.stringify(c));
  }
  if (options.missingState) writeFileSync(join(root, "state-applied"), "true");
  if (options.repair) {
    mkdirSync(join(root, ".flux-deploy/bootstrap"), { recursive: true });
    writeFileSync(
      join(root, ".flux-deploy/bootstrap/terraform.tfstate"),
      "Retained bootstrap metadata fixture",
    );
    writeFileSync(join(root, "state-applied"), "true");
    writeFileSync(join(root, "applied"), "true");
  }
  const mock = join(root, "bin/mock.mjs"),
    log = join(root, "commands.jsonl");
  writeFileSync(
    mock,
    `#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const root=process.env.FLUX_TEST_ROOT,a=process.argv.slice(2),tool=path.basename(process.argv[1]),key=a.join(' ');
fs.appendFileSync(root+'/commands.jsonl',JSON.stringify({tool,args:a})+'\\n');
const out=v=>{process.stdout.write(typeof v==='string'?v+'\\n':JSON.stringify(v)+'\\n');process.exit(0)},c=fs.existsSync(root+'/.flux-deploy/config.json')?JSON.parse(fs.readFileSync(root+'/.flux-deploy/config.json')):null;
if(tool==='git'){if(key==='remote get-url origin')out('https://github.com/Wadat-sumi/flux.git');if(key==='branch --show-current')out('main');if(key==='status --porcelain')out(process.env.FLUX_TEST_DIRTY?' M scripts/deploy-azure.sh':'');if(key.startsWith('merge-base --is-ancestor'))out('');if(key==='rev-parse HEAD')out((process.env.FLUX_TEST_REVISION_CHANGED?'b':'a').repeat(40));}
if(tool==='az'){
 if(key.startsWith('account show')){if(process.env.FLUX_TEST_LOGGED_OUT){process.stderr.write('SENTINEL_SECRET');process.exit(1);}if(a.includes('id'))out(process.env.FLUX_TEST_WRONG_SUBSCRIPTION?'33333333-3333-4333-8333-333333333333':c?.subscription);out('');}
 if(key.startsWith('account set')||key.startsWith('version'))out('');
 if(key.startsWith('account list'))out('Fixture subscription');
 if(key.startsWith('provider show')){if(a.includes('registrationState')){
  const mode=process.env.FLUX_TEST_PROVIDER_MODE;
  if(a.includes('Microsoft.App')&&mode==='app-progress')out('Registering');
  if(a.includes('Microsoft.Network')&&mode&&mode!=='app-progress'){
   if(mode==='status-fails'){process.stderr.write('SENTINEL_SECRET');process.exit(1);}
   if(mode==='unknown')out('SENTINEL_SECRET');
   if(mode==='unregistering')out('Unregistering');
   if(mode==='stuck')out('Registering');
   const p=root+'/provider-checks',n=fs.existsSync(p)?Number(fs.readFileSync(p)):0;fs.writeFileSync(p,String(n+1));
   if(mode==='in-progress')out(n===0?'Registering':'Registered');
   if(mode==='register'&&n>=2)out('Registered');
   out(fs.existsSync(root+'/provider-submitted')&&mode!=='stale'?'Registering':'NotRegistered');
  }
  out('Registered');
 }out(['Central India']);}
 if(key.startsWith('provider register')){if(process.env.FLUX_TEST_PROVIDER_MODE==='request-fails'){process.stderr.write('SENTINEL_SECRET');process.exit(1);}fs.writeFileSync(root+'/provider-submitted','true');out('');}
 if(key.startsWith('postgres flexible-server list-skus'))out([{name:'Standard_B1ms'}]);
 if(key.startsWith('group exists'))out(a.includes(c?.state_group)?(fs.existsSync(root+'/state-applied')||process.env.FLUX_TEST_FOREIGN_STATE?'true':'false'):(fs.existsSync(root+'/applied')||process.env.FLUX_TEST_FOREIGN?'true':'false'));
 if(key.startsWith('group show'))out(process.env.FLUX_TEST_FOREIGN||process.env.FLUX_TEST_FOREIGN_STATE?'foreign-marker':c.deployment_id);
 if(key.startsWith('storage account show'))out({location:'centralindia',allowSharedKeyAccess:false,allowBlobPublicAccess:false,enableHttpsTrafficOnly:true,minimumTlsVersion:'TLS1_2',networkRuleSet:{defaultAction:'Deny'}});
 if(key.startsWith('storage account blob-service-properties show'))out({isVersioningEnabled:true,deleteRetentionPolicy:{enabled:true},containerDeleteRetentionPolicy:{enabled:true}});
 if(key.startsWith('storage container show')){if(process.env.FLUX_TEST_RBAC_DELAY&&!fs.existsSync(root+'/rbac-retried')){fs.writeFileSync(root+'/rbac-retried','true');process.exit(1);}out('');}
 if(key.startsWith('keyvault secret list'))out('true');
 if(key.startsWith('containerapp job start'))out('flux-test-migrate-fixture');
 if(key.startsWith('containerapp job execution list'))out(process.env.FLUX_TEST_FAILED_MIGRATION?'Failed':'Succeeded');
 if(key.startsWith('rest ')){
  const id=new URL(a[a.indexOf('--url')+1]).pathname;
  if(process.env.FLUX_TEST_REPAIR_INSPECTION_FAILURE){process.stderr.write('SENTINEL_SECRET');process.exit(1);}
  if(process.env.FLUX_TEST_EXISTING_DNS&&id.includes('/virtualNetworkLinks/'))out({id,state:process.env.FLUX_TEST_BAD_REPAIR_STATUS?'Updating':'Failed',reference:process.env.FLUX_TEST_BAD_REPAIR_REFERENCE?'SENTINEL_SECRET':'/subscriptions/'+c.subscription+'/resourceGroups/'+c.group+'/providers/Microsoft.Network/virtualNetworks/'+c.app+'-vnet'});
  if(process.env.FLUX_TEST_EXISTING_ENVIRONMENT&&id.includes('/managedEnvironments/'))out({id,state:'Failed',reference:'/subscriptions/'+c.subscription+'/resourceGroups/'+c.group+'/providers/Microsoft.Network/virtualNetworks/'+c.app+'-vnet/subnets/containers'});
  process.stderr.write(process.env.FLUX_TEST_ABSENT_RESPONSE||'ERROR: (ResourceNotFound) Fixture resource absent');process.exit(1);
 }
}
if(tool==='terraform'){
 if(key==='version -json')out({terraform_version:'1.9.8'});
 if(a[0]==='init'||a[0]==='fmt'||a[0]==='validate'||a[0]==='test')out('');
 if(a[0]==='plan'){const p=a.find(x=>x.startsWith('-out=')).slice(5);fs.writeFileSync(p,'Private binary-plan fixture');out('Mock plan');}
 if(key==='show -json')out({values:{root_module:{resources:[{address:'azurerm_resource_group.flux',mode:'managed',values:{id:'/subscriptions/'+c.subscription+'/resourceGroups/'+c.group,tags:{fluxDeploymentId:c.deployment_id},value:'SENTINEL_SECRET'}}]}}});
 if(a[0]==='show')out({resource_changes:[{mode:'managed',change:{actions:process.env.FLUX_TEST_DESTRUCTIVE?['delete','create']:['create'],before:null,after:{value:'SENTINEL_SECRET'}}}]});
 if(a[0]==='apply'){if(process.cwd().endsWith('/bootstrap')){fs.writeFileSync(root+'/state-applied','true');fs.writeFileSync(process.cwd()+'/terraform.tfstate','Fixture metadata only');}else fs.writeFileSync(root+'/applied','true');out('');}
 if(key==='output -raw backend_url')out('https://flux-test-api.fixture.centralindia.azurecontainerapps.io');
}
if(tool==='open')out('');
if(tool==='curl'){if(key.includes('api.ipify.org')||key.includes('checkip.amazonaws.com'))out(process.env.FLUX_TEST_BAD_IP?'192.168.1.1':'8.8.8.8');out({status:'ok'});}
if(tool==='sleep')out('');
if(tool==='date'){if(process.env.FLUX_TEST_PROVIDER_MODE==='stuck'){const p=root+'/date-checks',n=fs.existsSync(p)?Number(fs.readFileSync(p)):0;fs.writeFileSync(p,String(n+1));out(n<2?'0':'601');}out(String(Math.floor(Date.now()/1000)));}
process.stderr.write('Unexpected mock command: '+tool+' '+key);process.exit(3);
`,
    { mode: 0o755 },
  );
  for (const tool of [
    "git",
    "az",
    "terraform",
    "open",
    "curl",
    "sleep",
    "date",
  ])
    symlinkSync(mock, join(root, "bin", tool));
  const env = {
    ...process.env,
    PATH: join(root, "bin") + ":" + process.env.PATH,
    FLUX_TEST_ROOT: root,
    ...(options.foreign ? { FLUX_TEST_FOREIGN: "1" } : {}),
    ...(options.foreignState ? { FLUX_TEST_FOREIGN_STATE: "1" } : {}),
    ...(options.destructive ? { FLUX_TEST_DESTRUCTIVE: "1" } : {}),
    ...(options.badIp ? { FLUX_TEST_BAD_IP: "1" } : {}),
    ...(options.rbacDelay ? { FLUX_TEST_RBAC_DELAY: "1" } : {}),
    ...(options.failedMigration ? { FLUX_TEST_FAILED_MIGRATION: "1" } : {}),
    ...(options.providerMode
      ? { FLUX_TEST_PROVIDER_MODE: options.providerMode }
      : {}),
    ...(options.revisionChanged ? { FLUX_TEST_REVISION_CHANGED: "1" } : {}),
    ...(options.existingDns ? { FLUX_TEST_EXISTING_DNS: "1" } : {}),
    ...(options.existingEnvironment
      ? { FLUX_TEST_EXISTING_ENVIRONMENT: "1" }
      : {}),
    ...(options.badRepairReference
      ? { FLUX_TEST_BAD_REPAIR_REFERENCE: "1" }
      : {}),
    ...(options.badRepairStatus ? { FLUX_TEST_BAD_REPAIR_STATUS: "1" } : {}),
    ...(options.repairInspectionFailure
      ? { FLUX_TEST_REPAIR_INSPECTION_FAILURE: "1" }
      : {}),
    ...(options.absentResponse
      ? { FLUX_TEST_ABSENT_RESPONSE: options.absentResponse }
      : {}),
    ...(options.dirty ? { FLUX_TEST_DIRTY: "1" } : {}),
    ...(options.loggedOut ? { FLUX_TEST_LOGGED_OUT: "1" } : {}),
    ...(options.wrongSubscription ? { FLUX_TEST_WRONG_SUBSCRIPTION: "1" } : {}),
  };
  const execute = (input: string, args: string[] = []) =>
    spawnSync("/bin/bash", [join(root, "scripts/deploy-azure.sh"), ...args], {
      encoding: "utf8",
      input,
      env,
      timeout: 20000,
    });
  return {
    root,
    execute,
    commands: () =>
      readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((x) => JSON.parse(x) as { tool: string; args: string[] }),
  };
}
test("read-only preflight never logs in, plans, applies or calls a provider", () => {
  const f = mockedDeployment();
  const r = f.execute("", ["--check"]);
  expect(r.status, r.stderr).toBe(0);
  expect(
    f
      .commands()
      .filter((c) => c.tool === "az")
      .map((c) => c.args[0]),
  ).toEqual(["version"]);
  expect(
    f
      .commands()
      .some(
        (c) =>
          c.args.includes("plan") ||
          c.args.includes("apply") ||
          c.args.includes("login"),
      ),
  ).toBe(false);
});
test("mock deployment completes Central India stages once and resumes without reapplying or rerunning migrations", () => {
  const f = mockedDeployment();
  const r = f.execute(
    "APPLY-flux-test\nAPPLY-flux-test\n\nAPPLY-flux-test\nAPPLY-flux-test\nMIGRATE\nAPPLY-flux-test\n",
  );
  expect(r.status, r.stdout + r.stderr).toBe(0);
  expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
  const c = JSON.parse(
    readFileSync(join(f.root, ".flux-deploy/config.json"), "utf8"),
  );
  expect(c.phase).toBe("4");
  expect(c.bootstrap_complete).toBe(true);
  const vars = JSON.parse(
    readFileSync(join(f.root, ".flux-deploy/runtime.tfvars.json"), "utf8"),
  );
  expect(vars).toMatchObject({
    location: "centralindia",
    deploy_backend_app: true,
    backend_allow_registration: false,
    enable_tomtom: false,
    grant_operator_secret_access: true,
  });
  expect(
    f
      .commands()
      .filter((c) => c.tool === "terraform" && c.args[0] === "init")
      .at(-1)!.args,
  ).toContain("-reconfigure");
  const again = f.execute("\n");
  expect(again.status, again.stdout + again.stderr).toBe(0);
  expect(
    f.commands().filter((c) => c.tool === "terraform" && c.args[0] === "apply"),
  ).toHaveLength(5);
  expect(
    f
      .commands()
      .filter(
        (c) =>
          c.tool === "az" &&
          c.args.slice(0, 3).join(" ") === "containerapp job start",
      ),
  ).toHaveLength(1);
  expect(
    f
      .commands()
      .some(
        (c) =>
          c.args.includes("--auto-approve") ||
          c.args.includes("--show-secrets"),
      ),
  ).toBe(false);
});
test.each([
  { foreign: true },
  { foreignState: true },
  { destructive: true },
  {},
])(
  "mock deployment stops before apply on foreign ownership, destructive plans or declined approval %j",
  (options) => {
    const f = mockedDeployment(options);
    const r = f.execute("NO\n");
    expect(r.status).not.toBe(0);
    expect(
      f.commands().some((c) => c.tool === "terraform" && c.args[0] === "apply"),
    ).toBe(false);
  },
);

test("fresh deployment only asks for the subscription as infrastructure configuration", () => {
  const f = mockedDeployment({ fresh: true });
  const r = f.execute(config.subscription + "\nNO\n");
  expect(r.status).not.toBe(0); // Explicitly decline the first saved plan.
  expect(r.stderr).toContain("No changes approved");
  const c = JSON.parse(
    readFileSync(join(f.root, ".flux-deploy/config.json"), "utf8"),
  );
  expect(c).toMatchObject({
    subscription: config.subscription,
    schema: 2,
    operator_ip: "8.8.8.8/32",
    bootstrap_complete: false,
    ghcr_user: "Wadat-sumi",
  });
  expect(c.app).toMatch(/^flux-staging-[a-f0-9]{10}$/);
  expect(c.state_account).toMatch(/^fluxstate[a-f0-9]{10}$/);
  expect(r.stderr).not.toMatch(
    /State resource group:|State storage-account name|Your public IPv4|New application name|GitHub username owning/,
  );
  expect(
    f.commands().filter((c) => c.tool === "terraform" && c.args[0] === "apply"),
  ).toHaveLength(0);
});
test.each([{ fresh: true, badIp: true }, { fresh: true }])(
  "bad automatic IP or subscription fails before provisioning %j",
  (options) => {
    const f = mockedDeployment(options);
    const r = f.execute(
      (options.badIp ? config.subscription : "bad-subscription") + "\n",
    );
    expect(r.status).not.toBe(0);
    expect(existsSync(join(f.root, ".flux-deploy/config.json"))).toBe(false);
    expect(
      f
        .commands()
        .some(
          (c) =>
            c.tool === "terraform" && ["plan", "apply"].includes(c.args[0]),
        ),
    ).toBe(false);
  },
);
test("unprovisioned legacy configuration upgrades without asking for resource names", () => {
  const f = mockedDeployment({ legacy: true });
  const r = f.execute("NO\n");
  expect(r.stderr).toContain("No changes approved");
  const c = JSON.parse(
    readFileSync(join(f.root, ".flux-deploy/config.json"), "utf8"),
  );
  expect(c.schema).toBe(2);
  expect(c.subscription).toBe(config.subscription);
});
test("missing local bootstrap state never adopts the existing state resource group", () => {
  const f = mockedDeployment({ missingState: true });
  const r = f.execute("");
  expect(r.status).not.toBe(0);
  expect(r.stderr).toContain("Bootstrap state is missing");
  expect(
    f.commands().some((c) => c.tool === "terraform" && c.args[0] === "apply"),
  ).toBe(false);
});
test("state RBAC propagation retries and failed migrations never deploy the application", () => {
  const f = mockedDeployment({ rbacDelay: true, failedMigration: true });
  const r = f.execute(
    "APPLY-flux-test\nAPPLY-flux-test\n\nAPPLY-flux-test\nAPPLY-flux-test\nMIGRATE\n",
  );
  expect(r.status).not.toBe(0);
  expect(r.stdout).toContain("Waiting for state-store RBAC");
  expect(r.stderr).toContain("Migration failed");
  const c = JSON.parse(
    readFileSync(join(f.root, ".flux-deploy/config.json"), "utf8"),
  );
  expect(c.phase).toBe("3");
  expect(
    f.commands().filter((c) => c.tool === "terraform" && c.args[0] === "apply"),
  ).toHaveLength(4);
});

test.each(["in-progress", "register"])(
  "Network provider %s waits visibly until Registered before any plan",
  (providerMode) => {
    const f = mockedDeployment({ providerMode });
    const r = f.execute(
      providerMode === "register" ? "REGISTER\nNO\n" : "NO\n",
    );
    expect(r.stderr).toContain("No changes approved"); // Reaches the first saved plan.
    expect(r.stdout).toContain(
      "waiting for authorization before DNS/VNet operations",
    );
    expect(r.stdout).toContain("Microsoft.Network: Registered");
    const registrations = f
      .commands()
      .filter(
        (c) =>
          c.tool === "az" &&
          c.args.slice(0, 2).join(" ") === "provider register",
      );
    expect(registrations).toHaveLength(providerMode === "register" ? 1 : 0);
    expect(registrations.some((c) => c.args.includes("--wait"))).toBe(false);
  },
);
test.each([
  "request-fails",
  "status-fails",
  "unregistering",
  "unknown",
  "stale",
])(
  "provider %s stops safely before provisioning without exposing CLI payloads",
  (providerMode) => {
    const f = mockedDeployment({ providerMode });
    const r = f.execute("REGISTER\nNO\n");
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
    expect(
      f
        .commands()
        .some(
          (c) =>
            c.tool === "terraform" && ["plan", "apply"].includes(c.args[0]),
        ),
    ).toBe(false);
  },
);
test("a script update resumes the provider-only checkpoint after verifying both resource groups are absent", () => {
  const f = mockedDeployment({ revisionChanged: true });
  const r = f.execute("NO\n");
  expect(r.stderr).toContain("No changes approved");
  const c = JSON.parse(
    readFileSync(join(f.root, ".flux-deploy/config.json"), "utf8"),
  );
  expect(c).toMatchObject({
    revision: "b".repeat(40),
    deployment_id: config.deployment_id,
    app: config.app,
    phase: "0",
    image: "",
  });
});
test.each([{ progressed: true }, { missingState: true }])(
  "a script update never upgrades a checkpoint with infrastructure %j",
  (options) => {
    const f = mockedDeployment({ ...options, revisionChanged: true });
    const r = f.execute("");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("checkout changed");
    const c = JSON.parse(
      readFileSync(join(f.root, ".flux-deploy/config.json"), "utf8"),
    );
    expect(c.revision).toBe(config.revision);
    expect(
      f.commands().some((c) => c.tool === "terraform" && c.args[0] === "apply"),
    ).toBe(false);
  },
);

test("other providers may continue registering, while a stuck Network registration times out before provisioning", () => {
  const other = mockedDeployment({ providerMode: "app-progress" });
  expect(other.execute("NO\n").stderr).toContain("No changes approved");
  const stuck = mockedDeployment({ providerMode: "stuck" });
  const r = stuck.execute("");
  expect(r.status).not.toBe(0);
  expect(r.stderr).toContain("10 minutes");
  expect(
    stuck
      .commands()
      .some(
        (c) => c.tool === "terraform" && ["plan", "apply"].includes(c.args[0]),
      ),
  ).toBe(false);
});
test("reviewed network repair imports only the owned failed network resources, preserves bootstrap, and completes without duplicating migration", () => {
  const f = mockedDeployment({
    repair: true,
    revisionChanged: true,
    existingDns: true,
    existingEnvironment: true,
  });
  const r = f.execute(
    "APPLY-flux-test\n\n" +
      config.image +
      "\nVERIFIED\nAPPLY-flux-test\nAPPLY-flux-test\nMIGRATE\nAPPLY-flux-test\n",
    ["--repair-network"],
  );
  expect(r.status, r.stdout + r.stderr).toBe(0);
  expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
  const c = JSON.parse(
    readFileSync(join(f.root, ".flux-deploy/config.json"), "utf8"),
  );
  expect(c).toMatchObject({
    phase: "4",
    revision: "b".repeat(40),
    deployment_id: config.deployment_id,
    bootstrap_complete: true,
  });
  const imports = readFileSync(
    join(f.root, ".flux-deploy/network-repair/network-recovery.import.tf"),
    "utf8",
  );
  expect(imports).toContain(
    "azurerm_private_dns_zone_virtual_network_link.database[0]",
  );
  expect(imports).toContain("azurerm_container_app_environment.backend[0]");
  expect(f.execute("\n").status).toBe(0);
  expect(
    f.commands().filter((c) => c.tool === "terraform" && c.args[0] === "apply"),
  ).toHaveLength(4);
  expect(
    f
      .commands()
      .filter(
        (c) =>
          c.tool === "az" &&
          c.args.slice(0, 3).join(" ") === "containerapp job start",
      ),
  ).toHaveLength(1);
  expect(
    f
      .commands()
      .some(
        (c) =>
          c.tool === "terraform" &&
          ["import", "destroy", "untaint"].includes(c.args[0]),
      ),
  ).toBe(false);
});
test.each([
  { repair: true, destructive: true },
  { repair: true, foreign: true },
  { repair: true, progressed: true },
])(
  "network repair refuses destructive plans, foreign ownership or progressed stages %j",
  (options) => {
    const f = mockedDeployment({ ...options, revisionChanged: true });
    const r = f.execute("APPLY-flux-test\n", ["--repair-network"]);
    expect(r.status).not.toBe(0);
    const c = JSON.parse(
      readFileSync(join(f.root, ".flux-deploy/config.json"), "utf8"),
    );
    expect(c.revision).toBe(config.revision);
    expect(
      f.commands().some((c) => c.tool === "terraform" && c.args[0] === "apply"),
    ).toBe(false);
  },
);

test.each([
  { badRepairReference: true },
  { badRepairStatus: true },
  { repairInspectionFailure: true },
])(
  "network repair rejects mismatched resources, active operations and inspection failures %j",
  (options) => {
    const f = mockedDeployment({
      ...options,
      repair: true,
      revisionChanged: true,
      existingDns: true,
    });
    const r = f.execute("", ["--repair-network"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("Network recovery stopped");
    expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
    expect(
      f
        .commands()
        .some(
          (c) =>
            c.tool === "terraform" &&
            ["plan", "apply", "import"].includes(c.args[0]),
        ),
    ).toBe(false);
  },
);
test.each([
  "valid",
  "foreign-group",
  "foreign-marker",
  "missing-anchor",
  "malformed",
])("network recovery filters protected state ownership: %s", (kind) => {
  const dir = temp(),
    output = join(dir, "addresses.json");
  const state = {
    values: {
      root_module: {
        resources:
          kind === "missing-anchor"
            ? []
            : [
                {
                  address: "azurerm_resource_group.flux",
                  mode: "managed",
                  values: {
                    id:
                      kind === "foreign-group"
                        ? "/subscriptions/foreign/resourceGroups/production"
                        : `/subscriptions/${config.subscription}/resourceGroups/${config.group}`,
                    tags: {
                      fluxDeploymentId:
                        kind === "foreign-marker"
                          ? "other"
                          : config.deployment_id,
                    },
                    password: "SENTINEL_SECRET",
                  },
                },
              ],
      },
    },
  };
  const r = spawnSync(
    "python3",
    [resolve("scripts/prepare-network-repair.py"), "state", fixture(), output],
    {
      encoding: "utf8",
      input:
        kind === "malformed"
          ? "invalid state SENTINEL_SECRET"
          : JSON.stringify(state),
    },
  );
  expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
  if (kind === "valid") {
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual([
      "azurerm_resource_group.flux",
    ]);
  } else {
    expect(r.status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
  }
});

test("a declined recovery plan leaves the old checkpoint and protected state unchanged", () => {
  const f = mockedDeployment({
    repair: true,
    revisionChanged: true,
    existingDns: true,
  });
  const r = f.execute("NO\n", ["--repair-network"]);
  expect(r.stderr).toContain("No changes approved");
  expect(
    f.commands().some((c) => c.tool === "terraform" && c.args[0] === "apply"),
  ).toBe(false);
  const imports = readFileSync(
    join(f.root, ".flux-deploy/network-repair/network-recovery.import.tf"),
    "utf8",
  );
  expect(imports).toContain(
    "azurerm_private_dns_zone_virtual_network_link.database[0]",
  );
  expect(imports).not.toContain("azurerm_container_app_environment");
  const c = JSON.parse(
    readFileSync(join(f.root, ".flux-deploy/config.json"), "utf8"),
  );
  expect(c).toMatchObject({
    phase: "0",
    revision: config.revision,
    deployment_id: config.deployment_id,
  });
});

test.each([
  ["ERROR: (NotFound) Fixture absent", "NotFound"],
  ["ERROR: (ResourceNotFound) Fixture absent", "ResourceNotFound"],
  ["ERROR: (ParentResourceNotFound) Fixture absent", "ParentResourceNotFound"],
  [
    'ERROR: Not Found({"error":{"code":"NotFound","message":"SENTINEL_SECRET"}})',
    "NotFound",
  ],
  [
    'ERROR: Forbidden({"error":{"code":"AuthorizationFailed","message":"SENTINEL_SECRET"}})',
    "AuthorizationFailed",
  ],
  [
    'ERROR: (AuthorizationFailed) {"error":{"code":"NotFound"}}',
    "AuthorizationFailed",
  ],
  [
    'ERROR: Not Found({"error":{"code":"InvalidApiVersionParameter"}})',
    "InvalidApiVersionParameter",
  ],
  ['ERROR: Not Found({"error":{"code":"SENTINEL_SECRET"}})', "Unclassified"],
  ['ERROR: (SENTINEL_SECRET) {"error":{"code":"NotFound"}}', "Unclassified"],
  [
    "ERROR: unrecognized arguments: --api-version SENTINEL_SECRET",
    "CliArgumentError",
  ],
  ["ERROR: Please run 'az login' to setup account.", "LoginRequired"],
  [
    "SENTINEL_SECRET https://user:pass@example.invalid/?sig=SENTINEL_SECRET",
    "Unclassified",
  ],
])(
  "Azure CLI inspection errors are classified without exposing their payload: %s",
  (payload, expected) => {
    const r = spawnSync(
      "python3",
      [
        "-c",
        "import runpy,sys,json; m=runpy.run_path(sys.argv[1]); print(m['error_code'](json.load(sys.stdin)))",
        resolve("scripts/prepare-network-repair.py"),
      ],
      { encoding: "utf8", input: JSON.stringify(payload) },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(expected);
    expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
  },
);
test.each([
  "ERROR: (NotFound) Absent",
  'ERROR: Not Found({"error":{"code":"NotFound","message":"SENTINEL_SECRET"}})',
])(
  "confirmed missing recovery resources proceed to a reviewed create plan: %s",
  (absentResponse) => {
    const f = mockedDeployment({
      repair: true,
      revisionChanged: true,
      absentResponse,
    });
    const r = f.execute("NO\n", ["--repair-network"]);
    expect(r.stderr).toContain("No changes approved");
    expect(r.stdout).toContain(
      "Azure resource is absent; Terraform will create",
    );
    expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
    const reads = f
      .commands()
      .filter((c) => c.tool === "az" && c.args[0] === "rest");
    expect(reads).toHaveLength(2);
    for (const read of reads) {
      expect(read.args[read.args.indexOf("--method") + 1]).toBe("get");
      const url = new URL(read.args[read.args.indexOf("--url") + 1]);
      expect(url.origin).toBe("https://management.azure.com");
      expect(
        url.pathname.startsWith(
          `/subscriptions/${config.subscription}/resourceGroups/${config.group}/providers/`,
        ),
      ).toBe(true);
      expect([...url.searchParams.keys()]).toEqual(["api-version"]);
      expect(url.username + url.password).toBe("");
    }
    expect(
      f.commands().some((c) => c.tool === "terraform" && c.args[0] === "apply"),
    ).toBe(false);
  },
);
test("authorization inspection failure identifies the resource and code, never treating it as absent", () => {
  const f = mockedDeployment({
    repair: true,
    revisionChanged: true,
    absentResponse:
      'ERROR: Forbidden({"error":{"code":"AuthorizationFailed","message":"SENTINEL_SECRET"}})',
  });
  const r = f.execute("", ["--repair-network"]);
  expect(r.status).not.toBe(0);
  expect(r.stderr).toContain(
    "azurerm_private_dns_zone_virtual_network_link.database[0]",
  );
  expect(r.stderr).toContain("Azure code AuthorizationFailed; CLI exit 1");
  expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
  expect(
    f
      .commands()
      .some(
        (c) =>
          c.tool === "terraform" &&
          ["plan", "apply", "import"].includes(c.args[0]),
      ),
  ).toBe(false);
});

test("plan-only recovery reviews local fixes without cloud mutations or advancing the checkpoint", () => {
  const f = mockedDeployment({
    repair: true,
    revisionChanged: true,
    dirty: true,
    existingEnvironment: true,
  });
  const checkpoint = join(f.root, ".flux-deploy/config.json"),
    before = readFileSync(checkpoint, "utf8"),
    r = f.execute("", ["--plan-network-repair"]);
  expect(r.status, r.stdout + r.stderr).toBe(0);
  expect(r.stdout).toContain("Recovery plan prepared:");
  expect(r.stdout).toMatch(/SHA-256: [a-f0-9]{64}/);
  expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
  expect(readFileSync(checkpoint, "utf8")).toBe(before);
  expect(existsSync(join(f.root, ".flux-deploy/foundation.tfplan"))).toBe(true);
  expect(
    f
      .commands()
      .some((c) =>
        c.tool === "terraform"
          ? ["apply", "import", "destroy"].includes(c.args[0])
          : c.tool === "az" &&
            [
              "login",
              "account set",
              "provider register",
              "containerapp job start",
            ].some((prefix) => c.args.join(" ").startsWith(prefix)),
      ),
  ).toBe(false);
  expect(f.commands().some((c) => c.tool === "open")).toBe(false);
});

test.each([
  { loggedOut: true },
  { wrongSubscription: true },
  { foreign: true },
  { progressed: true },
  { providerMode: "register" },
  { destructive: true },
])(
  "plan-only recovery refuses unsafe context %j without changes",
  (options) => {
    const f = mockedDeployment({ repair: true, ...options }),
      checkpoint = join(f.root, ".flux-deploy/config.json"),
      before = readFileSync(checkpoint, "utf8"),
      r = f.execute("", ["--plan-network-repair"]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
    expect(readFileSync(checkpoint, "utf8")).toBe(before);
    expect(
      f
        .commands()
        .some((c) =>
          c.tool === "terraform"
            ? ["apply", "import", "destroy"].includes(c.args[0])
            : c.tool === "az" &&
              [
                "login",
                "account set",
                "provider register",
                "containerapp job start",
              ].some((prefix) => c.args.join(" ").startsWith(prefix)),
        ),
    ).toBe(false);
  },
);

test("normal deployment preserves local edits and directs failed foundations to recovery review", () => {
  const dirty = mockedDeployment({ dirty: true }),
    r = dirty.execute("");
  expect(r.status).not.toBe(0);
  expect(r.stderr).toContain("--plan-network-repair");
  expect(
    dirty.commands().some((c) => c.tool === "az" && c.args[0] !== "version"),
  ).toBe(false);
  const pinned = mockedDeployment({ repair: true, revisionChanged: true }),
    p = pinned.execute("");
  expect(p.status).not.toBe(0);
  expect(p.stderr).toContain("--plan-network-repair, then --repair-network");
});

test.each([
  ["grants", "ROLE_GRANTS_PRESENT_SERVICE_AUTH_UNVERIFIED"],
  ["excluded", "REQUIRED_RBAC_GRANT_MISSING"],
  ["mismatch", "SUBSCRIPTION_CONTEXT_MISMATCH"],
  ["unregistered", "NETWORK_REGISTRATION_NOT_COMPLETE"],
  ["failed", "LOGIN_OR_CONTEXT_UNVERIFIED"],
  ["paginated", "UNVERIFIED"],
])(
  "network diagnostics report %s with secret-safe read-only requests",
  (mode, expected) => {
    const r = spawnSync(
      "python3",
      [
        "-c",
        `
import json,runpy,sys
m=runpy.run_path(sys.argv[1]); mode=sys.argv[2]; c=json.load(sys.stdin); calls=[]
def fake(args):
 calls.append(args)
 if args[0]=='account':
  if mode=='failed': return None,m['error_code']('ERROR: (AuthorizationFailed) SENTINEL_SECRET')
  return {'subscription':'other' if mode=='mismatch' else c['subscription'],'identityType':'user'},None
 if args[0]=='provider': return ('Registering' if mode=='unregistered' else 'Registered'),None
 if args[0]=='monitor': return [{'correlationId':'SENTINEL_SECRET'},{'correlationId':'11111111-1111-4111-8111-111111111111'}],None
 url=args[args.index('--url')+1]
 if '/permissions?' in url:
  return {'entries':[{'actions':['Microsoft.Network/*'],'notActions':['Microsoft.Network/*/action'] if mode=='excluded' else []}],'nextLink':'SENTINEL_SECRET' if mode=='paginated' else None},None
 return {'id':url.removeprefix('https://management.azure.com').split('?')[0],'state':'Succeeded'},None
m['diagnose_authorization'].__globals__['diagnostic_json']=fake
report=m['diagnose_authorization'](c)
assert all(a[0] in ['account','provider','rest','monitor'] for a in calls)
assert all(a[a.index('--method')+1]=='get' for a in calls if a[0]=='rest')
assert all(a[1]!='register' for a in calls if a[0]=='provider')
print(json.dumps(report))
`,
        resolve("scripts/prepare-network-repair.py"),
        mode,
      ],
      {
        encoding: "utf8",
        input: JSON.stringify(config),
      },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).result).toBe(expected);
    expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
  },
);
