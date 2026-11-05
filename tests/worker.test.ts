import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerRuntime } from '../src/worker/runtime';
import type { WorkerResponse } from '../src/worker/protocol';
import { freeRoad, intersection, flyover } from '../src/scenarios/presets';

afterEach(() => vi.useRealTimers());
describe('worker protocol', () => {
  it('round-trips ping and transfers typed arrays independently of engine storage', () => {
    const send = vi.fn(), runtime = new WorkerRuntime(send);
    runtime.handle({ type: 'ping', requestId: 'hello' }); expect(send.mock.calls[0][0]).toEqual({ type: 'pong', requestId: 'hello' });
    runtime.handle({ type: 'load', scenario: freeRoad() });
    const [message, transfers] = send.mock.calls.at(-1)!;
    expect(message.type).toBe('frame'); expect(message.states).toBeInstanceOf(Float32Array); expect(transfers).toEqual([message.states.buffer]);
    const transferred = structuredClone(message, { transfer: transfers }); expect(message.states.byteLength).toBe(0); expect(transferred.metrics.time).toBe(0);
    runtime.handle({ type: 'step', count: 600 }); expect(send.mock.calls.at(-1)![0].metrics.time).toBe(20); runtime.dispose();
  });
  it('play, pause and finish obey the fixed timestep', () => {
    vi.useFakeTimers(); const send = vi.fn(), runtime = new WorkerRuntime(send), s = freeRoad(); s.duration = 10;
    runtime.handle({ type: 'load', scenario: s }); runtime.handle({ type: 'play', speed: 2 });
    vi.advanceTimersByTime(1000); expect(send.mock.calls.at(-1)![0].metrics.time).toBeGreaterThan(1.9);
    runtime.handle({ type: 'pause' }); const count = send.mock.calls.length; vi.advanceTimersByTime(1000); expect(send.mock.calls.length).toBe(count);
    runtime.handle({ type: 'play', speed: 8 }); vi.advanceTimersByTime(2000); expect(send.mock.calls.at(-1)![0].done).toBe(true); runtime.dispose();
  });
  it('reports invalid requests without crashing', () => {
    const send = vi.fn(), runtime = new WorkerRuntime(send); runtime.handle({ type: 'step', count: 1 }); expect(send.mock.calls.at(-1)![0].type).toBe('error');
    runtime.handle({ type: 'load', scenario: freeRoad() }); runtime.handle({ type: 'step', count: -1 }); expect(send.mock.calls.at(-1)![0].type).toBe('error'); runtime.dispose();
  });
  it('runs a paired experiment and yields while working', () => {
    vi.useFakeTimers(); const messages: WorkerResponse[] = [], runtime = new WorkerRuntime(m => messages.push(m));
    const a = intersection(), b = flyover(); a.duration = 10; b.duration = 10;
    runtime.handle({ type: 'compare', baseline: a, modified: b }); vi.runAllTimers();
    const result = messages.at(-1)!; expect(result.type).toBe('comparison');
    if (result.type === 'comparison') expect(result.results[0].metrics.generated).toBe(result.results[1].metrics.generated);
    runtime.dispose();
  });
});
