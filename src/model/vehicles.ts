import { z } from "zod";

export const vehicleTypeIds = [
  "car",
  "twoWheeler",
  "autoRickshaw",
  "lightCommercial",
  "bus",
  "truck",
] as const;
export type VehicleTypeId = (typeof vehicleTypeIds)[number];
const finite = z.number().finite();
export const vehicleProfileSchema = z
  .object({
    id: z.enum(vehicleTypeIds),
    share: finite.min(0).max(100),
    length: finite.min(1).max(18),
    width: finite.min(0.5).max(3),
    maxSpeed: finite.min(2).max(45),
    acceleration: finite.min(0.2).max(5),
    deceleration: finite.min(0.5).max(6),
    emergencyDeceleration: finite.min(2).max(12),
    minGap: finite.min(0.5).max(5),
    headway: finite.min(0.3).max(3),
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
/** Illustrative engineering defaults, not observed or calibrated Indian fleet data. SI units. */
export const defaultVehicleProfiles: readonly VehicleProfile[] = [
  {
    id: "car",
    share: 100,
    length: 4.8,
    width: 1.8,
    maxSpeed: 120 / 3.6,
    acceleration: 1.5,
    deceleration: 2,
    emergencyDeceleration: 8,
    minGap: 2,
    headway: 1.2,
  },
  {
    id: "twoWheeler",
    share: 0,
    length: 2,
    width: 0.8,
    maxSpeed: 80 / 3.6,
    acceleration: 2,
    deceleration: 2.5,
    emergencyDeceleration: 8,
    minGap: 1,
    headway: 0.8,
  },
  {
    id: "autoRickshaw",
    share: 0,
    length: 2.8,
    width: 1.4,
    maxSpeed: 50 / 3.6,
    acceleration: 1.2,
    deceleration: 2,
    emergencyDeceleration: 7,
    minGap: 1.5,
    headway: 1,
  },
  {
    id: "lightCommercial",
    share: 0,
    length: 6,
    width: 2,
    maxSpeed: 25,
    acceleration: 1.2,
    deceleration: 2,
    emergencyDeceleration: 7,
    minGap: 2,
    headway: 1.4,
  },
  {
    id: "bus",
    share: 0,
    length: 12,
    width: 2.5,
    maxSpeed: 80 / 3.6,
    acceleration: 0.8,
    deceleration: 1.5,
    emergencyDeceleration: 6,
    minGap: 2.5,
    headway: 1.8,
  },
  {
    id: "truck",
    share: 0,
    length: 10,
    width: 2.5,
    maxSpeed: 80 / 3.6,
    acceleration: 0.7,
    deceleration: 1.5,
    emergencyDeceleration: 6,
    minGap: 2.5,
    headway: 2,
  },
];
export function fleetSummary(fleet?: VehicleProfile[]): string {
  return fleet
    ? fleet
        .filter((p) => p.share > 0)
        .map((p) => `${vehicleLabels[p.id]} ${Number(p.share.toFixed(2))}%`)
        .join(" · ")
    : "Cars (default)";
}
/** First nine fields retain their meanings; tail fields are physical length, width and type index. */
export const SNAPSHOT_STRIDE = 12;
