import type { TextAssistantView } from './text-assistant.js';
import type { VoiceErrorGroup } from './voice-error.js';

export const unconfirmedPlaybackIdleMs = 15_000;

export const voiceSessionExpiredMessage =
  'Din inloggning har gått ut. Logga in igen. Lämna hela instruktionen på nytt. Ditt utkast och redan genomförda sparanden finns kvar.';

export interface VoiceAssistantView {
  id: string;
  phase: 'connecting' | 'listening' | 'working' | 'recovery' | 'closing' | 'closed' | 'error';
  error?: string;
  errorGroup?: VoiceErrorGroup;
  diagnosticId?: string;
  seconds: number | null;
  /** No delegated work or incomplete utterance will be canceled by a context handoff. */
  summaryReady?: boolean;
  /** Latest input fragment received on the server side of this voice connection. */
  inputVersion?: number;
  usageFinal: boolean;
  newConversationRequested?: boolean;
  /** A server rejection before work was accepted, independent of audio. */
  refusal?: { id: string; text: string };
  /** Ephemeral typed reply handoffs; OFF completions are consumed without speech. */
  replyDelivery?: { id: string; voiced: boolean }[];
  /** The checked result handed to the voice, not evidence that its audio was heard. */
  response?: {
    id: string;
    revision: number;
    text: string;
    questionPending: boolean;
    receiptOperationId?: string;
    /** Ordinary conversation words that can be paraphrased in the voice. */
    conversationalText?: string;
  };
}

export interface VoiceAssistantResponse {
  voice: VoiceAssistantView;
  assistant: TextAssistantView;
  sdp?: string;
}
