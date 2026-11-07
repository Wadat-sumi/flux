import type { RoadEdge, RoadNode } from "./schema";
export interface Point {
  x: number;
  y: number;
}
export function roadPoints(edge: RoadEdge, a: Point, b: Point): Point[] {
  return [a, ...(edge.shape ?? []), b];
}
export function pathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  return length;
}
export function samplePath(
  points: Point[],
  fraction: number,
): { x: number; y: number; angle: number } {
  const length = pathLength(points),
    target = Math.max(0, Math.min(1, fraction)) * length;
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 0 && (travelled + d >= target || i === points.length - 1)) {
      const t = Math.max(0, Math.min(1, (target - travelled) / d));
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    travelled += d;
  }
  return { ...points[0], angle: 0 };
}
export function nodePoints(nodes: Map<string, RoadNode>, edge: RoadEdge) {
  return roadPoints(edge, nodes.get(edge.from)!, nodes.get(edge.to)!);
}
