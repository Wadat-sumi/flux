import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { backendFixture, waitForJob, type Auth } from "./backend-helpers";
import { intersection, flyover } from "../src/scenarios/presets";
import { runExperiment } from "../src/engine/experiment";
import { experimentForExport } from "../src/ui/observations";
import type {
  ServerScenario,
  ServerJob,
  ImportedData,
} from "../src/model/backend";
import {
  hashPassword,
  verifyPassword,
  RateLimiter,
  sessionCookie,
} from "../server/security";

let context: Awaited<ReturnType<typeof backendFixture>>, alice: Auth, bob: Auth;
beforeAll(async () => {
  context = await backendFixture();
  alice = await context.register("alice@flux.test");
  bob = await context.register("bob@flux.test");
});
afterAll(async () => context?.close());
const metadata = {
  source: "Test observations — explicitly synthetic fixture",
  license: "Test only",
  capturedAt: "2026-11-06T00:00:00Z",
};

describe("backend accounts and session security", () => {
  test("health checks database and sessions restore without exposing stored tokens/passwords", async () => {
    expect((await context.request("/api/health")).data.status).toBe("ok");
    expect((await context.request("/api/session")).data.user).toBeNull();
    const active = await context.request(
      "/api/session",
      "GET",
      undefined,
      alice,
    );
    expect(active.data.user).toEqual(alice.user);
    const [stored] = await context.db.query(
      "SELECT password_hash FROM flux_users WHERE id=$1",
      [alice.user.id],
    );
    expect(stored.password_hash).toMatch(/^scrypt:/);
    expect(JSON.stringify(active.data)).not.toContain("password");
    const sessions = await context.db.query(
      "SELECT token_hash FROM flux_sessions WHERE user_id=$1",
      [alice.user.id],
    );
    expect(sessions[0].token_hash).toHaveLength(64);
    expect(sessions[0].token_hash).not.toBe(alice.cookie.split("=")[1]);
  });
  test("case-normalized login, rotation and revocation work", async () => {
    const user = await context.register("ROTATE@flux.test");
    expect(user.user.email).toBe("rotate@flux.test");
    const login = await context.request<{ csrf: string; user: Auth["user"] }>(
      "/api/auth/login",
      "POST",
      { email: "ROTATE@flux.test", password: "Flux-test-phrase-2026!" },
      user,
    );
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(login.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(
      (await context.request("/api/scenarios", "GET", undefined, user)).status,
    ).toBe(401);
    const rotated = {
      ...login.data,
      cookie: login.headers.get("set-cookie")!.split(";")[0],
    };
    expect(
      (await context.request("/api/auth/logout", "POST", undefined, rotated))
        .status,
    ).toBe(200);
    expect(
      (await context.request("/api/scenarios", "GET", undefined, rotated))
        .status,
    ).toBe(401);
  });
  test("rejects wrong passwords, unknown accounts, duplicate accounts and weak credentials", async () => {
    expect(
      (
        await context.request("/api/auth/login", "POST", {
          email: alice.user.email,
          password: "incorrect-long-password",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await context.request("/api/auth/login", "POST", {
          email: "absent@flux.test",
          password: "incorrect-long-password",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await context.request("/api/auth/register", "POST", {
          email: alice.user.email,
          password: "long-enough-test-string",
        })
      ).status,
    ).toBe(409);
    for (const input of [
      { email: "a", password: "long-enough-string" },
      { email: "x@flux.test", password: "short" },
      { email: "x@flux.test", password: "x".repeat(129) },
      { email: "x@flux.test", password: "long-enough-string", admin: true },
    ])
      expect(
        (await context.request("/api/auth/register", "POST", input)).status,
      ).toBe(400);
  });
  test("expired/revoked/forged/duplicate cookies cannot authenticate", async () => {
    const user = await context.register("expired@flux.test");
    await context.db.query(
      "UPDATE flux_sessions SET expires_at=$1 WHERE user_id=$2",
      ["2000-01-01T00:00:00Z", user.user.id],
    );
    expect(
      (await context.request("/api/scenarios", "GET", undefined, user)).status,
    ).toBe(401);
    for (const cookie of [
      "flux_session=forged",
      `${alice.cookie}; ${alice.cookie}`,
      "flux_session=" + "a".repeat(43),
    ])
      expect(
        (
          await context.request("/api/scenarios", "GET", undefined, {
            ...alice,
            cookie,
          })
        ).status,
      ).toBe(401);
  });
  test("scrypt uses distinct salts and compares valid/invalid inputs", async () => {
    const a = await hashPassword("a sufficiently long passphrase"),
      b = await hashPassword("a sufficiently long passphrase");
    expect(a).not.toBe(b);
    expect(await verifyPassword("a sufficiently long passphrase", a)).toBe(
      true,
    );
    expect(await verifyPassword("wrong password", a)).toBe(false);
    expect(await verifyPassword("x", "corrupt")).toBe(false);
    expect(sessionCookie("x", true)).toContain("Secure");
  });
  test("limiter resets its window and rejects bursts", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    limiter.check("ip");
    limiter.check("ip");
    expect(() => limiter.check("ip")).toThrow(/Too many/);
    now = 1001;
    expect(() => limiter.check("ip")).not.toThrow();
  });
});
describe("owner-scoped persistence", () => {
  test("concurrent scenario creation stops at the per-owner storage boundary", async () => {
    const owner = await context.register("save-cap@flux.test");
    const document = JSON.stringify({
      scenario: intersection(),
      provenance: [],
    });
    for (let i = 0; i < 99; i++)
      await context.db.query(
        "INSERT INTO flux_scenarios(id,owner_id,document,updated_at) VALUES($1,$2,$3,$4)",
        [randomUUID(), owner.user.id, document, new Date().toISOString()],
      );
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        context.request(
          "/api/scenarios",
          "POST",
          { scenario: intersection() },
          owner,
        ),
      ),
    );
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 409)).toHaveLength(7);
    expect(
      (
        await context.request<ServerScenario[]>(
          "/api/scenarios",
          "GET",
          undefined,
          owner,
        )
      ).data,
    ).toHaveLength(100);
  });
  test("concurrent imports stop at the dataset boundary without retaining rejected raw files", async () => {
    const owner = await context.register("dataset-cap@flux.test");
    for (let i = 0; i < 19; i++)
      await context.db.query(
        "INSERT INTO flux_datasets(id,owner_id,document,raw_content,created_at) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          owner.user.id,
          JSON.stringify({
            provenance: {},
            summary: "synthetic boundary fixture",
          }),
          "",
          new Date().toISOString(),
        ],
      );
    const text = readFileSync("public/data/bengaluru-osm.json", "utf8");
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        context.request("/api/import/osm", "POST", { text, metadata }, owner),
      ),
    );
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 409)).toHaveLength(4);
    const [count] = await context.db.query(
      "SELECT COUNT(*) AS total FROM flux_datasets WHERE owner_id=$1",
      [owner.user.id],
    );
    expect(Number(count.total)).toBe(20);
  });
  test("create/read/update/delete survives independent requests with per-user isolation", async () => {
    const created = await context.request<ServerScenario>(
      "/api/scenarios",
      "POST",
      { scenario: intersection() },
      alice,
    );
    expect(created.status).toBe(201);
    const id = created.data.id;
    expect(
      (
        await context.request<ServerScenario[]>(
          `/api/scenarios`,
          "GET",
          undefined,
          bob,
        )
      ).data,
    ).toEqual([]);
    for (const method of ["GET", "PUT", "DELETE"])
      expect(
        (
          await context.request(
            `/api/scenarios/${id}`,
            method,
            method === "PUT" ? { scenario: flyover() } : undefined,
            bob,
          )
        ).status,
      ).toBe(404);
    expect(
      (
        await context.request(
          `/api/scenarios/${id}`,
          "PUT",
          { scenario: { ...intersection(), name: "Updated server network" } },
          alice,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await context.request<ServerScenario>(
          `/api/scenarios/${id}`,
          "GET",
          undefined,
          alice,
        )
      ).data.scenario.name,
    ).toBe("Updated server network");
    expect(
      (
        await context.request(
          `/api/scenarios/${id}`,
          "DELETE",
          undefined,
          alice,
        )
      ).status,
    ).toBe(200);
    expect(
      (await context.request(`/api/scenarios/${id}`, "GET", undefined, alice))
        .status,
    ).toBe(404);
  });
  test("rejects malformed scenarios, owner injection and excess properties", async () => {
    for (const data of [
      { scenario: {} },
      { scenario: intersection(), owner_id: bob.user.id },
      { scenario: { ...intersection(), seed: -1 } },
    ])
      expect(
        (await context.request("/api/scenarios", "POST", data, alice)).status,
      ).toBe(400);
  });
  test("persists imported raw data, provenance, hash and normalized network with owner isolation", async () => {
    const text = readFileSync("public/data/bengaluru-osm.json", "utf8");
    const result = await context.request<ImportedData & { id: string }>(
      "/api/import/osm",
      "POST",
      { text, metadata },
      alice,
    );
    expect(result.status).toBe(201);
    const id = result.data.id;
    expect(
      (
        await context.request(
          `/api/datasets/${id}/raw`,
          "GET",
          undefined,
          alice,
        )
      ).data,
    ).toEqual(JSON.parse(text));
    expect(
      (await context.request(`/api/datasets/${id}`, "GET", undefined, bob))
        .status,
    ).toBe(404);
    expect(
      (await context.request(`/api/datasets/${id}`, "DELETE", undefined, bob))
        .status,
    ).toBe(404);
    expect(
      (
        await context.request<ImportedData>(
          `/api/datasets/${id}`,
          "GET",
          undefined,
          alice,
        )
      ).data.provenance.sha256,
    ).toBe(result.data.provenance.sha256);
    expect(
      (await context.request("/api/datasets", "GET", undefined, alice)).status,
    ).toBe(200);
    expect(
      (await context.request(`/api/datasets/${id}`, "DELETE", undefined, alice))
        .status,
    ).toBe(200);
  });
  test("observed count API validates before persisting and retains exact raw CSV", async () => {
    const scenario = intersection(),
      d = scenario.demand[0],
      text = `origin,destination,count,interval_seconds,observed_at\n${d.origin},${d.destination},60,300,2026-11-06T00:00:00Z\n`;
    const result = await context.request<ImportedData & { id: string }>(
      "/api/import/demand",
      "POST",
      { text, scenario, metadata },
      alice,
    );
    expect(result.status).toBe(201);
    expect(result.data.scenario.demand[0].rate).toBe(720);
    expect(
      (
        await context.request(
          `/api/datasets/${result.data.id}/raw`,
          "GET",
          undefined,
          alice,
        )
      ).data,
    ).toBe(text);
    expect(
      (
        await context.request(
          "/api/import/demand",
          "POST",
          { text: "broken", scenario, metadata },
          alice,
        )
      ).status,
    ).toBe(400);
    await context.request(
      `/api/datasets/${result.data.id}`,
      "DELETE",
      undefined,
      alice,
    );
  });
});
describe("server simulation execution", () => {
  test("isolated server results exactly match the deterministic headless engine", async () => {
    const scenario = { ...intersection(), duration: 60 },
      created = await context.request<ServerJob>(
        "/api/jobs",
        "POST",
        { scenario },
        alice,
      );
    expect(created.status).toBe(202);
    expect(
      (
        await context.request(
          `/api/jobs/${created.data.id}`,
          "GET",
          undefined,
          bob,
        )
      ).status,
    ).toBe(404);
    const job = await waitForJob(context, created.data.id, alice);
    expect(job.status).toBe("completed");
    expect(job.progress).toBe(100);
    expect(job.results).toEqual([experimentForExport(runExperiment(scenario))]);
    expect(
      (
        await context.request(
          `/api/jobs/${job.id}/cancel`,
          "POST",
          undefined,
          bob,
        )
      ).status,
    ).toBe(404);
    expect(
      (await context.request(`/api/jobs/${job.id}`, "DELETE", undefined, bob))
        .status,
    ).toBe(409);
    expect(
      (await context.request(`/api/jobs/${job.id}`, "DELETE", undefined, alice))
        .status,
    ).toBe(200);
  });
  test("paired job preserves shared seed, horizon and exact arrivals", async () => {
    const baseline = { ...intersection(), duration: 40 },
      scenario = { ...flyover(), duration: 100, seed: 123 };
    const result = await context.request<ServerJob>(
      "/api/jobs",
      "POST",
      { scenario, baseline },
      alice,
    );
    const job = await waitForJob(context, result.data.id, alice);
    expect(job.status).toBe("completed");
    expect(job.results).toHaveLength(2);
    expect(job.results![0].metrics.time).toBe(40);
    expect(job.results![1].metrics.generated).toBe(
      job.results![0].metrics.generated,
    );
    expect(job.results![1].metrics.time).toBe(40);
  });
  test("unobserved completed averages are null and zero demand is handled", async () => {
    const result = await context.request<ServerJob>(
      "/api/jobs",
      "POST",
      { scenario: { ...intersection(), duration: 10, demand: [] } },
      alice,
    );
    const job = await waitForJob(context, result.data.id, alice);
    expect(job.results![0].metrics.meanTravelTime).toBeNull();
    expect(job.results![0].metrics.generated).toBe(0);
  });
  test("cancels queued/running work, enforces admission and leaves API responsive", async () => {
    const scenario = { ...intersection(), duration: 3600, maxVehicles: 10000 };
    const created: ServerJob[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await context.request<ServerJob>(
        "/api/jobs",
        "POST",
        { scenario },
        bob,
      );
      expect(r.status).toBe(202);
      created.push(r.data);
    }
    expect(
      (await context.request("/api/jobs", "POST", { scenario }, bob)).status,
    ).toBe(429);
    const health = await context.request("/api/health");
    expect(health.status).toBe(200);
    expect(health.elapsed).toBeLessThan(1000);
    for (const j of created.reverse())
      expect(
        (
          await context.request<ServerJob>(
            `/api/jobs/${j.id}/cancel`,
            "POST",
            undefined,
            bob,
          )
        ).data.status,
      ).toBe("cancelled");
    expect(
      (
        await context.request(
          `/api/jobs/${created[0].id}`,
          "DELETE",
          undefined,
          bob,
        )
      ).status,
    ).toBe(200);
  });
});
test("database and sessions survive process-equivalent restart; interrupted jobs become failed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flux-backend-"));
  let persistent: Awaited<ReturnType<typeof backendFixture>> | undefined;
  try {
    persistent = await backendFixture({ directory });
    const user = await persistent.register("persistent@flux.test");
    const saved = await persistent.request<ServerScenario>(
      "/api/scenarios",
      "POST",
      { scenario: intersection() },
      user,
    );
    await persistent.db.query(
      "INSERT INTO flux_jobs(id,owner_id,name,status,progress,input,created_at) VALUES($1,$2,$3,'running',10,$4,$5)",
      [
        "00000000-0000-0000-0000-000000000000",
        user.user.id,
        "Interrupted",
        JSON.stringify({ scenario: intersection(), provenance: [] }),
        new Date().toISOString(),
      ],
    );
    await persistent.close();
    persistent = undefined;
    persistent = await backendFixture({ directory });
    expect(
      (
        await persistent.request<ServerScenario>(
          `/api/scenarios/${saved.data.id}`,
          "GET",
          undefined,
          user,
        )
      ).data.scenario,
    ).toEqual(intersection());
    const interrupted = await persistent.request<ServerJob>(
      "/api/jobs/00000000-0000-0000-0000-000000000000",
      "GET",
      undefined,
      user,
    );
    expect(interrupted.data.status).toBe("failed");
    expect(interrupted.data.error).toContain("restarted");
  } finally {
    await persistent?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("worker timeout is persisted and the queue recovers", async () => {
  const isolated = await backendFixture({ jobTimeoutMs: 1 });
  try {
    const user = await isolated.register("timeout@flux.test");
    const result = await isolated.request<ServerJob>(
      "/api/jobs",
      "POST",
      { scenario: { ...intersection(), duration: 3600 } },
      user,
    );
    const job = await waitForJob(isolated, result.data.id, user);
    expect(job.status).toBe("failed");
    expect(job.error).toContain("resource limit");
    expect((await isolated.request("/api/health")).status).toBe(200);
  } finally {
    await isolated.close();
  }
});
