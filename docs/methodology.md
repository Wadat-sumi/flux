# Flux methodology

All quantities are SI internally: length in metres, time in seconds, speed in m/s. Demand rates are vehicles/hour. Screen coordinates represent metres; an edge's operational length is independently editable, so straight screen geometry is illustrative.

## Demand and accounting

For each origin/destination pair a Poisson process uses exponential interarrival times `-log(1-u) * 3600 / rate`. Mulberry32 consumes only the scenario seed, demand array and observation duration when pre-generating the schedule. The same stream pre-generates each driver's desired-speed factor (uniform 0.9–1.1) and vehicle length (4.2–5.4 m). A separate seeded behavior stream sets lane-change cooldowns. No engine code reads wall clocks or global randomness. Paired experiments copy the baseline seed, demand, duration and active-agent cap to the modification. They must retain source/sink IDs.

Generated means arrivals whose scheduled time has passed. A generated trip is either moving, waiting outside a source in the spawn queue, completed, or rejected. `Active = Moving + Pending`; `Generated = Active + Completed + Rejected`. Future scheduled arrivals are not Generated. Pending trips wait until a full body plus minimum gap fits in a source lane. Unreachable trips, arrivals beyond maxVehicles and gridlock recovery trips are Rejected. The observation horizon ends at duration without draining the network: active unfinished trips remain censored and are reported alongside completed-trip averages. There is no fabricated travel time for an unfinished trip.

## Longitudinal motion

IDM acceleration is

```text
s* = s0 + max(0, vT + v(v - vleader)/(2 sqrt(ab)))
acceleration = a [1 - (v/vdesired)^4 - (s*/s)^2]
a=1.5 m/s²; b=2 m/s²; T=1.2 s; s0=2 m
```

Acceleration is clamped to [-8, 1.5] m/s². Velocity is nonnegative and bounded by the road's speed limit times the driver's desired-speed factor. Posted limits therefore represent the reference desired speed; up to 10% driver variation is explicitly modeled. Position integrates the average of old/new speed over dt=1/30 s. Vehicles update front-to-back deterministically, with a hard projection against the updated leader's rear plus s0. This safety guard changes the pure IDM at emergency/finite-step boundaries. Cars spawn at rest with their entire body in the edge. Agents are never compared across different edges merely because their screen coordinates cross.

## Lanes, routes and capacity

At source entry and each segment transfer, choose the lane with greatest available entry space (lowest lane index breaks a tie). Every lane permits every turn; turn pockets and mandatory pre-turn weaving are outside this model. Lane selection at transfer is the simplified turning rule. Once per simulated second a driver may change into an adjacent lane only if front and rear gaps exceed `max(2 m, speed*1.2 s)` and the front gap improves by at least 8 m. A 3 s cooldown limits oscillation. No lane change occurs in the last 25 m of an approach. This gap-acceptance rule is simpler than MOBIL and does not claim its full acceleration/politeness criterion.

Dijkstra uses length/speed-limit edge cost and caches routes per origin/destination in the immutable engine network. Reloading an edited scenario reconstructs the engine and invalidates the cache. Cycles are accepted. Unreachable paths terminate safely. No implicit node is created at a geometric crossing.

Lane count changes operational space and interactions. Width affects rendering only. Capacity emerges from IDM gaps, speeds, lane use, signals and reservations. No independent user capacity value is exposed. Results are sensitive to conservative junction throughput.

## Junctions, signals and elevation

A two-axis fixed-time signal groups incoming roads according to their dominant x or y direction. Both axes have the same configurable green/yellow/all-red times and offset. Yellow forbids new entries, and all-red separates groups. The same control handles a T-junction, with unused groups wasting time. It is deliberately not an arbitrary movement-phase signal planner.

Every approaching vehicle treats the junction as a stationary virtual obstacle. Once within 2.4 m of the segment end, a green approach may request a transfer. An exclusive node reservation lasts max(0.8 s, length/max(3 m/s, current speed)). Priority score `2*roadPriority + cumulativeWaiting` orders requests, with ID as final tie-break. Aging reduces starvation. Opposing nonconflicting movements still share the conservative reservation.

A transfer requires storage for the whole vehicle plus a minimum gap on the next edge; this prevents box blocking. The boundary transfer abstracts the junction path and inserts the front bumper one vehicle length into the next edge. This omits a few metres of traversal and underestimates intersection travel time. There are no explicit intersection polygons or swept-body collision checks. Lane spacing is validated longitudinally; this does not establish real-world geometric collision safety through turns.

Node and edge layers are explicit integers. Non-ramp endpoints must match the edge layer. Only a ramp joins different node layers, storing its origin layer; rendered elevation interpolates along it. Vehicles interact at the explicit shared endpoint layer, including ramp merges. Ground/flyover visual crossings without common nodes do not interact.

## Gridlock resolution

For a vehicle ready at a junction, a blocked downstream insertion starts a deterministic timer. A successful transfer clears it. After 120 s of downstream blockage, the vehicle is removed, counted as Rejected and a timestamped warning is retained. Time spent facing a red signal does not itself start the timer, but red intervals count after downstream blockage has begun. This artificial removal restores space in completely occupied cyclic networks and preserves conservation; it is not a real driver behavior. Paired results include warning counts so comparisons affected by this policy can be identified.

## Metrics

Completed-trip travel time includes source waiting. Waiting time accumulates at speed below 0.5 m/s, plus source waiting. Delay is max(0, completed travel time minus route free-flow time at that driver's desired speed). Travel/wait/delay averages use completed trips only. Mean speed averages moving agents including stopped agents; pending source trips are excluded. Queue length counts stopped moving agents plus pending agents. Edge occupancy is total vehicle body length / (edge length × lane count), not a detector occupancy. Congestion speed ratio is mean edge speed / posted limit, capped at one; empty roads use ratio one. Throughput is cumulative completed trips/hour over elapsed observation time. History samples once per simulated second. These definitions must appear in UI help/legends and exports.

## Rendering and comparative charts

Canvas uses a plan or invertible isometric transform of the same graph. Road widths, lane spacing and car glyphs are exaggerated for readability, while the engine retains the operational dimensions. Flyovers are depth-ordered above the ground; labels show L0, elevated layers and ramp endpoint transitions. Layer visibility and city context affect drawing only. Vehicle positions interpolate between transferred snapshots only when vehicle ID and edge agree; road transfers snap to the new edge. Reduced motion draws the current state directly. No rendered position is fed back into the engine.

Time-series samples are numerical observations from the worker. Paired throughput charts use a common y-axis maximum, as do paired completed-travel-time charts, and both have the same observation horizon. Numeric current values and axis maxima accompany the drawings. The comparison table reports raw changes without assuming that every increase/decrease is desirable.

## Missing observations

The numerical core uses finite zero sentinels before any trip has completed. Presentation must not treat those sentinels as measured zero-duration trips: the UI shows an em dash and omits travel-time samples until completed > 0. Exported experiment reports use null for unavailable completed-trip averages and mean speed when no on-road vehicle exists. Actual measured zeros remain numeric zero. Missing history samples keep their original time positions, rather than shifting the first completed observation to time zero.
