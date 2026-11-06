import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
const directory = await mkdtemp(join(tmpdir(), "flux-e2e-"));
const child = spawn(process.execPath, ["dist-server/index.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: "4173",
    FLUX_HOST: "127.0.0.1",
    PUBLIC_ORIGIN: "http://127.0.0.1:4173",
    FLUX_DB_DIR: directory,
    FLUX_ALLOW_REGISTRATION: "true",
  },
});
child.on("exit", async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exitCode = code ?? 0;
});
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
