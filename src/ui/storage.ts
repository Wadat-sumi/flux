import { importScenario, exportScenario, type Scenario } from "../model/schema";
import { nextId } from "./editor";

export const STORAGE_KEY = "flux.scenarios.v1";
export interface SavedScenario {
  id: string;
  scenario: Scenario;
}
export function readSaved(storage: Pick<Storage, "getItem">): SavedScenario[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  if (raw.length > 4_000_000)
    throw new Error(
      "Saved scenario library is too large. Clear local saves to recover.",
    );
  const input: unknown = JSON.parse(raw);
  if (!Array.isArray(input) || input.length > 12)
    throw new Error("Saved scenario library is invalid.");
  return input.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      item.id.length > 80
    )
      throw new Error("Invalid saved scenario.");
    return {
      id: item.id,
      scenario: importScenario(JSON.stringify(item.scenario)),
    };
  });
}
export function saveScenario(
  storage: Pick<Storage, "setItem">,
  saved: SavedScenario[],
  scenario: Scenario,
): SavedScenario[] {
  const clean = importScenario(exportScenario(scenario));
  const next = [
    {
      id: nextId(
        "saved",
        saved.map((s) => s.id),
      ),
      scenario: clean,
    },
    ...saved,
  ].slice(0, 12);
  const raw = JSON.stringify(next);
  if (new TextEncoder().encode(raw).byteLength > 4_000_000)
    throw new Error(
      "Local library exceeds 4 MB. Export a scenario or remove older saves.",
    );
  storage.setItem(STORAGE_KEY, raw);
  return next;
}
