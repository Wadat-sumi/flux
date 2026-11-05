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
const roadWidth = (e: RoadEdge) => Math.max(20, e.width * 2.5, e.lanes * 12);
const palette = {
  ground: "#D4D0DA",
  bridge: "#B2ACBE",
  car: "#716393",
  line: "#FAF8FD",
};

export function NetworkCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    propsRef = useRef(props);
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
    let previousArray: Float32Array | undefined,
      previousIds = new Map<number, number>();
    const draw = (now: number) => {
      const p = propsRef.current,
        { scenario: s, view } = p;
      if (s !== cachedScenario) {
        cachedScenario = s;
        net = new Network(s);
      }
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
      const bounds = s.nodes.map((n) => project(n.x, n.y, n.layer, view));
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
          for (let i = 0; i < previousArray.length; i += 9)
            previousIds.set(previousArray[i], i);
      }
      const alpha =
        current.current?.playing && !reduced.matches
          ? Math.min(
              1,
              Math.max(0, (now - current.current.received) / (1000 / 30)),
            )
          : 1;
      for (const e of sorted) {
        const a = getNode(e.from),
          b = getNode(e.to),
          pa = point(a.x, a.y, a.layer),
          pb = point(b.x, b.y, b.layer);
        const elevated = a.layer > 0 || b.layer > 0,
          w = roadWidth(e) * scale * (view === "iso" ? 0.75 : 1);
        if (elevated) {
          stroke(
            [pa[0] + 5 * scale, pa[1] + 9 * scale],
            [pb[0] + 5 * scale, pb[1] + 9 * scale],
            "#CCC6D5",
            w + 5 * scale,
          );
          if (view === "iso")
            for (const t of [0.2, 0.5, 0.8]) {
              const x = a.x + (b.x - a.x) * t,
                y = a.y + (b.y - a.y) * t,
                l = a.layer + (b.layer - a.layer) * t;
              stroke(point(x, y), point(x, y, l), "#B8B0C3", 4 * scale);
            }
        }
        if (p.selection?.kind === "edge" && p.selection.id === e.id)
          stroke(pa, pb, "#6554A4", w + 7);
        stroke(pa, pb, elevated ? palette.bridge : palette.ground, w);
        const dx = b.x - a.x,
          dy = b.y - a.y,
          len = Math.hypot(dx, dy),
          nx = -dy / len,
          ny = dx / len;
        for (let lane = 1; lane < e.lanes; lane++) {
          const offset = (lane / e.lanes - 0.5) * roadWidth(e);
          stroke(
            point(a.x + nx * offset, a.y + ny * offset, a.layer),
            point(b.x + nx * offset, b.y + ny * offset, b.layer),
            palette.line,
            Math.max(0.8, scale),
            [9 * scale, 12 * scale],
          );
        }
        if (e.lanes === 1)
          stroke(pa, pb, palette.line, Math.max(0.6, scale * 0.7), [
            8 * scale,
            14 * scale,
          ]);
        if (p.overlay) {
          const ratio = metrics.get(e.id)?.speedRatio ?? 1,
            color = rampColors[Math.min(4, Math.floor(ratio * 4))];
          stroke(
            [pa[0], pa[1] + w * 0.33],
            [pb[0], pb[1] + w * 0.33],
            color,
            Math.max(3, scale * 3),
          );
        }
        // Small directional chevron, independent of signal/congestion color.
        const angle = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
        ctx.save();
        ctx.translate(
          pa[0] + (pb[0] - pa[0]) * 0.72,
          pa[1] + (pb[1] - pa[1]) * 0.72,
        );
        ctx.rotate(angle);
        ctx.strokeStyle = "#FBF9FD";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(-4, -3);
        ctx.lineTo(0, 0);
        ctx.lineTo(-4, 3);
        ctx.stroke();
        ctx.restore();
        const edgeIndex = s.edges.indexOf(e);
        for (let i = 0; i < states.length; i += 9) {
          if (states[i + 1] !== edgeIndex) continue;
          let pos = states[i + 3];
          const old = previousIds.get(states[i]);
          if (old !== undefined && previousArray?.[old + 1] === edgeIndex)
            pos =
              previousArray[old + 3] + (pos - previousArray[old + 3]) * alpha;
          const t = Math.min(1, Math.max(0, pos / e.length)),
            lane = states[i + 2];
          const offset = ((lane + 0.5) / e.lanes - 0.5) * roadWidth(e),
            x = a.x + dx * t + nx * offset,
            y = a.y + dy * t + ny * offset,
            l = a.layer + (b.layer - a.layer) * t;
          const ux = dx / len,
            uy = dy / len,
            // Scale the glyph with the operational-to-drawn length ratio so
            // editing a road length does not make queue glyphs overlap.
            carLength = Math.min(6, (len / e.length) * 6),
            carWidth = 3.5;
          const corners = [
            [-carLength / 2, -carWidth / 2],
            [carLength / 2, -carWidth / 2],
            [carLength / 2, carWidth / 2],
            [-carLength / 2, carWidth / 2],
          ].map(([u, v]) => point(x + ux * u + nx * v, y + uy * u + ny * v, l));
          poly(corners, palette.car);
          if (carLength * scale >= 5 && states.length < 9000) {
            const [px, py] = point(x, y, l);
            ctx.fillStyle = "#C1B7D1";
            ctx.fillRect(
              px - 1.6 * scale,
              py - 1.3 * scale,
              3.2 * scale,
              2.6 * scale,
            );
          }
        }
        if (!p.editing && scale > 0.4) {
          const tagPosition = elevated ? 0.48 : 0.72;
          const px = pa[0] + (pb[0] - pa[0]) * tagPosition + 15,
            py = pa[1] + (pb[1] - pa[1]) * tagPosition + (elevated ? -25 : 25);
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
      for (const n of s.nodes) {
        if (!p.layers.includes(n.layer)) continue;
        const actual = getNode(n.id),
          [x, y] = point(actual.x, actual.y, n.layer);
        if (p.editing) {
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
          ctx.fillText(`${n.id} · L${n.layer}`, x + 10, y - 10);
        } else if (n.kind === "source" || n.kind === "sink") {
          ctx.font = "600 10px system-ui";
          ctx.fillStyle = "#71677D";
          ctx.fillText(
            n.kind === "source" ? "IN ↗" : "OUT ↗",
            x + 10,
            y - 15,
          );
        }
        if (n.control === "signal")
          for (const e of net.incoming.get(n.id) ?? []) {
            const from = nodeMap.get(e.from)!,
              t = 0.87;
            const [px, py] = point(
              from.x + (n.x - from.x) * t,
              from.y + (n.y - from.y) * t,
              n.layer,
            );
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
      canvas.dataset.agents = String(states.length / 9);
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
        return { kind: "node", id: n.id };
    }
    for (const e of p.scenario.edges.slice().reverse()) {
      const a = p.scenario.nodes.find((n) => n.id === e.from)!,
        b = p.scenario.nodes.find((n) => n.id === e.to)!;
      if (!p.layers.includes(a.layer) && !p.layers.includes(b.layer)) continue;
      const pa = project(a.x, a.y, a.layer, p.view),
        pb = project(b.x, b.y, b.layer, p.view);
      if (
        segmentDistance(
          x,
          y,
          cx + pa[0] * scale,
          cy + pa[1] * scale,
          cx + pb[0] * scale,
          cy + pb[1] * scale,
        ) < Math.max(10, roadWidth(e) * scale * 0.45)
      )
        return { kind: "edge", id: e.id };
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
                ? `${selected.kind === "edge" ? "Road" : "Node"} · ${selected.id}`
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
      {hover && (
        <div className="canvas-tooltip" aria-hidden="true">
          {hover}
        </div>
      )}
    </>
  );
}
