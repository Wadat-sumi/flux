import { z } from 'zod';

const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/, 'IDs may contain only letters, digits, underscores and hyphens');
const layer = z.number().int().min(0).max(5);
const finite = z.number().finite();
export const nodeSchema = z.object({
  id, x: finite.min(-10000).max(10000), y: finite.min(-10000).max(10000),
  layer, kind: z.enum(['junction', 'source', 'sink', 'waypoint']),
  control: z.enum(['priority', 'signal']).default('priority'),
  signal: z.object({ green: finite.min(3).max(180), yellow: finite.min(1).max(10), allRed: finite.min(1).max(10), offset: finite.min(0).max(1000) }).strict().optional(),
}).strict();
export const edgeSchema = z.object({
  id, from: id, to: id, layer, ramp: z.boolean().default(false),
  length: finite.min(10).max(10000), lanes: z.number().int().min(1).max(6),
  width: finite.min(2).max(40), speedLimit: finite.min(2).max(45),
  priority: z.number().int().min(0).max(10).default(1),
}).strict();
export const scenarioSchema = z.object({
  schemaVersion: z.literal(1), generator: z.literal('Flux'),
  name: z.string().min(1).max(120), description: z.string().max(2000).default(''),
  nodes: z.array(nodeSchema).max(300), edges: z.array(edgeSchema).max(1000),
  demand: z.array(z.object({ origin: id, destination: id, rate: finite.min(0).max(7200) }).strict()).max(100),
  duration: finite.min(10).max(3600), seed: z.number().int().min(0).max(4294967295),
  maxVehicles: z.number().int().min(1).max(10000).default(3000),
}).strict().superRefine((s, ctx) => {
  const nodes = new Map(s.nodes.map(n => [n.id, n]));
  const ids = new Set<string>();
  for (const [i, n] of s.nodes.entries()) {
    if (ids.has(n.id)) ctx.addIssue({ code: 'custom', path: ['nodes', i, 'id'], message: 'Duplicate node ID' });
    ids.add(n.id);
    if (n.control === 'signal' && !n.signal) ctx.addIssue({ code: 'custom', path: ['nodes', i, 'signal'], message: 'Signal timing required' });
  }
  ids.clear();
  for (const [i, e] of s.edges.entries()) {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    const fail = (message: string) => ctx.addIssue({ code: 'custom', path: ['edges', i], message });
    if (ids.has(e.id)) fail('Duplicate edge ID');
    ids.add(e.id);
    if (!a || !b) { fail('Dangling edge endpoint'); continue; }
    if (a.id === b.id || Math.hypot(a.x - b.x, a.y - b.y) < 1) fail('Edge endpoints must be distinct positions');
    if (e.ramp) {
      if (a.layer === b.layer || e.layer !== a.layer) fail('Ramp must change layers and store its origin layer');
    } else if (a.layer !== b.layer || e.layer !== a.layer) fail('Only explicit ramps may connect different layers');
  }
  for (const [i, d] of s.demand.entries()) {
    if (nodes.get(d.origin)?.kind !== 'source' || nodes.get(d.destination)?.kind !== 'sink' || d.origin === d.destination) {
      ctx.addIssue({ code: 'custom', path: ['demand', i], message: 'Demand must connect a source to a distinct sink' });
    }
  }
  const expected = s.demand.reduce((sum, d) => sum + d.rate * s.duration / 3600, 0);
  if (expected > 20000) ctx.addIssue({ code: 'custom', path: ['demand'], message: 'Expected demand exceeds 20,000 trips; reduce rate or duration' });
});

export type RoadNode = z.infer<typeof nodeSchema>;
export type RoadEdge = z.infer<typeof edgeSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export function parseScenario(input: unknown): Scenario { return scenarioSchema.parse(input); }
export function importScenario(text: string): Scenario {
  if (text.length > 2_000_000 || new TextEncoder().encode(text).byteLength > 2_000_000) throw new Error('Scenario file exceeds 2 MB');
  return parseScenario(JSON.parse(text));
}
export function exportScenario(s: Scenario): string { return JSON.stringify(parseScenario(s), null, 2); }
