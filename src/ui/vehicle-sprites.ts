import type { BodyShape } from "../model/vehicles";
import { project, type View } from "./camera";
import { vehicleGlyphs, type GlyphPoint } from "./vehicle-shapes";

type Point3 = readonly [number, number, number];
type Material =
  "paint" | "glass" | "tyre" | "metal" | "cargo" | "canopy" | "lamp";
interface Face {
  points: readonly Point3[];
  normal: Point3;
  material: Material;
  detail: boolean;
  wheel?: boolean;
}
export interface SpritePolygon {
  points: [number, number][];
  fill: string;
  material: Material | "shadow";
  depth: number;
  pass: 0 | 1 | 2;
}
export interface SpritePose {
  length: number;
  width: number;
  angle: number;
  heightScale?: number;
}
const rectangle = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): GlyphPoint[] => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
];
function face(
  points: readonly Point3[],
  material: Material,
  detail = false,
): Face {
  const [a, b, c] = points;
  const u = b.map((v, i) => v - a[i]),
    v = c.map((n, i) => n - a[i]);
  return {
    points,
    material,
    detail,
    normal: [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ],
  };
}
function prism(
  outline: readonly GlyphPoint[],
  bottom: number,
  top: number,
  material: Material = "paint",
  detail = false,
  upper = outline,
  side = material,
): Face[] {
  const lower = outline.map(([x, y]): Point3 => [x, y, bottom]);
  const roof = upper.map(([x, y]): Point3 => [x, y, top]);
  return [
    ...outline.map((_, i) =>
      face(
        [
          lower[i],
          lower[(i + 1) % outline.length],
          roof[(i + 1) % outline.length],
          roof[i],
        ],
        side,
        detail,
      ),
    ),
    face(roof, material, detail),
  ];
}
function box(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bottom: number,
  top: number,
  material: Material = "paint",
  detail = false,
) {
  return prism(rectangle(x1, y1, x2, y2), bottom, top, material, detail);
}
function wheel(
  x: number,
  y: number,
  rx: number,
  rz: number,
  halfWidth = 0.045,
): Face[] {
  const ring = (side: number, factor = 1): Point3[] =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return [
        x + rx * factor * Math.cos(a),
        side,
        rz + rz * factor * Math.sin(a),
      ];
    });
  const a = ring(y - halfWidth),
    b = ring(y + halfWidth);
  return [
    face(a, "tyre", true),
    face([...b].reverse(), "tyre", true),
    ...a.map((p, i) =>
      face([p, b[i], b[(i + 1) % 8], a[(i + 1) % 8]], "tyre", true),
    ),
    face(ring(y - halfWidth - 0.001, 0.48), "metal", true),
    face(ring(y + halfWidth + 0.001, 0.48).reverse(), "metal", true),
  ].map((f) => ({ ...f, wheel: true }));
}
const fourWheels = (front: number, rear: number, rx: number, rz: number) =>
  [front, rear].flatMap((x) =>
    [-0.45, 0.45].flatMap((y) => wheel(x, y, rx, rz)),
  );
const outline = (shape: BodyShape) =>
  vehicleGlyphs[shape].find((g) => g.role === "body")!.points;
const sideGlass = (
  x1: number,
  x2: number,
  y: number,
  z1: number,
  z2: number,
  detail = false,
) =>
  face(
    y > 0
      ? [
          [x2, y, z1],
          [x1, y, z1],
          [x1, y, z2],
          [x2, y, z2],
        ]
      : [
          [x1, y, z1],
          [x2, y, z1],
          [x2, y, z2],
          [x1, y, z2],
        ],
    "glass",
    detail,
  );

/** Original low-poly solids. x/y are normalized to the footprint; z is schematic visual metres.
 * Heights are presentation assumptions, never collision geometry or OEM dimensional claims. */
