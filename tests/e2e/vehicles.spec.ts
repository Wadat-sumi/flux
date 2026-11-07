import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { intersection } from "../../src/scenarios/presets";
import { mixedFleet } from "../vehicle-fixture";

async function exportCurrent(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = await pending;
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("single-type selection edits real vehicle attributes and survives export, saves and reload", async ({
  page,
}) => {
  await page.getByText("Vehicle types & attributes", { exact: true }).click();
  await expect(
    page.getByLabel("Vehicle selection").locator("option"),
  ).toHaveCount(7);
  await page.getByLabel("Vehicle selection").selectOption("bus");
  await page.getByLabel("Bus length (m)", { exact: true }).fill("14");
  await page.getByLabel("Bus maximum speed (km/h)", { exact: true }).fill("36");
  await page.getByLabel("Bus acceleration (m/s²)", { exact: true }).fill("0.6");
  const headway = page.getByLabel("Bus following headway (s)", { exact: true });
  await headway.fill("");
  await headway.pressSequentially("2.2");
  await expect(headway).toHaveValue("2.2");
  await page
    .getByRole("button", { name: "Apply vehicle settings", exact: true })
    .click();
  await expect(page.getByRole("group", { name: "Vehicle colours" })).toHaveText(
    "Bus",
  );
  const saved = await exportCurrent(page),
    bus = saved.fleet.find((p: { id: string }) => p.id === "bus");
  expect(bus).toMatchObject({
    share: 100,
    length: 14,
    maxSpeed: 10,
    acceleration: 0.6,
    headway: 2.2,
  });
  await page.getByText("Demand & simulation settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Advance 20 seconds", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute("data-time", "20");
  const types = JSON.parse(
    (await page.locator("canvas").getAttribute("data-vehicle-types"))!,
  );
  expect(types.bus).toBeGreaterThan(0);
  expect(
    Object.entries(types)
      .filter(([id]) => id !== "bus")
      .every(([, n]) => n === 0),
  ).toBe(true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await page.getByLabel("Scenario", { exact: true }).selectOption("saved-1");
  expect((await exportCurrent(page)).fleet).toEqual(saved.fleet);
  await page.getByText("Vehicle types & attributes", { exact: true }).click();
  await expect(page.getByLabel("Vehicle selection")).toHaveValue("bus");
  await expect(
    page.getByLabel("Bus maximum speed (km/h)", { exact: true }),
  ).toHaveValue("36");
  await page.locator(".vehicle-fields").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/vehicle-settings.png" });
});
test("invalid mixes and braking are rejected, reset is usable, and phone forms fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page
    .getByRole("button", { name: "Show controls", exact: true })
    .click();
  await page.getByText("Vehicle types & attributes", { exact: true }).click();
  await page.getByLabel("Vehicle selection").selectOption("mixed");
  await page.getByLabel("Car share (%)", { exact: true }).fill("80");
  await expect(
    page.getByRole("button", { name: "Apply vehicle settings", exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator(".vehicle-settings").getByRole("alert"),
  ).toContainText("80%");
  await page.getByLabel("Bus share (%)", { exact: true }).fill("20");
  await page
    .getByLabel("Car comfortable braking (m/s²)", { exact: true })
    .fill("6");
  await page
    .getByLabel("Car emergency braking (m/s²)", { exact: true })
    .fill("2");
  await page
    .getByRole("button", { name: "Apply vehicle settings", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Emergency braking");
  await expect(
    page.getByRole("group", { name: "Vehicle colours" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Applied: Cars (default)", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset selected type defaults", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply vehicle settings", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  const saved = await exportCurrent(page);
  expect(
    saved.fleet.filter((p: { share: number }) => p.share > 0),
  ).toHaveLength(2);
});
test("mixed traffic is visible, reports per-type observations and runs on the server with identical settings", async ({
  page,
}) => {
  const scenario = intersection();
  scenario.duration = 120;
  scenario.fleet = mixedFleet();
  scenario.nodes = scenario.nodes.map((n) => ({
    ...n,
    x: n.x / 2,
    y: n.y / 2,
  }));
  scenario.edges = scenario.edges.map((e) => ({ ...e, length: 150 }));
  await page.getByLabel("Import scenario file", { exact: true }).setInputFiles({
    name: "synthetic-mixed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(scenario)),
  });
  await page.getByRole("button", { name: "Plan view", exact: true }).click();
  await page.getByText("Demand & simulation settings", { exact: true }).click();
  for (let i = 1; i <= 3; i++) {
    await page
      .getByRole("button", { name: "Advance 20 seconds", exact: true })
      .click();
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-time",
      String(i * 20),
    );
  }
  await page.getByText("Demand & simulation settings", { exact: true }).click();
  const moving = JSON.parse(
    (await page.locator("canvas").getAttribute("data-vehicle-types"))!,
  );
  expect(
    Object.values(moving).filter((n) => Number(n) > 0).length,
  ).toBeGreaterThanOrEqual(4);
  await expect(
    page.getByRole("group", { name: "Vehicle colours" }).locator("span"),
  ).toHaveCount(6);
  await page.getByRole("button", { name: "Hide labels", exact: true }).click();
  await page.screenshot({ path: "docs/screenshots/mixed-traffic.png" });
  await page
    .getByRole("button", { name: "All metrics +", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Vehicle type results" })
      .locator("tbody tr"),
  ).toHaveCount(6);
  await page
    .getByRole("button", { name: "Close detailed metrics", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run on server", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Network to run on server" }),
  ).toContainText("Car 40%");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`mixed-${crypto.randomUUID()}@flux.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-test-passphrase!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run current on server", exact: true })
    .click();
  await expect(page.getByLabel("Server simulation result")).toContainText(
    "completed · 100%",
    { timeout: 20000 },
  );
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download server report", exact: true })
    .click();
  const file = await pending,
    report = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(report.job.input.scenario.fleet).toEqual(scenario.fleet);
  const types = report.job.results[0].metrics.vehicleTypes;
  expect(types).toHaveLength(6);
  for (const type of types)
    expect(type.generated).toBe(type.active + type.completed + type.rejected);
});
