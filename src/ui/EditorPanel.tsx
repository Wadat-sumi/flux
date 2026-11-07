import { useState } from "react";
import {
  addNode,
  addRoad,
  deleteSelection,
  updateNode,
  type Selection,
} from "./editor";
import {
  parseScenario,
  type Scenario,
  type RoadNode,
  type RoadEdge,
} from "../model/schema";

interface Props {
  scenario: Scenario;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onChange: (s: Scenario) => void;
  onError: (e: unknown) => void;
  tool: "select" | "node";
  setTool: (t: "select" | "node") => void;
  layer: number;
  setLayer: (n: number) => void;
  onUndo: () => void;
  canUndo: boolean;
}

export function EditorPanel(p: Props) {
  const s = p.scenario,
    selectedNode =
      p.selection?.kind === "node"
        ? s.nodes.find((n) => n.id === p.selection!.id)
        : undefined;
  const selectedEdge =
    p.selection?.kind === "edge"
      ? s.edges.find((e) => e.id === p.selection!.id)
      : undefined;
  const selectedRoundabout =
    p.selection?.kind === "roundabout"
      ? s.roundabouts?.find((r) => r.id === p.selection!.id)
      : undefined;
  const groupedNodes = new Set((s.roundabouts ?? []).flatMap((r) => r.nodeIds)),
    groupedEdges = new Set((s.roundabouts ?? []).flatMap((r) => r.edgeIds));
  const attempt = (fn: () => Scenario) => {
    try {
      p.onChange(fn());
    } catch (e) {
      p.onError(e);
    }
  };
  return (
    <>
      <div className="panel-title">
        <span className="eyebrow">NETWORK WORKSHOP</span>
        <span className="tag">{s.nodes.length} nodes</span>
      </div>
      <h2>Shape the network.</h2>
      <p className="muted small">
        Select a road or node. Drag nodes to reposition; forms offer the same
        controls.
      </p>
      <div className="segmented">
        <button
          aria-pressed={p.tool === "select"}
          onClick={() => p.setTool("select")}
        >
          Select / pan
        </button>
        <button
          aria-pressed={p.tool === "node"}
          onClick={() => p.setTool("node")}
        >
          + Place node
        </button>
      </div>
      <label>
        Placement layer
        <select
          aria-label="Placement layer"
          value={p.layer}
          onChange={(e) => p.setLayer(Number(e.target.value))}
        >
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              L{n} · {n === 0 ? "Ground" : "Elevated"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Inspect element
        <select
          aria-label="Inspect element"
          value={p.selection ? `${p.selection.kind}:${p.selection.id}` : ""}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(":");
            p.onSelect(
              id ? { kind: kind as "node" | "edge" | "roundabout", id } : null,
            );
          }}
        >
          <option value="">Choose node or road</option>
          {(s.roundabouts?.length ?? 0) > 0 && (
            <optgroup label="Roundabouts">
              {s.roundabouts!.map((r) => (
                <option key={r.id} value={`roundabout:${r.id}`}>
                  {r.id} · {r.nodeIds.length} connections
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Nodes">
            {s.nodes
              .filter((n) => !groupedNodes.has(n.id))
              .map((n) => (
                <option key={n.id} value={`node:${n.id}`}>
                  {n.id} · L{n.layer} · {n.kind}
                </option>
              ))}
          </optgroup>
          <optgroup label="Roads">
            {s.edges
              .filter((e) => !groupedEdges.has(e.id))
              .map((e) => (
                <option key={e.id} value={`edge:${e.id}`}>
                  {e.id} · {e.lanes} lane{e.lanes > 1 ? "s" : ""}
                  {e.ramp ? " · ramp" : ""}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      {selectedRoundabout && (
        <form
          key={
            JSON.stringify(selectedRoundabout) +
            JSON.stringify(
              s.edges.filter((e) => selectedRoundabout.edgeIds.includes(e.id)),
            )
          }
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            attempt(() =>
              parseScenario({
                ...s,
                edges: s.edges.map((e) =>
                  selectedRoundabout.edgeIds.includes(e.id)
                    ? {
                        ...e,
                        lanes: Number(values.get("lanes")),
                        width: Number(values.get("lanes")) * 3.5,
                        speedLimit: Number(values.get("speed")),
                      }
                    : e,
                ),
              }),
            );
          }}
        >
          <h3>Roundabout</h3>
          <p className="muted small">
            One grouped structure with {selectedRoundabout.nodeIds.length}{" "}
            connection ports. Curved circulating arcs retain mapped direction
            and give circulating vehicles priority. Shape points do not create
            junction stops.
          </p>
          <label>
            Roundabout lanes
            <input
              aria-label="Roundabout lanes"
              name="lanes"
              type="number"
              min="1"
              max="6"
              step="1"
              defaultValue={
                s.edges.find((e) => e.id === selectedRoundabout.edgeIds[0])!
                  .lanes
              }
              required
            />
          </label>
          <label>
            Roundabout speed (m/s)
            <input
              aria-label="Roundabout speed"
              name="speed"
              type="number"
              min="2"
              max="45"
              step="0.01"
              defaultValue={
                s.edges.find((e) => e.id === selectedRoundabout.edgeIds[0])!
                  .speedLimit
              }
              required
            />
          </label>
          <button className="primary full">Apply roundabout</button>
        </form>
      )}
      {selectedNode && (
        <NodeInspector
          key={JSON.stringify(selectedNode)}
          node={selectedNode}
          onApply={(n) => attempt(() => updateNode(s, n))}
        />
      )}
      {selectedEdge && (
        <EdgeInspector
          key={JSON.stringify(selectedEdge)}
          edge={selectedEdge}
          onApply={(e) =>
            attempt(() =>
              parseScenario({
                ...s,
                edges: s.edges.map((old) => (old.id === e.id ? e : old)),
              }),
            )
          }
        />
      )}
      {p.selection && (
        <button
          className="danger subtle full"
          onClick={() => {
            attempt(() => deleteSelection(s, p.selection!));
            p.onSelect(null);
          }}
        >
          Delete selected{" "}
          {p.selection.kind === "edge"
            ? "road"
            : p.selection.kind === "roundabout"
              ? "roundabout"
              : "node"}
        </button>
      )}
      <details className="editor-section">
        <summary>Add a node by coordinates</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            attempt(() =>
              addNode(s, Number(data.get("x")), Number(data.get("y")), p.layer),
            );
          }}
        >
          <div className="field-pair">
            <label>
              New node X
              <input
                name="x"
                type="number"
                min="-10000"
                max="10000"
                defaultValue="100"
                required
              />
            </label>
            <label>
              New node Y
              <input
                name="y"
                type="number"
                min="-10000"
                max="10000"
                defaultValue="100"
                required
              />
            </label>
          </div>
          <button className="secondary full" type="submit">
            Add node
          </button>
        </form>
      </details>
      <details className="editor-section">
        <summary>Sources & demand</summary>
        <p className="hint">
          Set node roles to source and sink, then connect their routes. Demand
          is vehicles per hour.
        </p>
        {s.demand.map((d, i) => (
          <form
            key={`${d.origin}-${d.destination}-${i}-${d.rate}`}
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              attempt(() =>
                parseScenario({
                  ...s,
                  demand: s.demand.map((old, j) =>
                    j === i ? { ...old, rate: Number(data.get("rate")) } : old,
                  ),
                }),
              );
            }}
          >
            <label>
              {d.origin} → {d.destination} rate
              <input
                name="rate"
                aria-label={`Demand ${d.origin} to ${d.destination}`}
                type="number"
                min="0"
                max="7200"
                defaultValue={d.rate}
                required
              />
            </label>
            <div className="field-pair">
              <button className="secondary" type="submit">
                Update rate
              </button>
              <button
                className="danger subtle"
                type="button"
                aria-label={`Remove demand ${d.origin} to ${d.destination}`}
                onClick={() =>
                  attempt(() =>
                    parseScenario({
                      ...s,
                      demand: s.demand.filter((_, j) => j !== i),
                    }),
                  )
                }
              >
                Remove
              </button>
            </div>
          </form>
        ))}
        {s.nodes.some((n) => n.kind === "source") &&
          s.nodes.some((n) => n.kind === "sink") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                attempt(() =>
                  parseScenario({
                    ...s,
                    demand: [
                      ...s.demand,
                      {
                        origin: String(data.get("origin")),
                        destination: String(data.get("destination")),
                        rate: Number(data.get("rate")),
                      },
                    ],
                  }),
                );
              }}
            >
              <label>
                Trip origin
                <select name="origin" aria-label="Trip origin">
                  {s.nodes
                    .filter((n) => n.kind === "source")
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Trip destination
                <select name="destination" aria-label="Trip destination">
                  {s.nodes
                    .filter((n) => n.kind === "sink")
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                New demand (veh/h)
                <input
                  name="rate"
                  type="number"
                  min="0"
                  max="7200"
                  defaultValue="600"
                  required
                />
              </label>
              <button className="secondary full">Add demand pair</button>
            </form>
          )}
      </details>
      <details className="editor-section" open>
        <summary>Connect two nodes</summary>
        <form
          key={s.nodes.map((n) => n.id).join(",")}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            attempt(() =>
              addRoad(
                s,
                String(data.get("from")),
                String(data.get("to")),
                Number(data.get("lanes")),
              ),
            );
          }}
        >
          <label>
            From node
            <select
              name="from"
              aria-label="From node"
              defaultValue={s.nodes[0]?.id}
            >
              {s.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id} · L{n.layer}
                </option>
              ))}
            </select>
          </label>
          <label>
            To node
            <select
              name="to"
              aria-label="To node"
              defaultValue={s.nodes[1]?.id}
            >
              {s.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id} · L{n.layer}
                </option>
              ))}
            </select>
          </label>
          <label>
            New road lanes
            <input
              name="lanes"
              type="number"
              min="1"
              max="6"
              defaultValue="1"
              required
            />
          </label>
          <button className="secondary full" disabled={s.nodes.length < 2}>
            Connect nodes
          </button>
          <p className="hint">
            Different endpoint layers create an explicit ramp. Visual crossings
            never create a junction.
          </p>
        </form>
      </details>
      <button
        className="text-button full"
        disabled={!p.canUndo}
        onClick={p.onUndo}
      >
        ↶ Undo last network change
      </button>
    </>
  );
}

