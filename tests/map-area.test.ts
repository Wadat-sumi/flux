import { describe, expect, test } from "vitest";
import { importOsm } from "../server/imports";
import {
  areaSize,
  mapAreaSchema,
  projectPoint,
  unprojectPoint,
} from "../src/model/map-area";
import { Network } from "../src/engine/network";
import { Simulation } from "../src/engine/simulation";
import { mapBounds, mapFixture, mapMetadata } from "./map-fixtures";

function imported(fixture: unknown = mapFixture, rate = 900) {
  return importOsm(
    { text: JSON.stringify(fixture), metadata: mapMetadata },
    { bounds: mapBounds, syntheticRate: rate },
  );
}
function oneWay(direction: string) {
  const fixture = structuredClone(mapFixture);
  fixture.elements[3].tags = {
    ...fixture.elements[3].tags!,
    oneway: direction,
  } as (typeof fixture.elements)[3]["tags"];
  return fixture;
}
describe("directed selection boundary conversion", () => {
  test("clips two-way roads with separate entry/exit terminals and no spurious boundary turns", () => {
    const { scenario, provenance } = imported(),
      net = new Network(scenario),
      size = areaSize(mapBounds);
    expect(scenario.nodes.filter((n) => n.kind === "source")).toHaveLength(2);
    expect(scenario.nodes.filter((n) => n.kind === "sink")).toHaveLength(2);
    expect(scenario.nodes.filter((n) => n.kind === "junction")).toHaveLength(1);
    for (const n of scenario.nodes) {
      expect(Math.abs(n.x)).toBeLessThanOrEqual(size.width / 2 + 1e-6);
      expect(Math.abs(n.y)).toBeLessThanOrEqual(size.height / 2 + 1e-6);
      if (n.kind === "source") {
        expect(net.incoming.get(n.id)).toBeUndefined();
        expect(net.outgoing.get(n.id)).toHaveLength(1);
      }
      if (n.kind === "sink") {
        expect(net.outgoing.get(n.id)).toBeUndefined();
        expect(net.incoming.get(n.id)).toHaveLength(1);
      }
    }
    expect(scenario.demand.reduce((sum, d) => sum + d.rate, 0)).toBeCloseTo(
      900,
    );
    for (const d of scenario.demand)
      expect(net.route(d.origin, d.destination)).toHaveLength(2);
    expect(provenance.warnings.some((w) => w.includes("synthetic"))).toBe(true);
  });
  test.each(["yes", "1", "true", "-1"])(
    "respects one-way %s and determines entry by direction",
    (direction) => {
      const { scenario } = imported(oneWay(direction));
      const source = scenario.nodes.find((n) => n.kind === "source")!,
        sink = scenario.nodes.find((n) => n.kind === "sink")!;
      expect(scenario.edges).toHaveLength(2);
      expect(direction === "-1" ? source.x > sink.x : source.x < sink.x).toBe(
        true,
      );
      expect(scenario.demand).toHaveLength(1);
    },
  );
  test("crossing segments without an inside shape node still receive terminals", () => {
    const fixture = structuredClone(mapFixture);
    fixture.elements[3].nodes = [1, 3];
    expect(imported(fixture).scenario.nodes).toHaveLength(4);
    expect(imported(fixture).scenario.edges).toHaveLength(2);
  });
  test("an exact boundary node becomes a terminal; tangent and border-only roads do not inject traffic", () => {
    const fixture = structuredClone(mapFixture);
    fixture.elements[0].lon = mapBounds.west;
    const base = imported(fixture).scenario;
    fixture.elements.push(
      { type: "node", id: 4, lat: mapBounds.north, lon: 76.998 },
      { type: "node", id: 5, lat: mapBounds.north, lon: 77.002 },
      {
        type: "way",
        id: 11,
        nodes: [4, 5],
        tags: { highway: "residential", lanes: "2", maxspeed: "30" },
      },
    );
    expect(imported(fixture).scenario.nodes).toEqual(base.nodes);
  });
  test("diagonal corner crossings clip exactly and preserve direction", () => {
    const fixture = oneWay("yes");
    fixture.elements[0].lat = 11.998;
    fixture.elements[2].lat = 12.002;
    const { scenario } = imported(fixture),
      source = scenario.nodes.find((n) => n.kind === "source")!;
    expect(source.y).toBeCloseTo(areaSize(mapBounds).height / 2, 5);
    expect(source.x).toBeCloseTo(-areaSize(mapBounds).width / 2, 5);
  });
  test("dead ends stay junctions and unreachable entries receive no starter demand", () => {
    const fixture = structuredClone(mapFixture);
    fixture.elements.push(
      { type: "node", id: 4, lat: 12.002, lon: 77.0005 },
      { type: "node", id: 5, lat: 12.0005, lon: 77.0005 },
      {
        type: "way",
        id: 11,
        nodes: [4, 5],
        tags: { ...fixture.elements[3].tags!, oneway: "yes" },
      },
    );
    const { scenario } = imported(fixture);
    expect(scenario.nodes.find((n) => n.id === "osm_5_l0")?.kind).toBe(
      "junction",
    );
    expect(scenario.nodes.filter((n) => n.kind === "source")).toHaveLength(3);
    expect(scenario.demand).toHaveLength(2);
    expect(scenario.demand.every((d) => !d.origin.includes("way_11"))).toBe(
      true,
    );
  });
  test("grade-separated roads never gain an implicit junction at a shared OSM node", () => {
    const fixture = structuredClone(mapFixture);
    fixture.elements.push(
      { type: "node", id: 4, lat: 11.998, lon: 77 },
      { type: "node", id: 5, lat: 12.002, lon: 77 },
      {
        type: "way",
        id: 11,
        nodes: [4, 2, 5],
        tags: { ...fixture.elements[3].tags!, highway: "primary", layer: "1" },
      },
    );
    const { scenario } = imported(fixture);
    expect(
      scenario.nodes.filter((n) => n.id.startsWith("osm_2_")),
    ).toHaveLength(2);
    expect(
      scenario.edges.every((e) => {
        const a = scenario.nodes.find((n) => n.id === e.from)!,
          b = scenario.nodes.find((n) => n.id === e.to)!;
        return a.layer === b.layer;
      }),
    ).toBe(true);
  });
  test("sub-metre connected shape points collapse without disconnecting a road", () => {
    const fixture = structuredClone(mapFixture);
    fixture.elements.push({ type: "node", id: 4, lat: 12, lon: 77.000001 });
    fixture.elements[3].nodes = [1, 2, 4, 3];
    const { scenario, provenance } = imported(fixture);
    expect(scenario.demand).toHaveLength(2);
    expect(provenance.warnings.some((w) => w.includes("sub-metre"))).toBe(true);
    for (const d of scenario.demand)
      expect(new Network(scenario).route(d.origin, d.destination)).toHaveLength(
        2,
      );
  });
  test("zero synthetic traffic is valid and map coordinates round-trip", () => {
    expect(
      imported(mapFixture, 0).scenario.demand.every((d) => d.rate === 0),
    ).toBe(true);
    const p = projectPoint(12.0003, 77.0004, mapBounds);
    expect(unprojectPoint(p.x, p.y, mapBounds)[0]).toBeCloseTo(12.0003, 9);
    expect(unprojectPoint(p.x, p.y, mapBounds)[1]).toBeCloseTo(77.0004, 9);
  });
  test("a road leaving and re-entering is split into independent inside routes", () => {
    const fixture = oneWay("yes");
    fixture.elements.push(
      { type: "node", id: 4, lat: 11.9995, lon: 77.002 },
      { type: "node", id: 5, lat: 11.9995, lon: 77 },
      { type: "node", id: 6, lat: 11.998, lon: 77 },
    );
    fixture.elements[3].nodes = [1, 2, 3, 4, 5, 6];
    const { scenario } = imported(fixture),
      net = new Network(scenario);
    expect(scenario.demand).toHaveLength(2);
    for (const demand of scenario.demand)
      expect(net.route(demand.origin, demand.destination)).toHaveLength(2);
    expect(
      net.route(scenario.demand[0].origin, scenario.demand[1].destination),
    ).toBeNull();
  });
  test("an entirely internal road or a one-way entry with no exit is rejected", () => {
    const fixture = oneWay("yes");
    fixture.elements[0].lon = 76.9995;
    fixture.elements[2].lon = 77.0005;
    expect(() => imported(fixture)).toThrow("entry-to-exit");
    fixture.elements[0].lon = 76.998;
    expect(() => imported(fixture)).toThrow("entry-to-exit");
  });
  test("selected real-road topology runs deterministically with conservation", () => {
    const { scenario } = imported(),
      a = new Simulation(scenario),
      b = new Simulation(scenario);
    while (!a.done) a.step();
    while (!b.done) b.step();
    expect(a.metrics()).toEqual(b.metrics());
    const m = a.metrics();
    expect(m.generated).toBe(m.active + m.completed + m.rejected);
    expect(m.completed).toBeGreaterThan(0);
    expect(m.rejected).toBe(0);
  });
  test.each([
    { ...mapBounds, east: mapBounds.west },
    { ...mapBounds, north: mapBounds.south },
    { ...mapBounds, east: 78 },
    { ...mapBounds, north: 12.00001, south: 12 },
    { ...mapBounds, west: NaN },
    { ...mapBounds, north: 90 },
  ])("rejects invalid/empty/too-small/too-large bounds %#", (bounds) =>
    expect(() => mapAreaSchema.parse({ bounds })).toThrow(),
  );
  test("rejects URL/query injection and negative or excessive traffic", () => {
    for (const extra of [
      { url: "http://169.254.169.254" },
      { query: "out meta;" },
      { syntheticRate: -1 },
      { syntheticRate: 7201 },
    ])
      expect(() =>
        mapAreaSchema.parse({ bounds: mapBounds, ...extra }),
      ).toThrow();
  });
});
