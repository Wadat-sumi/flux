import { describe, expect, it, vi } from 'vitest';
import { exportScenario, importScenario } from '../src/model/schema';
import { pairedScenarios, runExperiment } from '../src/engine/experiment';
import { Simulation } from '../src/engine/simulation';
import { WorkerRuntime } from '../src/worker/runtime';
import { bottleneck, flyover, intersection, rampScenario } from '../src/scenarios/presets';

describe('serialization, simulation, metrics and worker integration', () => {
  it.each([intersection, flyover, bottleneck, rampScenario])('%s survives export/import and a complete observation', create => {
    const scenario = importScenario(exportScenario(create())), sim = new Simulation(scenario);
    while (!sim.done) sim.step(300);
    const m = sim.metrics(); expect(m.generated).toBe(m.active + m.completed + m.rejected);
    expect(m.generated).toBe(sim.schedule.length);
    expect(m.completed).toBeGreaterThan(0); expect(sim.history).toHaveLength(scenario.duration);
  });
  it('compares at-grade and grade-separated corridors using the exact same demand', () => {
    const [a, b] = pairedScenarios(intersection(), flyover());
    expect(new Simulation(a).schedule).toEqual(new Simulation(b).schedule);
    const baseline = runExperiment(a), modification = runExperiment(b);
    expect(baseline.metrics.generated).toBe(modification.metrics.generated);
    expect(modification.metrics.completed).toBeGreaterThan(baseline.metrics.completed);
    expect(modification.metrics.meanTravelTime).toBeLessThan(baseline.metrics.meanTravelTime);
  });
  it('reloading a changed graph invalidates the previous route cache and resets accounting', () => {
    const send = vi.fn(), runtime = new WorkerRuntime(send), s = intersection();
    runtime.handle({ type: 'load', scenario: s }); runtime.handle({ type: 'step', count: 600 });
    s.edges = []; runtime.handle({ type: 'load', scenario: s });
    expect(send.mock.calls.at(-1)![0].metrics.generated).toBe(0);
    runtime.handle({ type: 'step', count: 600 }); expect(send.mock.calls.at(-1)![0].metrics.rejected).toBeGreaterThan(0); runtime.dispose();
  });
  it('cancels an in-flight experiment when a new scenario is loaded', () => {
    vi.useFakeTimers(); const send = vi.fn(), runtime = new WorkerRuntime(send);
    try {
      runtime.handle({ type: 'compare', baseline: intersection(), modified: flyover() });
      runtime.handle({ type: 'load', scenario: bottleneck() }); vi.runAllTimers();
      expect(send.mock.calls.some(call => call[0].type === 'comparison')).toBe(false);
      expect(send.mock.calls.at(-1)![0].type).toBe('frame');
    } finally { runtime.dispose(); vi.useRealTimers(); }
  });
});
