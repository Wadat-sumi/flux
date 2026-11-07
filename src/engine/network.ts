import type { Scenario, RoadEdge, RoadNode } from "../model/schema";
import { nodePoints, samplePath } from "../model/road-geometry";

export class Network {
  readonly nodes: Map<string, RoadNode>;
  readonly edges: Map<string, RoadEdge>;
  readonly outgoing = new Map<string, RoadEdge[]>();
  readonly incoming = new Map<string, RoadEdge[]>();
  readonly roundaboutEdges = new Set<string>();
  private readonly routeCache = new Map<string, string[] | null>();
  constructor(readonly scenario: Scenario) {
    for (const r of scenario.roundabouts ?? [])
      for (const id of r.edgeIds) this.roundaboutEdges.add(id);
    this.nodes = new Map(scenario.nodes.map((n) => [n.id, n]));
    this.edges = new Map(scenario.edges.map((e) => [e.id, e]));
    for (const e of scenario.edges) {
      this.outgoing.set(e.from, [...(this.outgoing.get(e.from) ?? []), e]);
      this.incoming.set(e.to, [...(this.incoming.get(e.to) ?? []), e]);
    }
  }
  /** Dijkstra weights are seconds at the posted speed limit. Cycles are valid. */
  route(origin: string, destination: string): string[] | null {
    const key = JSON.stringify([origin, destination]);
    if (this.routeCache.has(key)) return this.routeCache.get(key)!;
    const dist = new Map([[origin, 0]]),
      previous = new Map<string, RoadEdge>();
    const pending = new Set(this.nodes.keys());
    while (pending.size) {
      let current: string | undefined,
        best = Infinity;
      for (const n of pending)
        if ((dist.get(n) ?? Infinity) < best) {
          current = n;
          best = dist.get(n)!;
        }
      if (!current || current === destination) break;
      pending.delete(current);
      for (const e of this.outgoing.get(current) ?? []) {
        const cost = best + e.length / e.speedLimit;
        if (cost < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, cost);
          previous.set(e.to, e);
        }
      }
    }
    if (!dist.has(destination)) {
      this.routeCache.set(key, null);
      return null;
    }
    const path: string[] = [];
    let n = destination;
    while (n !== origin) {
      const e = previous.get(n);
      if (!e) {
        this.routeCache.set(key, null);
        return null;
      }
      path.unshift(e.id);
      n = e.from;
    }
    this.routeCache.set(key, path);
    return path;
  }
  point(
    edgeId: string,
    position: number,
    lane: number,
    visualWidth?: number,
  ): { x: number; y: number; angle: number; layer: number } {
    const e = this.edges.get(edgeId)!,
      a = this.nodes.get(e.from)!,
      b = this.nodes.get(e.to)!;
    const t = Math.max(0, Math.min(1, position / e.length)),
      dx = b.x - a.x,
      dy = b.y - a.y;
    const offset = ((lane + 0.5) / e.lanes - 0.5) * (visualWidth ?? e.width);
    if (e.shape?.length) {
      const p = samplePath(nodePoints(this.nodes, e), t);
      return {
        x: p.x - Math.sin(p.angle) * offset,
        y: p.y + Math.cos(p.angle) * offset,
        angle: p.angle,
        layer: a.layer + (b.layer - a.layer) * t,
      };
    }
    const angle = Math.atan2(dy, dx);
    return {
      x: a.x + dx * t - Math.sin(angle) * offset,
      y: a.y + dy * t + Math.cos(angle) * offset,
      angle,
      layer: a.layer + (b.layer - a.layer) * t,
    };
  }
}
