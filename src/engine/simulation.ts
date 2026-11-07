import { parseScenario, type Scenario, type RoadEdge } from "../model/schema";
import { generateDemand, type Arrival } from "./demand";
import { Network } from "./network";
import { randomStream } from "./random";
import { signalState } from "./signals";
import { DT, MIN_GAP, idmAcceleration, type Vehicle } from "./vehicle";
import type { Metrics, Sample } from "./statistics";

type Lanes = Map<string, Vehicle[]>;
const laneKey = (edge: string, lane: number) => `${edge}:${lane}`;

export class Simulation {
  readonly scenario: Scenario;
  readonly network: Network;
  readonly schedule: Arrival[];
  readonly vehicles = new Map<number, Vehicle>();
  readonly history: Sample[] = [];
  readonly warnings: { time: number; vehicle: number; message: string }[] = [];
  private pending: Arrival[] = [];
  private arrivalIndex = 0;
  private ticks = 0;
  private completed = 0;
  private rejected = 0;
  private totalTravel = 0;
  private totalWaiting = 0;
  private totalDelay = 0;
  private readonly rng: () => number;
  private readonly reservedUntil = new Map<string, number>();
  private readonly blockedSince = new Map<number, number>();

  constructor(input: Scenario) {
    this.scenario = parseScenario(input);
    this.network = new Network(this.scenario);
    this.schedule = generateDemand(this.scenario);
    this.rng = randomStream((this.scenario.seed ^ 0xa5a5a5a5) >>> 0);
  }
  get time(): number {
    return this.ticks * DT;
  }
  get done(): boolean {
    return this.time >= this.scenario.duration;
  }
  private lanes(): Lanes {
    const lanes: Lanes = new Map();
    for (const v of this.vehicles.values()) {
      const key = laneKey(v.edge, v.lane),
        list = lanes.get(key);
      if (list) list.push(v);
      else lanes.set(key, [v]);
    }
    for (const list of lanes.values())
      list.sort((a, b) => b.position - a.position || a.id - b.id);
    return lanes;
  }
  private entryLane(
    edge: RoadEdge,
    length: number,
    lanes: Lanes,
  ): number | null {
    let best: number | null = null,
      bestGap = -Infinity;
    for (let lane = 0; lane < edge.lanes; lane++) {
      const list = lanes.get(laneKey(edge.id, lane)) ?? [],
        tail = list.at(-1);
      const gap = tail ? tail.position - tail.length : edge.length;
      if (gap >= length + MIN_GAP && gap > bestGap) {
        best = lane;
        bestGap = gap;
      }
    }
    return best;
  }
  private spawn(lanes: Lanes): void {
    while (
      this.arrivalIndex < this.schedule.length &&
      this.schedule[this.arrivalIndex].time <= this.time + 1e-9
    ) {
      const a = this.schedule[this.arrivalIndex++];
      if (this.vehicles.size + this.pending.length >= this.scenario.maxVehicles)
        this.rejected++;
      else this.pending.push(a);
    }
    const remaining: Arrival[] = [];
    for (const a of this.pending) {
      const route = this.network.route(a.origin, a.destination);
      if (!route?.length) {
        this.rejected++;
        continue;
      }
      const edge = this.network.edges.get(route[0])!,
        lane = this.entryLane(edge, a.length, lanes);
      if (lane === null) {
        remaining.push(a);
        continue;
      }
      const v: Vehicle = {
        ...a,
        edge: edge.id,
        lane,
        position: a.length,
        speed: 0,
        acceleration: 0,
        route,
        routeIndex: 0,
        waiting: this.time - a.time,
        entryTime: a.time,
        status: "moving",
        laneChangeAt: this.time + 2 + this.rng(),
      };
      this.vehicles.set(v.id, v);
      const key = laneKey(v.edge, v.lane);
      lanes.set(key, [...(lanes.get(key) ?? []), v]);
    }
    this.pending = remaining;
  }
  /** Sequential, gap-accepting lane changes. Rebuild only at 1 Hz. */
  private changeLanes(lanes: Lanes): void {
    for (const v of this.vehicles.values()) {
      const edge = this.network.edges.get(v.edge)!;
      if (
        edge.lanes < 2 ||
        this.time < v.laneChangeAt ||
        edge.length - v.position < 25
      )
        continue;
      const current = lanes.get(laneKey(v.edge, v.lane))!;
      const leader = current
        .filter((other) => other.position > v.position)
        .at(-1);
      const currentGap = leader
        ? leader.position - leader.length - v.position
        : Infinity;
      for (const lane of [v.lane - 1, v.lane + 1]) {
        if (lane < 0 || lane >= edge.lanes) continue;
        const target = lanes.get(laneKey(v.edge, lane)) ?? [];
        const ahead = target.filter((o) => o.position >= v.position).at(-1);
        const behind = target.find((o) => o.position < v.position);
        const frontGap = ahead
          ? ahead.position - ahead.length - v.position
          : Infinity;
        const rearGap = behind
          ? v.position - v.length - behind.position
          : Infinity;
        if (
          frontGap > Math.max(MIN_GAP, v.speed * 1.2) &&
          rearGap > Math.max(MIN_GAP, (behind?.speed ?? 0) * 1.2) &&
          frontGap > currentGap + 8
        ) {
          current.splice(current.indexOf(v), 1);
          v.lane = lane;
          target.push(v);
          target.sort((a, b) => b.position - a.position || a.id - b.id);
          lanes.set(laneKey(v.edge, lane), target);
          v.laneChangeAt = this.time + 3;
          break;
        }
      }
    }
  }
  step(count = 1): void {
    if (!Number.isInteger(count) || count < 1 || count > 30000)
      throw new Error("Step count must be an integer from 1 to 30000");
    for (let step = 0; step < count && !this.done; step++) {
      const lanes = this.lanes();
      if (this.ticks % 30 === 0) this.changeLanes(lanes);
      // Front-to-back movement and hard gap projection guard finite-step overlap.
      for (const list of lanes.values()) {
        for (let i = 0; i < list.length; i++) {
          const v = list[i],
            edge = this.network.edges.get(v.edge)!,
            leader = list[i - 1];
          const remaining = edge.length - v.position;
          let gap = leader
            ? leader.position - leader.length - v.position
            : Infinity;
          let leaderSpeed = leader?.speed ?? v.speed;
          // All junctions are virtual stop lines until transfer is granted.
          if (v.routeIndex < v.route.length - 1 && remaining < gap) {
            gap = remaining;
            leaderSpeed = 0;
          }
          const desired = edge.speedLimit * v.desiredFactor;
          v.acceleration = idmAcceleration(v.speed, desired, gap, leaderSpeed);
          let speed = Math.max(
            0,
            Math.min(desired, v.speed + v.acceleration * DT),
          );
          let position = v.position + (v.speed + speed) * 0.5 * DT;
          if (leader)
            position = Math.min(
              position,
              leader.position - leader.length - MIN_GAP,
            );
          position = Math.min(position, edge.length);
          position = Math.max(v.position, position);
          if (position < v.position + speed * DT * 0.5)
            speed = Math.min(speed, (position - v.position) / DT);
          v.position = position;
          v.speed = speed;
          if (speed < 0.5) v.waiting += DT;
        }
      }
      // Age offsets priority to avoid starvation; stable IDs break ties.
      const candidates = [...this.vehicles.values()].filter(
        (v) =>
          this.network.edges.get(v.edge)!.length - v.position < MIN_GAP + 0.4,
      );
      candidates.sort(
        (a, b) =>
          this.network.edges.get(b.edge)!.priority * 2 +
            b.waiting -
            (this.network.edges.get(a.edge)!.priority * 2 + a.waiting) ||
          a.id - b.id,
      );
      for (const v of candidates) {
        const edge = this.network.edges.get(v.edge)!;
        if (v.routeIndex === v.route.length - 1) {
          // Finish only at the physical end of a sink edge, not the stop threshold.
          if (v.position < edge.length - 1e-6) continue;
          this.completed++;
          const travel = this.time + DT - v.entryTime;
          const free = v.route.reduce((sum, id) => {
            const e = this.network.edges.get(id)!;
            return sum + e.length / (e.speedLimit * v.desiredFactor);
          }, 0);
          this.totalTravel += travel;
          this.totalWaiting += v.waiting;
          this.totalDelay += Math.max(0, travel - free);
          this.vehicles.delete(v.id);
          continue;
        }
        const node = this.network.nodes.get(edge.to)!;
        if (
          signalState(this.network, edge, this.time) !== "green" ||
          (this.reservedUntil.get(node.id) ?? 0) > this.time
        )
          continue;
        const next = this.network.edges.get(v.route[v.routeIndex + 1])!;
        // At a roundabout entry, circulating traffic has priority independently of wait-age ordering.
        if (
          !this.network.roundaboutEdges.has(edge.id) &&
          this.network.roundaboutEdges.has(next.id)
        ) {
          const approaching = (this.network.incoming.get(node.id) ?? []).filter(
            (e) => this.network.roundaboutEdges.has(e.id),
          );
          if (
            approaching.some((e) =>
              Array.from(
                { length: e.lanes },
                (_, lane) => lanes.get(laneKey(e.id, lane)) ?? [],
              ).some((list) =>
                list.some(
                  (car) => e.length - car.position < Math.max(8, car.speed * 3),
                ),
              ),
            )
          )
            continue;
        }
        const lane = this.entryLane(next, v.length, lanes);
        if (lane === null) {
          const since = this.blockedSince.get(v.id) ?? this.time;
          this.blockedSince.set(v.id, since);
          if (this.time - since >= 120) {
            this.vehicles.delete(v.id);
            this.blockedSince.delete(v.id);
            this.rejected++;
            const list = lanes.get(laneKey(v.edge, v.lane))!;
            list.splice(list.indexOf(v), 1);
            this.warnings.push({
              time: this.time,
              vehicle: v.id,
              message:
                "Gridlock recovery: rejected after 120 s of downstream blockage",
            });
          }
          continue;
        } // Never enter a box without downstream clearance.
        this.blockedSince.delete(v.id);
        const oldList = lanes.get(laneKey(v.edge, v.lane))!;
        oldList.splice(oldList.indexOf(v), 1);
        v.routeIndex++;
        v.edge = next.id;
        v.lane = lane;
        v.position = v.length;
        v.speed = Math.min(v.speed, next.speedLimit * v.desiredFactor);
        const key = laneKey(v.edge, v.lane);
        lanes.set(key, [...(lanes.get(key) ?? []), v]);
        this.reservedUntil.set(
          node.id,
          this.time + Math.max(0.8, v.length / Math.max(3, v.speed)),
        );
      }
      this.ticks++;
      this.spawn(this.lanes());
      if (this.ticks % 30 === 0) {
        const m = this.metrics();
        this.history.push({
          time: m.time,
          completed: m.completed,
          throughput: m.throughput,
          meanTravelTime: m.meanTravelTime,
          meanSpeed: m.meanSpeed,
          queue: m.queue,
        });
      }
    }
  }
  metrics(): Metrics {
    const moving = [...this.vehicles.values()],
      active = moving.length + this.pending.length;
    const edges = this.scenario.edges.map((e) => {
      const cars = moving.filter((v) => v.edge === e.id),
        meanSpeed = cars.length
          ? cars.reduce((s, v) => s + v.speed, 0) / cars.length
          : e.speedLimit;
      return {
        id: e.id,
        count: cars.length,
        queue: cars.filter((v) => v.speed < 0.5).length,
        meanSpeed,
        occupancy:
          cars.reduce((s, v) => s + v.length, 0) / (e.length * e.lanes),
        speedRatio: Math.min(1, meanSpeed / e.speedLimit),
      };
    });
    return {
      time: this.time,
      generated: this.arrivalIndex,
      active,
      moving: moving.length,
      pending: this.pending.length,
      completed: this.completed,
      rejected: this.rejected,
      meanSpeed: moving.length
        ? moving.reduce((s, v) => s + v.speed, 0) / moving.length
        : 0,
      meanTravelTime: this.completed ? this.totalTravel / this.completed : 0,
      meanWaitingTime: this.completed ? this.totalWaiting / this.completed : 0,
      meanDelay: this.completed ? this.totalDelay / this.completed : 0,
      throughput: this.time ? (this.completed * 3600) / this.time : 0,
      queue: this.pending.length + edges.reduce((s, e) => s + e.queue, 0),
      edges,
    };
  }
  /** [id, edgeIndex, lane, position(m), speed(m/s), x, y, angle, elevation] */
  snapshot(): Float32Array {
    const data = new Float32Array(this.vehicles.size * 9),
      indices = new Map(this.scenario.edges.map((e, i) => [e.id, i]));
    let offset = 0;
    for (const v of this.vehicles.values()) {
      const p = this.network.point(v.edge, v.position, v.lane);
      data.set(
        [
          v.id,
          indices.get(v.edge)!,
          v.lane,
          v.position,
          v.speed,
          p.x,
          p.y,
          p.angle,
          p.layer,
        ],
        offset,
      );
      offset += 9;
    }
    return data;
  }
}
