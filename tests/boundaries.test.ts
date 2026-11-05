import { describe, expect, it } from 'vitest';
import { freeRoad, rampScenario } from '../src/scenarios/presets';
import { parseScenario } from '../src/model/schema';
import { Simulation } from '../src/engine/simulation';
import { idmAcceleration } from '../src/engine/vehicle';

describe('positive and boundary unit cases', () => {
  it.each([0, 4294967295])('accepts seed boundary %s deterministically', seed => {
    const s = freeRoad(); s.seed = seed;
    expect(new Simulation(s).schedule).toEqual(new Simulation(s).schedule);
  });
  it.each([1, 6])('accepts lane boundary %s', lanes => { const s = freeRoad(); s.edges[0].lanes = lanes; expect(parseScenario(s).edges[0].lanes).toBe(lanes); });
  it.each([2, 45])('accepts speed-limit boundary %s', speed => { const s = freeRoad(); s.edges[0].speedLimit = speed; expect(parseScenario(s).edges[0].speedLimit).toBe(speed); });
  it.each([0, 7200])('accepts demand boundary %s', rate => { const s = freeRoad(); s.demand[0].rate = rate; expect(parseScenario(s).demand[0].rate).toBe(rate); });
  it('handles zero demand for the full observation and accepts a downward ramp', () => {
    const s = freeRoad(); s.demand[0].rate = 0; const sim = new Simulation(s); sim.step(5400); expect(sim.done).toBe(true); expect(sim.metrics().generated).toBe(0);
    const ramp = rampScenario();
    for (const n of ramp.nodes) n.layer = 1 - n.layer;
    for (const e of ramp.edges) e.layer = 1 - e.layer;
    expect(parseScenario(ramp).edges[1].ramp).toBe(true);
  });
  it('IDM accelerates freely and brakes toward a close obstacle with finite bounds', () => {
    expect(idmAcceleration(0, 14)).toBe(1.5); expect(idmAcceleration(14, 14)).toBe(0);
    expect(idmAcceleration(14, 14, 0, 0)).toBe(-8);
    expect(idmAcceleration(5, 14, 10, 2)).toBeLessThan(0);
  });
  it.each([0, -1, 0.5, NaN, Infinity, 30001])('rejects invalid engine step count %s', count => {
    expect(() => new Simulation(freeRoad()).step(count)).toThrow();
  });
  it('does not advance beyond duration on an oversized valid step', () => {
    const s = freeRoad(); s.duration = 10; const sim = new Simulation(s); sim.step(30000); expect(sim.time).toBe(10); sim.step(); expect(sim.time).toBe(10);
  });
});
