import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import { Simulation } from '../src/engine/simulation';
import { freeRoad } from '../src/scenarios/presets';

it('sustains 30+ packed simulation ticks/s with at least 500 moving agents', () => {
  const s = freeRoad(); s.duration = 600; s.edges[0].lanes = 6; s.edges[0].width = 21; s.demand[0].rate = 7200;
  const sim = new Simulation(s); sim.step(9000); expect(sim.metrics().moving).toBeGreaterThanOrEqual(500);
  const start = performance.now();
  for (let i = 0; i < 300; i++) { sim.step(); sim.metrics(); sim.snapshot(); }
  const rate = 300000 / (performance.now() - start); expect(rate).toBeGreaterThan(30);
}, 15000);
