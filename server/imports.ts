import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import {
  parseScenario,
  type RoadNode,
  type RoadEdge,
  type Scenario,
} from "../src/model/schema";
import type { ImportedData, Provenance } from "../src/model/backend";
import { Network } from "../src/engine/network";
import { defaultVehicleProfiles } from "../src/model/vehicles";
import {
  clipMapRoads,
  projectPoint,
  clipSegment,
  areaSize,
  type MapBounds,
} from "../src/model/map-area";

const metadata = z
  .object({
    source: z.string().trim().min(1).max(500),
    license: z.string().trim().min(1).max(200),
    capturedAt: z.iso.datetime(),
  })
  .strict();
export const osmInputSchema = z
  .object({ text: z.string().min(1).max(2_000_000), metadata })
  .strict();
export const demandInputSchema = z
  .object({
    text: z.string().min(1).max(500_000),
    scenario: z.unknown(),
    metadata,
  })
  .strict();
const osmId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const tags = z.record(z.string().max(100), z.string().max(500)).default({});
const osmSchema = z.object({
  elements: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("node"),
          id: osmId,
          lat: z.number().finite().min(-85).max(85),
          lon: z.number().finite().min(-180).max(180),
          tags,
        }),
        z.object({
          type: z.literal("way"),
          id: osmId,
          nodes: z.array(osmId).min(2).max(5000),
          tags,
        }),
        z.object({ type: z.literal("relation"), id: osmId, tags }),
      ]),
    )
    .min(1)
    .max(20000),
});
const defaults: Record<string, number> = {
  motorway: 90,
  motorway_link: 50,
  trunk: 80,
  trunk_link: 40,
  primary: 50,
  primary_link: 40,
  secondary: 50,
  secondary_link: 30,
  tertiary: 40,
  tertiary_link: 30,
  residential: 30,
  unclassified: 30,
  living_street: 15,
  service: 20,
};
function provenance(
  kind: Provenance["kind"],
  text: string,
  meta: z.infer<typeof metadata>,
  warnings: Set<string>,
): Provenance {
  return {
    kind,
    ...meta,
    sha256: createHash("sha256").update(text).digest("hex"),
    warnings: [...warnings].slice(0, 100),
  };
}
export function importOsm(
  input: unknown,
  area?: { bounds: MapBounds; syntheticRate: number },
): ImportedData {
  const { text, metadata: meta } = (
    area
      ? osmInputSchema.extend({ text: z.string().min(1).max(8_000_000) })
      : osmInputSchema
  ).parse(input);
  if (Buffer.byteLength(text) > (area ? 8_000_000 : 2_000_000))
    throw new Error(
      area ? "OSM map extract exceeds 8 MB" : "OSM file exceeds 2 MB",
    );
  const raw = osmSchema.parse(JSON.parse(text));
  if (!area && raw.elements.length > 3000)
    throw new Error(
      "OSM file exceeds 3,000 elements; select a smaller extract",
    );
  const warnings = new Set<string>([
    "OSM geometry is observed map data; no traffic demand is inferred. Import OD observations or configure synthetic demand separately.",
    "Turn restrictions, detailed signal timing and junction turning geometry require manual review.",
  ]);
  const points = new Map(
    raw.elements.filter((e) => e.type === "node").map((n) => [n.id, n]),
  );
  if (points.size !== raw.elements.filter((e) => e.type === "node").length)
    throw new Error("Duplicate OSM node IDs");
  const wayIds = new Set<number>();
  let ways = raw.elements
    .filter((e) => e.type === "way")
    .filter(
      (e) =>
        Object.hasOwn(defaults, e.tags.highway) &&
        !["private", "no"].includes(e.tags.access ?? "") &&
        !["private", "no"].includes(e.tags.motor_vehicle ?? "") &&
        !["private", "no"].includes(e.tags.motorcar ?? "") &&
        !["private", "no"].includes(e.tags.vehicle ?? "") &&
        e.tags.area !== "yes",
    );
  if (area) {
    const major = new Set([
      "motorway",
      "motorway_link",
      "trunk",
      "trunk_link",
      "primary",
      "primary_link",
      "secondary",
      "secondary_link",
      "tertiary",
      "tertiary_link",
    ]);
    const selected = new Set(
      ways.filter((w) => major.has(w.tags.highway)).map((w) => w.id),
    );
    const connected = new Set(
      ways.filter((w) => selected.has(w.id)).flatMap((w) => w.nodes),
    );
    // Keep circulating arcs connected to major roads even if their own highway class is inconsistent.
    for (let changed = true; changed;) {
      changed = false;
      for (const w of ways)
        if (
          w.tags.junction === "roundabout" &&
          !selected.has(w.id) &&
          w.nodes.some((id) => connected.has(id))
        ) {
          selected.add(w.id);
          w.nodes.forEach((id) => connected.add(id));
          changed = true;
        }
    }
    const size = areaSize(area.bounds);
    ways = ways
      .filter((w) => selected.has(w.id))
      .filter((w) => {
        for (let i = 1; i < w.nodes.length; i++) {
          const a = points.get(w.nodes[i - 1]),
            b = points.get(w.nodes[i]);
          if (!a || !b)
            throw new Error(
              "OSM road is missing dependent nodes; retry the map request",
            );
          if (
            clipSegment(
              projectPoint(a.lat, a.lon, area.bounds),
              projectPoint(b.lat, b.lon, area.bounds),
              size.width,
              size.height,
              0.000001,
            )
          )
            return true;
        }
        return false;
      });
    warnings.add(
      "Only major motor roads (motorway/trunk/primary/secondary/tertiary and their links) are imported. Connected roundabout arcs are retained. Residential/service roads, alleys, cycleways and walkways are excluded.",
    );
    warnings.add(
      "Geometry-only points are stored as curved road shape, not simulation junctions. True connections, controls, boundaries and road-attribute changes are preserved.",
    );
  }
  if (!ways.length)
    throw new Error(
      area
        ? "No major motor roads found in this selection. Move the rectangle over primary, secondary or tertiary roads; local streets and paths are excluded."
        : "No supported public motor roads; export OSM ways and their nodes",
    );
  if (
    ways.reduce((sum, way) => sum + way.nodes.length - 1, 0) >
    (area ? 20000 : 1000)
  )
    throw new Error(
      "OSM extract exceeds the bounded segment budget; select a smaller corridor",
    );
  const wayLayer = (way: (typeof ways)[number]) => {
    const value =
      way.tags.layer === undefined
        ? way.tags.bridge === "yes"
          ? 1
          : way.tags.tunnel === "yes"
            ? -1
            : 0
        : Number(way.tags.layer);
    if (!Number.isInteger(value) || value < -5 || value > 5)
      throw new Error("Unsupported OSM elevation layer");
    return value;
  };
  const elevations = [...new Set([0, ...ways.map(wayLayer)])].sort(
    (a, b) => a - b,
  );
  if (elevations.length > 6)
    throw new Error("OSM extract has more than six elevation levels");
  if (elevations.length > 1)
    warnings.add(
      "Layers stay disconnected at coincident endpoints. Review and add explicit ramps between grade changes; crossing geometry never creates a junction.",
    );
  const referenced = ways.flatMap((w) =>
    w.nodes.map((id) => {
      const point = points.get(id);
      if (!point)
        throw new Error(
          "OSM way is missing a node; export with dependent nodes",
        );
      return point;
    }),
  );
  const lat0 =
    referenced.reduce((sum, n) => sum + n.lat, 0) / referenced.length;
  const lon0 =
    referenced.reduce((sum, n) => sum + n.lon, 0) / referenced.length;
  const nodes = new Map<string, RoadNode>(),
    edges: RoadEdge[] = [];
  const roundaboutEdges = new Set<string>(),
    protectedNodes = new Set<string>();
  for (const way of ways) {
    if (wayIds.has(way.id)) throw new Error("Duplicate OSM way IDs");
    wayIds.add(way.id);
    const layer = elevations.indexOf(wayLayer(way));
    if (
      !["yes", "no", "-1", "1", "true", "false", "0", undefined].includes(
        way.tags.oneway,
      )
    )
      throw new Error(
        "Unsupported reversible/conditional one-way; review extract",
      );
    const direction =
      way.tags.oneway === "-1"
        ? -1
        : ["yes", "1", "true"].includes(way.tags.oneway) ||
            ((way.tags.junction === "roundabout" ||
              way.tags.highway === "motorway") &&
              way.tags.oneway === undefined)
          ? 1
          : 0;
    let kmh = defaults[way.tags.highway];
    if (way.tags.maxspeed) {
      const speed = /^(\d+(?:\.\d+)?)\s*(mph|km\/h|kph)?$/.exec(
        way.tags.maxspeed,
      );
      if (speed) kmh = Number(speed[1]) * (speed[2] === "mph" ? 1.609344 : 1);
      else
        warnings.add(
          "Unrecognized maxspeed tags use road-class defaults; review all imported speed limits.",
        );
    } else
      warnings.add(
        "Missing maxspeed tags use road-class defaults; review all imported speed limits.",
      );
    const laneCount = (value: string | undefined, fallback: number) => {
      if (value === undefined) {
        warnings.add(
          "Missing directional lane counts are inferred; review before interpreting capacity.",
        );
        return fallback;
      }
      if (!/^[1-6]$/.test(value))
        throw new Error(
          "Unsupported lane count; use an extract with one to six lanes per direction",
        );
      return Number(value);
    };
    const total = laneCount(way.tags.lanes, direction ? 1 : 2);
    const forward = laneCount(
      way.tags["lanes:forward"],
      direction ? total : Math.max(1, Math.ceil(total / 2)),
    );
    const backward = laneCount(
      way.tags["lanes:backward"],
      direction ? total : Math.max(1, Math.floor(total / 2)),
    );
    for (const id of way.nodes) {
      const n = points.get(id)!,
        key = `osm_${id}_l${layer}`;
      const x =
          (((n.lon - lon0) * Math.PI) / 180) *
          6371000 *
          Math.cos((lat0 * Math.PI) / 180),
        y = ((-(n.lat - lat0) * Math.PI) / 180) * 6371000;
      if (!area && (Math.abs(x) > 10000 || Math.abs(y) > 10000))
        throw new Error(
          "OSM extract is too large; select a smaller local area",
        );
      nodes.set(key, {
        id: key,
        ...(area ? projectPoint(n.lat, n.lon, area.bounds) : { x, y }),
        layer,
        kind: "junction",
        control: "priority",
      });
      if (n.tags.highway === "traffic_signals") {
        protectedNodes.add(key);
        warnings.add(
          "Mapped traffic signals use priority until timing is configured in the editor.",
        );
      }
    }
    for (let i = 1; i < way.nodes.length; i++) {
      const a = nodes.get(`osm_${way.nodes[i - 1]}_l${layer}`)!,
        b = nodes.get(`osm_${way.nodes[i]}_l${layer}`)!;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (!area && (a.id === b.id || distance < 1))
        throw new Error(
          "Degenerate OSM segment; simplify the extract before importing",
        );
      if (distance < 10)
        warnings.add(
          "Segments shorter than 10 m use the engine minimum operational length of 10 m.",
        );
      const road = (
        from: string,
        to: string,
        lanes: number,
        suffix: string,
      ): RoadEdge => ({
        id: `way_${way.id}_${i}_${suffix}`,
        from,
        to,
        layer,
        ramp: false,
        length: Math.max(10, distance),
        lanes,
        width: lanes * 3.5,
        speedLimit: kmh / 3.6,
        priority:
          way.tags.junction === "roundabout"
            ? 8
            : ["motorway", "trunk", "primary"].includes(way.tags.highway)
              ? 3
              : 1,
      });
      if (direction !== -1) {
        const edge = road(a.id, b.id, forward, "f");
        edges.push(edge);
        if (way.tags.junction === "roundabout") roundaboutEdges.add(edge.id);
      }
      if (direction !== 1) {
        const edge = road(b.id, a.id, direction === -1 ? total : backward, "b");
        edges.push(edge);
        if (way.tags.junction === "roundabout") roundaboutEdges.add(edge.id);
      }
    }
  }
  const rawScenario: Scenario = {
    schemaVersion: 1,
    generator: "Flux",
    name: "Imported OpenStreetMap roads",
    description:
      "© OpenStreetMap contributors — ODbL. Road geometry imported; traffic demand is not inferred.",
    nodes: [...nodes.values()],
    edges,
    demand: [],
    fleet: defaultVehicleProfiles.map((p) => ({ ...p })),
    duration: 300,
    seed: 42,
    maxVehicles: 3000,
  };
  warnings.add(
    "Vehicle profiles use named references and uncalibrated model settings. The initial 100% car mix is synthetic, not a surveyed local fleet.",
  );
  if (area) {
    // Real OSM geometry can contain sub-metre shape points. Collapse only connected,
    // same-layer points before clipping, rather than inventing connections at crossings.
    const parent = new Map<string, string>();
    const root = (id: string): string => {
      let current = id;
      while (parent.has(current)) current = parent.get(current)!;
      return current;
    };
    for (const e of edges) {
      const a = nodes.get(e.from)!,
        b = nodes.get(e.to)!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1) {
        const from = root(e.from),
          to = root(e.to);
        const fromPoint = nodes.get(from)!,
          toPoint = nodes.get(to)!;
        if (
          from !== to &&
          Math.hypot(fromPoint.x - toPoint.x, fromPoint.y - toPoint.y) < 1
        )
          parent.set(to, from);
      }
    }
    if (parent.size) {
      warnings.add(
        "Connected sub-metre shape points are collapsed to meet the engine's 1 m endpoint separation; short remaining roads use a 10 m operational minimum.",
      );
      rawScenario.nodes = [...nodes.values()].filter(
        (n) => root(n.id) === n.id,
      );
      rawScenario.edges = edges
        .map((e) => ({ ...e, from: root(e.from), to: root(e.to) }))
        .filter((e) => e.from !== e.to);
    }
    const scenario = clipMapRoads(
      rawScenario,
      area.bounds,
      area.syntheticRate,
      { roundaboutEdges, protectedNodes },
    );
    warnings.delete(
      "OSM geometry is observed map data; no traffic demand is inferred. Import OD observations or configure synthetic demand separately.",
    );
    warnings.add(
      `Starter demand is synthetic: ${area.syntheticRate} total vehicles/hour, split evenly across reachable entries, each routed to its furthest reachable boundary exit. Edit OD demand or import observations for calibration.`,
    );
    warnings.add(
      "Terminals follow directed boundary crossings; two-way roads have separate entry and exit nodes. Internal dead ends are not exits. Isolated entries without an exit have no demand.",
    );
    warnings.add(
      "The OSM map endpoint retrieves ways with nodes in a 100 m buffer. Very sparse ways crossing the entire buffered area without a node may be absent. Inspect the road coverage before interpreting results.",
    );
    return {
      scenario,
      provenance: provenance("osm", text, meta, warnings),
      summary: `${scenario.nodes.length} nodes, ${scenario.edges.length} directed roads, ${scenario.roundabouts?.length ?? 0} roundabouts; ${scenario.nodes.filter((n) => n.kind === "source").length} sources and ${scenario.nodes.filter((n) => n.kind === "sink").length} sinks on the boundary. Synthetic demand: ${area.syntheticRate} vehicles/hour.`,
    };
  }
  const scenario = parseScenario(rawScenario);
  const network = new Network(scenario),
    ordered = [...scenario.nodes].sort((a, b) => a.x - b.x || a.y - b.y);
  let selected = false;
  for (const source of ordered) {
    const sink = [...ordered]
      .reverse()
      .find(
        (n) => n.id !== source.id && network.route(source.id, n.id)?.length,
      );
    if (sink) {
      source.kind = "source";
      sink.kind = "sink";
      selected = true;
      break;
    }
  }
  if (!selected)
    throw new Error("OSM extract contains no usable directed route");
  warnings.add(
    "One reachable source/sink pair is suggested. Set boundary roles and match observed OD identifiers before importing counts.",
  );
  return {
    scenario: parseScenario(scenario),
    provenance: provenance("osm", text, meta, warnings),
    summary: `${scenario.nodes.length} mapped nodes and ${edges.length} directed segments; zero assumed traffic counts.`,
  };
}

