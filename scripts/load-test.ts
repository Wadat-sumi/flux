import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir, cpus, totalmem, platform, arch } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "../server/database";
import { createApp } from "../server/app";
import { hashPassword } from "../server/security";
import { intersection } from "../src/scenarios/presets";
import { defaultVehicleProfiles } from "../src/model/vehicles";

const users = 120,
  steadySeconds = 20,
  directory = await mkdtemp(join(tmpdir(), "flux-load-"));
const db = await openDatabase({ directory });
await migrate(db);
const origin = "http://127.0.0.1:5173",
  app = await createApp({ db, origin, authLimit: 1000 });
await new Promise<void>((resolve) =>
  app.server.listen(0, "127.0.0.1", resolve),
);
const address = app.server.address();
assert(address && typeof address !== "string");
const url = `http://127.0.0.1:${address.port}`,
  password = "Load-fixture-only-passphrase!",
  hashed = await hashPassword(password),
  scenario = {
    ...intersection(),
    duration: 60,
    fleet: defaultVehicleProfiles.map((p, i) => ({
      ...p,
      share: [40, 20, 10, 10, 10, 10][i],
    })),
  };
interface Client {
  email: string;
  cookie: string;
  csrf: string;
  save: string;
}
const clients: Client[] = [],
  measurements: { phase: string; ms: number; status: number }[] = [];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)
  ] ?? 0;
async function request(
  client: Client,
  path: string,
  method: string,
  data: unknown,
  phase: string,
) {
  const start = performance.now(),
    response = await fetch(url + path, {
      method,
      signal: AbortSignal.timeout(15000),
      headers: {
        Origin: origin,
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(client.cookie
          ? { Cookie: client.cookie, "X-Flux-CSRF": client.csrf }
          : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  const result = await response.json();
  measurements.push({
    phase,
    ms: performance.now() - start,
    status: response.status,
  });
  return { response, result };
}
const start = performance.now();
try {
  for (let i = 0; i < users; i++) {
    const id = randomUUID(),
      email = `load-${i}@flux.test`;
    await db.query(
      "INSERT INTO flux_users(id,email,password_hash,created_at) VALUES($1,$2,$3,$4)",
      [id, email, hashed, new Date().toISOString()],
    );
    clients.push({ email, cookie: "", csrf: "", save: "" });
  }
  // Accounts are seeded once; sessions are obtained through 120 real concurrent password logins.
  await Promise.all(
    clients.map(async (client) => {
      const { response, result } = await request(
        client,
        "/api/auth/login",
        "POST",
        { email: client.email, password },
        "login",
      );
      assert.equal(response.status, 200);
      client.cookie = response.headers.get("set-cookie")!.split(";")[0];
      client.csrf = result.csrf;
      const saved = await request(
        client,
        "/api/scenarios",
        "POST",
        { scenario },
        "setup",
      );
      assert.equal(saved.response.status, 201);
      client.save = saved.result.id;
    }),
  );
  const steadyStart = performance.now(),
    deadline = steadyStart + steadySeconds * 1000;
  await Promise.all(
    clients.map(async (client) => {
      let iteration = 0;
      while (performance.now() < deadline) {
        const choice = iteration++ % 4;
        const path =
          choice === 0
            ? "/api/scenarios"
            : choice === 1
              ? `/api/scenarios/${client.save}`
              : choice === 2
                ? "/api/jobs"
                : "/api/session";
        const result = await request(
          client,
          path,
          choice === 1 ? "PUT" : "GET",
          choice === 1 ? { scenario } : undefined,
          "steady",
        );
        assert.equal(result.response.status, 200);
        await pause(200);
      }
    }),
  );
  const elapsed = (performance.now() - steadyStart) / 1000;
  const heavy = { ...scenario, duration: 3600, maxVehicles: 10000 },
    accepted: { client: Client; id: string }[] = [];
  await Promise.all(
    clients.map(async (client) => {
      const result = await request(
        client,
        "/api/jobs",
        "POST",
        { scenario: heavy },
        "job-admission",
      );
      assert([202, 429].includes(result.response.status));
      if (result.response.status === 202)
        accepted.push({ client, id: result.result.id });
    }),
  );
  assert(accepted.length > 0 && accepted.length <= 20);
  const [running] = await db.query(
    "SELECT COUNT(*) AS total FROM flux_jobs WHERE status='running'",
  );
  assert(Number(running.total) <= 1);
  for (let i = 0; i < 20; i++) {
    const r = await request(
      clients[i],
      "/api/health",
      "GET",
      undefined,
      "health-during-worker",
    );
    assert.equal(r.response.status, 200);
  }
  await Promise.all(
    accepted.map(async ({ client, id }) => {
      const r = await request(
        client,
        `/api/jobs/${id}/cancel`,
        "POST",
        undefined,
        "cancellation",
      );
      assert.equal(r.response.status, 200);
    }),
  );
  const steady = measurements.filter((m) => m.phase === "steady"),
    login = measurements.filter((m) => m.phase === "login"),
    health = measurements.filter((m) => m.phase === "health-during-worker");
  const ms = steady.map((m) => m.ms),
    report = {
      measuredAt: new Date().toISOString(),
      users,
      distinctAuthenticatedSessions: clients.length,
      steadySeconds: elapsed,
      workload:
        "120 concurrent HTTP clients: real password login; separate owned scenario with six vehicle profiles (40/20/10/10/10/10 synthetic mix); 20 s paced read/update/job-list/session mix; simultaneous mixed-vehicle job admission; health checks under CPU worker load; cancellation",
      database:
        "Filesystem-persistent PGlite (embedded PostgreSQL); Azure managed PostgreSQL not measured",
      steadyRequests: steady.length,
      requestsPerSecond: steady.length / elapsed,
      unexpectedErrors: steady.filter((m) => m.status !== 200).length,
      latencyMs: {
        p50: percentile(ms, 0.5),
        p95: percentile(ms, 0.95),
        p99: percentile(ms, 0.99),
        max: Math.max(...ms),
      },
      loginP95Ms: percentile(
        login.map((m) => m.ms),
        0.95,
      ),
      healthUnderWorkerP95Ms: percentile(
        health.map((m) => m.ms),
        0.95,
      ),
      jobAdmission: {
        accepted: accepted.length,
        expectedOverload429: measurements.filter(
          (m) => m.phase === "job-admission" && m.status === 429,
        ).length,
        runningWorkers: Number(running.total),
      },
      host: {
        platform: platform(),
        architecture: arch(),
        logicalCpus: cpus().length,
        memoryGiB: totalmem() / 2 ** 30,
      },
      durationSeconds: (performance.now() - start) / 1000,
      limits:
        "Loopback API concurrency, not 120 browsers or 120 simultaneous simulations. One bounded CPU worker, 20 active queue slots. No commercial provider calls.",
    };
  await writeFile(
    "docs/benchmarks/backend-120-users.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  assert.equal(report.unexpectedErrors, 0);
  assert(report.latencyMs.p95 < 1000, "Steady p95 must stay below 1 second");
  assert(report.latencyMs.p99 < 2000, "Steady p99 must stay below 2 seconds");
  assert(
    report.requestsPerSecond >= 100,
    "At least 100 successful mixed requests/s required",
  );
  assert(report.loginP95Ms < 10000);
  assert(report.healthUnderWorkerP95Ms < 1000);
} finally {
  await app.close();
  await db.close();
  await rm(directory, { recursive: true, force: true });
}
