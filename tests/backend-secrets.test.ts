import { test, expect } from "vitest";
import { resolveSecrets } from "../server/secrets";

test("local browser/backend development requires no real credentials and makes no vault request", async () => {
  expect(
    await resolveSecrets({}, false, async () => {
      throw new Error("must not call");
    }),
  ).toEqual({
    databaseUrl: undefined,
    bootstrapUrl: undefined,
    tomtomKey: undefined,
  });
});
test.each(["TOMTOM_API_KEY", "DATABASE_URL", "BOOTSTRAP_DATABASE_URL"])(
  "local plaintext %s injection is rejected under the owner vault policy",
  async (name) => {
    await expect(
      resolveSecrets({ [name]: "synthetic-fixture" }, false),
    ).rejects.toThrow(/Key Vault/);
  },
);
test("production requires declared platform Key Vault reference injection", async () => {
  await expect(
    resolveSecrets({ DATABASE_URL: "synthetic-fixture" }, true),
  ).rejects.toThrow(/Key Vault/);
  expect(
    await resolveSecrets(
      {
        FLUX_SECRETS_SOURCE: "azure-key-vault",
        TOMTOM_API_KEY: "synthetic-fixture",
      },
      true,
    ),
  ).toEqual({
    tomtomKey: "synthetic-fixture",
    databaseUrl: undefined,
    bootstrapUrl: undefined,
  });
});
test("local developer identity retrieves only explicitly enabled secrets from the configured vault", async () => {
  const calls: string[] = [];
  const value = await resolveSecrets(
    {
      FLUX_KEY_VAULT_URL: "https://flux-test.vault.azure.net",
      FLUX_ENABLE_TOMTOM: "true",
    },
    false,
    async (url, name) => {
      calls.push(`${url}/${name}`);
      return "synthetic-fixture";
    },
  );
  expect(calls).toEqual(["https://flux-test.vault.azure.net/tomtom-api-key"]);
  expect(value.databaseUrl).toBeUndefined();
  expect(value.tomtomKey).toBe("synthetic-fixture");
});
test.each([
  "http://flux-test.vault.azure.net",
  "https://attacker.invalid",
  "https://flux-test.vault.azure.net/path",
  "https://user@flux-test.vault.azure.net",
  "https://flux-test.vault.azure.net?secret=1",
])("rejects an unsafe vault origin %s", async (url) => {
  await expect(
    resolveSecrets({ FLUX_KEY_VAULT_URL: url }, false),
  ).rejects.toThrow();
});
test("missing/invalid vault references fail closed without returning provider error details", async () => {
  await expect(
    resolveSecrets(
      {
        FLUX_KEY_VAULT_URL: "https://flux-test.vault.azure.net",
        TOMTOM_SECRET_NAME: "../key",
      },
      false,
    ),
  ).rejects.toThrow(/secret name/);
  await expect(
    resolveSecrets(
      {
        FLUX_KEY_VAULT_URL: "https://flux-test.vault.azure.net",
        FLUX_ENABLE_TOMTOM: "true",
      },
      false,
      async () => undefined,
    ),
  ).rejects.toThrow(/unavailable/);
});
test("cloud database is opt-in and obtains its connection string from Key Vault", async () => {
  const names: string[] = [];
  const result = await resolveSecrets(
    {
      FLUX_KEY_VAULT_URL: "https://flux-test.vault.azure.net",
      FLUX_USE_CLOUD_DATABASE: "true",
    },
    false,
    async (_url, name) => {
      names.push(name);
      return "synthetic-fixture";
    },
  );
  expect(names).toEqual(["database-runtime-url"]);
  expect(result.databaseUrl).toBe("synthetic-fixture");
  expect(result.tomtomKey).toBeUndefined();
});
