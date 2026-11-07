import { afterAll, beforeAll, expect, test } from "vitest";
import { backendFixture, waitForJob } from "./backend-helpers";
import { mixedFleet } from "./vehicle-fixture";
import { intersection, flyover } from "../src/scenarios/presets";
import { Simulation } from "../src/engine/simulation";
import type { Scenario } from "../src/model/schema";

let context: Awaited<ReturnType<typeof backendFixture>>;
beforeAll(async () => {
  context = await backendFixture();
});
afterAll(async () => {
  await context?.close();
});
test("mixed vehicle profiles survive server save/reload and produce server/headless result parity", async () => {
  const auth = await context.register("vehicle-integration@flux.test"),
    scenario = intersection();
  scenario.duration = 90;
  scenario.fleet = mixedFleet();
  const input = { scenario, provenance: [] };
  const saved = await context.request<{ id: string }>(
    "/api/scenarios",
    "POST",
    input,
    auth,
  );
  expect(saved.status).toBe(201);
  const loaded = await context.request<{ scenario: Scenario }>(
    `/api/scenarios/${saved.data.id}`,
    "GET",
    undefined,
    auth,
  );
  expect(loaded.data.scenario.fleet).toEqual(scenario.fleet);
  const job = await context.request<{ id: string }>(
    "/api/jobs",
    "POST",
    input,
    auth,
  );
  expect(job.status).toBe(202);
  const result = await waitForJob(context, job.data.id, auth);
  expect(result.status).toBe("completed");
  expect(result.input.scenario.fleet).toEqual(scenario.fleet);
  const local = new Simulation(scenario);
  while (!local.done) local.step(300);
  for (const t of result.results![0].metrics.vehicleTypes!) {
    const expected = local.metrics().vehicleTypes!.find((v) => v.id === t.id)!;
    expect(t.generated).toBe(expected.generated);
    expect(t.active).toBe(expected.active);
    expect(t.completed).toBe(expected.completed);
    expect(t.rejected).toBe(expected.rejected);
    expect(t.meanTravelTime).toBe(t.completed ? expected.meanTravelTime : null);
  }
  const modified = flyover();
  modified.fleet = [{ ...scenario.fleet[4], share: 100 }];
  const paired = await context.request<{ id: string }>(
    "/api/jobs",
    "POST",
    { scenario: modified, baseline: scenario, provenance: [] },
    auth,
  );
  expect(paired.status).toBe(202);
  const comparison = await waitForJob(context, paired.data.id, auth);
  expect(comparison.status).toBe("completed");
  expect(
    comparison.results![0].metrics.vehicleTypes!.map((t) => t.generated),
  ).toEqual(
    comparison.results![1].metrics.vehicleTypes!.map((t) => t.generated),
  );
});
test("server endpoints reject hostile, excessive and inconsistent fleet profiles before storage or execution", async () => {
  const auth = await context.register("vehicle-security@flux.test"),
    scenario = intersection();
  scenario.fleet = mixedFleet();
  for (const fleet of [
    [{ ...scenario.fleet[0], id: "<script>" }],
    [{ ...scenario.fleet[0], length: -10 }],
    [{ ...scenario.fleet[0], share: 99 }],
    Array.from({ length: 100 }, () => scenario.fleet![0]),
    [{ ...scenario.fleet[0], constructor: "malicious" }],
  ]) {
    for (const path of ["/api/scenarios", "/api/jobs"])
      expect(
        (
          await context.request(
            path,
            "POST",
            { scenario: { ...scenario, fleet }, provenance: [] },
            auth,
          )
        ).status,
      ).toBe(400);
  }
  expect(
    (await context.request("/api/jobs", "GET", undefined, auth)).data,
  ).toEqual([]);
  expect(
    (await context.request("/api/scenarios", "GET", undefined, auth)).data,
  ).toEqual([]);
});
