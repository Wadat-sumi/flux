import { projectVehicleSprite } from "./vehicle-sprites";
import { useEffect, useRef, useState } from "react";
import type { Scenario, RoadEdge, RoadNode } from "../model/schema";
import type { Metrics } from "../engine/statistics";
import { Network } from "../engine/network";
import { signalState } from "../engine/signals";
import {
  project,
  unproject,
  segmentDistance,
  zoomAt,
  type Camera,
  type View,
} from "./camera";
import type { Selection } from "./editor";
import {
  roundaboutOutlines,
  insidePolygon,
  displayRoadWidth,
  type RoundaboutOutline,
} from "./roundabout-geometry";
import { roadPoints, pathLength, samplePath } from "../model/road-geometry";
import { SNAPSHOT_STRIDE, vehicleColors, bodyShapes } from "../model/vehicles";

export interface Frame {
  states: Float32Array;
  metrics: Metrics;
  received: number;
  playing: boolean;
}
interface Props {
  scenario: Scenario;
  frame: Frame | null;
  view: View;
  overlay: boolean;
  decor: boolean;
  labels: boolean;
  layers: number[];
  editing: boolean;
  tool: "select" | "node";
  editLayer: number;
  selection: Selection;
  fitVersion: number;
  zoomAction: number;
  onSelect: (selection: Selection) => void;
  onAddNode: (x: number, y: number) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
}
const rampColors = ["#440154", "#31688E", "#21918C", "#35B779", "#FDE725"];

const palette = {
  ground: "#D4D0DA",
  bridge: "#B2ACBE",
  car: "#716393",
  line: "#FAF8FD",
};

