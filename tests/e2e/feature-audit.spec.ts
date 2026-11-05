import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { flyover, freeRoad } from "../../src/scenarios/presets";
import type { Scenario } from "../../src/model/schema";

async function importScenario(page: Page, scenario: Scenario) {
  await page.getByLabel("Import scenario file", { exact: true }).setInputFiles({
    name: "audit-scenario.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(scenario)),
  });
  await expect(page.getByRole("status")).toContainText(
    "imported and validated",
  );
}
async function exportScenario(page: Page): Promise<Scenario> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, "utf8"));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeEnabled();
});

test("undo restores the demand form as well as the exported scenario", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Network", exact: true }).click();
  await page.getByText("Sources & demand", { exact: true }).click();
  await page.getByLabel("Demand west to east", { exact: true }).fill("2200");
  await page
    .getByRole("button", { name: "Update rate", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Undo last network change" }).click();
  expect((await exportScenario(page)).demand[0].rate).toBe(1100);
  await expect(
    page.getByLabel("Demand west to east", { exact: true }),
  ).toHaveValue("1100");
});

test("zero-completion comparisons show unavailable averages and empty travel-time charts", async ({
  page,
}) => {
  const s = flyover();
  s.duration = 10;
  await importScenario(page, s);
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await page
    .getByRole("button", { name: "Capture current as baseline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run paired experiment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What changed?" }),
  ).toBeVisible();
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", {
        name: "Mean travel time",
        exact: true,
      }),
    });
  await expect(row.getByRole("cell")).toHaveText(["—", "—", "—"]);
  await expect(
    page.getByText("No completed trips yet", { exact: true }),
  ).toHaveCount(2);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export experiment", exact: true })
    .click();
  const report = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(
    report.results.every(
      (result: { metrics: { meanTravelTime: number | null } }) =>
        result.metrics.meanTravelTime === null,
    ),
  ).toBe(true);
});

