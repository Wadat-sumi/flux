import { afterEach, expect, test } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  copyFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const source = resolve("scripts/deploy-azure.sh"),
  dirs: string[] = [];
const config = {
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
  options: { foreign?: boolean; destructive?: boolean } = {},
) {
  const root = temp();
  for (const name of ["scripts", "infra/terraform", ".flux-deploy", "bin"])
    mkdirSync(join(root, name), { recursive: true });
  copyFileSync(source, join(root, "scripts/deploy-azure.sh"));
  writeFileSync(join(root, ".flux-deploy/config.json"), JSON.stringify(config));
  const mock = join(root, "bin/mock.mjs"),
    log = join(root, "commands.jsonl");
  writeFileSync(
    mock,
    `#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const root=process.env.FLUX_TEST_ROOT,a=process.argv.slice(2),tool=path.basename(process.argv[1]),key=a.join(' ');
fs.appendFileSync(root+'/commands.jsonl',JSON.stringify({tool,args:a})+'\\n');
const out=v=>{process.stdout.write(typeof v==='string'?v+'\\n':JSON.stringify(v)+'\\n');process.exit(0)},c=JSON.parse(fs.readFileSync(root+'/.flux-deploy/config.json'));
if(tool==='git'){if(key==='remote get-url origin')out('https://github.com/Wadat-sumi/flux.git');if(key==='branch --show-current')out('main');if(key==='status --porcelain')out('');if(key==='rev-parse HEAD')out(c.revision);}
if(tool==='az'){
 if(key.startsWith('account show')||key.startsWith('account set')||key.startsWith('version'))out('');
 if(key.startsWith('provider show')){if(a.includes('registrationState'))out('Registered');out(['Central India']);}
 if(key.startsWith('postgres flexible-server list-skus'))out([{name:'Standard_B1ms'}]);
 if(key.startsWith('group exists'))out(fs.existsSync(root+'/applied')||process.env.FLUX_TEST_FOREIGN?'true':'false');
 if(key.startsWith('group show'))out(process.env.FLUX_TEST_FOREIGN?'foreign-marker':c.deployment_id);
 if(key.startsWith('storage account show'))out({location:'centralindia',allowSharedKeyAccess:false,allowBlobPublicAccess:false,enableHttpsTrafficOnly:true,minimumTlsVersion:'TLS1_2',networkRuleSet:{defaultAction:'Deny'}});
 if(key.startsWith('storage account blob-service-properties show'))out({isVersioningEnabled:true,deleteRetentionPolicy:{enabled:true},containerDeleteRetentionPolicy:{enabled:true}});
 if(key.startsWith('storage container show'))out('');
 if(key.startsWith('keyvault secret list'))out('true');
 if(key.startsWith('containerapp job start'))out('flux-test-migrate-fixture');
 if(key.startsWith('containerapp job execution list'))out('Succeeded');
}
if(tool==='terraform'){
 if(key==='version -json')out({terraform_version:'1.9.8'});
 if(a[0]==='init'||a[0]==='fmt'||a[0]==='validate'||a[0]==='test')out('');
 if(a[0]==='plan'){const p=a.find(x=>x.startsWith('-out=')).slice(5);fs.writeFileSync(p,'Private binary-plan fixture');out('Mock plan');}
 if(a[0]==='show')out({resource_changes:[{mode:'managed',change:{actions:process.env.FLUX_TEST_DESTRUCTIVE?['delete','create']:['create'],before:null,after:{value:'SENTINEL_SECRET'}}}]});
 if(a[0]==='apply'){fs.writeFileSync(root+'/applied','true');out('');}
 if(key==='output -raw backend_url')out('https://flux-test-api.fixture.centralindia.azurecontainerapps.io');
}
if(tool==='open')out('');
if(tool==='curl')out({status:'ok'});
if(tool==='sleep')out('');
process.stderr.write('Unexpected mock command: '+tool+' '+key);process.exit(3);
`,
    { mode: 0o755 },
  );
  for (const tool of ["git", "az", "terraform", "open", "curl", "sleep"])
    symlinkSync(mock, join(root, "bin", tool));
  const env = {
    ...process.env,
    PATH: join(root, "bin") + ":" + process.env.PATH,
    FLUX_TEST_ROOT: root,
    ...(options.foreign ? { FLUX_TEST_FOREIGN: "1" } : {}),
    ...(options.destructive ? { FLUX_TEST_DESTRUCTIVE: "1" } : {}),
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
    "APPLY-flux-test\n\nAPPLY-flux-test\nAPPLY-flux-test\nMIGRATE\nAPPLY-flux-test\n",
  );
  expect(r.status, r.stdout + r.stderr).toBe(0);
  expect(r.stdout + r.stderr).not.toContain("SENTINEL_SECRET");
  const c = JSON.parse(
    readFileSync(join(f.root, ".flux-deploy/config.json"), "utf8"),
  );
  expect(c.phase).toBe("4");
  const vars = JSON.parse(
    readFileSync(join(f.root, ".flux-deploy/runtime.tfvars.json"), "utf8"),
  );
  expect(vars).toMatchObject({
    location: "centralindia",
    deploy_backend_app: true,
    backend_allow_registration: false,
    enable_tomtom: false,
  });
  expect(
    f.commands().find((c) => c.tool === "terraform" && c.args[0] === "init")!
      .args,
  ).toContain("-reconfigure");
  const again = f.execute("\n");
  expect(again.status, again.stdout + again.stderr).toBe(0);
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
          c.args.includes("--auto-approve") ||
          c.args.includes("--show-secrets"),
      ),
  ).toBe(false);
});
test.each([{ foreign: true }, { destructive: true }, {}])(
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
