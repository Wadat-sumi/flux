export interface EdgeMetrics { id: string; count: number; queue: number; meanSpeed: number; occupancy: number; speedRatio: number }
export interface Metrics {
  time: number; generated: number; active: number; moving: number; pending: number;
  completed: number; rejected: number; meanSpeed: number; meanTravelTime: number;
  meanWaitingTime: number; meanDelay: number; throughput: number; queue: number; edges: EdgeMetrics[];
}
export interface Sample { time: number; completed: number; throughput: number; meanTravelTime: number; meanSpeed: number; queue: number }
