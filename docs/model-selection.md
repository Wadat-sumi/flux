# Flux model selection

Flux uses a custom TypeScript microscopic engine. Every vehicle has an identity, route, lane, front-bumper position, speed, acceleration, desired-speed factor, length, origin/destination, arrival time and accumulated waiting time. The engine has no React or browser dependency and is tested in Node.

The Intelligent Driver Model (IDM) provides interpretable speed/headway behavior and emergent queues. A fixed 1/30 s integration step is comfortably below the 0.5 s bound discussed in the [model authors' explanation](https://traffic-simulation.de/info/info_IDM.html). Finite-step safety guards, simplified lane changes and conservative intersection reservations make this an IDM-based educational model rather than an unmodified research implementation.

SUMO is a mature alternative with far richer junction, routing and validation capabilities. Its native executable/runtime would complicate a zero-server browser SPA. A cellular automaton would be simpler and efficient but quantize speed/position and require a different explanation of lane/road geometry. Flux chooses transparency and static deployment at the cost of calibration and realism. No simulator code has been copied.

React/TypeScript/Vite will provide the UI after the design gate. Canvas 2D will render the road network and agents, with SVG charts where sufficient. Runtime schema validation uses Zod; Vitest covers the scientific core and worker transport. Dependencies are pinned exactly in package.json and package-lock.json. No external charting or geometry library is necessary for the current straight-edge graph model.
