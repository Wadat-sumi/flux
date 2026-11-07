import { expect, test } from "@playwright/test";
import { freeRoad, intersection } from "../../src/scenarios/presets";
import { mkdirSync, writeFileSync } from "node:fs";
import { mixedFleet } from "../vehicle-fixture";

for (const topology of ["corridor", "signal", "curved", "mixed"] as const)
  test(`500+ live agents keep ${topology} rendering smooth and simulation near 30 Hz`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto("/");
    const s = topology === "signal" ? intersection() : freeRoad();
    s.duration = 600;
    if (topology !== "signal") {
      s.edges[0].lanes = 6;
      s.edges[0].width = 21;
      if (topology === "curved" || topology === "mixed")
        s.edges[0].shape = Array.from({ length: 64 }, (_, i) => ({
          x: ((i + 1) * 5000) / 65,
          y: 200 * Math.sin(((i + 1) * Math.PI * 2) / 65),
        }));
    } else {
      s.nodes = s.nodes.map((n) => ({ ...n, x: n.x * 4, y: n.y * 4 }));
      s.edges = s.edges.map((e) => ({
        ...e,
        length: 1200,
        lanes: 3,
        width: 10.5,
      }));
    }
    s.demand = s.demand.map((d) => ({ ...d, rate: 7200 }));
    if (topology === "mixed") s.fleet = mixedFleet();
    await page
      .getByLabel("Import scenario file", { exact: true })
      .setInputFiles({
        name: "load-test.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(s)),
      });
    await page
      .getByText("Demand & simulation settings", { exact: true })
      .click();
    const canvas = page.locator("canvas");
    // The signal network feeds vehicles from rest; warm until 500+ are on roads,
    // keeping external spawn queues out of the population measurement.
    const warmup = topology === "signal" ? 20 : 15;
    for (let i = 0; i < warmup; i++) {
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
      topology,
      viewport: { width: 1280, height: 900 },
      agentsAtStart: agents,
      ...measurement,
      note: "Real built app, main-thread canvas, module worker, live metrics; local production QA host, not deployed Azure.",
    };
    mkdirSync("docs/benchmarks", { recursive: true });
    writeFileSync(
      topology === "corridor"
        ? "docs/benchmarks/browser.json"
        : topology === "signal"
          ? "docs/benchmarks/browser-signal.json"
          : topology === "mixed"
            ? "docs/benchmarks/browser-mixed.json"
            : "docs/benchmarks/browser-curved.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    expect(measurement.rafFps).toBeGreaterThanOrEqual(50);
    expect(measurement.canvasFps).toBeGreaterThanOrEqual(50);
    expect(measurement.simulationTicksPerSecond).toBeGreaterThanOrEqual(29.5);
    expect(measurement.agentsAtEnd).toBeGreaterThanOrEqual(500);
  });
