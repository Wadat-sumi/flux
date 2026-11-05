import type { RoadEdge } from '../model/schema';
import type { Network } from './network';

export type SignalState = 'green' | 'yellow' | 'red';
/** Two alternating axis groups; yellow/all-red admit no new vehicles. */
export function signalState(network: Network, edge: RoadEdge, time: number): SignalState {
  const node = network.nodes.get(edge.to)!;
  if (node.control !== 'signal' || !node.signal) return 'green';
  const a = network.nodes.get(edge.from)!;
  const axis = Math.abs(node.x - a.x) >= Math.abs(node.y - a.y) ? 0 : 1;
  const { green, yellow, allRed, offset } = node.signal;
  const half = green + yellow + allRed, cycle = half * 2;
  const t = ((time + offset) % cycle + cycle) % cycle;
  if (Math.floor(t / half) !== axis) return 'red';
  const phase = t % half;
  return phase < green ? 'green' : phase < green + yellow ? 'yellow' : 'red';
}
