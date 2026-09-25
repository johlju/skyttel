import type { TextAssistantView } from './text-assistant.js';

export interface VoiceAssistantView {
  id: string;
  phase: 'connecting' | 'listening' | 'working' | 'recovery' | 'closing' | 'closed' | 'error';
  error?: string;
  seconds: number | null;
  usageFinal: boolean;
}

export interface VoiceAssistantResponse {
  voice: VoiceAssistantView;
  assistant: TextAssistantView;
  sdp?: string;
}
