import { parseScenario, type Scenario, type RoadNode, type RoadEdge } from '../model/schema';

const node = (id: string, x: number, y: number, kind: RoadNode['kind'] = 'junction', layer = 0): RoadNode => ({ id, x, y, kind, layer, control: 'priority' });
const edge = (id: string, from: string, to: string, length: number, lanes = 1, layer = 0, ramp = false): RoadEdge => ({ id, from, to, length, lanes, layer, ramp, width: lanes * 3.5, speedLimit: 13.89, priority: 1 });
const base = { schemaVersion: 1 as const, generator: 'Flux' as const, seed: 42, duration: 180, maxVehicles: 3000 };

export function intersection(): Scenario {
  const center = { ...node('center', 0, 0), control: 'signal' as const, signal: { green: 22, yellow: 3, allRed: 2, offset: 0 } };
  return parseScenario({ ...base, name: 'Signalized urban intersection', description: 'Two crossing one-way corridors with alternating fixed-time signals.',
    nodes: [node('west', -300, 0, 'source'), node('north', 0, -300, 'source'), center, node('east', 300, 0, 'sink'), node('south', 0, 300, 'sink')],
    edges: [edge('west-in', 'west', 'center', 300, 2), edge('east-out', 'center', 'east', 300, 2), edge('north-in', 'north', 'center', 300), edge('south-out', 'center', 'south', 300)],
    demand: [{ origin: 'west', destination: 'east', rate: 1100 }, { origin: 'north', destination: 'south', rate: 850 }],
  });
}
export function flyover(): Scenario {
  const s = intersection();
  s.name = 'Flyover versus at-grade crossing'; s.description = 'An elevated east-west corridor crosses an independent ground-level north-south corridor.';
  s.nodes = [node('west', -300, 0, 'source', 1), node('east', 300, 0, 'sink', 1), node('north', 0, -300, 'source'), node('south', 0, 300, 'sink')];
  s.edges = [edge('flyover', 'west', 'east', 600, 2, 1), edge('ground', 'north', 'south', 600)];
  return parseScenario(s);
}
export function bottleneck(lanes = 1): Scenario {
  return parseScenario({ ...base, name: 'Road capacity bottleneck', description: 'A three-lane approach feeds a narrower segment under peak demand.',
    nodes: [node('source', -500, 0, 'source'), node('merge', 0, 0, 'waypoint'), node('sink', 400, 0, 'sink')],
    edges: [edge('approach', 'source', 'merge', 500, 3), edge('narrow', 'merge', 'sink', 400, lanes)],
    demand: [{ origin: 'source', destination: 'sink', rate: 3200 }],
  });
}
export function rampScenario(): Scenario {
  return parseScenario({ ...base, name: 'Explicit ramp connection', description: 'Ground approach joins an elevated corridor through an explicit ramp.',
    nodes: [node('source', -300, 100, 'source'), node('low', -120, 100, 'waypoint'), node('high', 100, 0, 'waypoint', 1), node('sink', 400, 0, 'sink', 1)],
    edges: [edge('ground', 'source', 'low', 180), edge('ramp', 'low', 'high', 250, 1, 0, true), edge('bridge', 'high', 'sink', 300, 1, 1)],
    demand: [{ origin: 'source', destination: 'sink', rate: 700 }],
  });
}
export function freeRoad(): Scenario {
  return parseScenario({ ...base, name: 'Free-flow validation road', description: 'Long isolated straight road.',
    nodes: [node('source', 0, 0, 'source'), node('sink', 5000, 0, 'sink')], edges: [edge('road', 'source', 'sink', 5000)], demand: [{ origin: 'source', destination: 'sink', rate: 60 }],
  });
}
export const presets = [intersection, flyover, bottleneck];
