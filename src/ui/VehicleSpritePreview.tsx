import {
  defaultBodyShapes,
  vehicleColors,
  vehicleLabels,
  vehicleTypeIds,
  type VehicleProfile,
} from "../model/vehicles";
import { projectVehicleSprite } from "./vehicle-sprites";

export function VehicleSpritePreview({ profile }: { profile: VehicleProfile }) {
  const faces = projectVehicleSprite(
    profile.bodyShape ?? defaultBodyShapes[profile.id],
    { length: profile.length, width: profile.width, angle: 0 },
    "iso",
    vehicleColors[vehicleTypeIds.indexOf(profile.id)],
  );
  const points = faces.flatMap((f) => f.points);
  const minX = Math.min(-1, ...points.map((p) => p[0])),
    maxX = Math.max(1, ...points.map((p) => p[0]));
  const minY = Math.min(-1, ...points.map((p) => p[1])),
    maxY = Math.max(1, ...points.map((p) => p[1]));
  const pad = Math.max(0.25, (maxX - minX) * 0.08);
  return (
    <svg
      className="vehicle-footprint"
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      role="img"
      aria-label={`${vehicleLabels[profile.id]} 3D sprite preview`}
      data-faces={faces.length}
    >
      {faces.map((f, i) => (
        <polygon
          key={i}
          points={f.points.map((p) => p.join(",")).join(" ")}
          fill={f.fill}
          data-material={f.material}
        />
      ))}
    </svg>
  );
}
