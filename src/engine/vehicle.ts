import type { Arrival } from "./demand";
import type { VehicleProfile } from "../model/vehicles";

export interface Vehicle extends Arrival {
  edge: string;
  lane: number;
  position: number;
  speed: number;
  acceleration: number;
  route: string[];
  routeIndex: number;
  waiting: number;
  entryTime: number;
  status: "moving";
  laneChangeAt: number;
}
export const DT = 1 / 30;
export const MIN_GAP = 2;
export function idmAcceleration(
  speed: number,
  desired: number,
  gap = Infinity,
  leaderSpeed = speed,
  profile?: VehicleProfile,
): number {
  const a = profile?.acceleration ?? 1.5,
    b = profile?.deceleration ?? 2,
    headway = profile?.headway ?? 1.2;
  const desiredGap =
    (profile?.minGap ?? MIN_GAP) +
    Math.max(
      0,
      speed * headway +
        (speed * (speed - leaderSpeed)) / (2 * Math.sqrt(a * b)),
    );
  return Math.max(
    -(profile?.emergencyDeceleration ?? 8),
    Math.min(
      a,
      a *
        (1 - (speed / desired) ** 4 - (desiredGap / Math.max(0.01, gap)) ** 2),
    ),
  );
}
