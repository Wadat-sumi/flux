import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { importOsm } from "../../server/imports";
import { mapBounds, mapFixture, mapMetadata } from "../map-fixtures";
import { roundaboutFixture } from "../roundabout-fixture";

// UI tests use explicitly synthetic geometry and tiles. Live OSM is verified separately.
async function openMap(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#efede7"/><path d="M0 128H256M128 0V256" stroke="#fff" stroke-width="12"/></svg>',
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Map area", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "OpenStreetMap area selection" }),
  ).toBeVisible();
}
async function coordinates(page: Page) {
  await page
    .getByText("Selection coordinates / keyboard selection", { exact: true })
    .click();
  for (const key of ["south", "west", "north", "east"] as const)
    await page
      .getByLabel(`Selection ${key}`, { exact: true })
      .fill(String(mapBounds[key]));
  await page
    .getByRole("button", { name: "Apply coordinates", exact: true })
    .click();
}
test("OSM area preview marks directed boundary terminals and loads a runnable simulation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openMap(page);
  await coordinates(page);
  let requests = 0;
  await page.route("**/api/maps/osm-area", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.bounds).toEqual(mapBounds);
    requests++;
    const result = importOsm(
      { text: JSON.stringify(mapFixture), metadata: mapMetadata },
      input,
    );
    await route.fulfill({ json: result });
  });
  await page
    .getByRole("button", { name: "Preview roads & terminals", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "2 sources and 2 sinks",
  );
  await expect(
    page.locator(".leaflet-tooltip").filter({ hasText: "SOURCE" }),
  ).toHaveCount(2);
  await expect(
    page.locator(".leaflet-tooltip").filter({ hasText: "SINK" }),
  ).toHaveCount(2);
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "OpenStreetMap contributors",
  );
  await page
    .getByRole("button", { name: "Use area in simulation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".scene-heading")).toContainText(
    "OpenStreetMap selected area",
  );
  await page.getByText("Demand & simulation settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Advance 20 seconds", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute("data-time", "20");
  await page.getByRole("button", { name: "Network", exact: true }).click();
  await page
    .getByLabel("Inspect element", { exact: true })
    .selectOption("node:entry_way_10_1_f");
  await expect(page.getByLabel("Node role", { exact: true })).toHaveValue(
    "source",
  );
  expect(requests).toBe(1);
  expect(errors).toEqual([]);
});
test("all six city shortcuts work and changed bounds or demand invalidate the preview", async ({
  page,
}) => {
  await openMap(page);
  const select = page.getByLabel("Jump to city", { exact: true });
  await expect(select.locator("option")).toHaveCount(6);
  for (const city of [
    "mumbai",
    "chennai",
    "pune",
    "hyderabad",
    "delhi",
    "bengaluru",
  ]) {
    await select.selectOption(city);
    await expect(select).toHaveValue(city);
  }
  await coordinates(page);
  const result = importOsm(
    { text: JSON.stringify(mapFixture), metadata: mapMetadata },
    { bounds: mapBounds, syntheticRate: 900 },
  );
  await page.route("**/api/maps/osm-area", (route) =>
    route.fulfill({ json: result }),
  );
  await page
    .getByRole("button", { name: "Preview roads & terminals", exact: true })
    .click();
  const use = page.getByRole("button", {
    name: "Use area in simulation",
    exact: true,
  });
  await expect(use).toBeEnabled();
  await page
    .getByLabel("Synthetic vehicles per hour", { exact: true })
    .fill("0");
  await expect(use).toBeDisabled();
  await expect(page.locator(".leaflet-tooltip")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Select 260 m at map centre", exact: true })
    .click();
  await expect(use).toBeDisabled();
});
test("drawing two corners works, invalid bounds and provider failures are recoverable", async ({
  page,
}) => {
  await openMap(page);
  await page
    .getByRole("button", { name: "Draw selection", exact: true })
    .click();
  const map = page.getByRole("region", {
      name: "OpenStreetMap: pan, zoom and select a road area",
      exact: true,
    }),
    box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.25);
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "opposite corner",
  );
  await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.75);
  await expect(
    page.getByRole("button", { name: "Draw selection", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await coordinates(page);
  await page.getByLabel("Selection east", { exact: true }).fill("78");
  await page
    .getByRole("button", { name: "Apply coordinates", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("50 and 800");
  await page
    .getByLabel("Selection east", { exact: true })
    .fill(String(mapBounds.east));
  await page
    .getByRole("button", { name: "Apply coordinates", exact: true })
    .click();
  await page.route("**/api/maps/osm-area", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "OpenStreetMap could not be reached. Retry shortly." },
    }),
  );
  await page
    .getByRole("button", { name: "Preview roads & terminals", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("could not be reached");
  await expect(
    page.getByRole("button", { name: "Use area in simulation", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close map", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeEnabled();
});
test("phone map picker fits the screen and injected provenance remains inert", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMap(page);
  await coordinates(page);
  const result = importOsm(
    { text: JSON.stringify(mapFixture), metadata: mapMetadata },
    { bounds: mapBounds, syntheticRate: 900 },
  );
  result.provenance.source =
    '<img src="https://attacker.invalid/x" onerror="window.pwned=1">';
  await page.route("**/api/maps/osm-area", (route) =>
    route.fulfill({ json: result }),
  );
  await page
    .getByRole("button", { name: "Preview roads & terminals", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use area in simulation", exact: true }),
  ).toBeEnabled();
  await page
    .getByText("Import assumptions and provenance", { exact: true })
    .click();
  await expect(
    page.getByText(result.provenance.source, { exact: true }),
  ).toBeVisible();
  expect(await page.locator('img[src*="attacker.invalid"]').count()).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
});
test("header map, cloud and workspace controls remain unobstructed at desktop, tablet and phone widths", async ({
  page,
}) => {
  for (const width of [1280, 1100, 1024, 852, 834, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    for (const name of [
      "Map area",
      "Data & cloud",
      "Simulate",
      "Network",
      "Experiments",
    ]) {
      const button = page.getByRole("button", { name, exact: true });
      expect(
        await button.evaluate((el) => {
          const r = el.getBoundingClientRect(),
            top = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
          return top === el || (top !== null && el.contains(top));
        }),
      ).toBe(true);
    }
    await page.getByRole("button", { name: "Map area", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "OpenStreetMap area selection" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close map", exact: true }).click();
  }
});
test("roundabout imports as one editable structure and labels toggle without resetting simulation", async ({
  page,
}) => {
  await openMap(page);
  await coordinates(page);
  const result = importOsm(
    { text: JSON.stringify(roundaboutFixture()), metadata: mapMetadata },
    { bounds: mapBounds, syntheticRate: 900 },
  );
  await page.route("**/api/maps/osm-area", (route) =>
    route.fulfill({ json: result }),
  );
  await page
    .getByRole("button", { name: "Preview roads & terminals", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "1 roundabouts",
  );
  await page
    .getByRole("button", { name: "Hide map labels", exact: true })
    .click();
  await expect(page.locator(".leaflet-tooltip")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show map labels", exact: true })
    .click();
  await expect(page.locator(".leaflet-tooltip")).toHaveCount(8);
  await page
    .getByRole("button", { name: "Use area in simulation", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute("data-roundabouts", "1");
  await page.getByRole("button", { name: "Plan view", exact: true }).click();
  await page.screenshot({ path: "docs/screenshots/roundabout-geometry.png" });
  await page.getByText("Demand & simulation settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Advance 20 seconds", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute("data-time", "20");
  await page.getByRole("button", { name: "Hide labels", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-labels", "false");
  await expect(page.locator("canvas")).toHaveAttribute("data-time", "20");
  await page.getByRole("button", { name: "Show labels", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-labels", "true");
  await page.getByRole("button", { name: "Network", exact: true }).click();
  const group = result.scenario.roundabouts![0];
  await page
    .getByLabel("Inspect element", { exact: true })
    .selectOption(`roundabout:${group.id}`);
  await expect(
    page.getByRole("heading", { name: "Roundabout", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Inspect element", { exact: true }).locator("option"),
  ).toHaveCount(18);
  await page.getByLabel("Roundabout lanes", { exact: true }).fill("2");
  await page.getByLabel("Roundabout speed", { exact: true }).fill("6");
  await page
    .getByRole("button", { name: "Apply roundabout", exact: true })
    .click();
  await expect(
    page.getByLabel("Roundabout lanes", { exact: true }),
  ).toHaveValue("2");
  await expect(page.locator("canvas")).toHaveAttribute("data-roundabouts", "1");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await pending;
  const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(saved.roundabouts).toHaveLength(1);
  expect(
    saved.edges
      .filter((e: { id: string }) => group.edgeIds.includes(e.id))
      .every(
        (e: { lanes: number; speedLimit: number; shape?: unknown[] }) =>
          e.lanes === 2 && e.speedLimit === 6 && (e.shape?.length ?? 0) > 0,
      ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Delete selected roundabout", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute("data-roundabouts", "0");
  await page
    .getByRole("button", { name: "↶ Undo last network change", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute("data-roundabouts", "1");
});
test("map-to-server shortcut reviews the selected network before submitting a retained run", async ({
  page,
}) => {
  await openMap(page);
  const use = page.getByRole("button", {
    name: "Use area on server",
    exact: true,
  });
  await expect(use).toBeDisabled();
  await coordinates(page);
  const imported = importOsm(
    { text: JSON.stringify(roundaboutFixture()), metadata: mapMetadata },
    { bounds: mapBounds, syntheticRate: 900 },
  );
  await page.route("**/api/maps/osm-area", (route) =>
    route.fulfill({ json: imported }),
  );
  await page
    .getByRole("button", { name: "Preview roads & terminals", exact: true })
    .click();
  await use.click();
  await expect(
    page.getByRole("dialog", { name: "OpenStreetMap area selection" }),
  ).toHaveCount(0);
  const summary = page.getByRole("region", {
    name: "Network to run on server",
  });
  await expect(summary).toContainText("12 directed roads · 1 roundabouts");
  await expect(summary).toContainText("fresh run from time zero");
  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/jobs"))
      submissions++;
  });
  await page
    .getByLabel("Email", { exact: true })
    .fill(`map-server-${crypto.randomUUID()}@flux.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-test-passphrase!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Run current on server", exact: true }),
  ).toBeInViewport();
  expect(await (await page.request.get("/api/jobs")).json()).toEqual([]);
  expect(submissions).toBe(0);
  await page
    .getByRole("button", { name: "Run current on server", exact: true })
    .click();
  await expect(page.getByLabel("Server simulation result")).toContainText(
    "completed · 100%",
    { timeout: 20000 },
  );
  const jobs = await (await page.request.get("/api/jobs")).json();
  const job = await (await page.request.get(`/api/jobs/${jobs[0].id}`)).json();
  expect(job.input.scenario).toEqual(imported.scenario);
  expect(job.input.provenance).toEqual([imported.provenance]);
  expect(job.results[0].metrics.generated).toBeGreaterThan(0);
  expect(submissions).toBe(1);
  await page
    .getByRole("button", { name: "Close data workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run on server", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Run current on server", exact: true }),
  ).toBeInViewport();
  expect(submissions).toBe(1);
  await page.screenshot({ path: "docs/screenshots/map-server-run.png" });
});
test("drawing stays inside the map and preserves Leaflet layout classes across toggles and sizes", async ({
  page,
}) => {
  for (const width of [1280, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await openMap(page);
    const map = page.getByRole("region", {
      name: "OpenStreetMap: pan, zoom and select a road area",
      exact: true,
    });
    await expect(map).toHaveClass(/leaflet-container/);
    for (let i = 0; i < 2; i++) {
      await page
        .getByRole("button", { name: "Draw selection", exact: true })
        .click();
      await expect(map).toHaveClass(/leaflet-container/);
      for (const name of ["Close map", "Cancel drawing"])
        expect(
          await page
            .getByRole("button", { name, exact: true })
            .evaluate((el) => {
              const r = el.getBoundingClientRect(),
                top = document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                );
              return top === el || (top !== null && el.contains(top));
            }),
        ).toBe(true);
      expect(await map.evaluate((el) => getComputedStyle(el).overflow)).toBe(
        "hidden",
      );
      await page
        .getByRole("button", { name: "Cancel drawing", exact: true })
        .click();
      await expect(map).toHaveClass(/leaflet-container/);
    }
    await page
      .getByRole("button", { name: "Draw selection", exact: true })
      .click();
    const box = (await map.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.25);
    await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.75);
    await expect(
      page.getByRole("button", { name: "Draw selection", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(map).toHaveClass(/leaflet-container/);
    await page.getByRole("button", { name: "Close map", exact: true }).click();
  }
});
test("press-and-drag selects a rectangle without panning; normal panning returns after selection", async ({
  page,
}) => {
  await openMap(page);
  const map = page.getByRole("region", {
      name: "OpenStreetMap: pan, zoom and select a road area",
      exact: true,
    }),
    pane = map.locator(".leaflet-map-pane");
  await page
    .getByRole("button", { name: "Draw selection", exact: true })
    .click();
  const box = (await map.boundingBox())!,
    before = await pane.getAttribute("style");
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.75, {
    steps: 8,
  });
  expect(await pane.getAttribute("style")).toBe(before);
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Draw selection", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "Selection ready",
  );
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, {
    steps: 5,
  });
  await page.mouse.up();
  expect(await pane.getAttribute("style")).not.toBe(before);
});
test("touch dragging draws inside the map and Escape cancels drawing before closing the workspace", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await openMap(page);
    const map = page.getByRole("region", {
      name: "OpenStreetMap: pan, zoom and select a road area",
      exact: true,
    });
    await page
      .getByRole("button", { name: "Draw selection", exact: true })
      .click();
    const box = (await map.boundingBox())!,
      pane = map.locator(".leaflet-map-pane"),
      before = await pane.getAttribute("style"),
      session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + 60, y: box.y + 40 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: box.x + 160, y: box.y + 100 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: box.x + 240, y: box.y + 150 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      page.getByRole("button", { name: "Draw selection", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(await pane.getAttribute("style")).toBe(before);
    await page
      .getByRole("button", { name: "Draw selection", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Draw selection", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
