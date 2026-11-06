import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { flyover } from "../../src/scenarios/presets";
import type { ImportedData } from "../../src/model/backend";

async function openWorkspace(page: Page) {
  await page.getByRole("button", { name: "Data & cloud", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Data and cloud workspace" }),
  ).toBeVisible();
}
async function register(page: Page) {
  const email = `browser-${crypto.randomUUID()}@flux.test`;
  await openWorkspace(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-test-passphrase!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  return email;
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("accounts, server saves, session restore, replacement, deletion and logout work through the UI", async ({
  page,
}) => {
  const email = await register(page);
  await page
    .getByRole("button", { name: "Save current to server", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "saved to your account",
  );
  const library = page
    .getByRole("heading", { name: "Server scenario library" })
    .locator("..");
  await expect(
    library.getByRole("button", { name: "Load", exact: true }),
  ).toHaveCount(1);
  await page.reload();
  await openWorkspace(page);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await library.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "loaded into the editor",
  );
  await library.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "updated with the current",
  );
  await library.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No server scenarios yet.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-test-passphrase!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
});

test("real OSM sample and observed demand import retain provenance and drive a persisted server simulation", async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole("button", {
      name: "Load real Bengaluru road sample",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "zero assumed traffic counts",
  );
  const datasets = await (await page.request.get("/api/datasets")).json();
  const mapped = (await (
    await page.request.get(`/api/datasets/${datasets[0].id}`)
  ).json()) as ImportedData;
  expect(mapped.scenario.demand).toEqual([]);
  expect(mapped.provenance.license).toContain("ODbL");
  const origin = mapped.scenario.nodes.find((n) => n.kind === "source")!.id,
    destination = mapped.scenario.nodes.find((n) => n.kind === "sink")!.id;
  await page.getByLabel("Import format").selectOption("demand");
  await page.getByLabel("Dataset file").setInputFiles({
    name: "fixture-od.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `origin,destination,count,interval_seconds,observed_at\n${origin},${destination},10,300,2026-11-06T00:00:00Z\n`,
    ),
  });
  await page
    .getByLabel("Source / dataset URL")
    .fill("Synthetic test fixture; not real observed traffic");
  await page.getByLabel("License / permission").fill("Test fixture only");
  await page.getByLabel("Observation / extract time").fill("2026-11-06T00:00");
  await page
    .getByRole("button", { name: "Validate and import data", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "1 observations normalized",
  );
  await page
    .getByRole("button", { name: "Run current on server", exact: true })
    .click();
  const result = page.getByLabel("Server simulation result");
  await expect(result).toContainText("completed · 100%", { timeout: 20000 });
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download server report", exact: true })
    .click();
  const download = await downloadPromise;
  const report = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(
    report.job.input.provenance.map((p: { kind: string }) => p.kind),
  ).toEqual(["osm", "observed-demand"]);
  const metrics = report.job.results[0].metrics;
  expect(metrics.generated).toBe(
    metrics.active + metrics.completed + metrics.rejected,
  );
  expect(metrics.generated).toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Load dataset", exact: true }),
  ).toHaveCount(2);
});

test("paired server results share demand and survive closing the workspace", async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole("button", {
      name: "Run paired experiment on server",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Server simulation result")).toContainText(
    "completed · 100%",
    { timeout: 20000 },
  );
  await page
    .getByRole("button", { name: "Close data workspace", exact: true })
    .click();
  await openWorkspace(page);
  await page
    .getByRole("button", { name: "View result", exact: true })
    .first()
    .click();
  const result = page.getByLabel("Server simulation result");
  await expect(result.locator("tbody tr")).toHaveCount(2);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download server report", exact: true })
    .click();
  const download = await downloadPromise;
  const report = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(report.job.results[0].metrics.generated).toBe(
    report.job.results[1].metrics.generated,
  );
});

test("server cancellation and missing TomTom configuration are clear and recoverable", async ({
  page,
}) => {
  const scenario = { ...flyover(), duration: 3600, maxVehicles: 10000 };
  await page.getByLabel("Import scenario file", { exact: true }).setInputFiles({
    name: "long.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(scenario)),
  });
  await register(page);
  await page
    .getByRole("button", { name: "Run current on server", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel job", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Server simulation result")).toContainText(
    "cancelled",
  );
  await expect(
    page.getByRole("button", { name: "Fetch TomTom traffic", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("TomTom needs an Azure Key Vault secret reference.", {
      exact: false,
    }),
  ).toBeVisible();
  for (const city of [
    "mumbai",
    "chennai",
    "pune",
    "hyderabad",
    "delhi",
    "bengaluru",
  ]) {
    await page.getByLabel("Indian city", { exact: true }).selectOption(city);
    expect(
      Number(await page.getByLabel("Latitude", { exact: true }).inputValue()),
    ).toBeGreaterThan(6);
  }
});

test("stored server labels remain inert and the data workspace works on a phone", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4173") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  const scenario = {
    ...flyover(),
    name: '<img src="https://attacker.invalid" onerror="window.pwned=1">',
  };
  await page.getByLabel("Import scenario file", { exact: true }).setInputFiles({
    name: "label.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(scenario)),
  });
  await register(page);
  await page
    .getByRole("button", { name: "Save current to server", exact: true })
    .click();
  await expect(page.locator(".server-list").first()).toContainText(
    scenario.name,
  );
  expect(await page.locator("img").count()).toBe(0);
  expect(external).toEqual([]);
  await page
    .getByRole("button", { name: "Close data workspace", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const width = await page
    .getByRole("dialog")
    .evaluate((e) => e.scrollWidth <= e.clientWidth);
  expect(width).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
