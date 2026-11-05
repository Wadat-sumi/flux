import { performance } from 'node:perf_hooks';
import { Simulation } from '../src/engine/simulation';
import { freeRoad } from '../src/scenarios/presets';
import { mkdirSync, writeFileSync } from 'node:fs';

const s = freeRoad(); s.duration = 600; s.edges[0].lanes = 6; s.edges[0].width = 21; s.demand[0].rate = 7200;
const sim = new Simulation(s); sim.step(300 * 30);
const population = sim.metrics().moving;
const timings: number[] = [];
for (let i = 0; i < 900; i++) { const start = performance.now(); sim.step(); sim.metrics(); sim.snapshot(); timings.push(performance.now() - start); }
timings.sort((a, b) => a - b);
const elapsed = timings.reduce((sum, t) => sum + t, 0);
const report = { recordedAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch, seed: s.seed, dt: 1 / 30, environment: 'Node headless; includes metrics and snapshot packing; not a browser FPS measurement', agentsAtStart: population, agentsAtEnd: sim.metrics().moving, steps: timings.length, ticksPerSecond: timings.length * 1000 / elapsed, p95StepMs: timings[Math.floor(timings.length * 0.95)], targetMet: population >= 500 && timings.length * 1000 / elapsed >= 30 };
mkdirSync('docs/benchmarks', { recursive: true });
writeFileSync('docs/benchmarks/headless.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (population < 500 || timings.length * 1000 / elapsed < 30) process.exitCode = 1;
