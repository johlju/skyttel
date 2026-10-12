/** Opt-in, in-memory observation for isolated evaluation installations only.
 * Consumers own private artifact storage; normal production has no sink. */
export type AssistantObservation = {
  at: number;
  sessionId: string;
  taskId?: string;
  revision?: number;
  kind:
    | 'model_action'
    | 'mcp_started'
    | 'mcp_completed'
    | 'voice_event'
    | 'voice_commentary'
    | 'backend_request'
    | 'backend_result';
  data: unknown;
};
export type ObserveAssistant = (event: AssistantObservation) => void;
