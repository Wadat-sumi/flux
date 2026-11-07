import { expect, test } from "vitest";
import { importOsm } from "../server/imports";
import {
  displayRoadWidth,
  insidePolygon,
  roundaboutOutlines,
} from "../src/ui/roundabout-geometry";
import { mapBounds, mapMetadata } from "./map-fixtures";
import { roundaboutFixture } from "./roundabout-fixture";

function scenario() {
  return importOsm(
    { text: JSON.stringify(roundaboutFixture()), metadata: mapMetadata },
    { bounds: mapBounds, syntheticRate: 900 },
  ).scenario;
}
function polygon(points: number[][]) {
  const s = scenario(),
    group = s.roundabouts![0];
  group.nodeIds.forEach((id, i) => {
    const node = s.nodes.find((n) => n.id === id)!;
    [node.x, node.y] = points[i];
  });
  for (const e of s.edges) if (group.edgeIds.includes(e.id)) delete e.shape;
  return s;
}
test("mapped curved island remains inside its real outline without mutating simulation geometry", () => {
  const s = scenario(),
    before = structuredClone(s),
    [outline] = roundaboutOutlines(s);
  expect(outline.points.length).toBeGreaterThan(40);
  expect(outline.clearance).toBeCloseTo(35.5, 0);
  expect(insidePolygon(outline.centre, outline.points)).toBe(true);
  expect(outline.edgeIds).toEqual(s.roundabouts![0].edgeIds);
  expect(s).toEqual(before);
});
test("oval rings keep their aspect ratio instead of becoming a decorative circle", () => {
  const s = scenario();
  for (const n of s.nodes) n.x *= 2;
  for (const e of s.edges) for (const p of e.shape ?? []) p.x *= 2;
  const [outline] = roundaboutOutlines(s);
  const width =
    Math.max(...outline.points.map((p) => p.x)) -
    Math.min(...outline.points.map((p) => p.x));
  const height =
    Math.max(...outline.points.map((p) => p.y)) -
    Math.min(...outline.points.map((p) => p.y));
  expect(width / height).toBeCloseTo(2, 1);
  expect(outline.clearance).toBeGreaterThan(35);
  expect(outline.clearance).toBeLessThan(36);
});
test("a concave ring uses an interior anchor when its bounding-box centre is outside", () => {
  const [outline] = roundaboutOutlines(
    polygon([
      [0, 0],
      [80, 0],
      [12, 12],
      [0, 80],
    ]),
  );
  expect(insidePolygon({ x: 40, y: 40 }, outline.points)).toBe(false);
  expect(insidePolygon(outline.centre, outline.points)).toBe(true);
  expect(outline.clearance).toBeGreaterThan(0);
});
test("a tiny multilane ring keeps its island visible while ordinary roads retain their width", () => {
  const s = scenario();
  for (const n of s.nodes) {
    n.x *= 0.2;
    n.y *= 0.2;
  }
  for (const e of s.edges) {
    e.lanes = 6;
    for (const p of e.shape ?? []) {
      p.x *= 0.2;
      p.y *= 0.2;
    }
  }
  const [outline] = roundaboutOutlines(s),
    edge = s.edges.find((e) => outline.edgeIds.includes(e.id))!;
  expect(displayRoadWidth(edge, outline)).toBeLessThan(outline.clearance);
  expect(displayRoadWidth(edge)).toBe(72);
  expect(edge.lanes).toBe(6);
});
test("absent and zero-area rings do not create imaginary islands", () => {
  const s = scenario();
  delete s.roundabouts;
  expect(roundaboutOutlines(s)).toEqual([]);
  expect(
    roundaboutOutlines(
      polygon([
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0],
      ]),
    ),
  ).toEqual([]);
  expect(insidePolygon({ x: 0, y: 0 }, [])).toBe(false);
});
