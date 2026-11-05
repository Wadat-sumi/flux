export type View = "iso" | "plan";
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
/** Preserve the anchored world point even when the fitted graph is off origin. */
export function zoomAt(
  camera: Camera,
  requestedZoom: number,
  center: [number, number],
  anchor: [number, number] = center,
): Camera {
  const zoom = Math.max(0.3, Math.min(5, requestedZoom));
  const ratio = zoom / camera.zoom;
  return {
    x: ratio * camera.x + (1 - ratio) * (anchor[0] - center[0]),
    y: ratio * camera.y + (1 - ratio) * (anchor[1] - center[1]),
    zoom,
  };
}
export function project(
  x: number,
  y: number,
  layer: number,
  view: View,
): [number, number] {
  return view === "iso"
    ? [0.82 * (x - y), 0.42 * (x + y) - layer * 28]
    : [x, y];
}
export function unproject(
  px: number,
  py: number,
  layer: number,
  view: View,
): [number, number] {
  if (view === "plan") return [px, py];
  const sum = (py + layer * 28) / 0.42,
    difference = px / 0.82;
  return [(sum + difference) / 2, (sum - difference) / 2];
}
export function segmentDistance(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax,
    dy = by - ay,
    t = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)),
    );
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
