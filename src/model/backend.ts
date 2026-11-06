import { z } from "zod";
import { scenarioSchema, type Scenario } from "./schema";
import type { experimentForExport } from "../ui/observations";

export const credentialsSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();
export const provenanceSchema = z
  .object({
    kind: z.enum(["osm", "observed-demand"]),
    source: z.string().trim().min(1).max(500),
    license: z.string().trim().min(1).max(200),
    capturedAt: z.iso.datetime(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    warnings: z.array(z.string().max(500)).max(100),
  })
  .strict();
export type Provenance = z.infer<typeof provenanceSchema>;
export const savedInputSchema = z
  .object({
    scenario: scenarioSchema,
    provenance: z.array(provenanceSchema).max(20).default([]),
  })
  .strict();
export const jobInputSchema = z
  .object({
    scenario: scenarioSchema,
    baseline: scenarioSchema.optional(),
    provenance: z.array(provenanceSchema).max(20).default([]),
  })
  .strict();
export type JobInput = z.infer<typeof jobInputSchema>;
export interface User {
  id: string;
  email: string;
}
export interface ServerScenario {
  id: string;
  scenario: Scenario;
  provenance: Provenance[];
  updatedAt: string;
}
export interface ServerJob {
  id: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  input: JobInput;
  results: ReturnType<typeof experimentForExport>[] | null;
}
export interface ImportedData {
  scenario: Scenario;
  provenance: Provenance;
  summary: string;
}
