import { openDatabase, migrate } from "./database";
import { createApp } from "./app";
import { TomTom } from "./tomtom";
import { resolveSecrets } from "./secrets";

async function main() {
  const production = process.env.NODE_ENV === "production";
  const port = Number(process.env.PORT ?? 3001),
    host = process.env.FLUX_HOST ?? "127.0.0.1";
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  const origin = process.env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`;
  const url = new URL(origin);
  if (url.origin !== origin || (production && url.protocol !== "https:"))
    throw new Error(
      "PUBLIC_ORIGIN must be an exact origin (HTTPS in production)",
    );
  const secrets = await resolveSecrets(process.env, production);
  const db = await openDatabase({
    url: secrets.databaseUrl,
    directory: process.env.FLUX_DB_DIR ?? ".flux-data/postgres",
    production,
  });
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    if (production || secrets.databaseUrl) {
      const rows = await db.query(
        "SELECT version FROM flux_migrations WHERE version=1",
      );
      if (rows.length !== 1)
        throw new Error(
          "Run the administrative database migration before starting the service",
        );
    } else await migrate(db);
    app = await createApp({
      db,
      origin,
      production,
      tomtom: new TomTom(secrets.tomtomKey),
      allowRegistration:
        process.env.FLUX_ALLOW_REGISTRATION === "true" ||
        (!production && process.env.FLUX_ALLOW_REGISTRATION !== "false"),
      staticDirectory: process.env.FLUX_STATIC_DIR ?? "dist",
    });
    await new Promise<void>((resolve, reject) => {
      app!.server.once("error", reject);
      app!.server.listen(port, host, resolve);
    });
    process.stdout.write(`Flux API: ${origin}\n`);
    let stopping = false;
    async function stop() {
      if (stopping) return;
      stopping = true;
      await app!.close();
      await db.close();
    }
    process.on("SIGTERM", () => {
      void stop();
    });
    process.on("SIGINT", () => {
      void stop();
    });
  } catch {
    await app?.close();
    await db.close();
    throw new Error("Backend startup failed");
  }
}
main().catch(() => {
  process.stderr.write(
    JSON.stringify({
      event: "startup_failed",
      message:
        "Check vault access, database configuration, migrations and port availability; secret-bearing errors are suppressed.",
    }) + "\n",
  );
  process.exitCode = 1;
});
