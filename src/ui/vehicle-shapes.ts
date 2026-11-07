import type { BodyShape } from "../model/vehicles";

export type GlyphPoint = readonly [number, number];
export interface GlyphLayer {
  role: "body" | "window" | "tyre" | "roof";
  points: readonly GlyphPoint[];
}
const rect = (x1: number, y1: number, x2: number, y2: number): GlyphPoint[] => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
];
const layer = (
  role: GlyphLayer["role"],
  points: readonly GlyphPoint[],
): GlyphLayer => ({ role, points });
const wheels = (front: number, rear: number) =>
  [front, rear].flatMap((x) => [
    layer("tyre", rect(x - 0.06, -0.5, x + 0.06, -0.38)),
    layer("tyre", rect(x - 0.06, 0.38, x + 0.06, 0.5)),
  ]);
/** Original schematic silhouettes. Front is +x; all geometry stays inside the physical footprint. */
export const vehicleGlyphs: Record<BodyShape, readonly GlyphLayer[]> = {
  hatchback: [
    layer("body", [
      [-0.5, -0.35],
      [-0.42, -0.5],
      [0.28, -0.5],
      [0.5, -0.32],
      [0.5, 0.32],
      [0.28, 0.5],
      [-0.42, 0.5],
      [-0.5, 0.35],
    ]),
    ...wheels(0.28, -0.28),
    layer("window", [
      [0.12, -0.38],
      [0.3, -0.3],
      [0.3, 0.3],
      [0.12, 0.38],
    ]),
    layer("roof", rect(-0.25, -0.34, 0.1, 0.34)),
    layer("window", rect(-0.4, -0.3, -0.26, 0.3)),
  ],
  motorcycle: [
    layer("body", [
      [-0.5, -0.1],
      [-0.15, -0.18],
      [0.1, -0.28],
      [0.25, -0.5],
      [0.3, -0.5],
      [0.3, -0.12],
      [0.5, -0.1],
      [0.5, 0.1],
      [0.3, 0.12],
      [0.3, 0.5],
      [0.25, 0.5],
      [0.1, 0.28],
      [-0.15, 0.18],
      [-0.5, 0.1],
    ]),
    layer("tyre", rect(-0.5, -0.12, -0.3, 0.12)),
    layer("tyre", rect(0.33, -0.12, 0.5, 0.12)),
    layer("roof", [
      [-0.2, -0.17],
      [0, -0.24],
      [0.14, 0],
      [0, 0.24],
      [-0.2, 0.17],
    ]),
  ],
  rickshaw: [
    layer("body", [
      [-0.5, -0.45],
      [-0.4, -0.5],
      [0.1, -0.5],
      [0.5, -0.12],
      [0.5, 0.12],
      [0.1, 0.5],
      [-0.4, 0.5],
      [-0.5, 0.45],
    ]),
    layer("tyre", rect(0.36, -0.12, 0.5, 0.12)),
    ...wheels(-0.3, -0.3).slice(0, 2),
    layer("roof", rect(-0.38, -0.4, 0.02, 0.4)),
    layer("window", [
      [0.05, -0.35],
      [0.3, -0.14],
      [0.3, 0.14],
      [0.05, 0.35],
    ]),
  ],
  pickup: [
    layer("body", [
      [-0.5, -0.5],
      [0.35, -0.5],
      [0.5, -0.35],
      [0.5, 0.35],
      [0.35, 0.5],
      [-0.5, 0.5],
    ]),
    ...wheels(0.29, -0.29),
    layer("roof", rect(-0.44, -0.4, 0.07, 0.4)),
    layer("window", rect(0.24, -0.36, 0.37, 0.36)),
  ],
  cityBus: [
    layer("body", [
      [-0.5, -0.38],
      [-0.45, -0.5],
      [0.43, -0.5],
      [0.5, -0.35],
      [0.5, 0.35],
      [0.43, 0.5],
      [-0.45, 0.5],
      [-0.5, 0.38],
    ]),
    ...wheels(0.3, -0.23),
    layer("window", rect(0.37, -0.38, 0.46, 0.38)),
    ...[-0.35, -0.14, 0.07].flatMap((x) => [
      layer("window", rect(x, -0.45, x + 0.14, -0.3)),
      layer("window", rect(x, 0.3, x + 0.14, 0.45)),
    ]),
    layer("roof", rect(-0.3, -0.18, 0.25, 0.18)),
  ],
  rigidTruck: [
    layer("body", [
      [-0.5, -0.5],
      [0.34, -0.5],
      [0.5, -0.38],
      [0.5, 0.38],
      [0.34, 0.5],
      [-0.5, 0.5],
    ]),
    ...wheels(0.31, -0.25),
    layer("roof", rect(-0.46, -0.42, 0.14, 0.42)),
    layer("window", rect(0.32, -0.35, 0.43, 0.35)),
    layer("tyre", rect(0.17, -0.4, 0.2, 0.4)),
  ],
};