function NodeInspector({
  node,
  onApply,
}: {
  node: RoadNode;
  onApply: (n: RoadNode) => void;
}) {
  const [draft, setDraft] = useState(node);
  return (
    <form
      className="inspector"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(draft);
      }}
    >
      <div className="eyebrow">NODE / {node.id}</div>
      <div className="field-pair">
        <label>
          Node X
          <input
            type="number"
            min="-10000"
            max="10000"
            value={draft.x}
            onChange={(e) => setDraft({ ...draft, x: Number(e.target.value) })}
            required
          />
        </label>
        <label>
          Node Y
          <input
            type="number"
            min="-10000"
            max="10000"
            value={draft.y}
            onChange={(e) => setDraft({ ...draft, y: Number(e.target.value) })}
            required
          />
        </label>
      </div>
      <label>
        Node role
        <select
          aria-label="Node role"
          value={draft.kind}
          onChange={(e) =>
            setDraft({ ...draft, kind: e.target.value as RoadNode["kind"] })
          }
        >
          {["junction", "waypoint", "source", "sink"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Node elevation
        <input
          type="number"
          min="0"
          max="5"
          value={draft.layer}
          onChange={(e) =>
            setDraft({ ...draft, layer: Number(e.target.value) })
          }
          required
        />
      </label>
      <label>
        Junction control
        <select
          aria-label="Junction control"
          value={draft.control}
          onChange={(e) =>
            setDraft({
              ...draft,
              control: e.target.value as RoadNode["control"],
              signal:
                e.target.value === "signal"
                  ? (draft.signal ?? {
                      green: 22,
                      yellow: 3,
                      allRed: 2,
                      offset: 0,
                    })
                  : undefined,
            })
          }
        >
          <option value="priority">Priority / yield</option>
          <option value="signal">Fixed-time signal</option>
        </select>
      </label>
      {draft.control === "signal" && draft.signal && (
        <div className="field-pair">
          {(["green", "yellow", "allRed", "offset"] as const).map((k) => (
            <label key={k}>
              {k === "allRed" ? "All red" : k[0].toUpperCase() + k.slice(1)} (s)
              <input
                type="number"
                min={k === "green" ? 3 : k === "offset" ? 0 : 1}
                max={k === "green" ? 180 : k === "offset" ? 1000 : 10}
                value={draft.signal![k]}
                required
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    signal: { ...draft.signal!, [k]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      <button className="primary full">Apply node changes</button>
    </form>
  );
}
function EdgeInspector({
  edge,
  onApply,
}: {
  edge: RoadEdge;
  onApply: (e: RoadEdge) => void;
}) {
  const [draft, setDraft] = useState(edge);
  return (
    <form
      className="inspector"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(draft);
      }}
    >
      <div className="eyebrow">ROAD / {edge.id}</div>
      <p className="small">
        {edge.from} → {edge.to}{" "}
        <span className="tag">{edge.ramp ? "Ramp" : `L${edge.layer}`}</span>
      </p>
      <div className="field-pair">
        <label>
          Road lanes
          <input
            type="number"
            min="1"
            max="6"
            value={draft.lanes}
            onChange={(e) =>
              setDraft({ ...draft, lanes: Number(e.target.value) })
            }
            required
          />
        </label>
        <label>
          Speed limit (km/h)
          <input
            type="number"
            min="7.2"
            max="162"
            step="0.1"
            value={Math.round(draft.speedLimit * 36) / 10}
            onChange={(e) =>
              setDraft({ ...draft, speedLimit: Number(e.target.value) / 3.6 })
            }
            required
          />
        </label>
      </div>
      <label>
        Road length (m)
        <input
          type="number"
          min="10"
          max="10000"
          value={draft.length}
          onChange={(e) =>
            setDraft({ ...draft, length: Number(e.target.value) })
          }
          required
        />
      </label>
      <div className="field-pair">
        <label>
          Road width (m)
          <input
            type="number"
            min="2"
            max="40"
            step="0.1"
            value={draft.width}
            onChange={(e) =>
              setDraft({ ...draft, width: Number(e.target.value) })
            }
            required
          />
        </label>
        <label>
          Road priority
          <input
            type="number"
            min="0"
            max="10"
            value={draft.priority}
            onChange={(e) =>
              setDraft({ ...draft, priority: Number(e.target.value) })
            }
            required
          />
        </label>
      </div>
      <p className="hint">
        Elevation follows endpoint nodes. Width is visual; lane count and
        traffic dynamics determine capacity.
      </p>
      <button className="primary full">Apply road changes</button>
    </form>
  );
}
