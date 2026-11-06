import { build } from "esbuild";
await build({
  entryPoints: [
    "server/index.ts",
    "server/simulation-job.ts",
    "server/migrate.ts",
  ],
  outdir: "dist-server",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: false,
});
