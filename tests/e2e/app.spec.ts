import { expect, test, type Page } from "@playwright/test";
import { flyover } from "../../src/scenarios/presets";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeEnabled();
});

test("three presets, playback, pause, step, reset and detailed observations work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const preset of ["intersection", "bottleneck", "flyover"]) {
    await page.getByLabel("Scenario", { exact: true }).selectOption(preset);
    await expect(page.locator("canvas")).toHaveAttribute("data-time", "0");
  }
  await page.getByText("Demand & simulation settings", { exact: true }).click();
  for (let i = 1; i <= 3; i++) {
    await page.getByRole("button", { name: "Advance 20 seconds", exact: true }).click();
    await expect(page.locator("canvas")).toHaveAttribute("data-time", String(i * 20));
  }
  await page.getByText("Demand & simulation settings", { exact: true }).click();
  await page.getByText("YOUR EXPERIMENT", { exact: true }).scrollIntoViewIfNeeded();
  if (await page.getByRole("button", { name: "Dismiss message" }).isVisible()) {
    await page.getByRole("button", { name: "Dismiss message" }).click();
  }
  await page.screenshot({ path: "docs/screenshots/flux-layered-city.png" });
  await page.getByLabel("Playback speed", { exact: true }).selectOption("8");
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause simulation", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(await page.locator("canvas").getAttribute("data-time")),
    )
    .toBeGreaterThan(61);
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  const time = Number(await page.locator("canvas").getAttribute("data-time"));
  await page
    .getByRole("button", { name: "Advance one simulation step" })
    .click();
  await expect
    .poll(async () =>
      Number(await page.locator("canvas").getAttribute("data-time")),
    )
    .toBeGreaterThan(time);
  await page.getByRole("button", { name: "All metrics" }).click();
  await expect(
    page.getByRole("region", { name: "Detailed traffic metrics" }),
  ).toBeVisible();
  await expect(page.getByText("CONSERVATION", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close detailed metrics" }).click();
  await page.getByRole("button", { name: "Reset simulation" }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-time", "0");
  expect(errors).toEqual([]);
});

test("network editing adds, connects, inspects, changes and deletes roads and nodes", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Network", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Plan view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Add a node by coordinates", { exact: true }).click();
  await page.getByLabel("New node X", { exact: true }).fill("200");
  await page.getByLabel("New node Y", { exact: true }).fill("160");
  await page.getByRole("button", { name: "Add node", exact: true }).click();
  await page
    .getByLabel("Inspect element", { exact: true })
    .selectOption("node:node-1");
  await page.getByLabel("Node elevation", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Apply node changes" }).click();
  await page.getByLabel("From node", { exact: true }).selectOption("north");
  await page.getByLabel("To node", { exact: true }).selectOption("node-1");
  await page
    .getByRole("button", { name: "Connect nodes", exact: true })
    .click();
  await page
    .getByLabel("Inspect element", { exact: true })
    .selectOption("edge:road-1");
  await expect(page.getByText("Ramp", { exact: true })).toBeVisible();
  await page.getByLabel("Road lanes", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Apply road changes" }).click();
  await expect(page.getByLabel("Road lanes", { exact: true })).toHaveValue("2");
  await page.getByRole("button", { name: "Delete selected road" }).click();
  await expect(
    page.getByLabel("Inspect element").locator('option[value="edge:road-1"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo last network change" }).click();
  await expect(
    page.getByLabel("Inspect element").locator('option[value="edge:road-1"]'),
  ).toHaveCount(1);
  await page.getByLabel("Inspect element").selectOption("node:node-1");
  await page.getByRole("button", { name: "Delete selected node" }).click();
  await expect(
    page.getByLabel("Inspect element").locator('option[value="node:node-1"]'),
  ).toHaveCount(0);
});

test("configuration, validated file export/import and local saves survive reload", async ({
  page,
}) => {
  await page.getByText("Demand & simulation settings", { exact: true }).click();
  await page
    .getByLabel("Scenario name", { exact: true })
    .fill("My flyover experiment");
  await page.getByLabel("Random seed", { exact: true }).fill("123");
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloaded,
    path = await download.path();
  expect(path).not.toBeNull();
  const scenario = JSON.parse(await readFile(path!, "utf8"));
  expect(scenario.generator).toBe("Flux");
  expect(scenario.seed).toBe(123);
  await page.reload();
  await expect(
    page
      .getByLabel("Scenario", { exact: true })
      .locator('optgroup[label="Saved on this device"] option'),
  ).toHaveCount(1);
  await page.getByLabel("Scenario", { exact: true }).selectOption("saved-1");
  await expect(page.locator(".scene-heading")).toContainText(
    "My flyover experiment",
  );
  await page
    .getByLabel("Import scenario file", { exact: true })
    .setInputFiles({
      name: "scenario.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(scenario)),
    });
  await expect(page.getByRole("status")).toContainText(
    "imported and validated",
  );
});

test("paired comparison executes both networks and exports reproducible results", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await page
    .getByRole("button", { name: "At-grade ↔ Flyover", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run paired experiment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What changed?" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Completed trips");
  const chartScales = await page.locator('.comparison-charts .chart').evaluateAll(charts=>charts.map(chart=>chart.getAttribute('data-scale-max')));
  expect(chartScales[0]).toBe(chartScales[2]);
  expect(chartScales[1]).toBe(chartScales[3]);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export experiment", exact: true })
    .click();
  const download = await downloaded;
  const report = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(report.results[0].metrics.generated).toBe(
    report.results[1].metrics.generated,
  );
  expect(report.modified.seed).toBe(report.baseline.seed);
  expect(report.modified.demand).toEqual(report.baseline.demand);
  expect(report.results[1].metrics.completed).toBeGreaterThan(
    report.results[0].metrics.completed,
  );
});

test("tablet and phone layouts keep controls reachable without horizontal overflow", async ({
  page,
}) => {
  for (const viewport of [
    { width: 834, height: 1112 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page
      .getByRole("button", { name: "Show controls", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Run simulation", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause simulation", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Pause simulation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Hide controls", exact: true })
      .click();
    await page.getByRole("button", { name: "Plan view", exact: true }).click();
  }
});

test("keyboard navigation reaches editor forms and dismisses model notes with Escape", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Network", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("complementary", { name: "Network editor" }),
  ).toBeVisible();
  await page
    .getByLabel("Inspect element", { exact: true })
    .selectOption("node:north");
  await expect(page.getByLabel("Node role", { exact: true })).toHaveValue(
    "source",
  );
  await page
    .getByRole("button", { name: "About the model", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

export async function importNetwork(
  page: Page,
  scenario: ReturnType<typeof flyover>,
) {
  await page
    .getByLabel("Import scenario file", { exact: true })
    .setInputFiles({
      name: "fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(scenario)),
    });
  await expect(page.getByRole("status")).toContainText(
    "imported and validated",
  );
}
