import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ZodError } from "zod";
import {
  parseScenario,
  importScenario,
  exportScenario,
  type Scenario,
} from "../model/schema";
import {
  flyover as legacyFlyover,
  intersection as legacyIntersection,
  bottleneck as legacyBottleneck,
  rampScenario as legacyRampScenario,
} from "../scenarios/presets";
import type { WorkerRequest, WorkerResponse } from "../worker/protocol";
import type { ExperimentResult } from "../engine/experiment";
import type { Metrics, Sample } from "../engine/statistics";
import { pairedScenarios } from "../engine/experiment";
import { NetworkCanvas, type Frame } from "./NetworkCanvas";
import { Chart } from "./Chart";
import { EditorPanel } from "./EditorPanel";
import { addNode, updateNode, type Selection } from "./editor";
import {
  readSaved,
  saveScenario,
  STORAGE_KEY,
  type SavedScenario,
} from "./storage";
import type { View } from "./camera";
import { completedAverage, experimentForExport } from "./observations";
import { ServerPanel } from "./ServerPanel";
import { VehiclePanel } from "./VehiclePanel";
import { VehicleBreakdown } from "./VehicleBreakdown";
import {
  vehicleColors,
  vehicleLabels,
  vehicleTypeIds,
  fleetSummary,
  defaultVehicleProfiles,
} from "../model/vehicles";
import type { Provenance } from "../model/backend";
const MapPanel = lazy(() =>
  import("./MapPanel").then((m) => ({ default: m.MapPanel })),
);

type Mode = "simulate" | "network" | "experiments";
// New presets use current references; loading old JSON/saves preserves their parameters.
const withReferenceFleet = (scenario: Scenario): Scenario => ({
  ...scenario,
  fleet: defaultVehicleProfiles.map((p) => ({ ...p })),
});
const flyover = () => withReferenceFleet(legacyFlyover());
const intersection = () => withReferenceFleet(legacyIntersection());
const bottleneck = (lanes = 1) => withReferenceFleet(legacyBottleneck(lanes));
const rampScenario = () => withReferenceFleet(legacyRampScenario());
const presetOptions = [
  { id: "flyover", name: "Flyover crossing", create: flyover },
  { id: "intersection", name: "Urban intersection", create: intersection },
  { id: "bottleneck", name: "Capacity bottleneck", create: bottleneck },
  { id: "ramp", name: "Ramp connection", create: rampScenario },
];
const empty: Metrics = {
  time: 0,
  generated: 0,
  active: 0,
  moving: 0,
  pending: 0,
  completed: 0,
  rejected: 0,
  meanSpeed: 0,
  meanTravelTime: 0,
  meanWaitingTime: 0,
  meanDelay: 0,
  throughput: 0,
  queue: 0,
  edges: [],
};
const fmt = (n: number, digits = 0) =>
  n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
function download(value: string, name: string) {
  const url = URL.createObjectURL(
      new Blob([value], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    play: "M8 4l12 8-12 8V4",
    pause: "M8 5v14M16 5v14",
    reset: "M4 10a8 8 0 1 1 1 8M4 4v6h6",
    step: "M6 5l10 7-10 7V5M20 5v14",
    export: "M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6",
    import: "M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4",
    fit: "M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5",
    save: "M5 3h13l3 3v15H3V3h2m2 0v7h10V3M7 21v-7h10v7",
    help: "M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 3v1",
    close: "M6 6l12 12M18 6 6 18",
    layers: "m12 3 10 5-10 5L2 8l10-5M2 12l10 5 10-5M2 16l10 5 10-5",
    chevron: "m9 5 7 7-7 7",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === "play" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.help} />
    </svg>
  );
}