export const vehicleMeshes: Record<BodyShape, readonly Face[]> = {
  hatchback: [
    ...prism(outline("hatchback"), 0.24, 0.65),
    ...prism(
      rectangle(-0.34, -0.42, 0.31, 0.42),
      0.66,
      1.43,
      "paint",
      false,
      rectangle(-0.22, -0.32, 0.1, 0.32),
      "glass",
    ),
    ...fourWheels(0.3, -0.3, 0.075, 0.29),
    ...[-0.25, 0.15].flatMap((y) =>
      box(0.49, y, 0.501, y + 0.1, 0.4, 0.53, "lamp", true),
    ),
  ],
  motorcycle: [
    ...prism(
      [
        [-0.35, -0.13],
        [0.22, -0.18],
        [0.32, 0],
        [0.22, 0.18],
        [-0.35, 0.13],
      ],
      0.31,
      0.65,
    ),
    ...box(-0.28, -0.16, -0.02, 0.16, 0.66, 0.82, "tyre"),
    ...prism(
      rectangle(-0.12, -0.2, 0.12, 0.2),
      0.83,
      1.27,
      "canopy",
      false,
      rectangle(-0.07, -0.14, 0.07, 0.14),
    ),
    ...prism(
      Array.from(
        { length: 8 },
        (_, i) =>
          [
            0.1 * Math.cos((i * Math.PI) / 4),
            0.17 * Math.sin((i * Math.PI) / 4),
          ] as GlyphPoint,
      ),
      1.27,
      1.52,
      "metal",
    ),
    ...box(0.22, -0.47, 0.26, 0.47, 0.89, 0.94, "metal", true),
    ...wheel(-0.36, 0, 0.13, 0.28, 0.075),
    ...wheel(0.36, 0, 0.13, 0.28, 0.075),
  ],
  rickshaw: [
    ...prism(outline("rickshaw"), 0.29, 0.84),
    ...prism(
      rectangle(-0.46, -0.45, 0.13, 0.45),
      0.85,
      1.83,
      "canopy",
      false,
      rectangle(-0.4, -0.4, 0.08, 0.4),
    ),
    ...prism(
      [
        [-0.08, -0.38],
        [0.44, -0.12],
        [0.44, 0.12],
        [-0.08, 0.38],
      ],
      0.85,
      1.62,
      "paint",
      false,
      [
        [-0.06, -0.32],
        [0.16, -0.23],
        [0.16, 0.23],
        [-0.06, 0.32],
      ],
      "glass",
    ),
    sideGlass(-0.34, -0.03, -0.451, 1.02, 1.53),
    sideGlass(-0.34, -0.03, 0.451, 1.02, 1.53),
    ...[-0.43, 0.43].flatMap((y) => wheel(-0.3, y, 0.095, 0.25)),
    ...wheel(0.38, 0, 0.11, 0.25, 0.06),
  ],
  pickup: [
    ...prism(outline("pickup"), 0.25, 0.67),
    ...box(-0.47, -0.42, 0.08, 0.42, 0.68, 0.71, "cargo"),
    ...[-0.47, 0.4].flatMap((y) => box(-0.48, y, 0.1, y + 0.07, 0.68, 1.02)),
    ...box(-0.48, -0.4, -0.44, 0.4, 0.68, 1.02),
    ...prism(
      rectangle(0.1, -0.44, 0.47, 0.44),
      0.68,
      1.75,
      "paint",
      false,
      rectangle(0.14, -0.37, 0.33, 0.37),
      "glass",
    ),
    ...fourWheels(0.31, -0.31, 0.075, 0.3),
  ],
  cityBus: [
    ...prism(outline("cityBus"), 0.45, 2.9),
    sideGlass(-0.38, 0.36, -0.501, 1.4, 2.42),
    sideGlass(-0.38, 0.36, 0.501, 1.4, 2.42),
    face(
      [
        [0.501, -0.29, 1.25],
        [0.501, 0.29, 1.25],
        [0.501, 0.29, 2.57],
        [0.501, -0.29, 2.57],
      ],
      "glass",
    ),
    ...box(-0.25, -0.23, 0.2, 0.23, 2.91, 3.12, "metal"),
    ...[-0.24, -0.08, 0.08, 0.24].flatMap((x) =>
      [-0.502, 0.502]
        .map((y) => sideGlass(x, x + 0.014, y, 1.4, 2.42, true))
        .map((f) => ({ ...f, material: "paint" as const })),
    ),
    ...fourWheels(0.31, -0.28, 0.041, 0.48),
  ],
  rigidTruck: [
    ...prism(outline("rigidTruck"), 0.39, 0.85),
    ...box(-0.49, -0.48, 0.13, 0.48, 0.86, 2.9, "cargo"),
    ...prism(
      rectangle(0.18, -0.46, 0.49, 0.46),
      0.86,
      2.48,
      "paint",
      false,
      rectangle(0.2, -0.4, 0.44, 0.4),
    ),
    sideGlass(0.24, 0.4, -0.461, 1.45, 2.2),
    sideGlass(0.24, 0.4, 0.461, 1.45, 2.2),
    face(
      [
        [0.481, -0.32, 1.41],
        [0.481, 0.32, 1.41],
        [0.453, 0.32, 2.25],
        [0.453, -0.32, 2.25],
      ],
      "glass",
    ),
    ...fourWheels(0.32, -0.31, 0.053, 0.44),
    ...[-0.3, 0.2].flatMap((y) =>
      box(0.495, y, 0.502, y + 0.1, 0.91, 1.08, "lamp", true),
    ),
  ],
};

