# Flux scientific validation

Automated headless checks are in tests/engine.test.ts, supported by boundaries, integration, worker, performance and security suites. These are mechanism/invariant checks on synthetic networks, not empirical calibration against observed traffic.

| Requirement | Test and expected behavior |
|---|---|
| Empty network | Full stepping remains finite with no agents or snapshot rows. |
| Free flow | Isolated long-road vehicles with at least 35 s to accelerate approach their own desired speed within 0.1 m/s. |
| Congested bottleneck | 3-to-1 lane merge under 3,200 veh/h demand produces more than 10 queued and 40 active trips. |
| Signal obedience | Every observed edge transfer enters only on green; transitions occur and trips finish. Explicit green/yellow/all-red boundaries also tested. |
| Flyover separation | An elevated stream has identical positions/speeds with or without demand on the ground stream. No cross-layer route exists without ramps. |
| Connectivity | Disconnected demand is rejected; cyclic graphs route safely; explicit upward/downward ramps validate. |
| Vehicle safety | Sampled stressed runs maintain finite nonnegative speeds and at least 2 m longitudinal bumper gaps within each edge/lane. This does not validate swept turn geometry. |
| Conservation | Generated = Active + Completed + Rejected, including pending source vehicles and population-cap rejection. Completed observations include every scheduled arrival. |
| Reproducibility | Same seed/network reproduces exact snapshots, metrics and history. Paired topologies receive identical full spawn schedules. |
| Numerical stability | Finite packed coordinates and scalar metrics across all presets and ramp networks; zero/maximum parameter boundaries covered. |

Additional integration checks establish that the illustrative flyover completes more trips with lower completed-trip travel time than the at-grade version under the same arrivals. This is a scenario-specific directional check, not a universal claim about flyovers. Active/censored and rejected trip counts remain necessary to interpret averages.

Gridlock recovery is tested using a deliberately initialized, completely occupied cyclic state. It logs a deterministic rejection after downstream blockage exceeds 120 s. That fixture injects initial agents without demand arrivals, so the demand-driven conservation identity is deliberately not applied to that isolated recovery fixture.

Performance uses 500+ moving vehicles, not just pending source queues. Headless timing includes metrics and snapshot packing. Browser worker transport and UI rendering have separate verification requirements; passing headless timing does not prove 60 FPS drawing.
