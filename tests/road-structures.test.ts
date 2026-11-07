import { describe, expect, test } from "vitest";
import { importOsm } from "../server/imports";
import {
  parseScenario,
  exportScenario,
  importScenario,
} from "../src/model/schema";
import { Network } from "../src/engine/network";
import { Simulation } from "../src/engine/simulation";
import { deleteSelection } from "../src/ui/editor";
import { mapBounds, mapFixture, mapMetadata } from "./map-fixtures";
import { roundaboutFixture } from "./roundabout-fixture";
import { pathLength, nodePoints } from "../src/model/road-geometry";
const load = (fixture: unknown = roundaboutFixture()) =>
  importOsm(
    { text: JSON.stringify(fixture), metadata: mapMetadata },
    { bounds: mapBounds, syntheticRate: 900 },
  );
describe("major roads and topology-aware simplification", () => {
  test("hundreds of curved shape points do not exhaust the junction budget", () => {
    const elements: typeof mapFixture.elements = [];
    for (let i = 0; i < 800; i++)
      elements.push({
        type: "node",
        id: i + 1,
        lat: 12 + Math.sin(i / 60) * 0.0001,
        lon: 76.998 + (i * 0.004) / 799,
      });
    elements.push({
      type: "way",
      id: 10,
      nodes: Array.from({ length: 800 }, (_, i) => i + 1),
      tags: { highway: "primary", oneway: "yes", maxspeed: "30", lanes: "1" },
    });
    const { scenario } = load({ elements });
    expect(scenario.nodes).toHaveLength(2);
    expect(scenario.edges).toHaveLength(1);
    expect(scenario.edges[0].shape!.length).toBeGreaterThan(100);
    expect(scenario.edges[0].length).toBeLessThan(300);
  });
  test("unrelated buildings and outside unsupported roads do not consume the simulation budget", () => {
    const fixture = structuredClone(mapFixture);
    for (let i = 0; i < 4000; i++)
      fixture.elements.push({ type: "node", id: 1000 + i, lat: 12, lon: 77 });
    fixture.elements.push(
      { type: "node", id: 6001, lat: 12.01, lon: 77 },
      { type: "node", id: 6002, lat: 12.02, lon: 77 },
      {
        type: "way",
        id: 99,
        nodes: [6001, 6002],
        tags: { highway: "primary", oneway: "reversible" },
      },
    );
    expect(load(fixture).scenario.nodes).toHaveLength(4);
  });
  test.each([
    "cycleway",
    "footway",
    "path",
    "pedestrian",
    "steps",
    "residential",
    "service",
    "living_street",
    "unclassified",
    "track",
  ])("excludes %s from map imports", (highway) => {
    const fixture = structuredClone(mapFixture);
    fixture.elements[3].tags!.highway = highway;
    expect(() => load(fixture)).toThrow("No major motor roads");
  });
  test.each([
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "primary_link",
    "secondary_link",
  ])("imports %s as a major road", (highway) => {
    const fixture = structuredClone(mapFixture);
    fixture.elements[3].tags!.highway = highway;
    expect(load(fixture).scenario.edges.length).toBeGreaterThan(0);
  });
  test("motorcar/vehicle restrictions override major-road classification", () => {
    for (const tag of ["vehicle", "motorcar", "motor_vehicle", "access"]) {
      const f = structuredClone(mapFixture);
      f.elements[3].tags![tag] = "no";
      expect(() => load(f)).toThrow("No major motor roads");
    }
  });
  test("signals and changes in road attributes remain real connection nodes", () => {
    const fixture = structuredClone(mapFixture);
    fixture.elements[1].tags = { highway: "traffic_signals" };
    expect(
      load(fixture).scenario.nodes.find((n) => n.id === "osm_2_l0"),
    ).toBeDefined();
    const f = structuredClone(mapFixture);
    f.elements[3].nodes = [1, 2];
    f.elements.push({
      type: "way",
      id: 11,
      nodes: [2, 3],
      tags: { highway: "primary", maxspeed: "50", lanes: "4" },
    });
    expect(
      load(f).scenario.nodes.find((n) => n.id === "osm_2_l0"),
    ).toBeDefined();
  });
  test("a genuinely large number of terminals reports actual simplified counts", () => {
    const elements: typeof mapFixture.elements = [];
    for (let i = 0; i < 151; i++) {
      const lat = 11.9991 + (i * 0.0018) / 150;
      elements.push(
        { type: "node", id: i * 2 + 1, lat, lon: 76.998 },
        { type: "node", id: i * 2 + 2, lat, lon: 77.002 },
        {
          type: "way",
          id: 10000 + i,
          nodes: [i * 2 + 1, i * 2 + 2],
          tags: { highway: "primary", oneway: "yes" },
        },
      );
    }
    expect(() => load({ elements })).toThrow("302 junctions/terminals");
  });
});
describe("first-class grouped roundabouts", () => {
  test("one ring entity replaces 64 geometry nodes with four connection ports and four curved arcs", () => {
    const { scenario } = load();
    expect(scenario.roundabouts).toHaveLength(1);
    const r = scenario.roundabouts![0];
    expect(r.nodeIds).toHaveLength(4);
    expect(r.edgeIds).toHaveLength(4);
    expect(scenario.nodes).toHaveLength(12);
    expect(scenario.edges).toHaveLength(12);
    const net = new Network(scenario),
      arcs = scenario.edges.filter((e) => r.edgeIds.includes(e.id));
    expect(arcs.reduce((n, e) => n + e.length, 0)).toBeCloseTo(
      2 * Math.PI * 35.5823765,
      0,
    );
    for (const edge of arcs) {
      expect(edge.shape!.length).toBeGreaterThan(10);
      const mid = net.point(edge.id, edge.length / 2, 0);
      expect(Math.hypot(mid.x, mid.y)).toBeCloseTo(35.582, 0);
      expect(edge.length).toBeCloseTo(
        pathLength(nodePoints(net.nodes, edge)),
        6,
      );
      expect(net.roundaboutEdges.has(edge.id)).toBe(true);
    }
    expect(importScenario(exportScenario(scenario))).toEqual(scenario);
  });
  test("multi-way ring tags and connected lower-class roundabout arcs are grouped", () => {
    const f = roundaboutFixture(),
      way = f.elements.find((e) => e.type === "way" && e.id === 10)!;
    const nodes = way.nodes!;
    way.nodes = nodes.slice(0, 33);
    way.tags!.highway = "residential";
    f.elements.push({
      type: "way",
      id: 11,
      nodes: nodes.slice(32),
      tags: { ...way.tags },
    });
    expect(load(f).scenario.roundabouts).toHaveLength(1);
  });
  test("a clipped partial ring does not become a complete roundabout entity", () => {
    const result = importOsm(
      { text: JSON.stringify(roundaboutFixture()), metadata: mapMetadata },
      { bounds: { ...mapBounds, west: 77.00005 }, syntheticRate: 300 },
    );
    expect(result.scenario.roundabouts ?? []).toHaveLength(0);
    expect(result.scenario.demand.length).toBeGreaterThan(0);
  });
  test("simulation on the compact ring conserves trips and remains deterministic without lane overlap", () => {
    const { scenario } = load(),
      a = new Simulation(scenario),
      b = new Simulation(scenario);
    for (let i = 0; i < 9000; i++) {
      a.step();
      for (const edge of a.network.roundaboutEdges) {
        const cars = [...a.vehicles.values()]
          .filter((v) => v.edge === edge)
          .sort((x, y) => y.position - x.position);
        for (let j = 1; j < cars.length; j++)
          if (cars[j].lane === cars[j - 1].lane)
            expect(
              cars[j - 1].position - cars[j - 1].length - cars[j].position,
            ).toBeGreaterThanOrEqual(1.999);
      }
    }
    b.step(9000);
    expect(a.metrics()).toEqual(b.metrics());
    const m = a.metrics();
    expect(m.generated).toBe(m.completed + m.active + m.rejected);
    expect(m.completed).toBeGreaterThan(0);
    expect(m.rejected).toBe(0);
  });
  test("circulating traffic prevents an aged entering vehicle from cutting in", () => {
    const { scenario } = load(),
      sim = new Simulation({ ...scenario, demand: [] }),
      r = scenario.roundabouts![0],
      port = r.nodeIds[0],
      arc = scenario.edges.find(
        (e) => r.edgeIds.includes(e.id) && e.to === port,
      )!,
      next = scenario.edges.find(
        (e) => r.edgeIds.includes(e.id) && e.from === port,
      )!,
      entry = scenario.edges.find(
        (e) => !r.edgeIds.includes(e.id) && e.to === port,
      )!;
    const base = {
      time: 0,
      origin: entry.from,
      destination: next.to,
      length: 4.5,
      desiredFactor: 1,
      position: entry.length - 2.1,
      speed: 0,
      acceleration: 0,
      lane: 0,
      waiting: 100,
      entryTime: 0,
      status: "moving" as const,
      laneChangeAt: 100,
    };
    sim.vehicles.set(1, {
      ...base,
      id: 1,
      edge: entry.id,
      route: [entry.id, next.id],
      routeIndex: 0,
    });
    sim.vehicles.set(2, {
      ...base,
      id: 2,
      edge: arc.id,
      route: [arc.id, next.id],
      routeIndex: 0,
      position: arc.length - 5,
      speed: 3,
      waiting: 0,
    });
    sim.step();
    expect(sim.vehicles.get(1)!.edge).toBe(entry.id);
  });
  test("invalid rings and abusive curve geometry fail schema validation", () => {
    const { scenario } = load();
    for (const change of [
      {
        nodeIds: [
          scenario.nodes.find((n) => n.kind === "source")!.id,
          ...scenario.roundabouts![0].nodeIds.slice(1),
        ],
      },
      { edgeIds: ["missing", ...scenario.roundabouts![0].edgeIds.slice(1)] },
      {
        nodeIds: [
          ...scenario.roundabouts![0].nodeIds,
          scenario.roundabouts![0].nodeIds[0],
        ],
      },
    ])
      expect(() =>
        parseScenario({
          ...scenario,
          roundabouts: [{ ...scenario.roundabouts![0], ...change }],
        }),
      ).toThrow();
    for (const shape of [
      [{ x: Infinity, y: 0 }],
      Array.from({ length: 501 }, () => ({ x: 0, y: 0 })),
    ])
      expect(() =>
        parseScenario({
          ...scenario,
          edges: [{ ...scenario.edges[0], shape }, ...scenario.edges.slice(1)],
        }),
      ).toThrow();
  });
  test("deleting a grouped roundabout removes member ports and connected roads safely", () => {
    const { scenario } = load(),
      r = scenario.roundabouts![0],
      deleted = deleteSelection(scenario, { kind: "roundabout", id: r.id });
    expect(deleted.roundabouts).toHaveLength(0);
    expect(deleted.nodes.every((n) => !r.nodeIds.includes(n.id))).toBe(true);
    expect(deleted.edges).toHaveLength(0);
    expect(() => parseScenario(deleted)).not.toThrow();
  });
});