function tint(hex: string, brightness: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${[n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(Math.min(255, c * brightness))).join(",")})`;
}
/** Rotate solids with the road, remove back faces, light them and paint far-to-near.
 * Low detail still uses 3D body/cabin solids; wheels/trim are omitted below their useful pixel size. */
export function projectVehicleSprite(
  shape: BodyShape,
  pose: SpritePose,
  view: View,
  color: string,
  detail = true,
): SpritePolygon[] {
  const { length, width, angle, heightScale = 1 } = pose;
  if (
    ![length, width, angle, heightScale].every(Number.isFinite) ||
    length <= 0 ||
    width <= 0 ||
    heightScale <= 0
  )
    return [];
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const rotate = ([u, v, z]: Point3): [number, number, number] => [
    cos * u * length - sin * v * width,
    sin * u * length + cos * v * width,
    z * heightScale,
  ];
  const screen = ([x, y, z]: Point3): [number, number] => {
    const [px, py] = project(x, y, 0, view);
    return [px, py - (view === "iso" ? z * 0.85 : 0)];
  };
  const shadow = outline(shape).map(([x, y]) =>
    screen(rotate([x + 0.03, y + 0.06, 0])),
  );
  const result: SpritePolygon[] = [
    {
      points: shadow,
      fill: "rgba(49,39,64,0.18)",
      material: "shadow",
      depth: -Infinity,
      pass: 0,
    },
  ];
  for (const f of vehicleMeshes[shape]) {
    if (f.detail && !detail) continue;
    const nx = f.normal[0] / length,
      ny = f.normal[1] / width,
      nz = f.normal[2] / heightScale;
    const normal = [cos * nx - sin * ny, sin * nx + cos * ny, nz];
    const facing =
      view === "iso"
        ? normal[0] + normal[1] + normal[2] * (0.84 / 0.85)
        : normal[2];
    if (facing <= 1e-10) continue;
    const magnitude = Math.hypot(...normal);
    const light = Math.max(
      0,
      (-0.3 * normal[0] - 0.4 * normal[1] + 0.866 * normal[2]) / magnitude,
    );
    const material =
      f.material === "paint"
        ? color
        : f.material === "glass"
          ? "#91ACBD"
          : f.material === "tyre"
            ? "#34303D"
            : f.material === "metal"
              ? "#CFCCD5"
              : f.material === "cargo"
                ? "#B6A9BD"
                : f.material === "canopy"
                  ? "#4D465B"
                  : "#F7E1A7";
    const world = f.points.map(rotate);
    result.push({
      points: world.map(screen),
      fill: tint(material, 0.63 + 0.37 * light),
      material: f.material,
      pass: f.wheel ? 1 : 2,
      depth:
        world.reduce(
          (sum, [x, y, z]) =>
            sum + (view === "iso" ? x + y + z * (0.84 / 0.85) : z),
          0,
        ) / world.length,
    });
  }
  // Closed body panels occlude the upper tyres; no wheel-well cutouts are required.
  return result.sort((a, b) => a.pass - b.pass || a.depth - b.depth);
}
