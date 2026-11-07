import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { intersection } from "../../src/scenarios/presets";
import { mixedFleet } from "../vehicle-fixture";
import {
  defaultVehicleProfiles,
  vehicleLabels,
} from "../../src/model/vehicles";

async function exportCurrent(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = await pending;
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("new presets default to the suggested mix, all six 3D previews render, and restoring shares preserves custom attributes", async ({
  page,
}) => {
  await page.getByText("Vehicle types & attributes", { exact: true }).click();
  await expect(
    page.getByLabel("Vehicle selection", { exact: true }),
  ).toHaveValue("mixed");
  for (const profile of defaultVehicleProfiles) {
    await expect(
      page.getByLabel(`${vehicleLabels[profile.id]} share (%)`, {
        exact: true,
      }),
    ).toHaveValue(String(profile.share));
    await page
      .getByLabel("Edit vehicle attributes", { exact: true })
      .selectOption(profile.id);
    const preview = page.getByRole("img", {
      name: `${vehicleLabels[profile.id]} 3D sprite preview`,
    });
    await expect(preview).toBeVisible();
    expect(Number(await preview.getAttribute("data-faces"))).toBeGreaterThan(
      10,
    );
    await expect(
      preview.locator(
        'polygon[data-material="glass"], polygon[data-material="metal"]',
      ),
    ).not.toHaveCount(0);
    await preview.screenshot({
      path: `docs/screenshots/vehicle-3d-${profile.id}.png`,
    });
  }
  await page
    .getByLabel("Vehicle selection", { exact: true })
    .selectOption("car");
  await page.getByLabel("Car length (m)", { exact: true }).fill("4.5");
  await page
    .getByRole("button", { name: "Use suggested urban mix", exact: true })
    .click();
  await expect(
    page.getByLabel("Vehicle selection", { exact: true }),
  ).toHaveValue("mixed");
  for (const profile of defaultVehicleProfiles)
    await expect(
      page.getByLabel(`${vehicleLabels[profile.id]} share (%)`, {
        exact: true,
      }),
    ).toHaveValue(String(profile.share));
  await expect(page.getByLabel("Car length (m)", { exact: true })).toHaveValue(
    "4.5",
  );
  await page
    .getByRole("button", { name: "Apply vehicle settings", exact: true })
    .click();
  const saved = await exportCurrent(page);
  expect(saved.fleet.find((p: { id: string }) => p.id === "car").length).toBe(
    4.5,
  );
  expect(saved.fleet.map((p: { share: number }) => p.share)).toEqual([
    30, 50, 12, 4, 2, 2,
  ]);
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
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-vehicle-renderer",
    "3d-solids",
  );
  expect(
    Number(await page.locator("canvas").getAttribute("data-sprite-faces")),
  ).toBeGreaterThan(0);
  await page.getByText("Demand & simulation settings", { exact: true }).click();
  await page.screenshot({ path: "docs/screenshots/mixed-traffic-3d.png" });
  await page
    .getByLabel("Scenario", { exact: true })
    .selectOption("intersection");
  expect((await exportCurrent(page)).fleet).toEqual(defaultVehicleProfiles);
});
test("reference dimensions retain millimetres, source notes distinguish dynamics, and old custom profiles require explicit reset", async ({
  page,
}) => {
  await page.getByText("Vehicle types & attributes", { exact: true }).click();
  await expect(page.getByLabel("Car length (m)", { exact: true })).toHaveValue(
    "3.86",
  );
  await expect(page.getByLabel("Car width (m)", { exact: true })).toHaveValue(
    "1.735",
  );
  await expect(
    page.getByLabel("Car maximum speed (km/h)", { exact: true }),
  ).toHaveValue("165");
  await expect(
    page.getByLabel("Body shape", { exact: true }).locator("option"),
  ).toHaveCount(6);
  await expect(
    page.getByRole("region", { name: "Vehicle reference data" }),
  ).toContainText("Matches reference defaults");
  await page.getByText("Sources & parameter notes", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Vehicle reference data" }),
  ).toContainText("not a Swift performance measurement");
  await expect(
    page.getByRole("link", { name: "Suzuki Swift UK 1.2 MHEV brochure" }),
  ).toHaveAttribute("href", /^https:\/\/cdn.suzuki.co.uk\//);
  await page
    .getByLabel("Edit vehicle attributes", { exact: true })
    .selectOption("twoWheeler");
  await expect(
    page.getByLabel("Two-wheeler width (m)", { exact: true }),
  ).toHaveValue("0.767");
  await expect(
    page.getByLabel("Two-wheeler desired acceleration (m/s²)", { exact: true }),
  ).toHaveValue("2.825");
  await expect(
    page.getByRole("img", { name: "Two-wheeler 3D sprite preview" }),
  ).toBeVisible();
  const old = intersection();
  old.fleet = [
    {
      id: "car",
      share: 100,
      length: 4.8,
      width: 1.8,
      maxSpeed: 120 / 3.6,
      acceleration: 1.5,
      deceleration: 2,
      emergencyDeceleration: 8,
      minGap: 2,
      headway: 1.2,
    },
  ];
  await page.getByLabel("Import scenario file", { exact: true }).setInputFiles({
    name: "old-custom.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(old)),
  });
  expect((await exportCurrent(page)).fleet).toEqual(old.fleet);
  await page.getByText("Vehicle types & attributes", { exact: true }).click();
  await expect(page.getByLabel("Car length (m)", { exact: true })).toHaveValue(
    "4.8",
  );
  await expect(
    page.getByRole("region", { name: "Vehicle reference data" }),
  ).toContainText("Custom or earlier values");
  await page
    .getByRole("button", { name: "Reset selected type defaults", exact: true })
    .click();
  await expect(page.getByLabel("Car width (m)", { exact: true })).toHaveValue(
    "1.735",
  );
  await page
    .getByRole("button", { name: "Apply vehicle settings", exact: true })
    .click();
  const reset = (await exportCurrent(page)).fleet.find(
    (p: { id: string }) => p.id === "car",
  );
  expect(reset).toMatchObject({
    length: 3.86,
    width: 1.735,
    bodyShape: "hatchback",
    referenceRevision: "2026-11-07-ref1",
  });
  await page.getByText("Vehicle types & attributes", { exact: true }).click();
  await page
    .getByLabel("Edit vehicle attributes", { exact: true })
    .selectOption("bus");
  await page
    .getByRole("img", { name: "Bus 3D sprite preview" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/vehicle-reference-settings.png",
  });
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
  await page
    .getByLabel("Bus desired acceleration (m/s²)", { exact: true })
    .fill("0.6");
  await page
    .getByLabel("Body shape", { exact: true })
    .selectOption("rigidTruck");
  await expect(
    page.getByRole("region", { name: "Vehicle reference data" }),
  ).toContainText("Custom or earlier values");
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
    bodyShape: "rigidTruck",
    referenceRevision: "2026-11-07-ref1",
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
  await page.getByLabel("Vehicle selection").selectOption("car");
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
    page.getByRole("group", { name: "Vehicle colours" }).locator("span"),
  ).toHaveCount(6);
  await expect(
    page.getByText(
      "Applied: Car 30% · Two-wheeler 50% · Auto-rickshaw 12% · Light commercial 4% · Bus 2% · Truck 2%",
      { exact: true },
    ),
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
