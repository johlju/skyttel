import type { TextAssistantView } from './text-assistant.js';

export interface VoiceAssistantView {
  id: string;
  phase: 'connecting' | 'listening' | 'working' | 'recovery' | 'closing' | 'closed' | 'error';
  error?: string;
  seconds: number | null;
  usageFinal: boolean;
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
