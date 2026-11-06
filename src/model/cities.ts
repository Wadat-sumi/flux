export const cities = [
  { id: "bengaluru", name: "Bengaluru", latitude: 12.9763, longitude: 77.5944 },
  { id: "mumbai", name: "Mumbai", latitude: 19.076, longitude: 72.8777 },
  { id: "chennai", name: "Chennai", latitude: 13.0827, longitude: 80.2707 },
  { id: "pune", name: "Pune", latitude: 18.5204, longitude: 73.8567 },
  { id: "hyderabad", name: "Hyderabad", latitude: 17.385, longitude: 78.4867 },
  { id: "delhi", name: "Delhi", latitude: 28.6139, longitude: 77.209 },
] as const;
export type CityId = (typeof cities)[number]["id"];
