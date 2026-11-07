import type { Metrics, Sample } from "../engine/statistics";
import type { ExperimentResult } from "../engine/experiment";

export type ChartMetric = "throughput" | "meanTravelTime" | "queue";
/** Engine zero sentinels are not measured zero-duration journeys. */
export function completedAverage(
  metrics: Pick<Metrics, "completed">,
  value: number,
): number | null {
  return metrics.completed > 0 ? value : null;
}
export function observedSamples(
  history: Sample[],
  metric: ChartMetric,
): Sample[] {
  return metric === "meanTravelTime"
    ? history.filter((sample) => sample.completed > 0)
    : history;
}
export function experimentForExport(result: ExperimentResult) {
  return {
    ...result,
    metrics: {
      ...result.metrics,
      meanSpeed: result.metrics.moving ? result.metrics.meanSpeed : null,
      meanTravelTime: completedAverage(
        result.metrics,
        result.metrics.meanTravelTime,
      ),
      meanWaitingTime: completedAverage(
        result.metrics,
        result.metrics.meanWaitingTime,
      ),
      meanDelay: completedAverage(result.metrics, result.metrics.meanDelay),
      vehicleTypes: result.metrics.vehicleTypes?.map((t) => ({
        ...t,
        meanSpeed: t.moving ? t.meanSpeed : null,
        meanTravelTime: t.completed ? t.meanTravelTime : null,
      })),
    },
    history: result.history.map((sample) => ({
      ...sample,
      meanTravelTime: completedAverage(sample, sample.meanTravelTime),
    })),
  };
}
