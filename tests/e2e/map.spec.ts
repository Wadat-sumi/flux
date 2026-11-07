import { expect, test, type Page } from "@playwright/test";
import { importOsm } from "../../server/imports";
import { mapBounds, mapFixture, mapMetadata } from "../map-fixtures";

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
