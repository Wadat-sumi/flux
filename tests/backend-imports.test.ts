import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { importDemand, importOsm } from "../server/imports";
import { intersection } from "../src/scenarios/presets";

const metadata = {
  source: "Owner-provided survey",
  license: "Authorized research use",
  capturedAt: "2026-11-06T00:00:00Z",
};
export const osmFixture = {
  version: 0.6,
  elements: [
    { type: "node", id: 1, lat: 12, lon: 77 },
    { type: "node", id: 2, lat: 12, lon: 77.001 },
    { type: "node", id: 3, lat: 12, lon: 77.002 },
    {
      type: "way",
      id: 10,
      nodes: [1, 2, 3],
      tags: { highway: "residential", lanes: "2", maxspeed: "30" },
    },
  ],
};
const osm = (data: unknown = osmFixture) =>
  importOsm({ text: JSON.stringify(data), metadata });
const csv = (text: string, scenario = intersection()) =>
  importDemand({ text, metadata, scenario });
const header = "origin,destination,count,interval_seconds,observed_at\n";

describe("real-road ingestion", () => {
  test("rejects repeated-reference amplification before expanding a graph", () => {
    const fixture = structuredClone(osmFixture);
    const way = {
      type: "way",
      id: 20,
      nodes: Array.from({ length: 500 }, (_, i) => (i % 2) + 1),
      tags: { highway: "primary" },
    };
    expect(() =>
      osm({
        elements: [
          ...fixture.elements,
          way,
          { ...way, id: 21 },
          { ...way, id: 22 },
        ],
      }),
    ).toThrow(/segment budget/);
  });
  test("projects actual geographic coordinates in metres and preserves source/hash without invented demand", () => {
    const result = osm();
    expect(result.scenario.edges).toHaveLength(4);
    expect(result.scenario.nodes).toHaveLength(3);
    expect(result.scenario.edges[0].length).toBeCloseTo(108.765, 1);
    expect(result.scenario.edges[0].speedLimit).toBeCloseTo(30 / 3.6);
    expect(result.scenario.demand).toEqual([]);
    expect(result.provenance.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.provenance.source).toBe(metadata.source);
    expect(
      result.provenance.warnings.some((w) => w.includes("no traffic demand")),
    ).toBe(true);
  });
  test("real downloaded Bengaluru road sample parses and retains attribution", () => {
    const text = readFileSync("public/data/bengaluru-osm.json", "utf8"),
      data = JSON.parse(text);
    const result = importOsm({
      text,
      metadata: {
        source: data.flux_source,
        license: "ODbL 1.0",
        capturedAt: data.flux_captured_at,
      },
    });
    expect(result.scenario.edges.length).toBeGreaterThan(0);
    expect(result.scenario.demand).toEqual([]);
    expect(data.flux_note).toContain("OpenStreetMap");
  });
  test.each([
    ["yes", 2],
    ["-1", 2],
    ["no", 4],
  ])("oneway=%s yields the correct directed graph", (oneway, edges) => {
    const fixture = structuredClone(osmFixture);
    fixture.elements[3].tags = {
      highway: "residential",
      lanes: "2",
      maxspeed: "30",
      ...{ oneway },
    } as (typeof fixture.elements)[3]["tags"];
    const result = osm(fixture);
    expect(result.scenario.edges).toHaveLength(edges);
    if (oneway === "-1") expect(result.scenario.edges[0].from).toBe("osm_2_l0");
  });
  test("mph conversion and forward/backward lane counts", () => {
    const fixture = JSON.parse(JSON.stringify(osmFixture));
    fixture.elements[3].tags = {
      highway: "primary",
      maxspeed: "30 mph",
      lanes: "3",
      "lanes:forward": "2",
      "lanes:backward": "1",
    };
    const result = osm(fixture);
    expect(result.scenario.edges[0].speedLimit).toBeCloseTo(13.4112);
    expect(result.scenario.edges.map((e) => e.lanes)).toEqual([2, 1, 2, 1]);
  });
  test("different layers never gain an implicit junction", () => {
    const fixture = JSON.parse(JSON.stringify(osmFixture));
    fixture.elements.push({
      type: "way",
      id: 11,
      nodes: [1, 2],
      tags: { highway: "primary", bridge: "yes", layer: "1" },
    });
    const result = osm(fixture);
    expect(
      result.scenario.nodes.filter((n) => n.id.startsWith("osm_1_")),
    ).toHaveLength(2);
    expect(result.provenance.warnings.some((w) => w.includes("ramps"))).toBe(
      true,
    );
  });
  test.each([
    { elements: [] },
    { elements: [{ type: "node", id: 1, lat: Infinity, lon: 0 }] },
    { elements: [...osmFixture.elements, osmFixture.elements[0]] },
    { elements: [...osmFixture.elements, osmFixture.elements[3]] },
    { elements: osmFixture.elements.slice(1) },
    {
      elements: [
        { type: "node", id: 1, lat: 0, lon: 0 },
        { type: "node", id: 2, lat: 0, lon: 1 },
        { type: "way", id: 1, nodes: [1, 2], tags: { highway: "primary" } },
      ],
    },
  ])(
    "rejects invalid/duplicate/incomplete/oversized geographic topology %#",
    (fixture) => expect(() => osm(fixture)).toThrow(),
  );
  test("rejects dangerous or unsupported values and unknown request fields", () => {
    expect(() =>
      importOsm({
        text: JSON.stringify(osmFixture),
        metadata,
        url: "http://169.254.169.254",
      }),
    ).toThrow();
    for (const tags of [
      { highway: "primary", lanes: "99" },
      { highway: "primary", layer: "-10" },
      { highway: "primary", oneway: "reversible" },
    ]) {
      const fixture = JSON.parse(JSON.stringify(osmFixture));
      fixture.elements[3].tags = tags;
      expect(() => osm(fixture)).toThrow();
    }
  });
});
describe("observed demand ingestion", () => {
  const s = intersection(),
    d = s.demand[0];
  const row = (count = "60", interval = "300", at = "2026-11-06T00:00:00Z") =>
    `${d.origin},${d.destination},${count},${interval},${at}\n`;
  test("converts actual observed counts to hourly rate and preserves the original timestamp/hash", () => {
    const result = csv(header + row());
    expect(result.scenario.demand).toEqual([
      { origin: d.origin, destination: d.destination, rate: 720 },
    ]);
    expect(result.provenance.kind).toBe("observed-demand");
    expect(result.provenance.capturedAt).toBe(metadata.capturedAt);
  });
  test("aggregates nonoverlapping intervals by exposure time rather than averaging raw counts", () => {
    const result = csv(
      header + row("30", "300") + row("90", "900", "2026-11-06T00:05:00Z"),
    );
    expect(result.scenario.demand[0].rate).toBe(360);
  });
  test("zero observed demand is valid and no values are synthesized", () =>
    expect(csv(header + row("0")).scenario.demand[0].rate).toBe(0));
  test("BOM/quoted fields and CRLF are handled by the CSV parser", () =>
    expect(
      csv(
        "\uFEFF" +
          header.replaceAll("\n", "\r\n") +
          row().replace(d.origin, `"${d.origin}"`).replaceAll("\n", "\r\n"),
      ).scenario.demand[0].rate,
    ).toBe(720));
  test.each([
    ["-1", "300"],
    ["1.5", "300"],
    ["1", "0"],
    ["1", "Infinity"],
    ["9000", "1"],
    ["=1+1", "300"],
    ["", "300"],
  ])("rejects invalid count %s or interval %s", (count, interval) =>
    expect(() => csv(header + row(count, interval))).toThrow(),
  );
  test("rejects overlap, wrong roles, unknown columns and non-UTC dates", () => {
    expect(() => csv(header + row() + row())).toThrow(/Overlapping/);
    expect(() => csv(header + row().replace(d.origin, "unknown"))).toThrow();
    expect(() => csv("origin,destination,count\n" + row())).toThrow();
    expect(() => csv(header + row("60", "300", "yesterday"))).toThrow();
  });
  test("rejects unreachable observations instead of silently dropping trips", () => {
    const disconnected = structuredClone(s);
    disconnected.edges = [];
    expect(() => csv(header + row(), disconnected)).toThrow(
      /no directed route/,
    );
  });
});
