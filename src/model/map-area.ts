import { z } from "zod";
import {
  parseScenario,
  type RoadEdge,
  type RoadNode,
  type Scenario,
} from "./schema";
import { compactRoads, groupRoundabouts } from "./compact-roads";

const coordinate = z.number().finite();
export const boundsSchema = z
  .object({
    south: coordinate.min(-80).max(80),
    west: coordinate.min(-180).max(180),
    north: coordinate.min(-80).max(80),
    east: coordinate.min(-180).max(180),
  })
  .strict()
  .superRefine((b, ctx) => {
    const { width, height } = areaSize(b);
    if (width < 50 || height < 50 || width > 800 || height > 800)
      ctx.addIssue({
        code: "custom",
        message:
          "Select an area between 50 and 800 metres on each side; zoom in for a smaller corridor",
      });
  });
export const mapAreaSchema = z
  .object({
    bounds: boundsSchema,
    syntheticRate: coordinate.min(0).max(7200).default(900),
  })
  .strict();
export type MapBounds = z.infer<typeof boundsSchema>;
export function areaSize(b: MapBounds) {
  return {
    width:
      (b.east - b.west) *
      111194.9266 *
      Math.cos(((b.north + b.south) * Math.PI) / 360),
    height: (b.north - b.south) * 111194.9266,
  };
}
export function projectPoint(lat: number, lon: number, b: MapBounds) {
  return {
    x:
      (lon - (b.east + b.west) / 2) *
      111194.9266 *
      Math.cos(((b.north + b.south) * Math.PI) / 360),
    y: ((b.north + b.south) / 2 - lat) * 111194.9266,
  };
}
export function unprojectPoint(
  x: number,
  y: number,
  b: MapBounds,
): [number, number] {
  return [
    (b.north + b.south) / 2 - y / 111194.9266,
    (b.east + b.west) / 2 +
      x / (111194.9266 * Math.cos(((b.north + b.south) * Math.PI) / 360)),
  ];
}
/** Liang–Barsky clipping of a directed road. Boundary-only/tangent segments carry no inside flow. */
export function clipSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  height: number,
  minimumLength = 1,
) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  let start = 0,
    end = 1;
  for (const [p, q] of [
    [-dx, a.x + width / 2],
    [dx, width / 2 - a.x],
    [-dy, a.y + height / 2],
    [dy, height / 2 - a.y],
  ]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
    } else if (p < 0) start = Math.max(start, q / p);
    else end = Math.min(end, q / p);
  }
  if (end <= start || Math.hypot(dx, dy) * (end - start) < minimumLength)
    return null;
  const point = (t: number) => ({ x: a.x + dx * t, y: a.y + dy * t });
  const mid = point((start + end) / 2);
  if (
    Math.abs(mid.x) >= width / 2 - 1e-6 ||
    Math.abs(mid.y) >= height / 2 - 1e-6
  )
    return null;
  return { start, end, a: point(start), b: point(end) };
}
export function clipMapRoads(
  raw: Scenario,
  bounds: MapBounds,
  syntheticRate: number,
  context: { roundaboutEdges?: Set<string>; protectedNodes?: Set<string> } = {},
): Scenario {
  const { width, height } = areaSize(bounds),
    originals = new Map(raw.nodes.map((n) => [n.id, n]));
  const nodes = new Map<string, RoadNode>(),
    edges: RoadEdge[] = [];
  const boundary = (p: { x: number; y: number }) =>
    Math.abs(Math.abs(p.x) - width / 2) < 1e-5 ||
    Math.abs(Math.abs(p.y) - height / 2) < 1e-5;
  for (const edge of raw.edges) {
    const a = originals.get(edge.from)!,
      b = originals.get(edge.to)!;
    // Keep short boundary pieces until compaction; dropping them here can erase
    // the only entry/exit of a densely sampled road.
    const part = clipSegment(a, b, width, height, 0.000001);
    if (!part) continue;
    const endpoint = (
      n: RoadNode,
      p: { x: number; y: number },
      kind: "source" | "sink",
    ) => {
      // Separate terminals for each direction: never allow a boundary node to turn traffic back into the area.
      const id = boundary(p)
        ? `${kind === "source" ? "entry" : "exit"}_${edge.id}`
        : n.id;
      nodes.set(id, { ...n, ...p, id, kind: boundary(p) ? kind : "junction" });
      return id;
    };
    edges.push({
      ...edge,
      from: endpoint(a, part.a, "source"),
      to: endpoint(b, part.b, "sink"),
      length: Math.max(
        10,
        Math.hypot(part.b.x - part.a.x, part.b.y - part.a.y),
      ),
    });
  }
  const compact = compactRoads(
    { ...raw, nodes: [...nodes.values()], edges },
    context.roundaboutEdges,
    context.protectedNodes,
  );
  if (
    compact.scenario.nodes.length > 300 ||
    compact.scenario.edges.length > 1000
  )
    throw new Error(
      `After simplifying road shapes, this selection still has ${compact.scenario.nodes.length} junctions/terminals and ${compact.scenario.edges.length} roads (limits 300/1,000). Choose a smaller major-road corridor.`,
    );
  const roundabouts = groupRoundabouts(
    compact.scenario,
    compact.roundaboutEdges,
  );
  const compactNodes = new Map(compact.scenario.nodes.map((n) => [n.id, n]));
  if (
    compact.scenario.edges.some((e) => {
      const a = compactNodes.get(e.from)!,
        b = compactNodes.get(e.to)!;
      return Math.hypot(a.x - b.x, a.y - b.y) < 1;
    })
  )
    throw new Error(
      "The selection boundary lies within one metre of a real road connection. Move the rectangle edge a few metres and preview again.",
    );
  const scenario = parseScenario({
    ...raw,
    name: "OpenStreetMap selected area",
    nodes: compact.scenario.nodes,
    edges: compact.scenario.edges,
    ...(roundabouts.length ? { roundabouts } : {}),
    demand: [],
    description: `© OpenStreetMap contributors — ODbL. Selected bounds S/W/N/E: ${bounds.south},${bounds.west},${bounds.north},${bounds.east}. Automatic directed boundary terminals. Synthetic total demand ${syntheticRate} vehicles/hour; no observed counts or signal timings.`,
  });
  if (!edges.length)
    throw new Error(
      "No major motor roads cross this selection. Move it over a primary, secondary or tertiary road; residential streets, alleys and paths are excluded.",
    );
  const outgoing = new Map<string, string[]>();
  for (const e of scenario.edges)
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
  const sources = scenario.nodes.filter((n) => n.kind === "source"),
    sinks = scenario.nodes.filter((n) => n.kind === "sink");
  const pairs: Scenario["demand"] = [];
  for (const source of sources) {
    const reachable = new Set([source.id]),
      pending = [source.id];
    for (let i = 0; i < pending.length; i++)
      for (const id of outgoing.get(pending[i]) ?? [])
        if (!reachable.has(id)) {
          reachable.add(id);
          pending.push(id);
        }
    const sink = sinks
      .filter((n) => reachable.has(n.id))
      .sort(
        (a, b) =>
          Math.hypot(b.x - source.x, b.y - source.y) -
            Math.hypot(a.x - source.x, a.y - source.y) ||
          a.id.localeCompare(b.id),
      )[0];
    if (sink) pairs.push({ origin: source.id, destination: sink.id, rate: 0 });
  }
  if (!pairs.length)
    throw new Error(
      "Major roads are present, but no directed entry-to-exit route crosses the boundary. Expand or move the rectangle so a connected road enters and leaves it. A fully enclosed roundabout needs its approach roads included.",
    );
  if (pairs.length > 100)
    throw new Error(
      "Too many boundary entries; select a smaller road corridor",
    );
  scenario.demand = pairs.map((p) => ({
    ...p,
    rate: syntheticRate / pairs.length,
  }));
  return parseScenario(scenario);
}
