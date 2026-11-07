import { useState } from "react";
import { parseScenario, type Scenario } from "../model/schema";
import {
  defaultVehicleProfiles,
  bodyShapes,
  bodyShapeLabels,
  defaultBodyShapes,
  profileMatchesReference,
  fleetSummary,
  vehicleLabels,
  vehicleColors,
  vehicleTypeIds,
  suggestedVehicleShares,
  type VehicleProfile,
  type VehicleTypeId,
} from "../model/vehicles";
import references from "../data/vehicle-references.json" with { type: "json" };
import { VehicleSpritePreview } from "./VehicleSpritePreview";

const fields: {
  key: Exclude<
    keyof VehicleProfile,
    "id" | "share" | "bodyShape" | "referenceRevision"
  >;
  label: string;
  min: number;
  max: number;
  step: number;
  factor?: number;
}[] = [
  { key: "length", label: "length (m)", min: 1, max: 18, step: 0.001 },
  { key: "width", label: "width (m)", min: 0.5, max: 3, step: 0.001 },
  {
    key: "maxSpeed",
    label: "maximum speed (km/h)",
    min: 7.2,
    max: 252,
    step: 0.1,
    factor: 3.6,
  },
  {
    key: "acceleration",
    label: "desired acceleration (m/s²)",
    min: 0.2,
    max: 5,
    step: 0.001,
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
  const [mixVersion, setMixVersion] = useState(0);
  const [draft, setDraft] = useState(() =>
    defaultVehicleProfiles.map((p) => {
      const saved = scenario.fleet?.find((f) => f.id === p.id);
      return saved
        ? { ...saved, bodyShape: saved.bodyShape ?? defaultBodyShapes[p.id] }
        : { ...p, share: scenario.fleet ? 0 : p.share };
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
              <label key={`${p.id}-${mixVersion}`}>
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
        <button
          className="text-button full"
          type="button"
          onClick={() => {
            setMode("mixed");
            setDraft((old) =>
              old.map((p) => ({ ...p, share: suggestedVehicleShares[p.id] })),
            );
            setMixVersion((v) => v + 1);
          }}
        >
          Use suggested urban mix
        </button>
        <p className="hint">
          Suggested mix: 50% two-wheelers, 30% cars, 12% autos, 4% light
          commercial, 2% buses, 2% trucks. Educated assumption; replace with
          corridor observations when available.
        </p>
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
        <section
          className="vehicle-reference"
          aria-label="Vehicle reference data"
        >
          <strong>Reference: {references.profiles[editing].name}</strong>
          <p className="hint">
            {profileMatchesReference(profile)
              ? "Matches reference defaults. Dynamics remain uncalibrated."
              : "Custom or earlier values. Reset this type to use the reference defaults."}
          </p>
          <details>
            <summary>Sources & parameter notes</summary>
            <p className="hint">
              {references.profiles[editing].market}.{" "}
              {references.profiles[editing].sourceLocation}
            </p>
            <p className="hint">
              Acceleration — {references.profiles[editing].accelerationKind}:{" "}
              {references.profiles[editing].accelerationNote}
            </p>
            <p className="hint">
              Braking, gap and headway are uncalibrated model settings. Maximum
              speed is a technical capability, not a legal limit; the road speed
              also caps motion. 3D bodies and visual heights are schematic, not
              manufacturer CAD.
            </p>
            <ul>
              {[
                ...new Set([
                  ...references.profiles[editing].geometrySources,
                  ...references.profiles[editing].speedSources,
                  ...references.profiles[editing].accelerationSources,
                  "idm",
                ]),
              ].map((id) => {
                const source =
                  references.sources[id as keyof typeof references.sources];
                return (
                  <li key={id}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </details>
        </section>
        <label>
          Body shape
          <select
            aria-label="Body shape"
            value={profile.bodyShape ?? defaultBodyShapes[editing]}
            onChange={(e) =>
              update({
                bodyShape: e.target.value as VehicleProfile["bodyShape"],
              })
            }
          >
            {bodyShapes.map((shape) => (
              <option key={shape} value={shape}>
                {bodyShapeLabels[shape]}
              </option>
            ))}
          </select>
        </label>
        <VehicleSpritePreview profile={profile} />
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
                  (profile[f.key] * (f.factor ?? 1)).toFixed(3),
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
          Defaults use named vehicle references and model proxies, not measured
          city averages. Length affects storage; width controls lane fit. Trips
          without a route large enough for the vehicle are rejected.
          Two-wheelers follow lanes; lane filtering and bus stops are not
          modelled.
        </p>
        <button className="secondary full" disabled={invalidMix}>
          Apply vehicle settings
        </button>
        <p className="hint">Applying resets the simulation.</p>
      </form>
    </details>
  );
}