export function importDemand(input: unknown): ImportedData {
  const {
      text,
      metadata: meta,
      scenario: raw,
    } = demandInputSchema.parse(input),
    scenario = parseScenario(raw);
  if (Buffer.byteLength(text) > 500_000)
    throw new Error("Demand CSV exceeds 500 KB");
  const records = parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    max_record_size: 2000,
  }) as Record<string, string>[];
  if (!records.length || records.length > 1000)
    throw new Error("CSV must contain 1–1000 observed OD rows");
  const expected = [
    "count",
    "destination",
    "interval_seconds",
    "observed_at",
    "origin",
  ];
  const groups = new Map<
    string,
    {
      origin: string;
      destination: string;
      count: number;
      seconds: number;
      intervals: [number, number][];
    }
  >();
  for (const record of records) {
    if (Object.keys(record).sort().join(",") !== expected.join(","))
      throw new Error(
        "CSV columns must be origin,destination,count,interval_seconds,observed_at",
      );
    const { origin, destination } = record;
    if (
      !/^\d+$/.test(record.count) ||
      !/^\d+(?:\.\d+)?$/.test(record.interval_seconds)
    )
      throw new Error(
        "Counts must be nonnegative integers and intervals positive seconds",
      );
    const count = Number(record.count),
      seconds = Number(record.interval_seconds),
      observed = z.iso.datetime().parse(record.observed_at),
      start = Date.parse(observed);
    if (
      !Number.isSafeInteger(count) ||
      count > 1000000 ||
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      seconds > 86400
    )
      throw new Error("Observed count/interval exceeds supported bounds");
    const key = `${origin}\0${destination}`,
      group = groups.get(key) ?? {
        origin,
        destination,
        count: 0,
        seconds: 0,
        intervals: [],
      };
    const end = start + seconds * 1000;
    if (group.intervals.some(([a, b]) => start < b && end > a))
      throw new Error(
        "Overlapping observations for the same OD pair would double-count demand",
      );
    group.intervals.push([start, end]);
    group.count += count;
    group.seconds += seconds;
    groups.set(key, group);
  }
  const demand = [...groups.values()].map((g) => ({
    origin: g.origin,
    destination: g.destination,
    rate: (g.count * 3600) / g.seconds,
  }));
  const result = parseScenario({ ...scenario, demand });
  const network = new Network(result);
  for (const d of demand)
    if (!network.route(d.origin, d.destination)?.length)
      throw new Error(
        "Observed OD pair has no directed route; repair the network first",
      );
  const warnings = new Set([
    "Observed counts are converted to constant mean OD rates (count × 3600 / observed seconds); this is not time-varying replay or empirical calibration.",
    "Inputs must count origin-to-destination trips. Link/station counts alone cannot identify OD demand.",
    "Vehicle types, shares and behaviour use scenario settings; they are not inferred from these unclassified counts.",
  ]);
  return {
    scenario: result,
    provenance: provenance("observed-demand", text, meta, warnings),
    summary: `${records.length} observations normalized into ${demand.length} OD rates in vehicles/hour.`,
  };
}
