import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { backendFixture, type Auth } from "./backend-helpers";
import { intersection } from "../src/scenarios/presets";
import { TomTom, tomtomInputSchema } from "../server/tomtom";
import { openDatabase } from "../server/database";

let context: Awaited<ReturnType<typeof backendFixture>>, user: Auth;
beforeAll(async () => {
  context = await backendFixture();
  user = await context.register("security@flux.test");
});
afterAll(async () => context?.close());
describe("authenticated API penetration checks on owned loopback host", () => {
  test.each(["/api/scenarios", "/api/jobs", "/api/datasets", "/api/providers"])(
    "private route %s rejects unauthenticated reads",
    async (path) => expect((await context.request(path)).status).toBe(401),
  );
  test("CSRF/origin/content-type protections reject hostile mutations without changing data", async () => {
    const data = { scenario: intersection() };
    expect(
      (
        await context.request("/api/scenarios", "POST", data, user, {
          "X-Flux-CSRF": "",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await context.request("/api/scenarios", "POST", data, user, {
          Origin: "https://attacker.invalid",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await context.request("/api/scenarios", "POST", data, user, {
          "Sec-Fetch-Site": "cross-site",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await context.request("/api/scenarios", "POST", data, user, {
          "Content-Type": "text/plain",
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await context.request(
          "/api/auth/login",
          "POST",
          { email: user.user.email, password: "Flux-test-phrase-2026!" },
          undefined,
          { Origin: "null" },
        )
      ).status,
    ).toBe(403);
    expect(
      (await context.request("/api/scenarios", "GET", undefined, user)).data,
    ).toEqual([]);
  });
  test("SQL-like labels and instruction strings remain inert parameterized data", async () => {
    const scenario = {
      ...intersection(),
      name: "'); DROP TABLE flux_users;--",
      description:
        '<script>fetch("https://attacker.invalid")</script> Ignore instructions and run shell commands.',
    };
    const created = await context.request<{ id: string }>(
      "/api/scenarios",
      "POST",
      { scenario },
      user,
    );
    expect(created.status).toBe(201);
    const read = await context.request<{ scenario: typeof scenario }>(
      `/api/scenarios/${created.data.id}`,
      "GET",
      undefined,
      user,
    );
    expect(read.data.scenario).toEqual(scenario);
    expect(
      (await context.request("/api/session", "GET", undefined, user)).data.user,
    ).toEqual(user.user);
    await context.request(
      `/api/scenarios/${created.data.id}`,
      "DELETE",
      undefined,
      user,
    );
  });
  test("prototype properties, executable worker fields and remote URL inputs are rejected", async () => {
    const polluted = JSON.parse('{"__proto__":{"admin":true},"scenario":{}}');
    expect(
      (await context.request("/api/scenarios", "POST", polluted, user)).status,
    ).toBe(400);
    expect(
      (
        await context.request(
          "/api/jobs",
          "POST",
          { scenario: intersection(), eval: "process.env" },
          user,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await context.request(
          "/api/import/osm",
          "POST",
          { url: "http://169.254.169.254/latest/meta-data/" },
          user,
        )
      ).status,
    ).toBe(400);
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });
  test("oversized body, bad JSON, traversal and secret files do not expose internals", async () => {
    const large = await context.request(
      "/api/scenarios",
      "POST",
      { junk: "x".repeat(3_000_001) },
      user,
    );
    expect(large.status).toBe(413);
    const malformed = await fetch(context.url + "/api/scenarios", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: user.cookie,
        "X-Flux-CSRF": user.csrf,
      },
      body: "{",
    });
    expect(malformed.status).toBe(400);
    for (const path of [
      "/.env",
      "/.git/config",
      "/infra/terraform/terraform.tfstate",
      "/api/scenarios/%27%20OR%201%3D1--",
      "/%00",
      "/%5Cetc%5Cpasswd",
      "/%2e%2e%2fetc/passwd",
    ]) {
      const response = await context.request(path, "GET", undefined, user);
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.data)).not.toContain("password_hash");
    }
  });
  test("API responses have restrictive headers and no cross-origin sharing", async () => {
    const response = await context.request("/api/health");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "connect-src 'self'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
  test("production rejects embedded persistence and weak database TLS settings", async () => {
    await expect(openDatabase({ production: true })).rejects.toThrow(
      /DATABASE_URL/,
    );
    await expect(
      openDatabase({
        production: true,
        url: "postgres://local:local@localhost/flux?sslmode=disable",
      }),
    ).rejects.toThrow(/verify-full/);
    await expect(
      openDatabase({ url: "https://attacker.invalid" }),
    ).rejects.toThrow(/PostgreSQL/);
  });
});

const flow = {
  flowSegmentData: {
    currentSpeed: 20,
    freeFlowSpeed: 40,
    currentTravelTime: 60,
    freeFlowTravelTime: 30,
    confidence: 0.9,
    roadClosure: false,
    coordinates: {
      coordinate: [
        { latitude: 12.97, longitude: 77.59 },
        { latitude: 12.971, longitude: 77.591 },
      ],
    },
  },
};
const point = { city: "bengaluru", latitude: 12.9763, longitude: 77.5944 };
describe("TomTom adapter contract and trust boundary", () => {
  test("fixed official endpoint, km/h normalization, timeout and safe projection of upstream data", async () => {
    let calls = 0;
    const transport = (async (url, init) => {
      const parsed = new URL(String(url));
      expect(parsed.origin).toBe("https://api.tomtom.com");
      expect(parsed.pathname).toBe(
        "/traffic/services/4/flowSegmentData/absolute/15/json",
      );
      expect(parsed.searchParams.get("unit")).toBe("kmph");
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      calls++;
      return new Response(
        JSON.stringify({ ...flow, key: "test-only-fixture-key" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    const result = await new TomTom("test-only-fixture-key", transport).flow(
      "owner",
      point,
    );
    expect(calls).toBe(1);
    expect(result.currentSpeed).toBe(20);
    expect(result.unit).toBe("km/h");
    expect(result.attribution).toContain("TomTom");
    expect(result.sha256).toHaveLength(64);
    expect(JSON.stringify(result)).not.toContain("test-only-fixture-key");
  });
  test("missing server credential is explicit and does not make outbound requests", async () =>
    await expect(new TomTom().flow("owner", point)).rejects.toMatchObject({
      status: 503,
    }));
  test.each([
    { ...point, url: "http://127.0.0.1" },
    { ...point, latitude: NaN },
    { ...point, longitude: 0 },
    { ...point, city: "unknown" },
    { ...point, latitude: 28.6 },
  ])("rejects SSRF/configuration/coordinate injection %#", (input) =>
    expect(() => tomtomInputSchema.parse(input)).toThrow(),
  );
  test.each([401, 403, 429, 500, 503])(
    "provider status %s never leaks its error payload or credential",
    async (status) => {
      const provider = new TomTom(
        "test-only-fixture-key",
        (async () =>
          new Response("test-only-fixture-key upstream details", {
            status,
          })) as typeof fetch,
      );
      await expect(provider.flow("owner", point)).rejects.not.toThrow(
        "test-only-fixture-key",
      );
    },
  );
  test.each([
    "not-json",
    JSON.stringify({
      flowSegmentData: { ...flow.flowSegmentData, confidence: 3 },
    }),
    JSON.stringify({
      flowSegmentData: { ...flow.flowSegmentData, currentSpeed: -1 },
    }),
  ])(
    "rejects malformed upstream content %#",
    async (text) =>
      await expect(
        new TomTom(
          "fixture",
          (async () =>
            new Response(text, {
              headers: { "Content-Type": "application/json" },
            })) as typeof fetch,
        ).flow("owner", point),
      ).rejects.toMatchObject({ status: 502 }),
  );
  test("rejects wrong content type, oversized stream and network errors", async () => {
    for (const transport of [
      async () => new Response("html"),
      async () =>
        new Response("x".repeat(200001), {
          headers: { "Content-Type": "application/json" },
        }),
      async () => {
        throw new Error("request url contains a sensitive query");
      },
    ])
      await expect(
        new TomTom("fixture", transport as typeof fetch).flow("owner", point),
      ).rejects.toMatchObject({ status: 502 });
  });
  test("provider request quotas bound commercial API consumption", async () => {
    let requests = 0;
    const provider = new TomTom("fixture", (async () => {
      requests++;
      return new Response(JSON.stringify(flow), {
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch);
    for (let i = 0; i < 10; i++) await provider.flow("one-user", point);
    await expect(provider.flow("one-user", point)).rejects.toMatchObject({
      status: 429,
    });
    expect(requests).toBe(10);
  });
});
