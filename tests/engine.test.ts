import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/simulation';
import { Network } from '../src/engine/network';
import { generateDemand } from '../src/engine/demand';
import { signalState } from '../src/engine/signals';
import { pairedScenarios } from '../src/engine/experiment';
import { DT, MIN_GAP } from '../src/engine/vehicle';
import { bottleneck, flyover, freeRoad, intersection, rampScenario } from '../src/scenarios/presets';
import { exportScenario, importScenario, parseScenario, type Scenario } from '../src/model/schema';

function run(s: Scenario, seconds = s.duration): Simulation {
  const sim = new Simulation(s); sim.step(Math.ceil(seconds / DT)); return sim;
}
function assertSafety(sim: Simulation): void {
  const lanes = new Map<string, { position: number; length: number }[]>();
  for (const v of sim.vehicles.values()) {
    expect(Number.isFinite(v.position) && Number.isFinite(v.speed)).toBe(true);
    expect(v.speed).toBeGreaterThanOrEqual(0);
    const e = sim.network.edges.get(v.edge)!;
    expect(v.position).toBeLessThanOrEqual(e.length);
    expect(v.lane).toBeGreaterThanOrEqual(0); expect(v.lane).toBeLessThan(e.lanes);
    const key = `${v.edge}:${v.lane}`;
    lanes.set(key, [...(lanes.get(key) ?? []), v]);
  }
  for (const cars of lanes.values()) {
    cars.sort((a, b) => b.position - a.position);
    for (let i = 1; i < cars.length; i++) expect(cars[i - 1].position - cars[i - 1].length - cars[i].position).toBeGreaterThanOrEqual(MIN_GAP - 1e-6);
  }
  const m = sim.metrics(); expect(m.generated).toBe(m.active + m.completed + m.rejected);
}

describe('ten scientific validation requirements', () => {
  it('1 empty network is stable', () => {
    const s = parseScenario({ ...freeRoad(), nodes: [], edges: [], demand: [] });
    const sim = run(s, 30); expect(sim.metrics().active).toBe(0); expect(sim.snapshot().length).toBe(0); assertSafety(sim);
  });
  it('2 free-flow agents converge to their desired speed', () => {
    const s = freeRoad(); s.duration = 300;
    const sim = run(s, 150); expect(sim.vehicles.size).toBeGreaterThan(0);
    for (const v of sim.vehicles.values()) if (sim.time - v.time > 35) expect(v.speed).toBeCloseTo(sim.network.edges.get(v.edge)!.speedLimit * v.desiredFactor, 1);
  });
  it('3 oversaturated bottleneck produces a queue', () => {
    const sim = run(bottleneck()); const m = sim.metrics(); expect(m.queue).toBeGreaterThan(10); expect(m.active).toBeGreaterThan(40); assertSafety(sim);
  });
  it('4 vehicles do not enter on red or yellow and progress on green', () => {
    const sim = new Simulation(intersection()); let transitions = 0;
    for (let i = 0; i < 3000; i++) {
      const before = new Map([...sim.vehicles].map(([id, v]) => [id, v.edge])); const t = sim.time;
      sim.step();
      for (const v of sim.vehicles.values()) if (before.has(v.id) && before.get(v.id) !== v.edge) {
        expect(signalState(sim.network, sim.network.edges.get(before.get(v.id)!)!, t)).toBe('green'); transitions++;
      }
    }
    expect(transitions).toBeGreaterThan(5); expect(sim.metrics().completed).toBeGreaterThan(0);
  });
  it('5 grade-separated traffic streams do not interact', () => {
    const both = flyover(), one = structuredClone(both); one.demand = [both.demand[0]];
    const a = run(both, 60), b = run(one, 60);
    const states = (sim: Simulation) => [...sim.vehicles.values()].filter(v => v.origin === 'west').map(v => [v.time, v.position, v.speed, v.lane]);
    expect(states(a)).toEqual(states(b)); expect(a.network.route('west', 'south')).toBeNull();
  });
  it('6 unreachable trips are rejected without traversing disconnected roads', () => {
    const s = freeRoad(); s.edges = []; const sim = run(s, 120);
    expect(sim.metrics().rejected).toBeGreaterThan(0); expect(sim.metrics().active).toBe(0); assertSafety(sim);
  });
  it('7 no same-lane overlap and no negative speeds across stressed presets', () => {
    for (const s of [intersection(), bottleneck(), rampScenario()]) {
      const sim = new Simulation(s);
      for (let i = 0; i < 180; i++) { sim.step(30); assertSafety(sim); }
    }
  });
  it('8 conservation includes queued arrivals and bounded-capacity rejection', () => {
    const s = bottleneck(); s.maxVehicles = 20; const sim = run(s);
    expect(sim.metrics().rejected).toBeGreaterThan(0); expect(sim.metrics().active).toBeLessThanOrEqual(20); assertSafety(sim);
  });
  it('9 identical seeds and scenarios reproduce the complete observable state', () => {
    const a = run(intersection(), 90), b = run(intersection(), 90);
    expect(a.metrics()).toEqual(b.metrics()); expect(a.snapshot()).toEqual(b.snapshot()); expect(a.history).toEqual(b.history);
  });
  it('10 all snapshots and metrics remain finite', () => {
    for (const s of [flyover(), bottleneck(), rampScenario()]) {
      const sim = run(s); expect([...sim.snapshot()].every(Number.isFinite)).toBe(true);
      for (const n of Object.values(sim.metrics())) if (typeof n === 'number') expect(Number.isFinite(n)).toBe(true);
    }
  });
});

