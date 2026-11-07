import { mapFixture } from "./map-fixtures";
export function roundaboutFixture(steps = 64): typeof mapFixture {
  const elements: typeof mapFixture.elements = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i * 2 * Math.PI) / steps;
    elements.push({
      type: "node",
      id: i + 1,
      lat: 12 - Math.sin(angle) * 0.00032,
      lon: 77 + (Math.cos(angle) * 0.00032) / Math.cos((12 * Math.PI) / 180),
    });
  }
  elements.push({
    type: "way",
    id: 10,
    nodes: [...Array.from({ length: steps }, (_, i) => i + 1), 1],
    tags: {
      highway: "secondary",
      junction: "roundabout",
      lanes: "1",
      maxspeed: "30",
    },
  });
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    elements.push(
      {
        type: "node",
        id: 1000 + i,
        lat: 12 - Math.sin(angle) * 0.002,
        lon: 77 + Math.cos(angle) * 0.002,
      },
      {
        type: "way",
        id: 20 + i,
        nodes: [1000 + i, 1 + (i * steps) / 4],
        tags: { highway: "primary", lanes: "2", maxspeed: "40" },
      },
    );
  }
  return { elements };
}
