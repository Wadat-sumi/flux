import { parentPort, workerData } from "node:worker_threads";
import { jobInputSchema } from "../src/model/backend";
import { Simulation } from "../src/engine/simulation";
import { pairedScenarios } from "../src/engine/experiment";
import { experimentForExport } from "../src/ui/observations";

const input = jobInputSchema.parse(workerData);
const scenarios = input.baseline
  ? pairedScenarios(input.baseline, input.scenario)
  : [input.scenario];
const results = [];
let lastProgress = -1;
for (const [index, scenario] of scenarios.entries()) {
  const sim = new Simulation(scenario);
  while (!sim.done) {
    sim.step(150);
    const progress = Math.min(
      99,
      Math.floor(
        ((index + sim.time / scenario.duration) / scenarios.length) * 100,
      ),
    );
    if (progress !== lastProgress) {
      parentPort?.postMessage({ type: "progress", progress });
      lastProgress = progress;
    }
  }
  results.push(
    experimentForExport({
      name: scenario.name,
      metrics: sim.metrics(),
      history: sim.history,
      warnings: sim.warnings.length,
    }),
  );
}
parentPort?.postMessage({ type: "result", results });