describe('topology, demand, serialization and control', () => {
  it('accepts cycles and Dijkstra terminates', () => {
    const s = intersection(); s.edges.push({ ...s.edges[0], id: 'cycle', from: 'center', to: 'west' });
    const net = new Network(parseScenario(s)); expect(net.route('west', 'east')).toEqual(['west-in', 'east-out']); expect(net.route('east', 'west')).toBeNull();
  });
  it('requires explicit ramps and routes through one', () => {
    const s = rampScenario(); expect(new Network(s).route('source', 'sink')).toEqual(['ground', 'ramp', 'bridge']);
    s.edges[1].ramp = false; expect(() => parseScenario(s)).toThrow();
  });
  it('rejects dangling references, duplicate IDs, invalid dimensions and layers', () => {
    for (const mutate of [
      (s: Scenario) => { s.edges[0].to = 'missing'; },
      (s: Scenario) => { s.nodes.push(s.nodes[0]); },
      (s: Scenario) => { s.edges.push(s.edges[0]); },
      (s: Scenario) => { s.edges[0].lanes = 0; },
      (s: Scenario) => { s.edges[0].length = -1; },
      (s: Scenario) => { s.nodes[0].layer = 0.5; },
      (s: Scenario) => { s.edges[0].speedLimit = NaN; },
    ]) { const s = freeRoad(); mutate(s); expect(() => parseScenario(s)).toThrow(); }
  });
  it('rejects malformed and oversized imports and preserves valid JSON', () => {
    const s = intersection(); expect(importScenario(exportScenario(s))).toEqual(s);
    expect(() => importScenario('{')).toThrow(); expect(() => importScenario(' '.repeat(2_000_001))).toThrow();
  });
  it('pairs identical pre-generated demand despite topology and behavior changes', () => {
    const [a, b] = pairedScenarios(intersection(), flyover());
    expect(generateDemand(a)).toEqual(generateDemand(b));
    const sim = new Simulation(b); sim.step(900); expect(generateDemand(a)).toEqual(sim.schedule);
  });
  it('signals have explicit green, yellow and all-red transitions', () => {
    const net = new Network(intersection()), e = net.edges.get('west-in')!;
    expect(signalState(net, e, 0)).toBe('green'); expect(signalState(net, e, 22)).toBe('yellow');
    expect(signalState(net, e, 25)).toBe('red'); expect(signalState(net, e, 27)).toBe('red'); expect(signalState(net, e, 54)).toBe('green');
  });
  it('does not enter a junction without downstream storage', () => {
    const s = bottleneck(); s.edges[1].length = 10; s.edges[1].speedLimit = 2;
    const sim = new Simulation(s);
    for (let i = 0; i < 90; i++) { sim.step(30); assertSafety(sim); }
    expect(sim.metrics().queue).toBeGreaterThan(0);
  });
  it('detects a fully occupied cycle and records deterministic gridlock rejection', () => {
    const s = freeRoad(); s.demand = []; s.duration = 180;
    s.nodes.push({ id: 'middle', x: 10, y: 0, kind: 'junction', layer: 0, control: 'priority' });
    const template = s.edges[0];
    s.edges = [
      { ...template, id: 'ab', from: 'source', to: 'middle', length: 10 },
      { ...template, id: 'ba', from: 'middle', to: 'source', length: 10 },
      { ...template, id: 'exit', from: 'middle', to: 'sink', length: 100 },
    ];
    const sim = new Simulation(s);
    // Explicit occupied initial state isolates spillback recovery from demand/routing.
    for (const [id, edge, route] of [[1, 'ab', ['ab', 'ba', 'ab', 'exit']], [2, 'ba', ['ba', 'ab', 'exit']]] as const) {
      sim.vehicles.set(id, { id, edge, route: [...route], routeIndex: 0, position: 8, lane: 0, speed: 0, acceleration: 0, desiredFactor: 1, length: 4.5, time: 0, origin: 'source', destination: 'sink', waiting: 0, entryTime: 0, status: 'moving', laneChangeAt: 0 });
    }
    sim.step(121 * 30);
    expect(sim.warnings.length).toBeGreaterThan(0); expect(sim.metrics().rejected).toBeGreaterThan(0);
    expect(sim.warnings[0].message).toContain('Gridlock recovery');
    // Manual initial vehicles were not Generated, so conservation is tested in demand-driven cases above.
  });
});
