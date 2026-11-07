import { z } from "zod";
import references from "../data/vehicle-references.json" with { type: "json" };
import trafficMix from "../data/traffic-mix.json" with { type: "json" };

export const vehicleTypeIds = [
  "car",
  "twoWheeler",
  "autoRickshaw",
  "lightCommercial",
  "bus",
  "truck",
] as const;
export type VehicleTypeId = (typeof vehicleTypeIds)[number];
export const bodyShapes = [
  "hatchback",
  "motorcycle",
  "rickshaw",
  "pickup",
  "cityBus",
  "rigidTruck",
] as const;
export type BodyShape = (typeof bodyShapes)[number];
export const bodyShapeLabels: Record<BodyShape, string> = {
  hatchback: "Hatchback",
  motorcycle: "Motorcycle",
  rickshaw: "Three-wheeler",
  pickup: "Cab and load bed",
  cityBus: "City bus",
  rigidTruck: "Rigid truck",
};
export const defaultBodyShapes: Record<VehicleTypeId, BodyShape> = {
  car: "hatchback",
  twoWheeler: "motorcycle",
  autoRickshaw: "rickshaw",
  lightCommercial: "pickup",
  bus: "cityBus",
  truck: "rigidTruck",
};
const finite = z.number().finite();
export const vehicleProfileSchema = z
  .object({
    id: z.enum(vehicleTypeIds),
    share: finite.min(0).max(100),
    length: finite.min(1).max(18),
    width: finite.min(0.5).max(3),
    maxSpeed: finite.min(2).max(70),
    acceleration: finite.min(0.2).max(5),
    deceleration: finite.min(0.5).max(6),
    emergencyDeceleration: finite.min(2).max(12),
    minGap: finite.min(0.5).max(5),
    headway: finite.min(0.3).max(3),
    bodyShape: z.enum(bodyShapes).optional(),
    referenceRevision: z.literal("2026-11-07-ref1").optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.emergencyDeceleration < p.deceleration)
      ctx.addIssue({
        code: "custom",
        path: ["emergencyDeceleration"],
        message: "Emergency braking must be at least comfortable braking",
      });
  });
export type VehicleProfile = z.infer<typeof vehicleProfileSchema>;
export const fleetSchema = z
  .array(vehicleProfileSchema)
  .min(1)
  .max(6)
  .superRefine((fleet, ctx) => {
    if (new Set(fleet.map((p) => p.id)).size !== fleet.length)
      ctx.addIssue({ code: "custom", message: "Vehicle types must be unique" });
    if (Math.abs(fleet.reduce((sum, p) => sum + p.share, 0) - 100) > 0.000001)
      ctx.addIssue({
        code: "custom",
        message: "Vehicle shares must total 100%",
      });
  });
export const vehicleLabels: Record<VehicleTypeId, string> = {
  car: "Car",
  twoWheeler: "Two-wheeler",
  autoRickshaw: "Auto-rickshaw",
  lightCommercial: "Light commercial",
  bus: "Bus",
  truck: "Truck",
};
export const vehicleColors = [
  "#65538C",
  "#247B87",
  "#B17A18",
  "#47794E",
  "#AB5366",
  "#665E50",
];
/** Educated urban-road starting assumption, not surveyed traffic or registration shares. */
export const suggestedVehicleShares: Readonly<Record<VehicleTypeId, number>> =
  trafficMix.shares;
/** OEM footprints/capabilities and explicitly classified model/proxy dynamics; not calibrated fleet averages. */
export const defaultVehicleProfiles: readonly VehicleProfile[] =
  vehicleTypeIds.map((id) => {
    const reference = references.profiles[id];
    return vehicleProfileSchema.parse({
      id,
      share: suggestedVehicleShares[id],
      length: reference.length,
      width: reference.width,
      maxSpeed: reference.maxSpeedKmh / 3.6,
      acceleration: reference.acceleration,
      deceleration: 2,
      emergencyDeceleration: id === "car" || id === "twoWheeler" ? 8 : 7,
      minGap:
        id === "twoWheeler"
          ? 1
          : id === "autoRickshaw"
            ? 1.5
            : id === "bus" || id === "truck"
              ? 2.5
              : 2,
      headway:
        id === "car"
          ? 1.5
          : id === "twoWheeler"
            ? 1
            : id === "autoRickshaw"
              ? 1.2
              : id === "lightCommercial"
                ? 1.4
                : id === "bus"
                  ? 1.8
                  : 1.7,
      bodyShape: reference.bodyShape,
      referenceRevision: references.revision,
    });
  });
export function profileMatchesReference(profile: VehicleProfile): boolean {
  const reference = defaultVehicleProfiles.find((p) => p.id === profile.id)!;
  return (
    profile.referenceRevision === references.revision &&
    (Object.keys(reference) as (keyof VehicleProfile)[])
      .filter((key) => key !== "share")
      .every((key) => profile[key] === reference[key])
  );
}
export function fleetSummary(fleet?: VehicleProfile[]): string {
  return fleet
    ? fleet
        .filter((p) => p.share > 0)
        .map((p) => `${vehicleLabels[p.id]} ${Number(p.share.toFixed(2))}%`)
        .join(" · ")
    : "Cars (default)";
}
/** First nine fields retain their meanings; tail fields are length, width, type and body-shape indices. */
export const SNAPSHOT_STRIDE = 13;
