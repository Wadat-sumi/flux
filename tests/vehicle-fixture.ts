import {
  defaultVehicleProfiles,
  type VehicleProfile,
} from "../src/model/vehicles";
export function mixedFleet(): VehicleProfile[] {
  return defaultVehicleProfiles.map((p, i) => ({
    ...p,
    share: [40, 20, 10, 10, 10, 10][i],
  }));
}