export function NetworkCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    propsRef = useRef(props);
  const roundaboutVisuals = useRef(new Map<string, RoundaboutOutline>());
  const camera = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const geometry = useRef({ scale: 1, cx: 0, cy: 0, centerX: 0, centerY: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    moved: boolean;
    node?: string;
    worldX?: number;
    worldY?: number;
  } | null>(null);
  const previous = useRef<Frame | null>(null),
    current = useRef<Frame | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  propsRef.current = props;
  useEffect(() => {
    previous.current = current.current;
    current.current = props.frame;
  }, [props.frame]);
  useEffect(() => {
    camera.current = { x: 0, y: 0, zoom: 1 };
  }, [props.fitVersion, props.view]);
  useEffect(() => {
    if (props.zoomAction) {
      camera.current = zoomAt(
        camera.current,
        camera.current.zoom * (props.zoomAction > 0 ? 1.2 : 1 / 1.2),
        [geometry.current.centerX, geometry.current.centerY],
      );
    }
  }, [props.zoomAction]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    let width = 1,
      height = 1,
      raf = 0,
      frameCount = 0,
      lastMeasure = performance.now();
    const resize = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      width = w;
      height = h;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    resize.observe(canvas);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cachedScenario: Scenario | null = null,
      net: Network;
    let outlines: RoundaboutOutline[] = [];
    let previousArray: Float32Array | undefined,
      previousIds = new Map<number, number>();
    const draw = (now: number) => {
      const p = propsRef.current,
        { scenario: s, view } = p;
      let spriteFaces = 0,
        sprites3d = 0;
      if (s !== cachedScenario) {
        cachedScenario = s;
        net = new Network(s);
        outlines = roundaboutOutlines(s);
        roundaboutVisuals.current = new Map(
          outlines.flatMap((r) => r.edgeIds.map((id) => [id, r] as const)),
        );
      }
      const roadWidth = (e: RoadEdge) =>
        displayRoadWidth(e, roundaboutVisuals.current.get(e.id));
      const nodeMap = new Map(s.nodes.map((n) => [n.id, n]));
      const getNode = (id: string): RoadNode => {
        const n = nodeMap.get(id)!;
        return drag.current?.node === id
          ? {
              ...n,
              x: drag.current.worldX ?? n.x,
              y: drag.current.worldY ?? n.y,
            }
          : n;
      };
      const bounds = [
        ...s.nodes.map((n) => project(n.x, n.y, n.layer, view)),
        ...s.edges.flatMap((e) =>
          (e.shape ?? []).map((n) => project(n.x, n.y, e.layer, view)),
        ),
      ];
      const xs = bounds.map((n) => n[0]),
        ys = bounds.map((n) => n[1]);
      const minX = Math.min(...xs, -60) - 75,
        maxX = Math.max(...xs, 60) + 75;
      const minY = Math.min(...ys, -60) - 65,
        maxY = Math.max(...ys, 60) + 80;
      const left = width > 1000 ? 310 : width > 720 ? 270 : 20;
      const availableW = Math.max(220, width - left - 40),
        availableH = Math.max(200, height - 250);
      const fit = Math.min(
        availableW / (maxX - minX),
        availableH / (maxY - minY),
        2,
      );
      const scale = fit * camera.current.zoom;
      const cx =
        left + availableW / 2 - ((minX + maxX) / 2) * scale + camera.current.x;
      const cy =
        95 + availableH / 2 - ((minY + maxY) / 2) * scale + camera.current.y;
      geometry.current = {
        scale,
        cx,
        cy,
        centerX: left + availableW / 2,
        centerY: 95 + availableH / 2,
      };
      const point = (x: number, y: number, layer = 0): [number, number] => {
        const [a, b] = project(x, y, layer, view);
        return [cx + a * scale, cy + b * scale];
      };
      const poly = (
        points: [number, number][],
        fill: string,
        stroke?: string,
      ) => {
        ctx.beginPath();
        points.forEach(([x, y], i) =>
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
        );
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      };
      const stroke = (
        a: [number, number],
        b: [number, number],
        color: string,
        w: number,
        dash: number[] = [],
      ) => {
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.setLineDash(dash);
        ctx.lineCap = "butt";
        ctx.stroke();
        ctx.setLineDash([]);
      };
      ctx.fillStyle = "#F1EFF4";
      ctx.fillRect(0, 0, width, height);
      if (view === "plan") {
        ctx.fillStyle = "#DAD5E2";
        const gap = 40 * scale;
        if (gap > 10)
          for (let x = ((cx % gap) + gap) % gap; x < width; x += gap)
            for (let y = ((cy % gap) + gap) % gap; y < height; y += gap) {
              ctx.beginPath();
              ctx.arc(x, y, 0.7, 0, Math.PI * 2);
              ctx.fill();
            }
      }
      if (s.nodes.length && view === "iso" && p.decor) {
        const ax = Math.min(...s.nodes.map((n) => n.x)),
          bx = Math.max(...s.nodes.map((n) => n.x));
        const ay = Math.min(...s.nodes.map((n) => n.y)),
          by = Math.max(...s.nodes.map((n) => n.y));
        const extent = Math.max(300, bx - ax, by - ay),
          cell = extent / 6,
          mx = (ax + bx) / 2,
          my = (ay + by) / 2;
        poly(
          [
            point(mx - extent * 0.62, my - extent * 0.54),
            point(mx + extent * 0.62, my - extent * 0.54),
            point(mx + extent * 0.62, my + extent * 0.54),
            point(mx - extent * 0.62, my + extent * 0.54),
          ],
          "#EAE7EE",
        );
        let count = 0;
        for (let ix = -2; ix <= 2; ix++)
          for (let iy = -2; iy <= 2; iy++) {
            const x = mx + ix * cell - cell * 0.3,
              y = my + iy * cell - cell * 0.3,
              size = cell * 0.6;
            if (
              outlines.some((r) =>
                insidePolygon({ x: x + size / 2, y: y + size / 2 }, r.points),
              )
            )
              continue;
            if (
              s.edges.some((e) => {
                const a = nodeMap.get(e.from)!,
                  b = nodeMap.get(e.to)!;
                return (
                  segmentDistance(
                    x + size / 2,
                    y + size / 2,
                    a.x,
                    a.y,
                    b.x,
                    b.y,
                  ) <
                  size * 0.8 + 30
                );
              })
            )
              continue;
            if (count++ > 14) continue;
            const footprint = [
              point(x, y),
              point(x + size, y),
              point(x + size, y + size),
              point(x, y + size),
            ];
            const h = (24 + ((ix * 17 + iy * 11 + 80) % 35)) * scale;
            const top = footprint.map(
              ([px, py]) => [px, py - h] as [number, number],
            );
            poly(
              footprint.map(([px, py]) => [px + 8 * scale, py + 6 * scale]),
              "#DDD8E5",
            );
            poly([footprint[1], footprint[2], top[2], top[1]], "#D7D2DE");
            poly([footprint[3], footprint[2], top[2], top[3]], "#E2DDE8");
            poly(top, "#FCFAFD", "#E8E3EC");
          }
      }
      for (const r of outlines)
        if (p.layers.includes(r.layer))
          poly(
            r.points.map((n) => point(n.x, n.y, r.layer)),
            "#E2E8CF",
            "#7C8A58",
          );
      const visible = (e: RoadEdge) =>
        p.layers.includes(nodeMap.get(e.from)!.layer) ||
        p.layers.includes(nodeMap.get(e.to)!.layer);
      const sorted = s.edges
        .filter(visible)
        .slice()
        .sort(
          (a, b) =>
            Math.max(nodeMap.get(a.from)!.layer, nodeMap.get(a.to)!.layer) -
            Math.max(nodeMap.get(b.from)!.layer, nodeMap.get(b.to)!.layer),
        );
      const metrics = new Map(
        (current.current?.metrics.edges ?? []).map((e) => [e.id, e]),
      );
      const states = current.current?.states ?? new Float32Array();
      if (previous.current?.states !== previousArray) {
        previousArray = previous.current?.states;
        previousIds = new Map();
        if (previousArray)
          for (let i = 0; i < previousArray.length; i += SNAPSHOT_STRIDE)
            previousIds.set(previousArray[i], i);
      }
      const alpha =
        current.current?.playing && !reduced.matches
          ? Math.min(
              1,
              Math.max(0, (now - current.current.received) / (1000 / 30)),
            )
          : 1;
      const layerLabels = new Map<number, RoadEdge>();
      for (const edge of sorted) {
        const previous = layerLabels.get(edge.layer);
        if (!previous || edge.length > previous.length)
          layerLabels.set(edge.layer, edge);
      }
      const groupNodes = new Set(
        (s.roundabouts ?? []).flatMap((r) => r.nodeIds),
      );
      const selectedGroup =
        p.selection?.kind === "roundabout"
          ? s.roundabouts?.find((r) => r.id === p.selection!.id)
          : undefined;
      const strokePath = (
        points: [number, number][],
        color: string,
        w: number,
        dash: number[] = [],
      ) => {
        ctx.beginPath();
        points.forEach(([x, y], i) =>
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
        );
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.lineCap = "butt";
        ctx.lineJoin = "round";
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      for (const e of sorted) {
        const a = getNode(e.from),
          b = getNode(e.to),
          world = roadPoints(e, a, b),
          len = pathLength(world),
          w = roadWidth(e) * scale,
          elevated = a.layer > 0 || b.layer > 0;
        const screen = world.map((n, i) =>
          point(
            n.x,
            n.y,
            a.layer + ((b.layer - a.layer) * i) / (world.length - 1),
          ),
        );
        const offsetPath = (offset: number) =>
          world.map((n, i) => {
            const prev = world[Math.max(0, i - 1)],
              next = world[Math.min(world.length - 1, i + 1)],
              angle = Math.atan2(next.y - prev.y, next.x - prev.x);
            return point(
              n.x - Math.sin(angle) * offset,
              n.y + Math.cos(angle) * offset,
              a.layer + ((b.layer - a.layer) * i) / (world.length - 1),
            );
          });
        if (elevated) {
          strokePath(
            screen.map(([x, y]) => [x + 5 * scale, y + 9 * scale]),
            "#CCC6D5",
            w + 5 * scale,
          );
          if (view === "iso")
            for (const t of [0.2, 0.5, 0.8]) {
              const n = samplePath(world, t);
              stroke(
                point(n.x, n.y),
                point(n.x, n.y, a.layer + (b.layer - a.layer) * t),
                "#B8B0C3",
                4 * scale,
              );
            }
        }
        if (
          (p.selection?.kind === "edge" && p.selection.id === e.id) ||
          selectedGroup?.edgeIds.includes(e.id)
        )
          strokePath(screen, "#6554A4", w + 7);
        const roundabout = roundaboutVisuals.current.get(e.id);
        if (roundabout)
          strokePath(screen, "#79668E", w + Math.max(1.5, 2 * scale));
        strokePath(
          screen,
          roundabout ? "#B8ABC8" : elevated ? palette.bridge : palette.ground,
          w,
        );
        for (let lane = 1; lane < e.lanes; lane++)
          strokePath(
            offsetPath((lane / e.lanes - 0.5) * roadWidth(e)),
            palette.line,
            Math.max(0.8, scale),
            [9 * scale, 12 * scale],
          );
        if (e.lanes === 1)
          strokePath(screen, palette.line, Math.max(0.6, scale * 0.7), [
            8 * scale,
            14 * scale,
          ]);
        if (p.overlay) {
          const ratio = metrics.get(e.id)?.speedRatio ?? 1,
            color = rampColors[Math.min(4, Math.floor(ratio * 4))];
          strokePath(
            screen.map(([x, y]) => [x, y + w * 0.33]),
            color,
            Math.max(3, scale * 3),
          );
        }
        const arrow = samplePath(world, 0.72),
          ap = point(arrow.x, arrow.y, a.layer + (b.layer - a.layer) * 0.72),
          arrowNext = point(
            arrow.x + Math.cos(arrow.angle),
            arrow.y + Math.sin(arrow.angle),
            a.layer + (b.layer - a.layer) * 0.72,
          );
        ctx.save();
        ctx.translate(...ap);
        ctx.rotate(Math.atan2(arrowNext[1] - ap[1], arrowNext[0] - ap[0]));
        ctx.strokeStyle = roundabout ? "#514064" : "#FBF9FD";
        ctx.lineWidth = roundabout ? 1.8 : 1.3;
        ctx.beginPath();
        ctx.moveTo(-4, -3);
        ctx.lineTo(0, 0);
        ctx.lineTo(-4, 3);
        ctx.stroke();
        ctx.restore();
        const edgeIndex = s.edges.indexOf(e);
        const edgeVehicles: number[] = [];
        for (let i = 0; i < states.length; i += SNAPSHOT_STRIDE)
          if (states[i + 1] === edgeIndex) edgeVehicles.push(i);
        // Painter order within a road follows camera depth, independent of arrival/ID order.
        if (view === "iso")
          edgeVehicles.sort(
            (a, b) =>
              states[a + 5] + states[a + 6] - states[b + 5] - states[b + 6],
          );
        for (const i of edgeVehicles) {
          let pos = states[i + 3];
          const old = previousIds.get(states[i]);
          if (old !== undefined && previousArray?.[old + 1] === edgeIndex)
            pos =
              previousArray[old + 3] + (pos - previousArray[old + 3]) * alpha;
          const physicalLength = states[i + 9],
            physicalWidth = states[i + 10],
            typeIndex = states[i + 11];
          const t = Math.max(
              0,
              Math.min(1, (pos - physicalLength / 2) / e.length),
            ),
            n = samplePath(world, t),
            offset = ((states[i + 2] + 0.5) / e.lanes - 0.5) * roadWidth(e),
            ux = Math.cos(n.angle),
            uy = Math.sin(n.angle),
            nx = -uy,
            ny = ux,
            x = n.x + nx * offset,
            y = n.y + ny * offset,
            l = a.layer + (b.layer - a.layer) * t,
            carLength = Math.min(
              physicalLength,
              (len / e.length) * physicalLength,
              roundabout ? roundabout.clearance * 0.5 : Infinity,
            ),
            carWidth = Math.min(
              physicalWidth * (carLength / physicalLength),
              (roadWidth(e) / e.lanes) * 0.85,
            );
          const shape = bodyShapes[states[i + 12]] ?? "hatchback";
          const centre = point(x, y, l),
            radius = (carLength + carWidth + 4) * scale;
          if (
            centre[0] + radius < 0 ||
            centre[0] - radius > width ||
            centre[1] + radius < 0 ||
            centre[1] - radius > height
          )
            continue;
          const detail =
            carLength * scale >= 12 && states.length < SNAPSHOT_STRIDE * 1000;
          const faces = projectVehicleSprite(
            shape,
            {
              length: carLength,
              width: carWidth,
              angle: n.angle,
              heightScale: Math.min(1, carLength / physicalLength),
            },
            view,
            vehicleColors[typeIndex] ?? palette.car,
            detail,
          );
          sprites3d++;
          spriteFaces += faces.filter((f) => f.material !== "shadow").length;
          for (const face of faces)
            poly(
              face.points.map(([px, py]) => [
                centre[0] + px * scale,
                centre[1] + py * scale,
              ]),
              face.fill,
            );
        }
        if (
          p.labels &&
          !p.editing &&
          scale > 0.4 &&
          !net.roundaboutEdges.has(e.id) &&
          (sorted.length <= 8 ||
            e.ramp ||
            layerLabels.get(e.layer)?.id === e.id)
        ) {
          const t = elevated ? 0.48 : 0.72,
            n = samplePath(world, t),
            [tx, ty] = point(n.x, n.y, a.layer + (b.layer - a.layer) * t),
            px = tx + 15,
            py = ty + (elevated ? -25 : 25);
          if (
            outlines.some((r) => {
              const [rx, ry] = point(r.centre.x, r.centre.y, r.layer);
              return (
                Math.abs(px + 50 - rx) < r.clearance * scale + 75 &&
                Math.abs(py - 5 - ry) < r.clearance * scale + 35
              );
            })
          )
            continue;
          ctx.font = "600 11px system-ui";
          ctx.fillStyle = "rgba(255,255,255,.94)";
          ctx.beginPath();
          ctx.roundRect(px - 9, py - 17, 118, 28, 7);
          ctx.fill();
          ctx.fillStyle = "#5F546D";
          ctx.fillText(
            e.ramp
              ? `Ramp L${a.layer} → L${b.layer}`
              : `L${a.layer} · ${elevated ? "Flyover" : "Ground"}`,
            px,
            py + 1,
          );
        }
      }
      if (p.labels)
        for (const r of outlines) {
          if (!p.layers.includes(r.layer) || r.clearance * scale * 2 < 90)
            continue;
          const [x, y] = point(r.centre.x, r.centre.y, r.layer);
          ctx.font = "600 10px system-ui";
          ctx.fillStyle = "#4F593A";
          ctx.textAlign = "center";
          ctx.fillText("ROUNDABOUT", x, y);
          ctx.textAlign = "start";
        }
      for (const n of s.nodes) {
        if (!p.layers.includes(n.layer)) continue;
        const actual = getNode(n.id),
          [x, y] = point(actual.x, actual.y, n.layer);
        if (p.editing && !groupNodes.has(n.id)) {
          ctx.beginPath();
          ctx.arc(
            x,
            y,
            p.selection?.kind === "node" && p.selection.id === n.id ? 8 : 6,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = "#FFF";
          ctx.fill();
          ctx.strokeStyle = "#6554A4";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.font = "11px system-ui";
          ctx.fillStyle = "#52475F";
          if (p.labels) ctx.fillText(`${n.id} · L${n.layer}`, x + 10, y - 10);
        } else if (p.labels && (n.kind === "source" || n.kind === "sink")) {
          ctx.font = "600 10px system-ui";
          ctx.fillStyle = n.kind === "source" ? "#247a60" : "#bb4d47";
          ctx.fillText(
            n.kind === "source" ? "SOURCE" : "SINK",
            x + 10,
            n.kind === "source" ? y - 15 : y + 17,
          );
        }
        if (n.control === "signal")
          for (const e of net.incoming.get(n.id) ?? []) {
            const from = nodeMap.get(e.from)!,
              t = 0.87;
            const approach = samplePath(roadPoints(e, from, n), t);
            const [px, py] = point(approach.x, approach.y, n.layer);
            const signal = signalState(
                net,
                e,
                current.current?.metrics.time ?? 0,
              ),
              letter =
                signal === "green" ? "G" : signal === "yellow" ? "Y" : "R";
            ctx.beginPath();
            ctx.arc(px + 12, py - 8, 7, 0, Math.PI * 2);
            ctx.fillStyle =
              signal === "green"
                ? "#39796F"
                : signal === "yellow"
                  ? "#8E6C24"
                  : "#A04C66";
            ctx.fill();
            ctx.fillStyle = "#FFF";
            ctx.font = "bold 8px system-ui";
            ctx.textAlign = "center";
            ctx.fillText(letter, px + 12, py - 5);
            ctx.textAlign = "start";
          }
      }
      frameCount++;
      if (now - lastMeasure > 1000) {
        canvas.dataset.fps = String(
          Math.round((frameCount * 1000) / (now - lastMeasure)),
        );
        frameCount = 0;
        lastMeasure = now;
      }
      canvas.dataset.labels = String(p.labels);
      canvas.dataset.vehicleRenderer = "3d-solids";
      canvas.dataset.sprites3d = String(sprites3d);
      canvas.dataset.spriteFaces = String(spriteFaces);
      canvas.dataset.roundabouts = String(s.roundabouts?.length ?? 0);
      canvas.dataset.agents = String(states.length / SNAPSHOT_STRIDE);
      canvas.dataset.vehicleTypes = JSON.stringify(
        Object.fromEntries(
          (current.current?.metrics.vehicleTypes ?? []).map((m) => [
            m.id,
            m.moving,
          ]),
        ),
      );
      canvas.dataset.time = String(current.current?.metrics.time ?? 0);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const r = canvas.getBoundingClientRect(),
        px = event.clientX - r.left,
        py = event.clientY - r.top;
      camera.current = zoomAt(
        camera.current,
        camera.current.zoom * Math.exp(-event.deltaY * 0.0015),
        [geometry.current.centerX, geometry.current.centerY],
        [px, py],
      );
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      canvas.removeEventListener("wheel", wheel);
    };
  }, []);

  const hit = (x: number, y: number): Selection => {
    const p = propsRef.current,
      { scale, cx, cy } = geometry.current;
    for (const n of p.scenario.nodes.slice().reverse()) {
      if (!p.layers.includes(n.layer)) continue;
      const [a, b] = project(n.x, n.y, n.layer, p.view);
      if (Math.hypot(x - (cx + a * scale), y - (cy + b * scale)) < 13)
        return p.scenario.roundabouts?.find((r) => r.nodeIds.includes(n.id))
          ? {
              kind: "roundabout",
              id: p.scenario.roundabouts.find((r) => r.nodeIds.includes(n.id))!
                .id,
            }
          : { kind: "node", id: n.id };
    }
    for (const r of new Set(roundaboutVisuals.current.values())) {
      if (!p.layers.includes(r.layer)) continue;
      const [wx, wy] = unproject(
        (x - cx) / scale,
        (y - cy) / scale,
        r.layer,
        p.view,
      );
      if (insidePolygon({ x: wx, y: wy }, r.points))
        return { kind: "roundabout", id: r.id };
    }
    for (const e of p.scenario.edges.slice().reverse()) {
      const a = p.scenario.nodes.find((n) => n.id === e.from)!,
        b = p.scenario.nodes.find((n) => n.id === e.to)!;
      if (!p.layers.includes(a.layer) && !p.layers.includes(b.layer)) continue;
      const points = roadPoints(e, a, b).map((n, i, all) =>
        project(
          n.x,
          n.y,
          a.layer + ((b.layer - a.layer) * i) / (all.length - 1),
          p.view,
        ),
      );
      for (let i = 1; i < points.length; i++)
        if (
          segmentDistance(
            x,
            y,
            cx + points[i - 1][0] * scale,
            cy + points[i - 1][1] * scale,
            cx + points[i][0] * scale,
            cy + points[i][1] * scale,
          ) <
          Math.max(
            10,
            displayRoadWidth(e, roundaboutVisuals.current.get(e.id)) *
              scale *
              0.45,
          )
        ) {
          const roundabout = p.scenario.roundabouts?.find((r) =>
            r.edgeIds.includes(e.id),
          );
          return roundabout
            ? { kind: "roundabout", id: roundabout.id }
            : { kind: "edge", id: e.id };
        }
    }
    return null;
  };
  return (
    <>
      <canvas
        ref={canvasRef}
        className={`network-canvas ${props.editing && props.tool === "node" ? "crosshair" : ""}`}
        aria-label="Traffic network canvas. Use the Network forms and road list for keyboard editing."
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            props.onSelect(null);
            camera.current = { x: 0, y: 0, zoom: 1 };
          }
        }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect(),
            x = e.clientX - r.left,
            y = e.clientY - r.top;
          if (props.editing && props.tool === "node") {
            const { scale, cx, cy } = geometry.current;
            const [wx, wy] = unproject(
              (x - cx) / scale,
              (y - cy) / scale,
              props.editLayer,
              props.view,
            );
            props.onAddNode(Math.round(wx), Math.round(wy));
            return;
          }
          const selected = hit(x, y);
          props.onSelect(selected);
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x,
            y,
            moved: false,
            node:
              props.editing && selected?.kind === "node"
                ? selected.id
                : undefined,
          };
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect(),
            x = e.clientX - r.left,
            y = e.clientY - r.top;
          if (!drag.current) {
            const selected = hit(x, y);
            setHover(
              selected
                ? `${selected.kind === "edge" ? "Road" : selected.kind === "roundabout" ? "Roundabout" : "Node"} · ${selected.id}`
                : null,
            );
            return;
          }
          const d = drag.current;
          if (Math.hypot(x - d.x, y - d.y) > 2) d.moved = true;
          if (d.node) {
            const n = props.scenario.nodes.find((n) => n.id === d.node)!,
              { scale, cx, cy } = geometry.current;
            [d.worldX, d.worldY] = unproject(
              (x - cx) / scale,
              (y - cy) / scale,
              n.layer,
              props.view,
            );
          } else {
            camera.current.x += x - d.x;
            camera.current.y += y - d.y;
            d.x = x;
            d.y = y;
          }
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (
            d?.node &&
            d.moved &&
            d.worldX !== undefined &&
            d.worldY !== undefined
          )
            props.onMoveNode(
              d.node,
              Math.round(d.worldX),
              Math.round(d.worldY),
            );
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      {hover && props.labels && (
        <div className="canvas-tooltip" aria-hidden="true">
          {hover}
        </div>
      )}
    </>
  );
}
