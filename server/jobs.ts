import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Database } from "./database";
import type { JobInput, ServerJob } from "../src/model/backend";
import { pairedScenarios } from "../src/engine/experiment";
import { parseScenario } from "../src/model/schema";
import { HttpError } from "./security";

type Row = Record<string, unknown>;
export function jobFromRow(row: Row): ServerJob {
  return {
    id: String(row.id),
    name: String(row.name),
    status: row.status as ServerJob["status"],
    progress: Number(row.progress),
    createdAt: String(row.created_at),
    finishedAt: row.finished_at as string | null,
    error: row.error as string | null,
    input: JSON.parse(String(row.input)),
    results: row.results ? JSON.parse(String(row.results)) : null,
  };
}
export class Jobs {
  private current: {
    id: string;
    worker: Worker;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;
  private stopped = false;
  private pumping = false;
  private admission: Promise<unknown> = Promise.resolve();
  private updates: Promise<unknown> = Promise.resolve();
  constructor(
    private db: Database,
    private timeoutMs = 120000,
  ) {}
  async start(): Promise<void> {
    // One API replica owns the local queue. Interrupted runs never masquerade as complete.
    await this.db.query(
      "UPDATE flux_jobs SET status='failed', error=$1, finished_at=$2 WHERE status='running'",
      [
        "Server restarted during simulation; submit again",
        new Date().toISOString(),
      ],
    );
    void this.pump();
  }
  async submit(owner: string, input: JobInput): Promise<ServerJob> {
    if (input.baseline)
      for (const s of pairedScenarios(input.baseline, input.scenario))
        parseScenario(s);
    const operation = this.admission.then(async () => {
      if (this.stopped) throw new HttpError(503, "Server is shutting down");
      const [counts] = await this.db.query(
        "SELECT COUNT(*) AS total, SUM(CASE WHEN owner_id=$1 THEN 1 ELSE 0 END) AS owned FROM flux_jobs WHERE status IN ('queued','running')",
        [owner],
      );
      if (Number(counts.total) >= 20 || Number(counts.owned) >= 3)
        throw new HttpError(
          429,
          "Simulation queue is full; wait or cancel an active job",
        );
      const [history] = await this.db.query(
        "SELECT COUNT(*) AS total FROM flux_jobs WHERE owner_id=$1",
        [owner],
      );
      if (Number(history.total) >= 200)
        throw new HttpError(
          409,
          "Job history limit reached; delete old results first",
        );
      const id = randomUUID(),
        created = new Date().toISOString();
      const [row] = await this.db.query(
        "INSERT INTO flux_jobs(id,owner_id,name,status,progress,input,created_at) VALUES($1,$2,$3,'queued',0,$4,$5) RETURNING *",
        [id, owner, input.scenario.name, JSON.stringify(input), created],
      );
      void this.pump();
      return jobFromRow(row);
    });
    this.admission = operation.catch(() => undefined);
    return operation;
  }
  async cancel(id: string, owner: string): Promise<ServerJob> {
    const [row] = await this.db.query(
      "UPDATE flux_jobs SET status='cancelled',finished_at=$3 WHERE id=$1 AND owner_id=$2 AND status IN ('queued','running') RETURNING *",
      [id, owner, new Date().toISOString()],
    );
    if (!row) {
      const [existing] = await this.db.query(
        "SELECT * FROM flux_jobs WHERE id=$1 AND owner_id=$2",
        [id, owner],
      );
      if (!existing) throw new HttpError(404, "Job not found");
      return jobFromRow(existing);
    }
    if (this.current?.id === id) await this.finish(id, null, null);
    return jobFromRow(row);
  }
  private async pump(): Promise<void> {
    if (this.stopped || this.current || this.pumping) return;
    this.pumping = true;
    try {
      const [row] = await this.db.query(
        "UPDATE flux_jobs SET status='running' WHERE id=(SELECT id FROM flux_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1) AND status='queued' RETURNING *",
      );
      if (!row) return;
      if (this.stopped) {
        await this.db.query(
          "UPDATE flux_jobs SET status='queued' WHERE id=$1",
          [row.id],
        );
        return;
      }
      const id = String(row.id);
      const worker = new Worker(resolve("dist-server/simulation-job.mjs"), {
        workerData: JSON.parse(String(row.input)),
        resourceLimits: {
          maxOldGenerationSizeMb: 256,
          maxYoungGenerationSizeMb: 32,
        },
      });
      const timeout = setTimeout(() => {
        void this.finish(
          id,
          null,
          "Simulation exceeded the 120-second resource limit",
        );
      }, this.timeoutMs);
      this.current = { id, worker, timeout };
      worker.on(
        "message",
        (message: { type: string; progress?: number; results?: unknown }) => {
          if (
            message.type === "progress" &&
            Number.isInteger(message.progress)
          ) {
            this.updates = this.updates
              .then(() =>
                this.db.query(
                  "UPDATE flux_jobs SET progress=$2 WHERE id=$1 AND status='running'",
                  [id, message.progress],
                ),
              )
              .catch(() => undefined);
          }
          if (message.type === "result")
            void this.finish(id, message.results, null);
        },
      );
      worker.on("error", () => {
        void this.finish(
          id,
          null,
          "Simulation worker failed; reduce workload and retry",
        );
      });
      worker.on("exit", (code) => {
        if (this.current?.id === id)
          void this.finish(
            id,
            null,
            `Simulation worker exited before returning results (${code})`,
          );
      });
    } finally {
      this.pumping = false;
    }
  }
  private async finish(
    id: string,
    results: unknown,
    error: string | null,
  ): Promise<void> {
    if (this.current?.id !== id) return;
    const active = this.current;
    this.current = null;
    clearTimeout(active.timeout);
    await active.worker.terminate();
    await this.updates;
    if (results || error)
      await this.db.query(
        "UPDATE flux_jobs SET status=$2,progress=$3,results=$4,error=$5,finished_at=$6 WHERE id=$1 AND status='running'",
        [
          id,
          results ? "completed" : "failed",
          results ? 100 : 0,
          results ? JSON.stringify(results) : null,
          error,
          new Date().toISOString(),
        ],
      );
    if (!this.stopped) void this.pump();
  }
  async stop(): Promise<void> {
    this.stopped = true;
    await this.admission;
    if (this.current)
      await this.finish(
        this.current.id,
        null,
        "Server stopped during simulation; submit again",
      );
    await this.updates;
  }
}
