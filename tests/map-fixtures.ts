export const mapBounds = {
  south: 11.999,
  west: 76.999,
  north: 12.001,
  east: 77.001,
};
export const mapMetadata = {
  source: "Synthetic geometry test fixture",
  license: "Test fixture",
  capturedAt: "2026-11-07T00:00:00Z",
};
export const mapFixture: {
  elements: {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    nodes?: number[];
    tags?: Record<string, string>;
  }[];
} = {
  elements: [
    { type: "node", id: 1, lat: 12, lon: 76.998 },
    { type: "node", id: 2, lat: 12, lon: 77 },
    { type: "node", id: 3, lat: 12, lon: 77.002 },
    {
      type: "way",
      id: 10,
      nodes: [1, 2, 3],
      tags: { highway: "residential", lanes: "2", maxspeed: "30" },
    },
  ],
};
