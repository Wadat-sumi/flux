import {
  parseScenario,
  type Scenario,
  type RoadNode,
  type RoadEdge,
} from "../model/schema";

export type Selection = {
  kind: "node" | "edge" | "roundabout";
  id: string;
} | null;
export function nextId(prefix: string, ids: string[]): string {
  let n = 1;
  const set = new Set(ids);
  while (set.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
export function addNode(
  s: Scenario,
  x: number,
  y: number,
  layer = 0,
): Scenario {
  const node: RoadNode = {
    id: nextId(
      "node",
      s.nodes.map((n) => n.id),
    ),
    x,
    y,
    layer,
    kind: "junction",
    control: "priority",
  };
  return parseScenario({ ...s, nodes: [...s.nodes, node] });
}
export function addRoad(
  s: Scenario,
  from: string,
  to: string,
  lanes = 1,
): Scenario {
  const a = s.nodes.find((n) => n.id === from),
    b = s.nodes.find((n) => n.id === to);
  if (!a || !b || a.id === b.id)
    throw new Error("Choose two different existing endpoints.");
  const edge: RoadEdge = {
    id: nextId(
      "road",
      s.edges.map((e) => e.id),
    ),
    from,
    to,
    lanes,
    layer: a.layer,
    ramp: a.layer !== b.layer,
    length: Math.max(10, Math.round(Math.hypot(b.x - a.x, b.y - a.y))),
    width: lanes * 3.5,
    speedLimit: 13.89,
    priority: 1,
  };
  return parseScenario({ ...s, edges: [...s.edges, edge] });
}
export function deleteSelection(
  s: Scenario,
  selection: NonNullable<Selection>,
): Scenario {
  if (selection.kind === "roundabout") {
    const group = s.roundabouts?.find((r) => r.id === selection.id);
    if (!group) return s;
    return parseScenario({
      ...s,
      roundabouts: s.roundabouts?.filter((r) => r.id !== group.id),
      nodes: s.nodes.filter((n) => !group.nodeIds.includes(n.id)),
      edges: s.edges.filter(
        (e) => !group.nodeIds.includes(e.from) && !group.nodeIds.includes(e.to),
      ),
      demand: s.demand.filter(
        (d) =>
          !group.nodeIds.includes(d.origin) &&
          !group.nodeIds.includes(d.destination),
      ),
    });
  }
  if (selection.kind === "edge")
    return parseScenario({
      ...s,
      edges: s.edges.filter((e) => e.id !== selection.id),
      roundabouts: s.roundabouts?.filter(
        (r) => !r.edgeIds.includes(selection.id),
      ),
    });
  return parseScenario({
    ...s,
    nodes: s.nodes.filter((n) => n.id !== selection.id),
    roundabouts: s.roundabouts?.filter(
      (r) => !r.nodeIds.includes(selection.id),
    ),
    edges: s.edges.filter(
      (e) => e.from !== selection.id && e.to !== selection.id,
    ),
    demand: s.demand.filter(
      (d) => d.origin !== selection.id && d.destination !== selection.id,
    ),
  });
}
export function updateNode(s: Scenario, node: RoadNode): Scenario {
  // Updating elevation also updates adjacent edge/ramp semantics explicitly.
  const nodes = s.nodes.map((n) => (n.id === node.id ? node : n));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = s.edges.map((e) =>
    e.from === node.id || e.to === node.id
      ? {
          ...e,
          layer: byId.get(e.from)!.layer,
          ramp: byId.get(e.from)!.layer !== byId.get(e.to)!.layer,
        }
      : e,
  );
  return parseScenario({ ...s, nodes, edges });
}
