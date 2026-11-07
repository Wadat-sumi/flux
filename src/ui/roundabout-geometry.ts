import type { Scenario, RoadEdge } from "../model/schema";
import { roadPoints, type Point } from "../model/road-geometry";

export interface RoundaboutOutline {
  id: string;
  layer: number;
  points: Point[];
  centre: Point;
  clearance: number;
  edgeIds: string[];
}
export function insidePolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function clearance(p: Point, polygon: Point[]) {
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      dx = b.x - a.x,
      dy = b.y - a.y,
      d = dx * dx + dy * dy,
      t = d
        ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / d))
        : 0;
    nearest = Math.min(
      nearest,
      Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t),
    );
  }
  return nearest;
}
/** Uses the mapped polygon rather than replacing oval/irregular rings with circles. */
export function roundaboutOutlines(s: Scenario): RoundaboutOutline[] {
  const nodes = new Map(s.nodes.map((n) => [n.id, n])),
    edges = new Map(s.edges.map((e) => [e.id, e])),
    outlines: RoundaboutOutline[] = [];
  for (const group of s.roundabouts ?? []) {
    const arcs = group.edgeIds.map((id) => edges.get(id)!);
    let current = group.nodeIds[0];
    const points: Point[] = [];
    for (let i = 0; i < arcs.length; i++) {
      const edge = arcs.find((e) => e.from === current);
      if (!edge) break;
      points.push(
        ...roadPoints(edge, nodes.get(edge.from)!, nodes.get(edge.to)!).slice(
          0,
          -1,
        ),
      );
      current = edge.to;
    }
    if (points.length < 3) continue;
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y),
      minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    let centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      radius = insidePolygon(centre, points) ? clearance(centre, points) : 0;
    // Concave rings may not contain their bounding-box centre. Find a safe interior label/width anchor.
    if (!radius)
      for (let x = 1; x < 8; x++)
        for (let y = 1; y < 8; y++) {
          const candidate = {
            x: minX + ((maxX - minX) * x) / 8,
            y: minY + ((maxY - minY) * y) / 8,
          };
          if (!insidePolygon(candidate, points)) continue;
          const r = clearance(candidate, points);
          if (r > radius) {
            radius = r;
            centre = candidate;
          }
        }
    if (radius > 0.05)
      outlines.push({
        id: group.id,
        layer: nodes.get(group.nodeIds[0])!.layer,
        points,
        centre,
        clearance: radius,
        edgeIds: group.edgeIds,
      });
  }
  return outlines;
}
export function displayRoadWidth(
  edge: RoadEdge,
  roundabout?: RoundaboutOutline,
) {
  const width = Math.max(20, edge.width * 2.5, edge.lanes * 12);
  return roundabout ? Math.min(width, roundabout.clearance * 0.75) : width;
}
