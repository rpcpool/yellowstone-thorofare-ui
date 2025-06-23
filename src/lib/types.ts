export interface BenchmarkResult {
  metadata: Metadata;
  endpoints: [EndpointInfo, EndpointInfo];
  endpoint1_summary: EndpointSummary;
  endpoint2_summary: EndpointSummary;
  slots: SlotComparison[];
}

export interface Metadata {
  total_slots_collected: number;
  common_slots: number;
  compared_slots: number;
  dropped_slots: number;
  duration_ms: number;
  benchmark_start_time: number;
}

export interface EndpointInfo {
  endpoint: string;
  avg_ping_ms: number;
  total_updates: number;
  unique_slots: number;
}

export interface EndpointSummary {
  first_shred_delay: Percentiles;
  download_time: Percentiles;
  replay_time: Percentiles;
  confirmation_time: Percentiles;
  finalization_time: Percentiles;
}

export interface Percentiles {
  p50: number;
  p90: number;
  p99: number;
}

export interface SlotComparison {
  slot: number;
  endpoint1: SlotDetail;
  endpoint2: SlotDetail;
}

export interface SlotDetail {
  first_shred_delay_ms: number | null;
  transitions: Transition[];
  durations: StageDurations;
}

export interface Transition {
  status: string;
  timestamp: number;
}

export interface StageDurations {
  download_ms: number;
  replay_ms: number;
  confirmation_ms: number;
  finalization_ms: number;
}