test("an empty network can be built with sources, sinks, a ramp and demand, then run and restarted", async ({
  page,
}) => {
  const blank = flyover();
  blank.name = "Network built in audit";
  blank.nodes = [];
  blank.edges = [];
  blank.demand = [];
  blank.duration = 60;
  await importScenario(page, blank);
  await page.getByRole("button", { name: "Network", exact: true }).click();
  await page.getByText("Add a node by coordinates", { exact: true }).click();
  for (const [x, role, layer, id] of [
    [-120, "source", 0, "node-1"],
    [120, "sink", 1, "node-2"],
  ] as const) {
    await page.getByLabel("New node X", { exact: true }).fill(String(x));
    await page.getByLabel("New node Y", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Add node", exact: true }).click();
    await page
      .getByLabel("Inspect element", { exact: true })
      .selectOption(`node:${id}`);
    await page.getByLabel("Node role", { exact: true }).selectOption(role);
    await page
      .getByLabel("Node elevation", { exact: true })
      .fill(String(layer));
    await page
      .getByRole("button", { name: "Apply node changes", exact: true })
      .click();
  }
  await page.getByLabel("From node", { exact: true }).selectOption("node-1");
  await page.getByLabel("To node", { exact: true }).selectOption("node-2");
  await page.getByLabel("New road lanes", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Connect nodes", exact: true })
    .click();
  await page.getByText("Sources & demand", { exact: true }).click();
  await page.getByLabel("New demand (veh/h)", { exact: true }).fill("1200");
  await page
    .getByRole("button", { name: "Add demand pair", exact: true })
    .click();
  const s = await exportScenario(page);
  expect(s.edges).toHaveLength(1);
  expect(s.edges[0].ramp).toBe(true);
  expect(s.edges[0].lanes).toBe(2);
  expect(s.demand[0].rate).toBe(1200);
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await page.getByLabel("L1 Elevated", { exact: true }).uncheck();
  await page.getByLabel("L1 Elevated", { exact: true }).check();
  await page.getByLabel("Congestion overlay", { exact: true }).check();
  await page.getByLabel("City context", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Plan view", exact: true }).click();
  await page.getByRole("button", { name: "Isometric", exact: true }).click();
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
  const completed = Number(
    await page
      .getByRole("region", { name: "Live traffic metrics" })
      .locator(".metric-value")
      .first()
      .innerText(),
  );
  expect(completed).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause simulation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
});

test("signal timings and road speed, length, width and priority persist through the editor", async ({
  page,
}) => {
  await page
    .getByLabel("Scenario", { exact: true })
    .selectOption("intersection");
  await page.getByRole("button", { name: "Network", exact: true }).click();
  await page
    .getByLabel("Inspect element", { exact: true })
    .selectOption("node:center");
  await page.getByLabel("Green (s)", { exact: true }).fill("12");
  await page.getByLabel("Yellow (s)", { exact: true }).fill("2");
  await page.getByLabel("All red (s)", { exact: true }).fill("1");
  await page.getByLabel("Offset (s)", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Apply node changes", exact: true })
    .click();
  await page
    .getByLabel("Inspect element", { exact: true })
    .selectOption("edge:west-in");
  await page.getByLabel("Speed limit (km/h)", { exact: true }).fill("36");
  await page.getByLabel("Road length (m)", { exact: true }).fill("400");
  await page.getByLabel("Road width (m)", { exact: true }).fill("9.5");
  await page.getByLabel("Road priority", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Apply road changes", exact: true })
    .click();
  const s = await exportScenario(page);
  expect(s.nodes.find((n) => n.id === "center")!.signal).toEqual({
    green: 12,
    yellow: 2,
    allRed: 1,
    offset: 3,
  });
  const road = s.edges.find((e) => e.id === "west-in")!;
  expect(road.speedLimit).toBe(10);
  expect(road.length).toBe(400);
  expect(road.width).toBe(9.5);
  expect(road.priority).toBe(3);
});

test("the bottleneck comparison runs with identical demand and improves throughput", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await page
    .getByRole("button", { name: "1 lane ↔ 2 lanes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run paired experiment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What changed?" }),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export experiment", exact: true })
    .click();
  const report = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(report.results[0].metrics.generated).toBe(
    report.results[1].metrics.generated,
  );
  expect(report.results[1].metrics.completed).toBeGreaterThan(
    report.results[0].metrics.completed,
  );
  expect(report.results[1].metrics.queue).toBeLessThan(
    report.results[0].metrics.queue,
  );
});

test("a long paired experiment can be cancelled without locking the controls", async ({
  page,
}) => {
  const s = flyover();
  s.duration = 3600;
  await importScenario(page, s);
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await page
    .getByRole("button", { name: "Capture current as baseline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run paired experiment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel experiment", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("cancelled");
  await expect(
    page.getByRole("button", { name: "Run paired experiment", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeEnabled();
});

test("wheel zoom preserves the world point under the cursor on an asymmetric network", async ({
  page,
}) => {
  await importScenario(page, freeRoad());
  await page.getByRole("button", { name: "Network", exact: true }).click();
  const position = { x: 800, y: 440 };
  await page.getByRole("button", { name: "+ Place node", exact: true }).click();
  await page.mouse.click(position.x, position.y);
  const before = (await exportScenario(page)).nodes.find(
    (n) => n.id === "node-1",
  )!;
  await page.getByRole("button", { name: "Undo last network change" }).click();
  await page.mouse.move(position.x, position.y);
  await page.mouse.wheel(0, -400);
  await page.getByRole("button", { name: "+ Place node", exact: true }).click();
  await page.mouse.click(position.x, position.y);
  const after = (await exportScenario(page)).nodes.find(
    (n) => n.id === "node-1",
  )!;
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
});

test('pan and fit preserve editing geometry and an existing node can be dragged', async ({ page }) => {
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  const anchor = { x: 800, y: 440 };
  const place = async () => {
    await page.getByRole('button', { name: '+ Place node', exact: true }).click();
    await page.mouse.click(anchor.x, anchor.y);
    return (await exportScenario(page)).nodes.find(n => n.id === 'node-1')!;
  };
  const original = await place();
  await page.getByRole('button', { name: 'Undo last network change' }).click();
  await page.mouse.move(900, 570); await page.mouse.down(); await page.mouse.move(980, 610, { steps: 8 }); await page.mouse.up();
  const panned = await place();
  expect(Math.hypot(panned.x-original.x, panned.y-original.y)).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Undo last network change' }).click();
  await page.getByRole('button', { name: 'Fit network', exact: true }).click();
  const fitted = await place();
  expect(Math.abs(fitted.x-original.x)).toBeLessThanOrEqual(1); expect(Math.abs(fitted.y-original.y)).toBeLessThanOrEqual(1);
  await page.mouse.move(anchor.x, anchor.y); await page.mouse.down(); await page.mouse.move(anchor.x+60, anchor.y+30, { steps: 8 }); await page.mouse.up();
  const dragged = (await exportScenario(page)).nodes.find(n => n.id === 'node-1')!;
  expect(dragged.x).toBeGreaterThan(fitted.x); expect(dragged.y).toBeGreaterThan(fitted.y);
});
