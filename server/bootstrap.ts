import type { Database } from "./database";

/** Run only in the administrative migration job, never in the HTTP service. */
export async function grantRuntimeRole(
  db: Database,
  runtimeUrl: string,
): Promise<void> {
  const url = new URL(runtimeUrl),
    user = decodeURIComponent(url.username),
    password = decodeURIComponent(url.password);
  if (user !== "flux_app" || password.length < 24)
    throw new Error(
      "Runtime database account must be flux_app with a 24+ character credential",
    );
  const [existing] = await db.query(
    "SELECT rolname FROM pg_roles WHERE rolname=$1",
    [user],
  );
  // PostgreSQL format(%I,%L) quotes identifiers/literals on the server. Never log this statement.
  const [statement] = await db.query(
    existing
      ? "SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS command"
      : "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS command",
    [user, password],
  );
  await db.exec(String(statement.command));
  await db.exec(
    "GRANT USAGE ON SCHEMA public TO flux_app; GRANT SELECT ON flux_migrations TO flux_app; GRANT SELECT,INSERT,UPDATE,DELETE ON flux_users,flux_sessions,flux_scenarios,flux_datasets,flux_jobs TO flux_app;",
  );
}
