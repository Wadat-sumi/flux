import { openDatabase, migrate } from "./database";
import { grantRuntimeRole } from "./bootstrap";
async function main() {
  const adminUrl = process.env.BOOTSTRAP_DATABASE_URL,
    runtimeUrl = process.env.DATABASE_URL;
  if (process.env.FLUX_SECRETS_SOURCE !== "azure-key-vault")
    throw new Error("Migration credentials must be Key Vault references");
  if (!adminUrl || !runtimeUrl)
    throw new Error(
      "Migration requires BOOTSTRAP_DATABASE_URL and DATABASE_URL",
    );
  const db = await openDatabase({ url: adminUrl, production: true });
  try {
    await migrate(db);
    await grantRuntimeRole(db, runtimeUrl);
    process.stdout.write(
      "Flux database schema and restricted runtime role are ready.\n",
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  process.stderr.write(
    "Flux migration failed; check vault access, database connectivity and permissions. Secret-bearing errors are suppressed.\n",
  );
  process.exitCode = 1;
});
