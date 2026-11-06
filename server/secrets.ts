import { AzureCliCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

type Environment = Record<string, string | undefined>;
type Reader = (vault: string, name: string) => Promise<string | undefined>;
const readAzure: Reader = async (vault, name) => {
  const client = new SecretClient(vault, new AzureCliCredential());
  return (
    await client.getSecret(name, { abortSignal: AbortSignal.timeout(5000) })
  ).value;
};
/** Real credentials are vault-derived. Tests inject synthetic values through this boundary. */
export async function resolveSecrets(
  env: Environment,
  production: boolean,
  reader: Reader = readAzure,
) {
  if (production) {
    if (env.FLUX_SECRETS_SOURCE !== "azure-key-vault")
      throw new Error(
        "Production secrets must be injected through Azure Key Vault references",
      );
    return {
      databaseUrl: env.DATABASE_URL,
      bootstrapUrl: env.BOOTSTRAP_DATABASE_URL,
      tomtomKey: env.TOMTOM_API_KEY,
    };
  }
  if (env.TOMTOM_API_KEY || env.DATABASE_URL || env.BOOTSTRAP_DATABASE_URL)
    throw new Error(
      "Local credentials must be retrieved from Key Vault; configure references instead of secret environment values",
    );
  if (!env.FLUX_KEY_VAULT_URL)
    return {
      databaseUrl: undefined,
      bootstrapUrl: undefined,
      tomtomKey: undefined,
    };
  const url = new URL(env.FLUX_KEY_VAULT_URL);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.vault\.azure\.net$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Use an exact HTTPS Azure Key Vault origin");
  const name = env.TOMTOM_SECRET_NAME ?? "tomtom-api-key";
  if (!/^[A-Za-z0-9-]{1,127}$/.test(name))
    throw new Error("Invalid Key Vault secret name");
  const tomtomKey =
    env.FLUX_ENABLE_TOMTOM === "true"
      ? await reader(url.origin, name)
      : undefined;
  const databaseUrl =
    env.FLUX_USE_CLOUD_DATABASE === "true"
      ? await reader(url.origin, "database-runtime-url")
      : undefined;
  if (
    (env.FLUX_ENABLE_TOMTOM === "true" && !tomtomKey) ||
    (env.FLUX_USE_CLOUD_DATABASE === "true" && !databaseUrl)
  )
    throw new Error("Required vault secret is unavailable");
  return { databaseUrl, bootstrapUrl: undefined, tomtomKey };
}
