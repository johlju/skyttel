export type TraceSuspension = 'quota' | 'credentials';
export type TraceDeliveryError =
  | TraceSuspension
  | 'network'
  | 'timeout'
  | 'capacity'
  | 'oversized'
  | 'expired'
  | 'export';

export interface TraceSendingStatus {
  connected: boolean;
  enabled: boolean;
  state: 'not_connected' | 'sending' | 'disabled' | 'suspended';
  suspension: TraceSuspension | null;
  lastSuccessfulDelivery: number | null;
  droppedEvents: number;
  lastError: TraceDeliveryError | null;
}
