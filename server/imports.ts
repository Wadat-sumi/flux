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
          nodes: z.array(osmId).min(2).max(500),
          tags,
        }),
        z.object({ type: z.literal("relation"), id: osmId, tags }),
      ]),
    )
    .min(1)
    .max(3000),
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
export function importOsm(input: unknown): ImportedData {
  const { text, metadata: meta } = osmInputSchema.parse(input);
  if (Buffer.byteLength(text) > 2_000_000)
    throw new Error("OSM file exceeds 2 MB");
  const raw = osmSchema.parse(JSON.parse(text));
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
  const ways = raw.elements
    .filter((e) => e.type === "way")
    .filter(
      (e) =>
        Object.hasOwn(defaults, e.tags.highway) &&
        !["private", "no"].includes(e.tags.access ?? "") &&
        !["private", "no"].includes(e.tags.motor_vehicle ?? ""),
    );
  if (!ways.length)
    throw new Error(
      "No supported public motor roads; export OSM ways and their nodes",
    );
  if (ways.reduce((sum, way) => sum + way.nodes.length - 1, 0) > 1000)
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
      if (Math.abs(x) > 10000 || Math.abs(y) > 10000)
        throw new Error(
          "OSM extract is too large; select a smaller local area",
        );
      nodes.set(key, {
        id: key,
        x,
        y,
        layer,
        kind: "junction",
        control: "priority",
      });
      if (n.tags.highway === "traffic_signals")
        warnings.add(
          "Mapped traffic signals use priority until timing is configured in the editor.",
        );
    }
    for (let i = 1; i < way.nodes.length; i++) {
      const a = nodes.get(`osm_${way.nodes[i - 1]}_l${layer}`)!,
        b = nodes.get(`osm_${way.nodes[i]}_l${layer}`)!;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (a.id === b.id || distance < 1)
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
        priority: ["motorway", "trunk", "primary"].includes(way.tags.highway)
          ? 3
          : 1,
      });
      if (direction !== -1) edges.push(road(a.id, b.id, forward, "f"));
      if (direction !== 1)
        edges.push(road(b.id, a.id, direction === -1 ? total : backward, "b"));
    }
  }
  const scenario: Scenario = parseScenario({
    schemaVersion: 1,
    generator: "Flux",
    name: "Imported OpenStreetMap roads",
    description:
      "© OpenStreetMap contributors — ODbL. Road geometry imported; traffic demand is not inferred.",
    nodes: [...nodes.values()],
    edges,
    demand: [],
    duration: 300,
    seed: 42,
    maxVehicles: 3000,
  });
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
  ]);
  return {
    scenario: result,
    provenance: provenance("observed-demand", text, meta, warnings),
    summary: `${records.length} observations normalized into ${demand.length} OD rates in vehicles/hour.`,
  };
}
