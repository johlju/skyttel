import type { TextAssistantView } from './text-assistant.js';
import type { VoiceErrorGroup } from './voice-error.js';

export interface VoiceAssistantView {
  id: string;
  phase: 'connecting' | 'listening' | 'working' | 'recovery' | 'closing' | 'closed' | 'error';
  error?: string;
  errorGroup?: VoiceErrorGroup;
  diagnosticId?: string;
  seconds: number | null;
  /** No delegated work or incomplete utterance will be canceled by a context handoff. */
  summaryReady?: boolean;
  usageFinal: boolean;
  /** Ephemeral typed reply handoffs; OFF completions are consumed without speech. */
  replyDelivery?: { id: string; voiced: boolean }[];
  /** The checked result handed to the voice, not evidence that its audio was heard. */
  response?: {
    id: string;
    revision: number;
    text: string;
    questionPending: boolean;
    receiptOperationId?: string;
  };
}

export interface VoiceAssistantResponse {
  voice: VoiceAssistantView;
  assistant: TextAssistantView;
  sdp?: string;
}
