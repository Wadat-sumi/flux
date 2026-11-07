import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { OsmMap } from "../server/osm-map";
import { backendFixture, waitForJob } from "./backend-helpers";
import { mapBounds, mapFixture } from "./map-fixtures";
import type { ImportedData } from "../src/model/backend";

const input = { bounds: mapBounds, syntheticRate: 900 },
  text = JSON.stringify(mapFixture);
const response = () =>
  new Response(text, { headers: { "Content-Type": "application/json" } });
describe("OSM map service transport and abuse boundaries", () => {
  test("only calls the fixed HTTPS host, encodes a bounded buffered bbox, identifies Flux, and caches raw geometry", async () => {
    const request = vi.fn<typeof fetch>(async (url, options) => {
      const target = new URL(String(url));
      expect(target.origin + target.pathname).toBe(
        "https://api.openstreetmap.org/api/0.6/map.json",
      );
      expect([...target.searchParams.keys()]).toEqual(["bbox"]);
      expect(options?.redirect).toBe("error");
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(options?.headers).get("user-agent")).toContain(
        "Flux/",
      );
      return response();
    });
    const service = new OsmMap(request),
      a = await service.area("ip", input),
      b = await service.area("ip", { ...input, syntheticRate: 0 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(a.provenance.sha256).toHaveLength(64);
    expect(a.provenance.capturedAt).toBe(b.provenance.capturedAt);
    expect(b.scenario.demand.every((d) => d.rate === 0)).toBe(true);
  });
  test.each([400, 403, 429, 500])(
    "upstream %s errors never echo provider payloads",
    async (status) => {
      const service = new OsmMap(
        async () => new Response("private upstream diagnostic", { status }),
      );
      await expect(service.area("ip", input)).rejects.toMatchObject({
        status: 502,
      });
      await expect(
        new OsmMap(async () => {
          throw new Error("private upstream diagnostic");
        }).area("ip", input),
      ).rejects.not.toThrow("private upstream diagnostic");
    },
  );
  test("rejects oversized content before reading and caps chunked bodies", async () => {
    for (const response of [
      new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "2000001",
        },
      }),
      new Response(" ".repeat(2_000_001), {
        headers: { "Content-Type": "application/json" },
      }),
    ]) {
      await expect(
        new OsmMap(async () => response).area("ip", input),
      ).rejects.toMatchObject({ status: 413 });
    }
  });
  test("rejects HTML, invalid JSON and empty geometry with sanitized errors", async () => {
    await expect(
      new OsmMap(async () => new Response("<html>bad</html>")).area(
        "ip",
        input,
      ),
    ).rejects.toMatchObject({ status: 502 });
    for (const value of ["not-json", '{"elements":[]}'])
      await expect(
        new OsmMap(
          async () =>
            new Response(value, {
              headers: { "Content-Type": "application/json" },
            }),
        ).area("ip", input),
      ).rejects.toMatchObject({ status: 422 });
  });
  test("enforces the per-IP quota even on cache hits", async () => {
    const service = new OsmMap(async () => response());
    for (let i = 0; i < 6; i++) await service.area("ip", input);
    await expect(service.area("ip", input)).rejects.toMatchObject({
      status: 429,
    });
  });
  test("bounds simultaneous fetches and releases capacity after a failure", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = new OsmMap(async () => {
      await gate;
      throw new Error("timeout");
    });
    const a = service.area("a", input).catch((e) => e),
      b = service.area("b", input).catch((e) => e);
    await expect(service.area("c", input)).rejects.toMatchObject({
      status: 429,
    });
    release();
    await Promise.all([a, b]);
    await expect(service.area("d", input)).rejects.toMatchObject({
      status: 502,
    });
  });
  test("global quota also bounds cached conversions across different IPs", async () => {
    const request = vi.fn<typeof fetch>(async () => response());
    const service = new OsmMap(request);
    for (let i = 0; i < 30; i++) await service.area(`ip-${i}`, input);
    await expect(service.area("ip-31", input)).rejects.toMatchObject({
      status: 429,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  test("cache retains at most four extracts and evicts the oldest", async () => {
    const request = vi.fn<typeof fetch>(async () => response()),
      service = new OsmMap(request);
    for (let i = 0; i < 5; i++)
      await service.area(`ip-${i}`, {
        ...input,
        bounds: {
          ...mapBounds,
          east: mapBounds.east + i * 0.00001,
          west: mapBounds.west + i * 0.00001,
        },
      });
    await service.area("again", input);
    expect(request).toHaveBeenCalledTimes(6);
  });
  test("rejects URL injection before any outbound network call", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(
      new OsmMap(request).area("ip", {
        ...input,
        url: "http://169.254.169.254",
      }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
describe("map selection HTTP integration", () => {
  let context: Awaited<ReturnType<typeof backendFixture>>;
  beforeAll(async () => {
    context = await backendFixture({
      osmMap: new OsmMap(async () => response()),
    });
  });
  afterAll(async () => context?.close());
  test("anonymous read-only selection builds roads, then an authenticated user saves and simulates them", async () => {
    const mapped = await context.request<ImportedData>(
      "/api/maps/osm-area",
      "POST",
      input,
    );
    expect(mapped.status).toBe(200);
    expect(mapped.data.scenario.demand).toHaveLength(2);
    const user = await context.register("map-integration@flux.test");
    const saved = {
      scenario: mapped.data.scenario,
      provenance: [mapped.data.provenance],
    };
    expect(
      (await context.request("/api/scenarios", "POST", saved, user)).status,
    ).toBe(201);
    expect(
      (await context.request("/api/datasets", "GET", undefined, user)).data,
    ).toEqual([]);
    const job = await context.request<{ id: string }>(
      "/api/jobs",
      "POST",
      saved,
      user,
    );
    expect(job.status).toBe(202);
    const finished = await waitForJob(context, job.data.id, user);
    expect(finished.status).toBe("completed");
    expect(finished.results?.[0].metrics.completed).toBeGreaterThan(0);
    expect(finished.input.provenance[0].sha256).toBe(
      mapped.data.provenance.sha256,
    );
  });
  test("origin/content-type/strict bounds block hostile requests; private writes still require authentication", async () => {
    expect(
      (
        await context.request("/api/maps/osm-area", "POST", input, undefined, {
          Origin: "https://attacker.invalid",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await context.request("/api/maps/osm-area", "POST", input, undefined, {
          "Sec-Fetch-Site": "cross-site",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await context.request("/api/maps/osm-area", "POST", input, undefined, {
          "Content-Type": "text/plain",
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await context.request("/api/maps/osm-area", "POST", {
          ...input,
          url: "http://127.0.0.1",
        })
      ).status,
    ).toBe(400);
    expect((await context.request("/api/scenarios", "POST", {})).status).toBe(
      401,
    );
  });
});
