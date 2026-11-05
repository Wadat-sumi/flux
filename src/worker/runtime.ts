import { Simulation } from '../engine/simulation';
import { pairedScenarios } from '../engine/experiment';
import { workerRequestSchema, type WorkerResponse } from './protocol';
import type { ExperimentResult } from '../engine/experiment';

export type WorkerSend = (message: WorkerResponse, transfer?: ArrayBuffer[]) => void;
/** Injectable transport/timer keeps protocol tests independent of browser globals. */
export class WorkerRuntime {
  private sim: Simulation | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  constructor(private readonly send: WorkerSend) {}
  private stop(): void { if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined; }
  private frame(): void {
    if (!this.sim) return;
    const states = this.sim.snapshot();
    this.send({ type: 'frame', states, metrics: this.sim.metrics(), history: this.sim.history.slice(-3600), done: this.sim.done, warnings: this.sim.warnings.length, playing: this.timer !== undefined }, [states.buffer as ArrayBuffer]);
  }
  handle(input: unknown): void {
    try {
      const request = workerRequestSchema.parse(input);
      switch (request.type) {
        case 'ping': this.send({ type: 'pong', requestId: request.requestId }); break;
        case 'load': this.stop(); this.generation++; this.sim = new Simulation(request.scenario); this.frame(); break;
        case 'pause': this.stop(); this.generation++; this.frame(); break;
        case 'step': if (!this.sim) throw new Error('Load a scenario first'); this.stop(); this.generation++; this.sim.step(request.count); this.frame(); break;
        case 'play': {
          if (!this.sim) throw new Error('Load a scenario first');
          if (![1, 2, 4, 8].includes(request.speed)) throw new Error('Playback speed must be 1, 2, 4 or 8');
          this.stop(); this.generation++;
          this.timer = setInterval(() => {
            try { this.sim!.step(request.speed); if (this.sim!.done) this.stop(); this.frame(); }
            catch (error) { this.stop(); this.send({ type: 'error', message: error instanceof Error ? error.message : 'Simulation failed' }); }
          }, 1000 / 30);
          this.frame(); break;
        }
        case 'compare': {
          this.stop(); const generation = ++this.generation;
          const scenarios = pairedScenarios(request.baseline, request.modified);
          const sims = scenarios.map(s => new Simulation(s));
          const chunk = () => {
            if (generation !== this.generation) return;
            try {
              for (const sim of sims) if (!sim.done) sim.step(150);
              if (sims.some(sim => !sim.done)) { setTimeout(chunk, 0); return; }
              const results = sims.map(sim => ({ name: sim.scenario.name, metrics: sim.metrics(), history: sim.history, warnings: sim.warnings.length })) as [ExperimentResult, ExperimentResult];
              this.send({ type: 'comparison', results });
            } catch (error) { this.send({ type: 'error', message: error instanceof Error ? error.message : 'Experiment failed' }); }
          };
          chunk(); break;
        }
      }
    } catch (error) { this.send({ type: 'error', message: error instanceof Error ? error.message : 'Invalid worker request' }); }
  }
  dispose(): void { this.stop(); this.generation++; }
}
