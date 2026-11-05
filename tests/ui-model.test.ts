import { describe, expect, it } from "vitest";
import {
  addNode,
  addRoad,
  deleteSelection,
  nextId,
  updateNode,
} from "../src/ui/editor";
import { project, unproject, segmentDistance } from "../src/ui/camera";
import { readSaved, saveScenario, STORAGE_KEY } from "../src/ui/storage";
import { flyover, freeRoad, rampScenario } from "../src/scenarios/presets";
import { parseScenario } from "../src/model/schema";

describe("positive, negative and boundary editor operations", () => {
  it("creates unique nodes and roads without changing the source scenario", () => {
    const original = freeRoad(),
      withNode = addNode(original, 200, 100),
      withRoad = addRoad(withNode, "source", "node-1", 2);
    expect(original.nodes).toHaveLength(2);
    expect(withRoad.nodes).toHaveLength(3);
    expect(withRoad.edges.at(-1)?.lanes).toBe(2);
    expect(nextId("node", ["node-1", "node-3"])).toBe("node-2");
  });
  it("creates a ramp only when endpoint layers differ, without auto intersections", () => {
    const s = flyover(),
      next = addRoad(s, "west", "south");
    expect(next.edges.at(-1)?.ramp).toBe(true);
    expect(next.nodes).toHaveLength(s.nodes.length);
  });
  it("updates connected layer semantics when a node elevation changes", () => {
    const s = freeRoad(),
      next = updateNode(s, { ...s.nodes[0], layer: 1 });
    expect(next.edges[0].ramp).toBe(true);
    expect(next.edges[0].layer).toBe(1);
    expect(() => parseScenario(next)).not.toThrow();
  });
  it("deletes a node together with incident roads and demand, keeping a valid graph", () => {
    const s = freeRoad(),
      next = deleteSelection(s, { kind: "node", id: "source" });
    expect(next.edges).toHaveLength(0);
    expect(next.demand).toHaveLength(0);
    expect(next.nodes).toHaveLength(1);
  });
  it("deletes only the selected road and preserves disconnected demand for rejection accounting", () => {
    const next = deleteSelection(freeRoad(), { kind: "edge", id: "road" });
    expect(next.edges).toHaveLength(0);
    expect(next.demand).toHaveLength(1);
  });
  it.each([
    ["missing", "sink"],
    ["source", "source"],
  ])("rejects malformed connection %s → %s", (from, to) => {
    expect(() => addRoad(freeRoad(), from, to)).toThrow();
  });
  it.each([0, 7, -1, 1.5])("rejects invalid lane count %s", (n) => {
    expect(() => addRoad(rampScenario(), "source", "low", n)).toThrow();
  });
  it.each([-10001, 10001, NaN, Infinity])(
    "rejects invalid node coordinate %s",
    (x) => {
      expect(() => addNode(freeRoad(), x, 10)).toThrow();
    },
  );
});
describe("camera geometry", () => {
  it.each(["iso", "plan"] as const)(
    "round-trips %s including negative coordinates and elevations",
    (view) => {
      for (const [x, y, layer] of [
        [0, 0, 0],
        [-10000, 10000, 5],
        [21, -85, 1],
      ]) {
        const p = project(x, y, layer, view),
          q = unproject(...p, layer, view);
        expect(q[0]).toBeCloseTo(x, 8);
        expect(q[1]).toBeCloseTo(y, 8);
      }
    },
  );
  it("hit testing clamps to endpoints and handles zero-length screen segments", () => {
    expect(segmentDistance(5, 5, 0, 0, 10, 0)).toBe(5);
    expect(segmentDistance(20, 0, 0, 0, 10, 0)).toBe(10);
    expect(segmentDistance(3, 4, 0, 0, 0, 0)).toBe(5);
  });
});
describe("validated local persistence", () => {
  const storage = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
  };
  it("saves/loads scenarios with unique identifiers and a bounded library", () => {
    const store = storage();
    let saved = saveScenario(store, [], freeRoad());
    for (let i = 0; i < 15; i++) saved = saveScenario(store, saved, flyover());
    expect(saved).toHaveLength(12);
    expect(new Set(saved.map((s) => s.id)).size).toBe(12);
    expect(readSaved(store)).toEqual(saved);
  });
  it.each(["{", "null", "{}", "[{}]", " ".repeat(4_000_001)])(
    "rejects corrupt or excessive persisted data",
    (raw) => {
      const store = storage();
      store.setItem(STORAGE_KEY, raw);
      expect(() => readSaved(store)).toThrow();
    },
  );
  it("surfaces storage quota/security errors without mutating the caller library", () => {
    const previous: ReturnType<typeof readSaved> = [];
    expect(() =>
      saveScenario(
        {
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
        },
        previous,
        freeRoad(),
      ),
    ).toThrow("Quota");
    expect(previous).toHaveLength(0);
  });
  it("revalidates persisted scenarios rather than trusting stored structure", () => {
    const store = storage(),
      s = freeRoad();
    s.edges[0].lanes = -1;
    store.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "saved-1", scenario: s }]),
    );
    expect(() => readSaved(store)).toThrow();
  });
});
