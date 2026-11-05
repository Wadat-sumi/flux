import type { Scenario } from '../model/schema';
import type { Metrics, Sample } from '../engine/statistics';
import type { ExperimentResult } from '../engine/experiment';
import { z } from 'zod';
import { scenarioSchema } from '../model/schema';

export const workerRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), requestId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('load'), scenario: scenarioSchema }).strict(),
  z.object({ type: z.literal('play'), speed: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]) }).strict(),
  z.object({ type: z.literal('pause') }).strict(),
  z.object({ type: z.literal('step'), count: z.number().int().min(1).max(600) }).strict(),
  z.object({ type: z.literal('compare'), baseline: scenarioSchema, modified: scenarioSchema }).strict(),
]);

export type WorkerRequest =
  | { type: 'ping'; requestId: string }
  | { type: 'load'; scenario: Scenario }
  | { type: 'play'; speed: number }
  | { type: 'pause' }
  | { type: 'step'; count: number }
  | { type: 'compare'; baseline: Scenario; modified: Scenario };
export type WorkerResponse =
  | { type: 'pong'; requestId: string }
  | { type: 'frame'; states: Float32Array; metrics: Metrics; history: Sample[]; done: boolean; warnings: number; playing: boolean }
  | { type: 'comparison'; results: [ExperimentResult, ExperimentResult] }
  | { type: 'error'; message: string };
