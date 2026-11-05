import { describe, expect, it } from "vitest";
import { Simulation } from "../src/engine/simulation";
import { generateDemand } from "../src/engine/demand";
import { runExperiment } from "../src/engine/experiment";
import { MIN_GAP, type Vehicle } from "../src/engine/vehicle";
import {
  bottleneck,
  intersection,
  freeRoad,
  rampScenario,
} from "../src/scenarios/presets";
import {
  completedAverage,
  observedSamples,
  experimentForExport,
} from "../src/ui/observations";
import { zoomAt } from "../src/ui/camera";
import { readSaved, STORAGE_KEY } from "../src/ui/storage";
import type { Sample } from "../src/engine/statistics";

describe("audit: observed averages and camera invariants", () => {
  it("distinguishes a missing completed-trip average from a measured zero", () => {
    expect(completedAverage({ completed: 0 }, 0)).toBeNull();
    expect(completedAverage({ completed: 1 }, 0)).toBe(0);
    expect(completedAverage({ completed: 3 }, 42)).toBe(42);
  });
  it("exports unavailable averages as null without altering the numeric engine state", () => {
    const s = freeRoad();
    s.duration = 10;
    s.demand = [];
    const original = runExperiment(s),
      report = experimentForExport(original);
    expect(report.metrics.meanTravelTime).toBeNull();
    expect(report.metrics.meanWaitingTime).toBeNull();
    expect(report.metrics.meanDelay).toBeNull();
    expect(report.metrics.meanSpeed).toBeNull();
    expect(report.history.every((s) => s.meanTravelTime === null)).toBe(true);
    expect(original.metrics.meanTravelTime).toBe(0);
    expect(original.history.every((s) => s.meanTravelTime === 0)).toBe(true);
  });
  it("does not plot pre-completion sentinels as zero-duration trips", () => {
    const history: Sample[] = [
      {
        time: 1,
        completed: 0,
        throughput: 0,
        meanTravelTime: 0,
        meanSpeed: 4,
        queue: 0,
      },
      {
        time: 2,
        completed: 1,
        throughput: 1800,
        meanTravelTime: 1.5,
        meanSpeed: 8,
        queue: 0,
      },
    ];
    expect(observedSamples(history, "meanTravelTime")).toEqual([history[1]]);
    expect(observedSamples(history, "throughput")).toEqual(history);
    expect(observedSamples([], "meanTravelTime")).toEqual([]);
  });
  it.each([0.3, 1.2, 5])(
    "zoom %s preserves the anchored projected world position after pan",
    (zoom) => {
      const camera = { x: 200, y: -150, zoom: 1.7 },
        center: [number, number] = [775, 364],
        anchor: [number, number] = [800, 440];
      const next = zoomAt(camera, zoom, center, anchor);
      const before = [
        (anchor[0] - center[0] - camera.x) / camera.zoom,
        (anchor[1] - center[1] - camera.y) / camera.zoom,
      ];
      const after = [
        (anchor[0] - center[0] - next.x) / next.zoom,
        (anchor[1] - center[1] - next.y) / next.zoom,
      ];
      expect(after[0]).toBeCloseTo(before[0], 10);
      expect(after[1]).toBeCloseTo(before[1], 10);
    },
  );
  it("clamps zoom to the supported range", () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, [0, 0]).zoom).toBe(0.3);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 100, [0, 0]).zoom).toBe(5);
  });
});

describe("audit: invalid persisted library identities", () => {
  it.each(["", "same id", "x".repeat(81)])(
    "rejects invalid save ID %j",
    (id) => {
      expect(() =>
        readSaved({
          getItem: () => JSON.stringify([{ id, scenario: freeRoad() }]),
        }),
      ).toThrow();
    },
  );
  it("rejects duplicate saved IDs rather than loading an ambiguous option", () => {
    const raw = JSON.stringify([
      { id: "saved-1", scenario: freeRoad() },
      { id: "saved-1", scenario: rampScenario() },
    ]);
    expect(() => readSaved({ getItem: () => raw })).toThrow();
  });
  it("enforces the persisted library size limit on UTF-8 bytes", () => {
    const raw = '"' + "😀".repeat(1_000_001) + '"';
    expect(() =>
      readSaved({ getItem: (key) => (key === STORAGE_KEY ? raw : null) }),
    ).toThrow("too large");
  });
});

