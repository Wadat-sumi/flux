import type { RoadEdge, Scenario, Roundabout } from "./schema";
import { pathLength, roadPoints } from "./road-geometry";

/** Remove geometry-only vertices. Never merge junctions, terminals, signals or attribute changes. */
export function compactRoads(
  s: Scenario,
  roundaboutEdges = new Set<string>(),
  protectedNodes = new Set<string>(),
) {
  const nodes = new Map(s.nodes.map((n) => [n.id, n])),
    outgoing = new Map<string, RoadEdge[]>(),
    incoming = new Map<string, RoadEdge[]>();
  for (const e of s.edges) {
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e]);
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e]);
  }
  const same = (a: RoadEdge, b: RoadEdge) =>
    a.layer === b.layer &&
    !a.ramp &&
    !b.ramp &&
    a.lanes === b.lanes &&
    a.width === b.width &&
    a.speedLimit === b.speedLimit &&
    a.priority === b.priority &&
    roundaboutEdges.has(a.id) === roundaboutEdges.has(b.id);
  const neighbourKey = (id: string) => {
    const n = nodes.get(id)!;
    return n.kind === "source" || n.kind === "sink"
      ? `${n.layer}:${n.x.toFixed(5)}:${n.y.toFixed(5)}`
      : id;
  };
  const pass = new Set(
    s.nodes
      .filter((n) => {
        if (
          n.kind !== "junction" ||
          n.control !== "priority" ||
          protectedNodes.has(n.id)
        )
          return false;
        const ins = incoming.get(n.id) ?? [],
          outs = outgoing.get(n.id) ?? [];
        const neighbours = new Set([
          ...ins.map((e) => neighbourKey(e.from)),
          ...outs.map((e) => neighbourKey(e.to)),
        ]);
        return (
          neighbours.size === 2 &&
          ins.length > 0 &&
          outs.length > 0 &&
          ins.length <= 2 &&
          outs.length <= 2 &&
          ins.every((e) => {
            const next = outs.filter(
              (o) => neighbourKey(o.to) !== neighbourKey(e.from),
            );
            return next.length === 1 && same(e, next[0]);
          })
        );
      })
      .map((n) => n.id),
  );
  // Each closed cycle needs at least one starting anchor. The traversal below retains a second port.
  const visited = new Set<string>(),
    edges: RoadEdge[] = [],
    rings = new Set<string>();
  const follow = (first: RoadEdge) => {
    if (visited.has(first.id)) return;
    let edge = first;
    const points = roadPoints(
      first,
      nodes.get(first.from)!,
      nodes.get(first.to)!,
    );
    visited.add(first.id);
    while (pass.has(edge.to) && points.length < 500) {
      const next = (outgoing.get(edge.to) ?? []).find(
        (e) => neighbourKey(e.to) !== neighbourKey(edge.from) && same(edge, e),
      );
      if (
        !next ||
        visited.has(next.id) ||
        next.to === first.from ||
        points.length + (next.shape?.length ?? 0) + 1 > 502
      )
        break;
      points.push(
        ...roadPoints(next, nodes.get(next.from)!, nodes.get(next.to)!).slice(
          1,
        ),
      );
      visited.add(next.id);
      edge = next;
    }
    const shape = points.slice(1, -1).map(({ x, y }) => ({ x, y }));
    edges.push({
      ...first,
      to: edge.to,
      length: Math.max(10, pathLength(points)),
      ...(shape.length ? { shape } : {}),
    });
    if (roundaboutEdges.has(first.id)) rings.add(first.id);
  };
  for (const e of s.edges) if (!pass.has(e.from)) follow(e);
  for (const e of s.edges)
    if (!visited.has(e.id)) {
      pass.delete(e.from);
      follow(e);
    }
  const used = new Set(edges.flatMap((e) => [e.from, e.to]));
  return {
    scenario: { ...s, nodes: s.nodes.filter((n) => used.has(n.id)), edges },
    roundaboutEdges: rings,
  };
}

/** Recognise complete directed rings only. A selection cutting a roundabout leaves ordinary partial arcs. */
export function groupRoundabouts(s: Scenario, ids: Set<string>): Roundabout[] {
  const ring = s.edges.filter((e) => ids.has(e.id)),
    byNode = new Map<string, RoadEdge[]>();
  for (const e of ring)
    for (const id of [e.from, e.to])
      byNode.set(id, [...(byNode.get(id) ?? []), e]);
  const visited = new Set<string>(),
    groups: Roundabout[] = [];
  for (const first of ring) {
    if (visited.has(first.id)) continue;
    const component: RoadEdge[] = [],
      pending = [first];
    for (let i = 0; i < pending.length; i++) {
      const e = pending[i];
      if (visited.has(e.id)) continue;
      visited.add(e.id);
      component.push(e);
      for (const id of [e.from, e.to])
        for (const adjacent of byNode.get(id) ?? [])
          if (!visited.has(adjacent.id)) pending.push(adjacent);
    }
    const nodeIds = [...new Set(component.flatMap((e) => [e.from, e.to]))];
    if (
      nodeIds.length >= 2 &&
      nodeIds.length <= 100 &&
      component.length <= 100 &&
      nodeIds.every(
        (id) =>
          component.filter((e) => e.from === id).length === 1 &&
          component.filter((e) => e.to === id).length === 1,
      ) &&
      nodeIds.every(
        (id) => s.nodes.find((n) => n.id === id)?.kind === "junction",
      )
    )
      groups.push({
        id: `roundabout_${first.id}`,
        nodeIds,
        edgeIds: component.map((e) => e.id),
      });
  }
  return groups;
}