export function App() {
  const [showServer, setShowServer] = useState(false),
    [serverFocus, setServerFocus] = useState<"library" | "run">("library"),
    [showMap, setShowMap] = useState(false),
    [provenance, setProvenance] = useState<Provenance[]>([]);
  const [scenario, setScenario] = useState<Scenario>(flyover),
    [preset, setPreset] = useState("flyover"),
    [mode, setMode] = useState<Mode>("simulate");
  const [frame, setFrame] = useState<Frame | null>(null),
    [history, setHistory] = useState<Sample[]>([]),
    [warnings, setWarnings] = useState(0),
    [workerReady, setWorkerReady] = useState(false);
  const [view, setView] = useState<View>("iso"),
    [overlay, setOverlay] = useState(false),
    [decor, setDecor] = useState(true),
    [labels, setLabels] = useState(true),
    [layers, setLayers] = useState([0, 1, 2, 3, 4, 5]);
  const [selection, setSelection] = useState<Selection>(null),
    [tool, setTool] = useState<"select" | "node">("select"),
    [editLayer, setEditLayer] = useState(0),
    [undo, setUndo] = useState<Scenario[]>([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saved, setSaved] = useState<SavedScenario[]>([]),
    [speed, setSpeed] = useState(1);
  const [fitVersion, setFitVersion] = useState(0),
    [zoomAction, setZoomAction] = useState(0),
    [showDetails, setShowDetails] = useState(false),
    [showAbout, setShowAbout] = useState(false),
    [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 850);
  const [baseline, setBaseline] = useState<Scenario>(intersection),
    [results, setResults] = useState<
      [ExperimentResult, ExperimentResult] | null
    >(null),
    [comparing, setComparing] = useState(false);
  const worker = useRef<Worker | null>(null),
    importRef = useRef<HTMLInputElement>(null),
    aboutRef = useRef<HTMLDialogElement>(null);
  const metrics = frame?.metrics ?? empty,
    playing = frame?.playing ?? false;
  const fail = (e: unknown) => {
    setError(
      e instanceof ZodError
        ? e.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
        : e instanceof Error
          ? e.message.slice(0, 400)
          : "That action could not be completed.",
    );
    setNotice("");
  };
  const send = (request: WorkerRequest) => worker.current?.postMessage(request);
  useEffect(() => {
    let w: Worker;
    try {
      w = new Worker(
        new URL("../worker/simulation.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      w.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        if (message.type === "pong") setWorkerReady(true);
        if (message.type === "frame") {
          setFrame({
            states: message.states,
            metrics: message.metrics,
            received: performance.now(),
            playing: message.playing,
          });
          setHistory(message.history);
          setWarnings(message.warnings);
        }
        if (message.type === "comparison") {
          setResults(message.results);
          setComparing(false);
          setNotice(
            "Paired experiment complete. Both networks received identical scheduled demand.",
          );
        }
        if (message.type === "error") {
          fail(new Error(message.message));
          setComparing(false);
          setFrame((old) => (old ? { ...old, playing: false } : null));
        }
      };
      w.onerror = () => {
        setError(
          "The simulation could not start. Reload the page or use a browser with module worker support.",
        );
        setWorkerReady(false);
        setComparing(false);
      };
      w.postMessage({ type: "ping", requestId: "flux-ready" });
    } catch (e) {
      fail(e);
    }
    return () => {
      w?.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    send({ type: "load", scenario });
    setFrame(null);
    setHistory([]);
    setWarnings(0);
    setComparing(false);
    setResults(null);
  }, [scenario]);
  useEffect(() => {
    try {
      setSaved(readSaved(localStorage));
    } catch (e) {
      fail(e);
    }
  }, []);
  useEffect(() => {
    if (showAbout) aboutRef.current?.showModal();
    else aboutRef.current?.close();
  }, [showAbout]);
  const apply = (s: Scenario, record = true) => {
    try {
      const clean = parseScenario(s);
      if (record) setUndo((old) => [...old.slice(-19), scenario]);
      setScenario(clean);
      setProvenance((old) =>
        old.map((p) => ({
          ...p,
          warnings: [
            ...new Set([
              ...p.warnings,
              "Scenario edited after import; current parameters may differ from the source observations.",
            ]),
          ].slice(0, 100),
        })),
      );
      setPreset("custom");
      setError("");
      setNotice("Network updated. The simulation has reset.");
    } catch (e) {
      fail(e);
    }
  };
  const load = (s: Scenario, id = "custom", lineage: Provenance[] = []) => {
    setUndo([]);
    setSelection(null);
    setScenario(parseScenario(s));
    setProvenance(lineage);
    setPreset(id);
    setError("");
    setNotice("Scenario loaded. Ready to run.");
    setFitVersion((v) => v + 1);
  };
  const changeMode = (next: Mode) => {
    send({ type: "pause" });
    setComparing(false);
    setMode(next);
    setSelection(null);
    setTool("select");
    if (next === "network") {
      setView("plan");
      setPanelOpen(true);
    }
    if (next === "simulate") setView("iso");
  };
  const run = () => {
    if (metrics.time >= scenario.duration) {
      send({ type: "load", scenario });
    }
    send({ type: playing ? "pause" : "play", speed });
    setError("");
  };
  const reset = () => {
    send({ type: "load", scenario });
    setNotice("Simulation reset. Same seed, same arrivals.");
  };
  const doCompare = () => {
    try {
      const [a, b] = pairedScenarios(baseline, scenario);
      parseScenario(a);
      parseScenario(b);
      send({ type: "pause" });
      setResults(null);
      setComparing(true);
      setError("");
      setNotice("Running paired networks with shared demand and seed…");
      send({ type: "compare", baseline: a, modified: b });
    } catch {
      fail(
        new Error(
          "The modified network must retain every baseline source and sink ID. Choose a matching experiment pair below.",
        ),
      );
    }
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          aria-label="Flux home"
          onClick={(e) => {
            e.preventDefault();
            changeMode("simulate");
          }}
        >
          flux
          <span className="brand-dot" />
        </a>
        <span className="brand-caption">
          A LITTLE TRAFFIC. A LOT TO DISCOVER.
        </span>
        <nav className="main-nav" aria-label="Workspace">
          {(["simulate", "network", "experiments"] as const).map((m) => (
            <button
              key={m}
              aria-current={mode === m ? "page" : undefined}
              onClick={() => changeMode(m)}
            >
              {m === "simulate"
                ? "Simulate"
                : m === "network"
                  ? "Network"
                  : "Experiments"}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="secondary cloud-button"
            onClick={() => setShowMap(true)}
          >
            Map area
          </button>
          <button
            className="secondary cloud-button"
            onClick={() => {
              setServerFocus("library");
              setShowServer(true);
            }}
          >
            Data & cloud
          </button>
          <button
            className="icon-button"
            title="About the model"
            aria-label="About the model"
            onClick={() => setShowAbout(true)}
          >
            <Icon name="help" />
          </button>
          <button
            className="export-button"
            onClick={() =>
              download(exportScenario(scenario), "flux-scenario.json")
            }
          >
            <Icon name="export" />
            <span>Export JSON</span>
          </button>
        </div>
      </header>
      <main className={`workspace mode-${mode}`}>
        {mode !== "experiments" && (
          <>
            <NetworkCanvas
              scenario={scenario}
              frame={frame}
              view={view}
              overlay={overlay}
              decor={decor}
              labels={labels}
              layers={layers}
              editing={mode === "network"}
              tool={tool}
              editLayer={editLayer}
              selection={selection}
              fitVersion={fitVersion}
              zoomAction={zoomAction}
              onSelect={setSelection}
              onAddNode={(x, y) => {
                try {
                  apply(addNode(scenario, x, y, editLayer));
                  setTool("select");
                } catch (e) {
                  fail(e);
                }
              }}
              onMoveNode={(id, x, y) => {
                try {
                  const n = scenario.nodes.find((n) => n.id === id)!;
                  apply(updateNode(scenario, { ...n, x, y }));
                } catch (e) {
                  fail(e);
                }
              }}
            />
            <div className="scene-heading">
              <div className="eyebrow">
                {mode === "network"
                  ? "A CITY IS A SET OF CONNECTIONS"
                  : "THE EVERYDAY, IN MOTION"}
              </div>
              <h1>
                {mode === "network"
                  ? "Make room for possibility."
                  : "Explore the flow."}
              </h1>
              <p>
                {presetOptions.find((p) => p.id === preset)?.name ??
                  scenario.name}
                <span className="heading-dot">·</span>seed {scenario.seed}
                <span className="heading-dot">·</span>
                <span className="live-status">
                  {playing
                    ? "Running"
                    : metrics.time >= scenario.duration
                      ? "Observation complete"
                      : "Ready to explore"}
                </span>
              </p>
            </div>
            <button
              className="panel-toggle secondary"
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen(!panelOpen)}
            >
              {panelOpen ? "Hide controls" : "Show controls"}
            </button>
            {panelOpen && (
              <aside
                className="floating-panel"
                aria-label={
                  mode === "network" ? "Network editor" : "Scenario controls"
                }
              >
                {mode === "network" ? (
                  <EditorPanel
                    scenario={scenario}
                    selection={selection}
                    onSelect={setSelection}
                    onChange={apply}
                    onError={fail}
                    tool={tool}
                    setTool={setTool}
                    layer={editLayer}
                    setLayer={setEditLayer}
                    canUndo={undo.length > 0}
                    onUndo={() => {
                      const s = undo.at(-1);
                      if (s) {
                        setUndo(undo.slice(0, -1));
                        apply(s, false);
                        setSelection(null);
                      }
                    }}
                  />
                ) : (
                  <>
                    <div className="panel-title">
                      <span className="eyebrow">YOUR EXPERIMENT</span>
                      <span className="small-mark">01 / LAB</span>
                    </div>
                    <h2>A crossing, reimagined.</h2>
                    <label>
                      Scenario
                      <select
                        aria-label="Scenario"
                        value={preset}
                        onChange={(e) => {
                          const p = presetOptions.find(
                            (p) => p.id === e.target.value,
                          );
                          if (p) load(p.create(), p.id);
                          else {
                            const item = saved.find(
                              (s) => s.id === e.target.value,
                            );
                            if (item) load(item.scenario, item.id);
                          }
                        }}
                      >
                        {presetOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                        {!presetOptions.some((p) => p.id === preset) &&
                          !saved.some((s) => s.id === preset) && (
                            <option value="custom">Custom network</option>
                          )}
                        {saved.length > 0 && (
                          <optgroup label="Saved on this device">
                            {saved.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.scenario.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </label>
                    <div className="scenario-summary">
                      <div>
                        <span>Demand</span>
                        <strong>
                          {fmt(
                            scenario.demand.reduce((sum, d) => sum + d.rate, 0),
                          )}
                          <small> veh/h</small>
                        </strong>
                      </div>
                      <div>
                        <span>Observation</span>
                        <strong>
                          {scenario.duration}
                          <small> seconds</small>
                        </strong>
                      </div>
                      <div>
                        <span>Network</span>
                        <strong>
                          {scenario.edges.length}
                          <small> roads · {scenario.nodes.length} nodes</small>
                        </strong>
                      </div>
                    </div>
                    <details className="settings">
                      <summary>Demand & simulation settings</summary>
                      <form
                        key={JSON.stringify(scenario)}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const data = new FormData(e.currentTarget);
                          apply({
                            ...scenario,
                            name: String(data.get("name")),
                            duration: Number(data.get("duration")),
                            seed: Number(data.get("seed")),
                            maxVehicles: Number(data.get("max")),
                            demand: scenario.demand.map((d, i) => ({
                              ...d,
                              rate: Number(data.get(`rate-${i}`)),
                            })),
                          });
                        }}
                      >
                        <label>
                          Scenario name
                          <input
                            name="name"
                            maxLength={120}
                            defaultValue={scenario.name}
                            required
                          />
                        </label>
                        {scenario.demand.map((d, i) => (
                          <label key={`${d.origin}-${d.destination}-${i}`}>
                            {d.origin} → {d.destination} (veh/h)
                            <input
                              name={`rate-${i}`}
                              type="number"
                              min="0"
                              max="7200"
                              defaultValue={d.rate}
                              required
                            />
                          </label>
                        ))}
                        <div className="field-pair">
                          <label>
                            Duration (s)
                            <input
                              name="duration"
                              type="number"
                              min="10"
                              max="3600"
                              defaultValue={scenario.duration}
                              required
                            />
                          </label>
                          <label>
                            Random seed
                            <input
                              name="seed"
                              type="number"
                              min="0"
                              max="4294967295"
                              defaultValue={scenario.seed}
                              required
                            />
                          </label>
                        </div>
                        <label>
                          Maximum active trips
                          <input
                            name="max"
                            type="number"
                            min="1"
                            max="10000"
                            defaultValue={scenario.maxVehicles}
                            required
                          />
                        </label>
                        <button className="secondary full">
                          Apply settings
                        </button>
                      </form>
                      <button
                        className="text-button full"
                        disabled={playing || !workerReady}
                        onClick={() => send({ type: "step", count: 600 })}
                      >
                        Advance 20 seconds
                      </button>
                    </details>
                    <VehiclePanel
                      key={JSON.stringify(scenario)}
                      scenario={scenario}
                      onApply={apply}
                      onError={fail}
                    />
                    <div className="layers-row">
                      <div className="eyebrow">VISIBLE LAYERS</div>
                      <div className="layer-options">
                        {[...new Set(scenario.nodes.map((n) => n.layer))]
                          .sort()
                          .map((l) => (
                            <label className="check-label" key={l}>
                              <input
                                type="checkbox"
                                checked={layers.includes(l)}
                                onChange={() =>
                                  setLayers(
                                    layers.includes(l)
                                      ? layers.filter((n) => n !== l)
                                      : [...layers, l],
                                  )
                                }
                              />
                              L{l} {l === 0 ? "Ground" : "Elevated"}
                            </label>
                          ))}
                      </div>
                    </div>
                    <button
                      className="primary full run-button"
                      disabled={!workerReady}
                      onClick={run}
                    >
                      <Icon name={playing ? "pause" : "play"} size={17} />
                      {playing
                        ? "Pause simulation"
                        : metrics.time >= scenario.duration
                          ? "Run again"
                          : "Run simulation"}
                    </button>
                    <button
                      className="secondary full"
                      onClick={() => {
                        setServerFocus("run");
                        setShowServer(true);
                      }}
                    >
                      Run on server
                    </button>
                    <div className="playback-secondary">
                      <button
                        className="subtle"
                        aria-label="Advance one simulation step"
                        disabled={playing || !workerReady}
                        onClick={() => send({ type: "step", count: 1 })}
                      >
                        <Icon name="step" />
                        Step
                      </button>
                      <button
                        className="subtle"
                        aria-label="Reset simulation"
                        onClick={reset}
                      >
                        <Icon name="reset" />
                        Reset
                      </button>
                      <label className="speed-label">
                        <span className="sr-only">Playback speed</span>
                        <select
                          aria-label="Playback speed"
                          value={speed}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setSpeed(n);
                            if (playing) send({ type: "play", speed: n });
                          }}
                        >
                          {[1, 2, 4, 8].map((n) => (
                            <option key={n} value={n}>
                              {n}×
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="panel-footer">
                      <span
                        className={`status-dot ${workerReady ? "connected" : ""}`}
                      />
                      {workerReady
                        ? "Reproducible by design"
                        : "Starting simulation…"}
                      <span className="mono">30 Hz</span>
                    </div>
                  </>
                )}
              </aside>
            )}
            <div className="view-hud">
              <div className="segmented">
                <button
                  aria-pressed={view === "iso"}
                  onClick={() => setView("iso")}
                >
                  Isometric
                </button>
                <button
                  aria-pressed={view === "plan"}
                  onClick={() => setView("plan")}
                >
                  Plan view
                </button>
              </div>
              <div className="zoom-row">
                <button
                  aria-label="Zoom out"
                  onClick={() => setZoomAction((n) => (n < 0 ? n - 1 : -1))}
                >
                  −
                </button>
                <button
                  className="fit-button"
                  onClick={() => setFitVersion((v) => v + 1)}
                >
                  <Icon name="fit" size={15} />
                  Fit network
                </button>
                <button
                  aria-label="Zoom in"
                  onClick={() => setZoomAction((n) => (n > 0 ? n + 1 : 1))}
                >
                  +
                </button>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={overlay}
                  onChange={(e) => setOverlay(e.target.checked)}
                />
                Congestion overlay
              </label>
              <label className="check-label scene-check">
                <input
                  type="checkbox"
                  checked={decor}
                  onChange={(e) => setDecor(e.target.checked)}
                />
                City context
              </label>
              <button
                className="secondary"
                aria-pressed={!labels}
                onClick={() => setLabels(!labels)}
              >
                {labels ? "Hide labels" : "Show labels"}
              </button>
              {scenario.fleet && (
                <div
                  className="vehicle-key"
                  role="group"
                  aria-label="Vehicle colours"
                >
                  {scenario.fleet
                    .filter((p) => p.share > 0)
                    .map((p) => (
                      <span key={p.id}>
                        <i
                          className="vehicle-swatch"
                          style={{
                            background:
                              vehicleColors[vehicleTypeIds.indexOf(p.id)],
                          }}
                        />
                        {vehicleLabels[p.id]}
                      </span>
                    ))}
                </div>
              )}
            </div>
            <div className="map-time">
              <span className={playing ? "pulse-dot" : "time-dot"} />
              <span className="mono">
                {fmt(metrics.time, 1)} <small>/ {scenario.duration} s</small>
              </span>
              {warnings > 0 && (
                <span className="warning-count">
                  {warnings} gridlock rejection{warnings === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="congestion-legend">
              <span className="eyebrow">SPEED / POSTED LIMIT</span>
              <div className="legend-ramp" />
              <div>
                <span>0 · Stopped</span>
                <span>0.5 · Slow</span>
                <span>1 · Free</span>
              </div>
            </div>
            <section className="metrics-dock" aria-label="Live traffic metrics">
              <Metric
                label="COMPLETED TRIPS"
                value={fmt(metrics.completed)}
                unit={`${fmt(metrics.active)} active · ${fmt(metrics.rejected)} rejected`}
              />
              <Metric
                label="MEAN TRAVEL TIME"
                value={metrics.completed ? fmt(metrics.meanTravelTime, 1) : "—"}
                unit="seconds · completed trips"
              />
              <Metric
                label="QUEUED VEHICLES"
                value={fmt(metrics.queue)}
                unit={`${fmt(metrics.pending)} waiting to enter`}
              />
              <Chart history={history} label="THROUGHPUT · TRIPS/H" compact />
              <div className="dock-action">
                <button
                  className="compare-link"
                  onClick={() => {
                    setBaseline(
                      preset === "bottleneck" ? bottleneck() : intersection(),
                    );
                    if (preset === "bottleneck") load(bottleneck(2), "custom");
                    changeMode("experiments");
                  }}
                >
                  Compare scenarios <span>↗</span>
                </button>
                <button
                  className="text-button"
                  aria-expanded={showDetails}
                  onClick={() => setShowDetails(!showDetails)}
                >
                  All metrics {showDetails ? "−" : "+"}
                </button>
              </div>
            </section>
          </>
        )}
        {mode === "experiments" && (
          <section className="experiments-page">
            <div className="eyebrow">ONE QUESTION. TWO POSSIBILITIES.</div>
            <h1>
              Small changes.
              <br />
              <span>Different journeys.</span>
            </h1>
            <p className="experiment-intro">
              Compare two networks with identical arrivals, driver parameters
              and observation time. Let the outcomes tell the story.
            </p>
            <div className="experiment-presets">
              <button
                className="chip"
                onClick={() => {
                  setBaseline(intersection());
                  load(flyover(), "flyover");
                }}
              >
                At-grade ↔ Flyover
              </button>
              <button
                className="chip"
                onClick={() => {
                  setBaseline(bottleneck());
                  load(bottleneck(2), "custom");
                }}
              >
                1 lane ↔ 2 lanes
              </button>
              <button
                className="chip"
                onClick={() => {
                  setBaseline(structuredClone(scenario));
                  setResults(null);
                  setNotice(
                    "Current network captured as baseline. Edit the network, then return here.",
                  );
                }}
              >
                Capture current as baseline
              </button>
            </div>
            <div className="experiment-pair">
              <article className="experiment-card">
                <span className="eyebrow">01 / BASELINE</span>
                <h2>{baseline.name}</h2>
                <p>
                  {baseline.edges.length} roads ·{" "}
                  {baseline.edges.reduce((sum, e) => sum + e.lanes, 0)} lane
                  segments
                </p>
                <div className="experiment-mini">
                  <MiniNetwork scenario={baseline} />
                </div>
                <label>
                  Baseline preset
                  <select
                    aria-label="Baseline preset"
                    value=""
                    onChange={(e) => {
                      const p = presetOptions.find(
                        (p) => p.id === e.target.value,
                      );
                      if (p) {
                        setBaseline(p.create());
                        setResults(null);
                      }
                    }}
                  >
                    <option value="">{baseline.name}</option>
                    {presetOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
              <article className="experiment-card modified">
                <span className="eyebrow">02 / MODIFIED</span>
                <h2>{scenario.name}</h2>
                <p>
                  {scenario.edges.length} roads ·{" "}
                  {scenario.edges.reduce((sum, e) => sum + e.lanes, 0)} lane
                  segments
                </p>
                <div className="experiment-mini">
                  <MiniNetwork scenario={scenario} />
                </div>
                <button
                  className="secondary full"
                  onClick={() => changeMode("network")}
                >
                  Edit modified network ↗
                </button>
              </article>
              <article className="experiment-setup">
                <span className="eyebrow">SHARED CONDITIONS</span>
                <dl>
                  <div>
                    <dt>Random seed</dt>
                    <dd>{baseline.seed}</dd>
                  </div>
                  <div>
                    <dt>Observation</dt>
                    <dd>{baseline.duration} s</dd>
                  </div>
                  <div>
                    <dt>Demand</dt>
                    <dd>
                      {fmt(baseline.demand.reduce((sum, d) => sum + d.rate, 0))}{" "}
                      veh/h
                    </dd>
                  </div>
                  <div>
                    <dt>Vehicles</dt>
                    <dd>{fleetSummary(baseline.fleet)}</dd>
                  </div>
                </dl>
                <p className="hint">
                  Baseline demand, seed and vehicle settings apply to both
                  networks. Capture a configured network as baseline to share
                  its traffic mix. Unfinished trips remain active at the
                  observation horizon.
                </p>
                <button
                  className="primary full"
                  disabled={comparing || !workerReady}
                  onClick={doCompare}
                >
                  {comparing ? (
                    <>
                      <span className="spinner" />
                      Running both networks…
                    </>
                  ) : (
                    "Run paired experiment"
                  )}
                </button>
                {comparing && (
                  <button
                    className="text-button full"
                    onClick={() => {
                      send({ type: "pause" });
                      setComparing(false);
                      setNotice("Experiment cancelled.");
                    }}
                  >
                    Cancel experiment
                  </button>
                )}
              </article>
            </div>
            {results && (
              <div className="comparison-results">
                <div className="results-title">
                  <h2>What changed?</h2>
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        JSON.stringify(
                          {
                            generator: "Flux",
                            reportVersion: 1,
                            baseline,
                            modified: pairedScenarios(baseline, scenario)[1],
                            results: results.map(experimentForExport),
                          },
                          null,
                          2,
                        ),
                        "flux-experiment.json",
                      )
                    }
                  >
                    <Icon name="export" />
                    Export experiment
                  </button>
                </div>
                <ComparisonTable results={results} />
                <div className="comparison-charts">
                  {results.map((r, i) => (
                    <div key={i}>
                      <span className="eyebrow">
                        {i === 0 ? "BASELINE" : "MODIFIED"}
                      </span>
                      <Chart
                        history={r.history}
                        label="THROUGHPUT · TRIPS/H"
                        scaleMax={Math.max(
                          ...results.flatMap((result) =>
                            result.history.map((sample) => sample.throughput),
                          ),
                        )}
                      />
                      <Chart
                        history={r.history}
                        metric="meanTravelTime"
                        label="COMPLETED TRAVEL TIME · SECONDS"
                        scaleMax={Math.max(
                          ...results.flatMap((result) =>
                            result.history.map(
                              (sample) => sample.meanTravelTime,
                            ),
                          ),
                        )}
                      />
                    </div>
                  ))}
                </div>
                <p className="hint">
                  Completed-trip averages exclude active trips. Read them
                  alongside completion, rejection and queue counts. These
                  results describe a simplified synthetic model.
                </p>
              </div>
            )}
          </section>
        )}
        {(error || notice) && (
          <div
            className={`toast ${error ? "error" : ""}`}
            role={error ? "alert" : "status"}
          >
            <span>{error || notice}</span>
            <button
              aria-label="Dismiss message"
              onClick={() => {
                setError("");
                setNotice("");
              }}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
      </main>
      {showDetails && mode !== "experiments" && (
        <section
          className="details-drawer"
          aria-label="Detailed traffic metrics"
        >
          <div className="results-title">
            <h2>The network, by numbers.</h2>
            <button
              className="icon-button"
              aria-label="Close detailed metrics"
              onClick={() => setShowDetails(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="detail-stats">
            <Metric
              label="MEAN SPEED"
              value={metrics.moving ? fmt(metrics.meanSpeed * 3.6, 1) : "—"}
              unit="km/h · includes stopped agents"
            />
            <Metric
              label="WAITING TIME"
              value={metrics.completed ? fmt(metrics.meanWaitingTime, 1) : "—"}
              unit="s · completed trips"
            />
            <Metric
              label="MEAN DELAY"
              value={metrics.completed ? fmt(metrics.meanDelay, 1) : "—"}
              unit="s above free-flow · completed"
            />
            <Metric
              label="CONSERVATION"
              value={`${metrics.generated} = ${metrics.active + metrics.completed + metrics.rejected}`}
              unit="generated = active + completed + rejected"
            />
          </div>
          <div className="comparison-charts">
            <Chart
              history={history}
              metric="meanTravelTime"
              label="MEAN COMPLETED TRIP TIME · SECONDS"
            />
            <Chart history={history} metric="queue" label="QUEUE · VEHICLES" />
          </div>
          <VehicleBreakdown metrics={metrics} />
          <div className="table-scroll">
            <table>
              <caption>
                Road observations. Occupancy is vehicle body length divided by
                available lane length.
              </caption>
              <thead>
                <tr>
                  <th>Road</th>
                  <th>Layer</th>
                  <th>Agents</th>
                  <th>Queue</th>
                  <th>Speed km/h</th>
                  <th>Occupancy</th>
                </tr>
              </thead>
              <tbody>
                {scenario.edges.map((e) => {
                  const m = metrics.edges.find((m) => m.id === e.id);
                  return (
                    <tr key={e.id}>
                      <th>{e.id}</th>
                      <td>{e.ramp ? "Ramp" : `L${e.layer}`}</td>
                      <td>{m?.count ?? 0}</td>
                      <td>{m?.queue ?? 0}</td>
                      <td>{fmt((m?.meanSpeed ?? e.speedLimit) * 3.6, 1)}</td>
                      <td>{fmt((m?.occupancy ?? 0) * 100, 1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <footer className="app-footer">
        <span>Interactive Agent-Based Traffic Simulation</span>
        <span className="footer-model">
          {provenance.length
            ? "Imported data. Review assumptions."
            : "Synthetic networks. Transparent models."}
        </span>
        <div>
          <button
            onClick={() => {
              try {
                setSaved(saveScenario(localStorage, saved, scenario));
                setNotice("Scenario saved on this device.");
                setError("");
              } catch (e) {
                fail(e);
              }
            }}
          >
            <Icon name="save" size={14} />
            Save
          </button>
          <button onClick={() => importRef.current?.click()}>
            <Icon name="import" size={14} />
            Import
          </button>
          <button onClick={() => setShowAbout(true)}>Model notes ↗</button>
        </div>
      </footer>
      {showMap && (
        <Suspense fallback={<p role="status">Opening map…</p>}>
          <MapPanel
            onLoad={(result) => {
              load(result.scenario, "custom", [result.provenance]);
              changeMode("simulate");
            }}
            onServer={(result) => {
              load(result.scenario, "custom", [result.provenance]);
              changeMode("simulate");
              setServerFocus("run");
              setShowServer(true);
            }}
            onClose={() => setShowMap(false)}
          />
        </Suspense>
      )}
      {showServer && (
        <ServerPanel
          scenario={scenario}
          baseline={baseline}
          provenance={provenance}
          focus={serverFocus}
          onLoad={(s, p) => load(s, "custom", p)}
          onClose={() => setShowServer(false)}
        />
      )}
      <input
        ref={importRef}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        aria-label="Import scenario file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 2_000_000)
              throw new Error("Scenario file exceeds 2 MB");
            load(importScenario(await file.text()));
            setNotice("Scenario imported and validated.");
          } catch (err) {
            fail(err);
          } finally {
            e.target.value = "";
          }
        }}
      />
      <dialog
        ref={aboutRef}
        className="about-dialog"
        onCancel={() => setShowAbout(false)}
        onClose={() => setShowAbout(false)}
      >
        <div className="results-title">
          <h2>A small traffic laboratory.</h2>
          <button
            className="icon-button"
            aria-label="Close model notes"
            onClick={() => setShowAbout(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <p>
          Flux explores how topology, demand and junction control influence
          queues and journeys. Each vehicle follows an IDM-based car-following
          model with a fixed 1/30 second step.
        </p>
        <p>
          These are synthetic experiments, not calibrated infrastructure
          forecasts. Junctions use conservative reservations; all-red and yellow
          forbid new entries. After 120 seconds of downstream blockage, an agent
          is rejected with a gridlock warning.
        </p>
        <p>
          Active trips include vehicles waiting outside sources. Mean travel,
          waiting and delay use completed trips only. Throughput is cumulative
          completions per elapsed hour; occupancy is vehicle body length divided
          by lane length. Unfinished trips remain active when an observation
          ends.
        </p>
        <p>
          Choose a single vehicle type or a percentage mix under Vehicle types &
          attributes. Dimensions affect lane fit and storage; speed,
          acceleration, braking, gaps and headway affect motion. Defaults are
          illustrative. Vehicles follow lanes; bus stops and two-wheeler
          filtering are not modelled.
        </p>
        <p>
          Road and vehicle widths are exaggerated for legibility. The city is
          decorative. Plan and isometric views share the same 2D simulation,
          with explicit ramps as the only connections between layers.
        </p>
        <p className="hint">
          Device saves stay in this browser. Data & cloud supports accounts,
          server saves and retained simulation jobs. Map previews fetch public
          road data; server saves and jobs retain their scenario and source
          records. Flux has no AI endpoint or analytics.
        </p>
        <button
          className="secondary"
          onClick={() => {
            try {
              localStorage.removeItem(STORAGE_KEY);
              setSaved([]);
              setError("");
              setNotice("Local scenario library cleared.");
              setShowAbout(false);
            } catch (e) {
              fail(e);
            }
          }}
        >
          Clear local saves
        </button>
      </dialog>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="metric">
      <div className="eyebrow">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-unit">{unit}</div>
    </div>
  );
}
function MiniNetwork({ scenario: s }: { scenario: Scenario }) {
  const xs = s.nodes.map((n) => n.x),
    ys = s.nodes.map((n) => n.y),
    minX = Math.min(...xs, -50) - 50,
    minY = Math.min(...ys, -50) - 50,
    w = Math.max(...xs, 50) - minX + 50,
    h = Math.max(...ys, 50) - minY + 50;
  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      role="img"
      aria-label={`${s.name} network diagram`}
    >
      {s.edges
        .slice()
        .sort((a, b) => a.layer - b.layer)
        .map((e) => {
          const a = s.nodes.find((n) => n.id === e.from)!,
            b = s.nodes.find((n) => n.id === e.to)!;
          return (
            <g key={e.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={e.layer ? "#A39AB7" : "#D2CCD9"}
                strokeWidth={18 + e.lanes * 6}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#FBF9FE"
                strokeWidth="2"
                strokeDasharray="14 14"
              />
            </g>
          );
        })}
      {s.nodes.map((n) => (
        <circle key={n.id} cx={n.x} cy={n.y} r="8" fill="#716393" />
      ))}
    </svg>
  );
}
function ComparisonTable({
  results,
}: {
  results: [ExperimentResult, ExperimentResult];
}) {
  const rows: [string, (r: ExperimentResult) => number | null, string][] = [
    ["Completed trips", (r) => r.metrics.completed, ""],
    ["Active / unfinished", (r) => r.metrics.active, ""],
    ["Rejected trips", (r) => r.metrics.rejected, ""],
    [
      "Mean travel time",
      (r) => completedAverage(r.metrics, r.metrics.meanTravelTime),
      " s",
    ],
    [
      "Mean waiting time",
      (r) => completedAverage(r.metrics, r.metrics.meanWaitingTime),
      " s",
    ],
    ["Throughput", (r) => r.metrics.throughput, " veh/h"],
    ["Queued vehicles", (r) => r.metrics.queue, ""],
    ["Gridlock warnings", (r) => r.warnings, ""],
  ];
  return (
    <div className="table-scroll">
      <table>
        <caption>Paired outcomes under identical scheduled demand</caption>
        <thead>
          <tr>
            <th>Observation</th>
            <th>Baseline</th>
            <th>Modified</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value, unit]) => {
            const a = value(results[0]),
              b = value(results[1]);
            return (
              <tr key={label}>
                <th>{label}</th>
                <td>{a === null ? "—" : `${fmt(a, unit ? 1 : 0)}${unit}`}</td>
                <td>{b === null ? "—" : `${fmt(b, unit ? 1 : 0)}${unit}`}</td>
                <td>
                  {a === null || b === null
                    ? "—"
                    : `${b - a > 0 ? "+" : ""}${fmt(b - a, unit ? 1 : 0)}${unit}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
