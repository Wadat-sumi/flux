import { useEffect, useRef, useState } from "react";
import type { Scenario } from "../model/schema";
import type {
  ImportedData,
  Provenance,
  ServerJob,
  ServerScenario,
  User,
} from "../model/backend";
import { api, setCsrf } from "./api";
import { Chart } from "./Chart";
import { cities, type CityId } from "../model/cities";
import type { TrafficObservation } from "../../server/tomtom";

type JobSummary = Omit<ServerJob, "input" | "results">;
interface Dataset {
  id: string;
  provenance: Provenance;
  summary: string;
  createdAt: string;
}
interface Props {
  scenario: Scenario;
  baseline: Scenario;
  provenance: Provenance[];
  onLoad(s: Scenario, p: Provenance[]): void;
  onClose(): void;
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ServerPanel({
  scenario,
  baseline,
  provenance,
  onLoad,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sessionVersion = useRef(0);
  const [user, setUser] = useState<User | null>(null),
    [connected, setConnected] = useState(false),
    [registration, setRegistration] = useState(false);
  const [message, setMessage] = useState("Connecting to the server…"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [saves, setSaves] = useState<ServerScenario[]>([]),
    [jobs, setJobs] = useState<JobSummary[]>([]),
    [datasets, setDatasets] = useState<Dataset[]>([]),
    [selected, setSelected] = useState<ServerJob | null>(null);
  const [importKind, setImportKind] = useState<"osm" | "demand">("osm");
  const [city, setCity] = useState<CityId>("bengaluru"),
    [tomtom, setTomtom] = useState(false),
    [traffic, setTraffic] = useState<TrafficObservation | null>(null);
  const fail = (e: unknown) =>
    setError(e instanceof Error ? e.message : "The request failed");
  async function refresh() {
    const version = sessionVersion.current;
    const [saved, history, data] = await Promise.all([
      api<ServerScenario[]>("/scenarios"),
      api<JobSummary[]>("/jobs"),
      api<Dataset[]>("/datasets"),
    ]);
    if (version !== sessionVersion.current) return;
    setSaves(saved);
    setJobs(history);
    setDatasets(data);
  }
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    dialog.current?.showModal();
    let live = true;
    void Promise.all([
      api<{ registration: boolean }>("/health"),
      api<{ user: User | null; csrf?: string }>("/session"),
    ])
      .then(([health, session]) => {
        if (!live) return;
        setConnected(true);
        setRegistration(health.registration);
        setUser(session.user);
        setCsrf(session.csrf ?? "");
        setMessage("Server connected. Browser simulation remains available.");
      })
      .catch(() => {
        if (live) {
          setConnected(false);
          setMessage(
            "Server unavailable. Start the full-stack development server to use accounts and server data.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (user) {
      void refresh().catch(fail);
      void api<{ tomtom: { configured: boolean } }>("/providers")
        .then((p) => setTomtom(p.tomtom.configured))
        .catch(fail);
    }
  }, [user]);
  useEffect(() => {
    if (!user || !jobs.some((j) => ["running", "queued"].includes(j.status)))
      return;
    let live = true;
    const timer = setInterval(() => {
      void api<JobSummary[]>("/jobs")
        .then((value) => {
          if (live) setJobs(value);
        })
        .catch(fail);
    }, 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [user, jobs]);
  useEffect(() => {
    if (!selected || !["running", "queued"].includes(selected.status)) return;
    let live = true;
    const timer = setInterval(() => {
      void api<ServerJob>(`/jobs/${selected.id}`)
        .then((value) => {
          if (live) setSelected(value);
        })
        .catch(fail);
    }, 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [selected, user]);
  async function acceptedImport(result: ImportedData) {
    const lineage =
      result.provenance.kind === "osm"
        ? [result.provenance]
        : [
            ...provenance.filter((p) => p.kind !== "observed-demand"),
            result.provenance,
          ];
    onLoad(result.scenario, lineage);
    setMessage(result.summary);
    await refresh();
  }
  return (
    <dialog
      ref={dialog}
      className="server-dialog"
      aria-label="Data and cloud workspace"
      onCancel={onClose}
    >
      <div className="results-title">
        <div>
          <span className="eyebrow">CONNECTED RESEARCH</span>
          <h2>Data & cloud</h2>
        </div>
        <button className="secondary" onClick={onClose}>
          Close data workspace
        </button>
      </div>
      <p className="hint" role="status">
        {message}
      </p>
      {error && (
        <p className="server-error" role="alert">
          {error}
        </p>
      )}
      {!user ? (
        <form
          className="server-auth"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget),
              submitter = (e.nativeEvent as SubmitEvent)
                .submitter as HTMLButtonElement;
            void action(async () => {
              const result = await api<{ user: User; csrf: string }>(
                `/auth/${submitter?.value === "register" ? "register" : "login"}`,
                "POST",
                {
                  email: String(data.get("email")),
                  password: String(data.get("password")),
                },
              );
              sessionVersion.current++;
              setCsrf(result.csrf);
              setUser(result.user);
              setMessage(`Signed in as ${result.user.email}`);
            });
          }}
        >
          <p>
            Sign in to keep scenarios and datasets on the server and run
            simulations independently of this browser.
          </p>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <div className="server-actions">
            <button
              className="primary"
              disabled={!connected || busy}
              value="login"
            >
              Sign in
            </button>
            {registration && (
              <button
                className="secondary"
                disabled={!connected || busy}
                value="register"
              >
                Create account
              </button>
            )}
          </div>
          <p className="hint">
            Use at least 12 characters. Production registration is controlled by
            the deployment owner.
          </p>
        </form>
      ) : (
        <>
          <div className="server-account">
            <span>
              Signed in as <strong>{user.email}</strong>
            </span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api("/auth/logout", "POST");
                  sessionVersion.current++;
                  setCsrf("");
                  setUser(null);
                  setSaves([]);
                  setJobs([]);
                  setDatasets([]);
                  setSelected(null);
                  setTraffic(null);
                  setMessage(
                    "Signed out. Browser simulation and local saves are available.",
                  );
                })
              }
            >
              Sign out
            </button>
          </div>
          <section className="server-section">
            <h3>Server scenario library</h3>
            <p className="hint">
              Saved to your account. Device saves remain separate. Imported
              provenance follows server saves and jobs.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api("/scenarios", "POST", { scenario, provenance });
                  await refresh();
                  setMessage("Current scenario saved to your account.");
                })
              }
            >
              Save current to server
            </button>
            <ul className="server-list">
              {saves.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.scenario.name}
                    <small>{new Date(s.updatedAt).toLocaleString()}</small>
                  </span>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      onLoad(s.scenario, s.provenance);
                      setMessage("Server scenario loaded into the editor.");
                    }}
                  >
                    Load
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api(`/scenarios/${s.id}`, "PUT", {
                          scenario,
                          provenance,
                        });
                        await refresh();
                        setMessage(
                          "Server scenario updated with the current editor network.",
                        );
                      })
                    }
                  >
                    Replace
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api(`/scenarios/${s.id}`, "DELETE");
                        await refresh();
                      })
                    }
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            {!saves.length && <p className="hint">No server scenarios yet.</p>}
          </section>
          <section className="server-section">
            <h3>Real-data imports</h3>
            <p className="hint">
              Road maps describe geometry. Observed OD counts describe demand.
              Neither establishes calibration by itself. Imports are retained in
              your dataset library.
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const response = await fetch("/data/bengaluru-osm.json");
                  if (!response.ok)
                    throw new Error("Real-road sample is unavailable");
                  const text = await response.text(),
                    sample = JSON.parse(text);
                  const result = await api<ImportedData>(
                    "/import/osm",
                    "POST",
                    {
                      text,
                      metadata: {
                        source: sample.flux_source,
                        license: "ODbL 1.0 — © OpenStreetMap contributors",
                        capturedAt: sample.flux_captured_at,
                      },
                    },
                  );
                  await acceptedImport(result);
                })
              }
            >
              Load real Bengaluru road sample
            </button>
            <p className="hint">
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                © OpenStreetMap contributors — ODbL
              </a>
              . The sample contains real roads and zero assumed traffic counts.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget),
                  file = data.get("file") as File;
                void action(async () => {
                  if (
                    !file?.size ||
                    file.size > (importKind === "osm" ? 2_000_000 : 500_000)
                  )
                    throw new Error(
                      "Choose a file within the displayed size limit",
                    );
                  const value = {
                    text: await file.text(),
                    metadata: {
                      source: String(data.get("source")),
                      license: String(data.get("license")),
                      capturedAt: new Date(
                        String(data.get("capturedAt")),
                      ).toISOString(),
                    },
                    ...(importKind === "demand" ? { scenario } : {}),
                  };
                  await acceptedImport(
                    await api<ImportedData>(
                      `/import/${importKind}`,
                      "POST",
                      value,
                    ),
                  );
                });
              }}
            >
              <label>
                Import format
                <select
                  value={importKind}
                  onChange={(e) =>
                    setImportKind(e.target.value as "osm" | "demand")
                  }
                >
                  <option value="osm">OpenStreetMap JSON roads (2 MB)</option>
                  <option value="demand">
                    Observed OD counts CSV (500 KB)
                  </option>
                </select>
              </label>
              <label>
                Dataset file
                <input
                  name="file"
                  type="file"
                  accept={importKind === "osm" ? ".json" : ".csv,text/csv"}
                  required
                />
              </label>
              <label>
                Source / dataset URL
                <input name="source" maxLength={500} required />
              </label>
              <label>
                License / permission
                <input
                  name="license"
                  maxLength={200}
                  defaultValue={
                    importKind === "osm"
                      ? "ODbL 1.0 — © OpenStreetMap contributors"
                      : ""
                  }
                  key={importKind}
                  required
                />
              </label>
              <label>
                Observation / extract time
                <input name="capturedAt" type="datetime-local" required />
              </label>
              <p className="hint">
                CSV columns:
                origin,destination,count,interval_seconds,observed_at. IDs must
                match source/sink nodes in the current network. observed_at uses
                ISO UTC. Counts must describe OD trips, rather than counts at a
                single road sensor.
              </p>
              <button className="primary" disabled={busy}>
                Validate and import data
              </button>
            </form>
            {provenance.map((p, i) => (
              <details key={i}>
                <summary>
                  {p.kind}: {p.source}
                </summary>
                <p>
                  {p.license} · {p.capturedAt}
                </p>
                <p className="data-hash">SHA-256 {p.sha256}</p>
                <ul>
                  {p.warnings.map((w, j) => (
                    <li key={j}>{w}</li>
                  ))}
                </ul>
              </details>
            ))}
            <ul className="server-list">
              {datasets.map((d) => (
                <li key={d.id}>
                  <span>
                    {d.provenance.kind}
                    <small>{d.summary}</small>
                  </span>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await acceptedImport(
                          await api<ImportedData>(`/datasets/${d.id}`),
                        );
                      })
                    }
                  >
                    Load dataset
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api(`/datasets/${d.id}`, "DELETE");
                        await refresh();
                      })
                    }
                  >
                    Delete dataset
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="server-section">
            <h3>TomTom traffic observations</h3>
            <p className="hint">
              {tomtom
                ? "TomTom is configured on the server."
                : "TomTom needs an Azure Key Vault secret reference. No key belongs in this page."}{" "}
              Queries are manual and limited to ten per account per minute.
              Traffic is displayed transiently and is excluded from saved
              datasets and exported reports.
            </p>
            <form
              key={city}
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void action(async () => {
                  setTraffic(
                    await api<TrafficObservation>("/traffic/tomtom", "POST", {
                      city,
                      latitude: Number(data.get("latitude")),
                      longitude: Number(data.get("longitude")),
                    }),
                  );
                  setMessage(
                    "TomTom observation retrieved. Verify the returned segment before comparing it with a simulation.",
                  );
                });
              }}
            >
              <label>
                Indian city
                <select
                  aria-label="Indian city"
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value as CityId);
                    setTraffic(null);
                  }}
                >
                  {cities.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-pair">
                <label>
                  Latitude
                  <input
                    name="latitude"
                    type="number"
                    step="any"
                    defaultValue={cities.find((c) => c.id === city)!.latitude}
                    required
                  />
                </label>
                <label>
                  Longitude
                  <input
                    name="longitude"
                    type="number"
                    step="any"
                    defaultValue={cities.find((c) => c.id === city)!.longitude}
                    required
                  />
                </label>
              </div>
              <button className="primary" disabled={busy || !tomtom}>
                Fetch TomTom traffic
              </button>
            </form>
            {traffic && (
              <div
                className="server-result"
                aria-label="TomTom traffic observation"
              >
                <p>
                  <strong>{traffic.attribution}</strong> · retrieved{" "}
                  {new Date(traffic.retrievedAt).toLocaleString()}
                </p>
                <p>
                  Current speed: {traffic.currentSpeed} km/h · free-flow:{" "}
                  {traffic.freeFlowSpeed} km/h
                </p>
                <p>
                  Segment travel time: {traffic.currentTravelTime} s ·
                  free-flow: {traffic.freeFlowTravelTime} s · confidence:{" "}
                  {traffic.confidence}
                </p>
                <p>
                  {traffic.roadClosure
                    ? "Road closure reported"
                    : "No closure reported"}{" "}
                  · segment points: {traffic.coordinates.length}
                </p>
                <details>
                  <summary>Matched segment and interpretation limits</summary>
                  <p className="data-hash">
                    {traffic.coordinates
                      .map((p) => `${p.latitude},${p.longitude}`)
                      .join(" → ")}
                  </p>
                  <ul>
                    {traffic.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </section>
          <section className="server-section">
            <h3>Server simulations</h3>
            <p className="hint">
              Jobs run in an isolated server worker. One job runs at a time; up
              to 20 active jobs globally and three per account. Each job has a
              120-second execution limit. Results remain available after closing
              the browser.
            </p>
            <div className="server-actions">
              {[false, true].map((paired) => (
                <button
                  key={String(paired)}
                  className={paired ? "secondary" : "primary"}
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      setSelected(
                        await api<ServerJob>("/jobs", "POST", {
                          scenario,
                          provenance,
                          ...(paired ? { baseline } : {}),
                        }),
                      );
                      await refresh();
                      setMessage(
                        "Server job submitted. Progress and results are shown below.",
                      );
                    })
                  }
                >
                  {paired
                    ? "Run paired experiment on server"
                    : "Run current on server"}
                </button>
              ))}
            </div>
            <ul className="server-list">
              {jobs.map((j) => (
                <li key={j.id}>
                  <span>
                    {j.name}
                    <small>
                      {j.status} · {j.progress}%
                    </small>
                  </span>
                  <button
                    className="secondary"
                    onClick={() =>
                      void action(async () =>
                        setSelected(await api<ServerJob>(`/jobs/${j.id}`)),
                      )
                    }
                  >
                    View result
                  </button>
                  {["queued", "running"].includes(j.status) ? (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          setSelected(
                            await api<ServerJob>(
                              `/jobs/${j.id}/cancel`,
                              "POST",
                            ),
                          );
                          await refresh();
                        })
                      }
                    >
                      Cancel job
                    </button>
                  ) : (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await api(`/jobs/${j.id}`, "DELETE");
                          if (selected?.id === j.id) setSelected(null);
                          await refresh();
                        })
                      }
                    >
                      Delete result
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {selected && (
              <div
                className="server-result"
                aria-label="Server simulation result"
              >
                <h3>{selected.name}</h3>
                <p>
                  {selected.status} · {selected.progress}%
                </p>
                {selected.error && <p role="alert">{selected.error}</p>}
                {selected.results && (
                  <>
                    <button
                      className="secondary"
                      onClick={() =>
                        download(
                          {
                            generator: "Flux",
                            reportVersion: 2,
                            job: selected,
                          },
                          "flux-server-result.json",
                        )
                      }
                    >
                      Download server report
                    </button>
                    <div className="table-scroll">
                      <table>
                        <caption>
                          Completed-trip averages exclude active and rejected
                          trips.
                        </caption>
                        <thead>
                          <tr>
                            <th>Network</th>
                            <th>Completed</th>
                            <th>Active</th>
                            <th>Rejected</th>
                            <th>Travel (s)</th>
                            <th>Queue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.results.map((r, i) => (
                            <tr key={i}>
                              <th>{r.name}</th>
                              <td>{r.metrics.completed}</td>
                              <td>{r.metrics.active}</td>
                              <td>{r.metrics.rejected}</td>
                              <td>
                                {r.metrics.meanTravelTime?.toFixed(2) ?? "—"}
                              </td>
                              <td>{r.metrics.queue}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {selected.results.map((r, i) => (
                      <Chart
                        key={i}
                        history={r.history.map((h) => ({
                          ...h,
                          meanTravelTime: h.meanTravelTime ?? 0,
                        }))}
                        label={`${r.name} · THROUGHPUT · TRIPS/H`}
                        scaleMax={Math.max(
                          1,
                          ...selected.results!.flatMap((result) =>
                            result.history.map((h) => h.throughput),
                          ),
                        )}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </dialog>
  );
}
