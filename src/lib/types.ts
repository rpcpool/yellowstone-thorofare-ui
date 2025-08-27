export interface BenchmarkResult {
  version: string;
  with_load: boolean;
  with_accounts: boolean;
  account_owner?: string | null;
  grpc_config: GrpcConfigSummary;
  metadata: Metadata;
  endpoints: [EndpointInfo, EndpointInfo];
  endpoint1_summary: EndpointSummary;
  endpoint2_summary: EndpointSummary;
  slots: SlotComparison[];
}

export interface GrpcConfigSummary {
  connect_timeout_ms: number;
  request_timeout_ms: number;
  max_message_size: number;
  use_tls: boolean;
  http2_adaptive_window: boolean;
  initial_connection_window_size: number | null;
  initial_stream_window_size: number | null;
}

export interface Metadata {
  total_slots_collected: number;
  common_slots: number;
  compared_slots: number;
  dropped_slots: number;
  duration_ms: number;
  benchmark_start_time: number;
  total_account_updates?: [number, number] | null;
}

export interface EndpointInfo {
  endpoint: string;
  plugin_type: string;
  plugin_version: string;
  avg_ping_ms: number;
  total_updates: number;
  unique_slots: number;
  account_updates?: number | null;
}

export interface EndpointSummary {
  first_shred_delay: Percentiles;
  processing_delay: Percentiles;
  confirmation_delay: Percentiles;
  finalization_delay: Percentiles;
  download_time: Percentiles;
  replay_time: Percentiles;
  confirmation_time: Percentiles;
  finalization_time: Percentiles;
  account_delay?: Percentiles | null;
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
  processing_delay_ms: number | null;
  confirmation_delay_ms: number | null;
  finalization_delay_ms: number | null;
  transitions: Transition[];
  durations: StageDurations;
  account_updates: AccountUpdateDetail[];
}

export interface AccountUpdateDetail {
  pubkey: string;
  write_version: number;
  tx_signature: string;
  delay_ms: number | null;
  timestamp: number;
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
