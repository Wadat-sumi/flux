import type { Scenario } from "../model/schema";
import { Simulation } from "./simulation";
import type { Metrics, Sample } from "./statistics";

export interface ExperimentResult {
  name: string;
  metrics: Metrics;
  history: Sample[];
  warnings: number;
}
/** Seed, demand and observation horizon are shared explicitly. */
export function pairedScenarios(
  baseline: Scenario,
  modified: Scenario,
): [Scenario, Scenario] {
  return [
    structuredClone(baseline),
    {
      ...structuredClone(modified),
      seed: baseline.seed,
      duration: baseline.duration,
      demand: structuredClone(baseline.demand),
      fleet: structuredClone(baseline.fleet),
      maxVehicles: baseline.maxVehicles,
    },
  ];
}
export function runExperiment(scenario: Scenario): ExperimentResult {
  const sim = new Simulation(scenario);
  while (!sim.done)
    sim.step(Math.min(30000, Math.ceil(scenario.duration * 30)));
  return {
    name: scenario.name,
    metrics: sim.metrics(),
    history: sim.history,
    warnings: sim.warnings.length,
  };
}
