import { spawn } from "node:child_process";
import process from "node:process";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const children = [
  spawn(process.execPath, ["dist-server/index.mjs"], {
    stdio: "inherit",
    env: { ...process.env, PUBLIC_ORIGIN: "http://127.0.0.1:5173" },
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--strictPort"],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
for (const child of children) child.on("exit", stop);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
