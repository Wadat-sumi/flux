import { useState } from "react";
import { parseScenario, type Scenario } from "../model/schema";
import {
  defaultVehicleProfiles,
  fleetSummary,
  vehicleLabels,
  vehicleColors,
  vehicleTypeIds,
  type VehicleProfile,
  type VehicleTypeId,
} from "../model/vehicles";

const fields: {
  key: Exclude<keyof VehicleProfile, "id" | "share">;
  label: string;
  min: number;
  max: number;
  step: number;
  factor?: number;
}[] = [
  { key: "length", label: "length (m)", min: 1, max: 18, step: 0.1 },
  { key: "width", label: "width (m)", min: 0.5, max: 3, step: 0.1 },
  {
    key: "maxSpeed",
    label: "maximum speed (km/h)",
    min: 7.2,
    max: 162,
    step: 0.1,
    factor: 3.6,
  },
  {
    key: "acceleration",
    label: "acceleration (m/s²)",
    min: 0.2,
    max: 5,
    step: 0.1,
  },
  {
    key: "deceleration",
    label: "comfortable braking (m/s²)",
    min: 0.5,
    max: 6,
    step: 0.1,
  },
  {
    key: "emergencyDeceleration",
    label: "emergency braking (m/s²)",
    min: 2,
    max: 12,
    step: 0.1,
  },
  { key: "minGap", label: "minimum gap (m)", min: 0.5, max: 5, step: 0.1 },
  {
    key: "headway",
    label: "following headway (s)",
    min: 0.3,
    max: 3,
    step: 0.1,
  },
];
export function VehiclePanel({
  scenario,
  onApply,
  onError,
}: {
  scenario: Scenario;
  onApply(s: Scenario): void;
  onError(e: unknown): void;
}) {
  const active = scenario.fleet?.filter((p) => p.share > 0);
  const [mode, setMode] = useState<VehicleTypeId | "mixed">(
    (active?.length ?? 0) > 1 ? "mixed" : (active?.[0]?.id ?? "car"),
  );
  const [editing, setEditing] = useState<VehicleTypeId>(
    active?.[0]?.id ?? "car",
  );
  const [resetVersion, setResetVersion] = useState(0);
  const [draft, setDraft] = useState(() =>
    defaultVehicleProfiles.map((p) => {
      const saved = scenario.fleet?.find((f) => f.id === p.id);
      return {
        ...p,
        ...saved,
        share: scenario.fleet ? (saved?.share ?? 0) : p.share,
      };
    }),
  );
  const profile = draft.find((p) => p.id === editing)!,
    total = draft.reduce((sum, p) => sum + p.share, 0),
    invalidMix = mode === "mixed" && Math.abs(total - 100) > 0.000001;
  const update = (patch: Partial<VehicleProfile>) =>
    setDraft((old) =>
      old.map((p) => (p.id === editing ? { ...p, ...patch } : p)),
    );
  return (
    <details className="settings vehicle-settings">
      <summary>Vehicle types & attributes</summary>
      <p className="hint">Applied: {fleetSummary(scenario.fleet)}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onApply(
              parseScenario({
                ...scenario,
                fleet: draft.map((p) => ({
                  ...p,
                  share: mode === "mixed" ? p.share : p.id === mode ? 100 : 0,
                })),
              }),
            );
          } catch (error) {
            onError(error);
          }
        }}
      >
        <label>
          Vehicle selection
          <select
            aria-label="Vehicle selection"
            value={mode}
            onChange={(e) => {
              const value = e.target.value as VehicleTypeId | "mixed";
              setMode(value);
              if (value !== "mixed") {
                setEditing(value);
                setDraft((old) =>
                  old.map((p) => ({ ...p, share: p.id === value ? 100 : 0 })),
                );
              }
            }}
          >
            {vehicleTypeIds.map((id) => (
              <option value={id} key={id}>
                {vehicleLabels[id]} only
              </option>
            ))}
            <option value="mixed">Mixed traffic</option>
          </select>
        </label>
        {mode === "mixed" && (
          <fieldset className="vehicle-mix">
            <legend>Traffic mix (%)</legend>
            {draft.map((p, i) => (
              <label key={p.id}>
                <span>
                  <i
                    className="vehicle-swatch"
                    style={{ background: vehicleColors[i] }}
                  />
                  {vehicleLabels[p.id]}
                </span>
                <input
                  aria-label={`${vehicleLabels[p.id]} share (%)`}
                  type="number"
                  min="0"
                  max="100"
                  step=".1"
                  required
                  defaultValue={p.share}
                  onChange={(e) =>
                    setDraft((old) =>
                      old.map((f) =>
                        f.id === p.id
                          ? { ...f, share: Number(e.target.value) }
                          : f,
                      ),
                    )
                  }
                />
              </label>
            ))}
            <p className="hint" role={invalidMix ? "alert" : undefined}>
              Total: {Number(total.toFixed(4))}% · must equal 100%. Shares are
              sampling probabilities; a short run may differ.
            </p>
          </fieldset>
        )}
        <label>
          Edit vehicle attributes
          <select
            aria-label="Edit vehicle attributes"
            value={editing}
            onChange={(e) => setEditing(e.target.value as VehicleTypeId)}
          >
            {vehicleTypeIds.map((id) => (
              <option key={id} value={id}>
                {vehicleLabels[id]}
              </option>
            ))}
          </select>
        </label>
        <div className="vehicle-fields">
          {fields.map((f) => (
            <label key={`${editing}-${f.key}-${resetVersion}`}>
              {f.label}
              <input
                aria-label={`${vehicleLabels[editing]} ${f.label}`}
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                required
                defaultValue={Number(
                  (profile[f.key] * (f.factor ?? 1)).toFixed(1),
                )}
                onChange={(e) =>
                  update({ [f.key]: Number(e.target.value) / (f.factor ?? 1) })
                }
              />
            </label>
          ))}
        </div>
        <button
          className="text-button full"
          type="button"
          onClick={() => {
            update({
              ...defaultVehicleProfiles.find((p) => p.id === editing)!,
              share: profile.share,
            });
            setResetVersion((v) => v + 1);
          }}
        >
          Reset selected type defaults
        </button>
        <p className="hint">
          Defaults are illustrative, not calibrated city observations. Length
          affects storage; width controls lane fit. Speed is capped by the road
          and vehicle limits. Following and braking settings affect motion.
          Vehicles need a route with enough lane width and segment storage;
          otherwise the trip is rejected. Two-wheelers still follow lanes;
          filtering, overtaking within a lane and bus stops are not modelled.
        </p>
        <button className="secondary full" disabled={invalidMix}>
          Apply vehicle settings
        </button>
        <p className="hint">Applying resets the simulation.</p>
      </form>
    </details>
  );
}
