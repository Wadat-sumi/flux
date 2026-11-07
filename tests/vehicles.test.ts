import { expect, test } from "vitest";
import {
  defaultVehicleProfiles,
  fleetSchema,
  SNAPSHOT_STRIDE,
  vehicleTypeIds,
  bodyShapes,
  profileMatchesReference,
} from "../src/model/vehicles";
import references from "../src/data/vehicle-references.json" with { type: "json" };
import { vehicleGlyphs } from "../src/ui/vehicle-shapes";
import {
  parseScenario,
  exportScenario,
  importScenario,
} from "../src/model/schema";
import { generateDemand } from "../src/engine/demand";
import { Simulation } from "../src/engine/simulation";
import { Network } from "../src/engine/network";
import { idmAcceleration, type Vehicle } from "../src/engine/vehicle";
import { pairedScenarios } from "../src/engine/experiment";
import { experimentForExport } from "../src/ui/observations";
import {
  bottleneck,
  freeRoad,
  intersection,
  rampScenario,
} from "../src/scenarios/presets";
import { importOsm } from "../server/imports";
import { roundaboutFixture } from "./roundabout-fixture";
import { mapBounds, mapMetadata } from "./map-fixtures";
import { mixedFleet } from "./vehicle-fixture";

function check(sim: Simulation) {
  const m = sim.metrics();
  expect(m.generated).toBe(m.active + m.completed + m.rejected);
  for (const t of m.vehicleTypes!)
    expect(t.generated).toBe(t.active + t.completed + t.rejected);
  expect(m.vehicleTypes!.reduce((sum, t) => sum + t.generated, 0)).toBe(
    m.generated,
  );
  expect(m.vehicleTypes!.reduce((sum, t) => sum + t.completed, 0)).toBe(
    m.completed,
  );
  const lanes = new Map<string, Vehicle[]>();
  for (const v of sim.vehicles.values()) {
    const edge = sim.network.edges.get(v.edge)!;
    expect(v.position).toBeGreaterThanOrEqual(v.length - 1e-6);
    expect(v.position).toBeLessThanOrEqual(edge.length + 1e-6);
    expect(v.speed).toBeGreaterThanOrEqual(0);
    expect(v.speed).toBeLessThanOrEqual(
      Math.min(edge.speedLimit, v.profile!.maxSpeed) + 1e-6,
    );
    expect(v.profile!.width).toBeLessThanOrEqual(
      edge.width / edge.lanes + 1e-6,
    );
    const key = `${v.edge}:${v.lane}`;
    lanes.set(key, [...(lanes.get(key) ?? []), v]);
  }
  for (const lane of lanes.values()) {
    lane.sort((a, b) => b.position - a.position);
    for (let i = 1; i < lane.length; i++)
      expect(
        lane[i - 1].position - lane[i - 1].length - lane[i].position,
      ).toBeGreaterThanOrEqual(lane[i].profile!.minGap - 1e-6);
  }
}
test.each(defaultVehicleProfiles)(
  "$id uses its dimensions, acceleration and speed cap in packed snapshots",
  (profile) => {
    const s = freeRoad();
    s.duration = 120;
    s.demand[0].rate = 600;
    s.edges[0].speedLimit = 40;
    s.fleet = [{ ...profile, share: 100 }];
    const sim = new Simulation(s);
    sim.step(3000);
    check(sim);
    expect(sim.vehicles.size).toBeGreaterThan(0);
    const states = sim.snapshot();
    expect(states.length).toBe(sim.vehicles.size * SNAPSHOT_STRIDE);
    for (let i = 0; i < states.length; i += SNAPSHOT_STRIDE) {
      expect(states[i + 9]).toBeCloseTo(profile.length, 4);
      expect(states[i + 10]).toBeCloseTo(profile.width, 4);
      expect(states[i + 11]).toBe(vehicleTypeIds.indexOf(profile.id));
      expect(states[i + 12]).toBe(bodyShapes.indexOf(profile.bodyShape!));
      expect(states[i + 4]).toBeLessThanOrEqual(profile.maxSpeed + 1e-5);
    }
    expect(idmAcceleration(0, 10, Infinity, 0, profile)).toBe(
      profile.acceleration,
    );
  },
);
test("fleet selection leaves arrival times unchanged and paired networks share vehicle assignments", () => {
  const a = intersection(),
    b = bottleneck();
  a.fleet = mixedFleet();
  b.fleet = [{ ...defaultVehicleProfiles[4], share: 100 }];
  const legacy = generateDemand({ ...a, fleet: undefined }),
    mixed = generateDemand(a);
  expect(mixed.map((v) => [v.time, v.origin, v.destination])).toEqual(
    legacy.map((v) => [v.time, v.origin, v.destination]),
  );
  const [first, second] = pairedScenarios(a, b);
  expect(generateDemand(first)).toEqual(generateDemand(second));
  expect(first.fleet).toEqual(second.fleet);
  expect(first.fleet).not.toBe(second.fleet);
  expect(new Set(mixed.map((v) => v.vehicleType)).size).toBe(6);
  expect(generateDemand(a)).toEqual(mixed);
});
test("zero-share types never spawn and legacy files retain the original car model", () => {
  const s = freeRoad();
  s.duration = 600;
  s.demand[0].rate = 600;
  const legacy = generateDemand(s);
  expect(
    legacy.every(
      (v) =>
        v.vehicleType === "car" &&
        !v.profile &&
        v.length >= 4.2 &&
        v.length <= 5.4,
    ),
  ).toBe(true);
  s.fleet = defaultVehicleProfiles.map((p) => ({
    ...p,
    share: p.id === "truck" ? 100 : 0,
  }));
  expect(
    generateDemand(s).every(
      (v) =>
        v.vehicleType === "truck" &&
        v.length === defaultVehicleProfiles[5].length,
    ),
  ).toBe(true);
  expect(importScenario(exportScenario(s))).toEqual(s);
});
test("vehicles choose a fitting alternative and oversized vehicles never enter a lane", () => {
  const s = freeRoad(),
    truck = { ...defaultVehicleProfiles[5], share: 100 };
  s.nodes.push({
    id: "mid",
    x: 2500,
    y: 300,
    kind: "waypoint",
    control: "priority",
    layer: 0,
  });
  s.edges[0].width = 2;
  s.edges.push(
    {
      ...s.edges[0],
      id: "alt1",
      from: "source",
      to: "mid",
      width: 3.5,
      length: 3000,
    },
    {
      ...s.edges[0],
      id: "alt2",
      from: "mid",
      to: "sink",
      width: 3.5,
      length: 3000,
    },
  );
  const network = new Network(s);
  expect(network.route("source", "sink")).toEqual(["road"]);
  expect(network.route("source", "sink", truck)).toEqual(["alt1", "alt2"]);
  s.edges = s.edges.slice(0, 1);
  s.fleet = [truck];
  const sim = new Simulation(s);
  sim.step(3000);
  check(sim);
  expect(sim.metrics().rejected).toBeGreaterThan(0);
  expect(sim.vehicles.size).toBe(0);
});
test("exact body-plus-gap storage and lane width fit are allowed, smaller segments are excluded", () => {
  const s = freeRoad(),
    p = { ...defaultVehicleProfiles[4], share: 100 };
  s.edges[0].length = p.length + p.minGap;
  s.edges[0].width = p.width;
  expect(new Network(s).route("source", "sink", p)).toEqual(["road"]);
  s.edges[0].length -= 0.01;
  expect(new Network(s).route("source", "sink", p)).toBeNull();
  s.edges[0].length = 100;
  s.edges[0].width -= 0.01;
  expect(new Network(s).route("source", "sink", p)).toBeNull();
});
test("body length and minimum gap change road storage", () => {
  const moving: number[] = [];
  for (const index of [1, 4]) {
    const s = freeRoad();
    s.duration = 120;
    s.edges[0].length = 120;
    s.edges[0].speedLimit = 2;
    s.demand[0].rate = 7200;
    s.fleet = [{ ...defaultVehicleProfiles[index], share: 100 }];
    const sim = new Simulation(s);
    sim.step(3600);
    check(sim);
    moving.push(sim.vehicles.size);
  }
  expect(moving[0]).toBeGreaterThan(moving[1]);
});
test("fractional lane division and body-plus-gap sums do not reject an exact fit", () => {
  const s = freeRoad();
  s.duration = 10;
  s.demand[0].rate = 7200;
  s.edges[0] = {
    ...s.edges[0],
    width: 2.4,
    lanes: 3,
    length: 10.2,
    speedLimit: 2,
  };
  s.fleet = [
    { ...defaultVehicleProfiles[1], share: 100, length: 9.3, minGap: 0.9 },
  ];
  expect(new Network(s).route("source", "sink", s.fleet[0])).toEqual(["road"]);
  const sim = new Simulation(s);
  sim.step(300);
  check(sim);
  expect(sim.metrics().generated).toBeGreaterThan(0);
  expect(sim.metrics().completed).toBeGreaterThan(0);
  expect(sim.metrics().rejected).toBe(0);
});
test("headway, gap and comfortable/emergency braking affect IDM response", () => {
  const p = defaultVehicleProfiles[0];
  expect(idmAcceleration(10, 15, 30, 10, { ...p, headway: 2.5 })).toBeLessThan(
    idmAcceleration(10, 15, 30, 10, { ...p, headway: 0.5 }),
  );
  expect(
    idmAcceleration(10, 15, 25, 6, { ...p, deceleration: 0.5 }),
  ).toBeLessThan(idmAcceleration(10, 15, 25, 6, { ...p, deceleration: 5 }));
  expect(
    idmAcceleration(20, 25, 0.1, 0, { ...p, emergencyDeceleration: 4 }),
  ).toBe(-4);
  expect(idmAcceleration(10, 15, 30, 10, { ...p, minGap: 5 })).toBeLessThan(
    idmAcceleration(10, 15, 30, 10, { ...p, minGap: 0.5 }),
  );
});
test.each([intersection, bottleneck, rampScenario])(
  "mixed traffic remains safe and conserved through %s",
  (create) => {
    const s = create();
    s.fleet = mixedFleet();
    const sim = new Simulation(s);
    while (!sim.done) {
      sim.step(10);
      check(sim);
    }
    expect(sim.metrics().completed).toBeGreaterThan(0);
  },
);
test("large gaps still allow junction transfer and mixed roundabout runs reproduce", () => {
  const s = intersection();
  s.fleet = [{ ...defaultVehicleProfiles[0], share: 100, minGap: 5 }];
  const sim = new Simulation(s);
  while (!sim.done) {
    sim.step(30);
    check(sim);
  }
  expect(sim.metrics().completed).toBeGreaterThan(0);
  const round = importOsm(
    { text: JSON.stringify(roundaboutFixture()), metadata: mapMetadata },
    { bounds: mapBounds, syntheticRate: 1800 },
  ).scenario;
  round.duration = 90;
  round.fleet = mixedFleet();
  const a = new Simulation(round),
    b = new Simulation(round);
  while (!a.done) {
    a.step(30);
    b.step(30);
    check(a);
  }
  expect(a.snapshot()).toEqual(b.snapshot());
  expect(a.metrics()).toEqual(b.metrics());
});
test("per-type rejection includes capacity/unreachable trips and missing report averages are null", () => {
  const s = freeRoad();
  s.fleet = mixedFleet();
  s.maxVehicles = 2;
  s.demand[0].rate = 7200;
  const sim = new Simulation(s);
  sim.step(1800);
  check(sim);
  expect(sim.metrics().rejected).toBeGreaterThan(0);
  const report = experimentForExport({
    name: s.name,
    metrics: sim.metrics(),
    history: sim.history,
    warnings: 0,
  });
  expect(
    report.metrics.vehicleTypes!.every((t) => t.meanTravelTime === null),
  ).toBe(true);
  const broken = new Simulation({ ...s, edges: [] });
  broken.step(1800);
  check(broken);
  expect(broken.metrics().rejected).toBe(broken.metrics().generated);
});
test.each([
  { length: -1 },
  { width: 0 },
  { maxSpeed: Infinity },
  { acceleration: NaN },
  { deceleration: 0 },
  { emergencyDeceleration: 2, deceleration: 6 },
  { headway: 0 },
  { minGap: 0 },
  { id: "<script>" },
  { share: 101 },
  { share: 0 },
  { mass: 1000 },
  { bodyShape: "<svg onload=alert(1)>" },
  { referenceRevision: "unverified" },
  { maxSpeed: 70.001 },
])("rejects invalid or unsupported profile fields %j", (patch) => {
  expect(() =>
    parseScenario({
      ...freeRoad(),
      fleet: [{ ...defaultVehicleProfiles[0], ...patch }],
    }),
  ).toThrow();
});
test("mix bounds reject duplicates, excess types and totals other than 100", () => {
  const p = defaultVehicleProfiles[0];
  for (const mix of [
    [],
    [{ ...p, share: 99 }],
    Array.from({ length: 7 }, () => ({ ...p, share: 100 / 7 })),
    [
      { ...p, share: 50 },
      { ...p, share: 50 },
    ],
  ])
    expect(() => fleetSchema.parse(mix)).toThrow();
  expect(fleetSchema.parse([{ ...p, share: 100 }])).toHaveLength(1);
});
test("published reference footprints and speed units survive schema/export without rounding", () => {
  const expected = [
    [3.86, 1.735, 165, 2.6],
    [2.08, 0.767, 99, 2.825],
    [2.635, 1.3, 65, 0.6],
    [3.8, 1.5, 65, 1.3],
    [12.05, 2.6, 70, 1.2],
    [8.665, 2.44, 105, 1.3],
  ];
  defaultVehicleProfiles.forEach((profile, i) => {
    const [length, width, kmh, a] = expected[i];
    expect(profile.length).toBe(length);
    expect(profile.width).toBe(width);
    expect(profile.maxSpeed * 3.6).toBeCloseTo(kmh, 10);
    expect(profile.acceleration).toBe(a);
    expect(profileMatchesReference(profile)).toBe(true);
    expect(profileMatchesReference({ ...profile, share: 25 })).toBe(true);
    expect(
      profileMatchesReference({ ...profile, length: profile.length + 0.01 }),
    ).toBe(false);
  });
  const s = {
    ...freeRoad(),
    fleet: defaultVehicleProfiles.map((p) => ({ ...p })),
  };
  expect(importScenario(exportScenario(s)).fleet).toEqual(s.fleet);
});
test("every reference has auditable source metadata and acceleration classification", () => {
  for (const source of Object.values(references.sources)) {
    expect(new URL(source.url).protocol).toBe("https:");
    expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Number.isFinite(Date.parse(source.retrievedAt))).toBe(true);
    expect(source.license.length).toBeGreaterThan(20);
  }
  for (const reference of Object.values(references.profiles)) {
    for (const id of [
      ...reference.geometrySources,
      ...reference.speedSources,
      ...reference.accelerationSources,
    ])
      expect(references.sources).toHaveProperty(id);
    expect(reference.accelerationKind).toMatch(/model|proxy|assumption/);
    expect(reference.accelerationNote.length).toBeGreaterThan(50);
  }
});
test("old explicit profiles retain custom dimensions and missing metadata without automatic migration", () => {
  const old = { ...defaultVehicleProfiles[0] };
  delete old.bodyShape;
  delete old.referenceRevision;
  const legacy = {
    ...old,
    length: 4.8,
    width: 1.8,
    acceleration: 1.5,
    share: 100,
  };
  const loaded = importScenario(
    exportScenario({
      ...freeRoad(),
      demand: [{ origin: "source", destination: "sink", rate: 600 }],
      fleet: [legacy],
    }),
  );
  expect(loaded.fleet).toEqual([legacy]);
  expect(profileMatchesReference(loaded.fleet![0])).toBe(false);
  const sim = new Simulation(loaded);
  sim.step(600);
  expect(sim.snapshot()[12]).toBe(bodyShapes.indexOf("hatchback"));
  expect(sim.snapshot()[9]).toBeCloseTo(4.8, 5);
});
test("all six original silhouettes differ and stay inside the physical footprint", () => {
  expect(
    new Set(
      Object.values(vehicleGlyphs).map((g) =>
        JSON.stringify(g.find((layer) => layer.role === "body")!.points),
      ),
    ).size,
  ).toBe(6);
  for (const glyph of Object.values(vehicleGlyphs))
    for (const layer of glyph) {
      expect(layer.points.length).toBeGreaterThanOrEqual(3);
      for (const point of layer.points)
        for (const coordinate of point) {
          expect(Number.isFinite(coordinate)).toBe(true);
          expect(Math.abs(coordinate)).toBeLessThanOrEqual(0.5);
        }
    }
});
test("body shape overrides affect the packed visual shape while physical dimensions remain unchanged", () => {
  const p = { ...defaultVehicleProfiles[0], bodyShape: "pickup" as const };
  const sim = new Simulation({
    ...freeRoad(),
    demand: [{ origin: "source", destination: "sink", rate: 600 }],
    fleet: [p],
  });
  sim.step(600);
  const states = sim.snapshot();
  expect(states.length).toBeGreaterThan(0);
  for (let i = 0; i < states.length; i += SNAPSHOT_STRIDE) {
    expect(states[i + 12]).toBe(bodyShapes.indexOf("pickup"));
    expect(states[i + 9]).toBeCloseTo(p.length, 5);
    expect(states[i + 10]).toBeCloseTo(p.width, 5);
  }
});
