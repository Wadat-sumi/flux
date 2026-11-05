import { expect, test } from "@playwright/test";
import { freeRoad } from "../../src/scenarios/presets";
import { mkdirSync, writeFileSync } from "node:fs";

test("500+ live agents keep canvas rendering smooth and simulation near 30 Hz", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  const s = freeRoad();
  s.duration = 600;
  s.edges[0].lanes = 6;
  s.edges[0].width = 21;
  s.demand[0].rate = 7200;
  await page
    .getByLabel("Import scenario file", { exact: true })
    .setInputFiles({
      name: "load-test.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(s)),
    });
  await page.getByText("Demand & simulation settings", { exact: true }).click();
  const canvas = page.locator("canvas");
  for (let i = 0; i < 15; i++) {
    await page
      .getByRole("button", { name: "Advance 20 seconds", exact: true })
      .click();
    await expect(canvas).toHaveAttribute("data-time", String((i + 1) * 20));
  }
  const agents = Number(await canvas.getAttribute("data-agents"));
  expect(agents).toBeGreaterThanOrEqual(500);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  const measurement = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas")!,
      start = performance.now(),
      timeStart = Number(canvas.dataset.time);
    const intervals: number[] = [];
    let previous = start;
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        intervals.push(now - previous);
        previous = now;
        if (now - start >= 4000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start,
      timeEnd = Number(canvas.dataset.time);
    intervals.sort((a, b) => a - b);
    return {
      elapsedMs: elapsed,
      rafFps: (intervals.length * 1000) / elapsed,
      canvasFps: Number(canvas.dataset.fps),
      p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
      simulationTicksPerSecond: ((timeEnd - timeStart) * 30 * 1000) / elapsed,
      agentsAtEnd: Number(canvas.dataset.agents),
    };
  });
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  const report = {
    recordedAt: new Date().toISOString(),
    browser: "Playwright Chromium",
    viewport: { width: 1280, height: 900 },
    agentsAtStart: agents,
    ...measurement,
    note: "Real built app, main-thread canvas, module worker, live metrics; local production QA host, not deployed Azure.",
  };
  mkdirSync("docs/benchmarks", { recursive: true });
  writeFileSync(
    "docs/benchmarks/browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  expect(measurement.rafFps).toBeGreaterThanOrEqual(50);
  expect(measurement.canvasFps).toBeGreaterThanOrEqual(50);
  expect(measurement.simulationTicksPerSecond).toBeGreaterThanOrEqual(29.5);
  expect(measurement.agentsAtEnd).toBeGreaterThanOrEqual(500);
});
