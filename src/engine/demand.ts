import type { Scenario } from '../model/schema';
import { randomStream } from './random';

export interface Arrival {
  id: number; time: number; origin: string; destination: string;
  desiredFactor: number; length: number;
}
/** The schedule depends ONLY on demand, duration and seed, never topology. */
export function generateDemand(s: Scenario): Arrival[] {
  const rng = randomStream(s.seed), arrivals: Arrival[] = [];
  for (const d of s.demand) {
    if (d.rate === 0) continue;
    let time = 0;
    while (true) {
      time += -Math.log(Math.max(1e-12, 1 - rng())) * 3600 / d.rate;
      if (time > s.duration) break;
      arrivals.push({ id: 0, time, origin: d.origin, destination: d.destination, desiredFactor: 0.9 + rng() * 0.2, length: 4.2 + rng() * 1.2 });
      if (arrivals.length > 30000) throw new Error('Realized demand exceeds 30,000 trips');
    }
  }
  arrivals.sort((a, b) => a.time - b.time || a.origin.localeCompare(b.origin));
  arrivals.forEach((a, i) => { a.id = i + 1; });
  return arrivals;
}