function vehicle(
  id: number,
  lane: number,
  position: number,
  speed = 0,
): Vehicle {
  return {
    id,
    lane,
    position,
    speed,
    edge: "road",
    route: ["road"],
    routeIndex: 0,
    acceleration: 0,
    desiredFactor: 1,
    length: 4.5,
    time: 0,
    origin: "source",
    destination: "sink",
    waiting: 0,
    entryTime: 0,
    status: "moving",
    laneChangeAt: 0,
  };
}
describe("audit: lane changes, priority junctions and capacity experiment", () => {
  it("changes into an empty adjacent lane to pass a slower leader", () => {
    const s = freeRoad();
    s.edges[0].lanes = 2;
    s.demand = [];
    const sim = new Simulation(s);
    sim.vehicles.set(1, vehicle(1, 0, 44));
    sim.vehicles.set(2, vehicle(2, 0, 30, 10));
    sim.step();
    expect(sim.vehicles.get(2)!.lane).toBe(1);
  });
  it("refuses a lane change when the target lane follower lacks safe space", () => {
    const s = freeRoad();
    s.edges[0].lanes = 2;
    s.demand = [];
    const sim = new Simulation(s);
    sim.vehicles.set(1, vehicle(1, 0, 44));
    sim.vehicles.set(2, vehicle(2, 0, 30, 10));
    sim.vehicles.set(3, vehicle(3, 1, 20, 30));
    sim.step();
    expect(sim.vehicles.get(2)!.lane).toBe(0);
  });
  it("resolves simultaneous T-junction requests by explicit road priority", () => {
    const s = intersection();
    s.demand = [];
    s.nodes = s.nodes
      .filter((n) => n.id !== "south")
      .map((n) =>
        n.id === "center"
          ? { ...n, control: "priority", signal: undefined }
          : n,
      );
    s.edges = s.edges
      .filter((e) => e.id !== "south-out")
      .map((e) => ({ ...e, priority: e.id === "north-in" ? 4 : 1 }));
    const sim = new Simulation(s);
    const low = {
      ...vehicle(1, 0, 298),
      edge: "west-in",
      origin: "west",
      destination: "east",
      route: ["west-in", "east-out"],
    };
    const high = {
      ...vehicle(2, 0, 298),
      edge: "north-in",
      origin: "north",
      destination: "east",
      route: ["north-in", "east-out"],
    };
    sim.vehicles.set(1, low);
    sim.vehicles.set(2, high);
    sim.step();
    expect(high.edge).toBe("east-out");
    expect(low.edge).toBe("west-in");
  });
  it("the one/two-lane bottleneck comparison shares demand and improves the expected outcomes", () => {
    const a = bottleneck(),
      b = bottleneck(2);
    expect(generateDemand(a)).toEqual(generateDemand(b));
    const baseline = runExperiment(a).metrics,
      modified = runExperiment(b).metrics;
    expect(modified.completed).toBeGreaterThan(baseline.completed);
    expect(modified.queue).toBeLessThan(baseline.queue);
    expect(modified.generated).toBe(baseline.generated);
  });
});

describe("audit: per-tick numerical safety under high demand", () => {
  for (const [name, create] of [
    ["signal", intersection],
    ["ramp", rampScenario],
    ["merge", bottleneck],
  ] as const) {
    it.each([0, 42, 4294967295])(
      `${name} remains safe at every tick for seed %s`,
      (seed) => {
        const s = create();
        s.seed = seed;
        s.duration = 60;
        s.demand = s.demand.map((d) => ({ ...d, rate: 7200 }));
        const sim = new Simulation(s);
        for (let tick = 0; tick < 1800; tick++) {
          sim.step();
          const m = sim.metrics();
          if (m.generated !== m.active + m.completed + m.rejected)
            throw new Error(`Conservation failed at tick ${tick}`);
          const lanes = new Map<string, Vehicle[]>();
          for (const v of sim.vehicles.values()) {
            if (
              !Number.isFinite(v.position) ||
              !Number.isFinite(v.speed) ||
              v.speed < 0
            )
              throw new Error(`Invalid agent ${v.id}`);
            if (v.lane < 0 || v.lane >= sim.network.edges.get(v.edge)!.lanes)
              throw new Error(`Invalid lane for ${v.id}`);
            const key = `${v.edge}/${v.lane}`;
            lanes.set(key, [...(lanes.get(key) ?? []), v]);
          }
          for (const cars of lanes.values()) {
            cars.sort((a, b) => b.position - a.position);
            for (let i = 1; i < cars.length; i++)
              if (
                cars[i - 1].position - cars[i - 1].length - cars[i].position <
                MIN_GAP - 1e-6
              )
                throw new Error(`Overlap at tick ${tick}`);
          }
        }
        expect(sim.done).toBe(true);
        expect(sim.metrics().generated).toBeGreaterThan(0);
      },
    );
  }
});
