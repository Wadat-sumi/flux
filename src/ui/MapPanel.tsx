import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cities as cityRegions, type CityId } from "../model/cities";
import {
  areaSize,
  boundsSchema,
  unprojectPoint,
  type MapBounds,
} from "../model/map-area";
import type { ImportedData } from "../model/backend";
import { api } from "./api";
import { roadPoints } from "../model/road-geometry";

const cities = cityRegions.map((c) =>
  c.id === "bengaluru" ? { ...c, latitude: 12.9745, longitude: 77.5964 } : c,
);

function around(lat: number, lon: number): MapBounds {
  const halfLat = 130 / 111194.9266,
    halfLon = halfLat / Math.cos((lat * Math.PI) / 180);
  return {
    south: lat - halfLat,
    north: lat + halfLat,
    west: lon - halfLon,
    east: lon + halfLon,
  };
}
const leafletBounds = (b: MapBounds): L.LatLngBoundsExpression => [
  [b.south, b.west],
  [b.north, b.east],
];
export function MapPanel({
  onLoad,
  onServer,
  onClose,
}: {
  onLoad(result: ImportedData): void;
  onServer(result: ImportedData): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    container = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    rectangle = useRef<L.Rectangle | null>(null),
    roads = useRef<L.LayerGroup | null>(null);
  const first = useRef<L.LatLng | null>(null),
    gesture = useRef<{
      pointerId: number;
      start: L.LatLng;
      downX: number;
      downY: number;
      moved: boolean;
    } | null>(null),
    alive = useRef(true);
  const [city, setCity] = useState<CityId>("bengaluru"),
    [bounds, setBounds] = useState(
      around(cities[0].latitude, cities[0].longitude),
    );
  const [drawing, setDrawing] = useState(false),
    [rate, setRate] = useState(900),
    [labels, setLabels] = useState(true),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<ImportedData | null>(null),
    [error, setError] = useState(""),
    [tileError, setTileError] = useState(false),
    [message, setMessage] = useState(
      "Pan and zoom, then choose Draw selection and press-drag a rectangle across the roads you want to simulate.",
    );
  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    const view = L.map(container.current!, {
      center: [cities[0].latitude, cities[0].longitude],
      zoom: 17,
      minZoom: 3,
      maxZoom: 19,
      worldCopyJump: false,
    });
    map.current = view;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      updateWhenIdle: true,
      keepBuffer: 0,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    })
      .on("tileerror", () => setTileError(true))
      .addTo(view);
    L.control.scale({ imperial: false }).addTo(view);
    rectangle.current = L.rectangle(
      leafletBounds(around(cities[0].latitude, cities[0].longitude)),
      { color: "#7763ac", weight: 2, fillOpacity: 0.1, interactive: false },
    ).addTo(view);
    roads.current = L.layerGroup().addTo(view);
    const resize = new ResizeObserver(() => view.invalidateSize());
    resize.observe(container.current!);
    return () => {
      alive.current = false;
      resize.disconnect();
      view.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const view = map.current;
    if (!view) return;
    for (const handler of [
      view.dragging,
      view.touchZoom,
      view.doubleClickZoom,
      view.scrollWheelZoom,
    ])
      if (drawing) handler.disable();
      else handler.enable();
  }, [drawing]);
  useEffect(() => {
    rectangle.current?.setBounds(leafletBounds(bounds));
    roads.current?.clearLayers();
  }, [bounds]);
  useEffect(() => {
    const layers = roads.current;
    if (!layers) return;
    layers.clearLayers();
    if (!result || drawing) return;
    const nodes = new Map(result.scenario.nodes.map((n) => [n.id, n]));
    for (const edge of result.scenario.edges) {
      const a = nodes.get(edge.from)!,
        b = nodes.get(edge.to)!;
      L.polyline(
        roadPoints(edge, a, b).map((n) => unprojectPoint(n.x, n.y, bounds)),
        { color: "#66528f", weight: 4, opacity: 0.8 },
      ).addTo(layers);
    }
    for (const n of result.scenario.nodes)
      if (n.kind === "source" || n.kind === "sink") {
        const source = n.kind === "source";
        L.circleMarker(unprojectPoint(n.x, n.y, bounds), {
          radius: source ? 8 : 4,
          color: source ? "#247a60" : "#bb4d47",
          fillColor: source ? "#ddf3e7" : "#f6d9d5",
          fillOpacity: 1,
          weight: 2,
        })
          .bindTooltip(source ? "SOURCE →" : "→ SINK", {
            permanent: labels,
            direction: source ? "left" : "right",
            offset: source ? [-8, -8] : [8, 8],
          })
          .addTo(layers);
      }
  }, [result, bounds, labels, drawing]);
  function select(next: MapBounds) {
    releaseGesture();
    setBounds(next);
    setResult(null);
    setError("");
    first.current = null;
    setDrawing(false);
    setMessage(
      "Selection ready. Preview roads to detect boundary sources and sinks.",
    );
  }
  function releaseGesture() {
    const g = gesture.current;
    gesture.current = null;
    if (g && container.current?.hasPointerCapture(g.pointerId))
      container.current.releasePointerCapture(g.pointerId);
  }
  function cancelDrawing() {
    releaseGesture();
    first.current = null;
    setDrawing(false);
    setError("");
    rectangle.current
      ?.setBounds(leafletBounds(bounds))
      .setStyle({ color: "#7763ac" });
    setMessage("Selection drawing cancelled.");
  }
  function pointerLocation(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return map.current!.containerPointToLatLng(
      L.point(
        Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
      ),
    );
  }
  function selectionBounds(a: L.LatLng, b: L.LatLng): MapBounds {
    return {
      south: Math.min(a.lat, b.lat),
      north: Math.max(a.lat, b.lat),
      west: Math.min(a.lng, b.lng),
      east: Math.max(a.lng, b.lng),
    };
  }
  function finishSelection(a: L.LatLng, b: L.LatLng) {
    const parsed = boundsSchema.safeParse(selectionBounds(a, b));
    first.current = null;
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      rectangle.current
        ?.setBounds(leafletBounds(bounds))
        .setStyle({ color: "#7763ac" });
      setMessage(
        "Drag a rectangle again, or choose two corners (50–800 m per side).",
      );
      return;
    }
    select(parsed.data);
    rectangle.current?.setStyle({ color: "#7763ac" });
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !drawing ||
      event.button !== 0 ||
      !event.isPrimary ||
      gesture.current ||
      (event.target as Element).closest(".leaflet-control")
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current = {
      pointerId: event.pointerId,
      start: first.current ?? pointerLocation(event),
      downX: event.clientX,
      downY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setError("");
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawing) return;
    const g = gesture.current;
    if (g && g.pointerId !== event.pointerId) return;
    const start = g?.start ?? first.current;
    if (!start) return;
    if (g && Math.hypot(event.clientX - g.downX, event.clientY - g.downY) > 4)
      g.moved = true;
    if (g && !g.moved && !first.current) return;
    event.preventDefault();
    const next = selectionBounds(start, pointerLocation(event)),
      size = areaSize(next),
      valid = boundsSchema.safeParse(next).success;
    rectangle.current
      ?.setBounds(leafletBounds(next))
      .setStyle({ color: valid ? "#7763ac" : "#bb633c" });
    setMessage(
      `${Math.round(size.width)} × ${Math.round(size.height)} m — release to select, or click the opposite corner.`,
    );
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!drawing || !g || g.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const end = pointerLocation(event);
    releaseGesture();
    if (g.moved || first.current) finishSelection(g.start, end);
    else {
      first.current = g.start;
      setMessage(
        "First corner set. Click the opposite corner or drag to size the selection.",
      );
    }
  }
  const size = areaSize(bounds);
  return (
    <dialog
      ref={dialog}
      className="server-dialog map-dialog"
      aria-label="OpenStreetMap area selection"
      onCancel={(event) => {
        if (drawing) {
          event.preventDefault();
          cancelDrawing();
        } else onClose();
      }}
    >
      <div className="results-title">
        <div>
          <span className="eyebrow">REAL ROADS · YOUR EXPERIMENT</span>
          <h2>Choose a piece of the city</h2>
        </div>
        <button className="secondary" onClick={onClose}>
          Close map
        </button>
      </div>
      <p>
        Major roads only: motorways, trunk, primary, secondary and tertiary
        roads, plus their links and connected roundabouts. Local streets,
        alleys, cycleways and walkways are excluded. Flux clips roads to its
        boundary and automatically marks{" "}
        <strong className="source-key">sources (in)</strong> and{" "}
        <strong className="sink-key">sinks (out)</strong> using road direction.
      </p>
      <div className="map-tools">
        <label>
          Jump to city
          <select
            aria-label="Jump to city"
            disabled={busy}
            value={city}
            onChange={(e) => {
              const id = e.target.value as CityId,
                c = cities.find((c) => c.id === id)!;
              setCity(id);
              select(around(c.latitude, c.longitude));
              map.current?.setView([c.latitude, c.longitude], 17);
            }}
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          disabled={busy}
          aria-pressed={drawing}
          onClick={() => {
            if (drawing) {
              cancelDrawing();
              return;
            }
            first.current = null;
            releaseGesture();
            setDrawing(true);
            setError("");
            setMessage(
              "Press and drag to draw a rectangle, or click two opposite corners. Panning is paused while drawing.",
            );
          }}
        >
          {drawing ? "Cancel drawing" : "Draw selection"}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            const centre = map.current!.getCenter();
            select(around(centre.lat, centre.lng));
          }}
        >
          Select 260 m at map centre
        </button>
        <button
          className="secondary"
          aria-pressed={!labels}
          onClick={() => setLabels(!labels)}
        >
          {labels ? "Hide map labels" : "Show map labels"}
        </button>
        <span className="map-size" aria-live="polite">
          {Math.round(size.width)} × {Math.round(size.height)} m selected
        </span>
      </div>
      <div
        ref={container}
        className="osm-map"
        data-drawing={drawing}
        style={{
          cursor: drawing ? "crosshair" : undefined,
          touchAction: drawing ? "none" : undefined,
        }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          releaseGesture();
          first.current = null;
          rectangle.current
            ?.setBounds(leafletBounds(bounds))
            .setStyle({ color: "#7763ac" });
          setMessage("Drawing interrupted. Press and drag again to select.");
        }}
        role="region"
        aria-label="OpenStreetMap: pan, zoom and select a road area"
      />
      {tileError && (
        <p className="error" role="alert">
          Some map tiles could not load. Check your connection or retry later.
          Coordinate selection and road import remain available.
        </p>
      )}
      <details>
        <summary>Selection coordinates / keyboard selection</summary>
        <form
          className="map-coordinates"
          key={JSON.stringify(bounds)}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget),
              value = boundsSchema.safeParse(
                Object.fromEntries(
                  ["south", "west", "north", "east"].map((k) => [
                    k,
                    Number(data.get(k)),
                  ]),
                ),
              );
            if (value.success) {
              select(value.data);
              map.current?.fitBounds(leafletBounds(value.data), {
                padding: [40, 40],
              });
            } else setError(value.error.issues[0].message);
          }}
        >
          {(["south", "west", "north", "east"] as const).map((k) => (
            <label key={k}>
              {k}
              <input
                aria-label={`Selection ${k}`}
                name={k}
                type="number"
                step="any"
                defaultValue={bounds[k]}
                disabled={busy}
                required
              />
            </label>
          ))}
          <button className="secondary" disabled={busy}>
            Apply coordinates
          </button>
        </form>
      </details>
      <div className="map-footer">
        <label>
          Starter traffic: total synthetic vehicles/hour
          <input
            aria-label="Synthetic vehicles per hour"
            type="number"
            min="0"
            max="7200"
            step="1"
            value={rate}
            disabled={busy}
            onChange={(e) => {
              setRate(Number(e.target.value));
              setResult(null);
              roads.current?.clearLayers();
            }}
          />
        </label>
        <button
          className="primary"
          disabled={
            busy || drawing || !Number.isFinite(rate) || rate < 0 || rate > 7200
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            setResult(null);
            try {
              const imported = await api<ImportedData>(
                "/maps/osm-area",
                "POST",
                { bounds, syntheticRate: rate },
              );
              if (alive.current) {
                setResult(imported);
                setMessage(imported.summary);
              }
            } catch (e) {
              if (alive.current)
                setError(e instanceof Error ? e.message : "Map import failed");
            } finally {
              if (alive.current) setBusy(false);
            }
          }}
        >
          {busy ? "Reading OSM roads…" : "Preview roads & terminals"}
        </button>
        <button
          className="primary"
          disabled={!result || busy || drawing}
          onClick={() => {
            if (result) {
              onLoad(result);
              onClose();
            }
          }}
        >
          Use area in simulation
        </button>
        <button
          className="secondary"
          disabled={!result || busy || drawing}
          onClick={() => {
            if (result) {
              onServer(result);
              onClose();
            }
          }}
        >
          Use area on server
        </button>
      </div>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <details>
          <summary>Import assumptions and provenance</summary>
          <p>{result.provenance.source}</p>
          <p>
            {result.provenance.license} · retrieved{" "}
            {result.provenance.capturedAt}
          </p>
          <ul>
            {result.provenance.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="data-hash">SHA-256: {result.provenance.sha256}</p>
        </details>
      )}
      <p className="muted">
        50–800 m per side · up to 300 junctions/terminals and 1,000 directed
        roads after shape simplification. Traffic counts and signal timings are
        not included. Starter demand is divided across reachable entries, with
        one furthest reachable exit each; edit demand in Network. Public OSM
        services require a connection and may limit requests.{" "}
        <a
          href="https://www.openstreetmap.org/fixthemap"
          target="_blank"
          rel="noreferrer"
        >
          Report a map issue
        </a>
        .
      </p>
    </dialog>
  );
}
