import type OpenAI from 'openai';
import type { SidebandWS } from 'openai/resources/live/sideband/ws';

export type LiveSideband = Pick<SidebandWS, 'on' | 'off' | 'send' | 'close' | 'socket'>;
export type LiveSidebandFactory = (client: OpenAI, sessionId: string) => LiveSideband;

export interface LiveUsageAttempt {
  attemptId: string;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  model: 'gpt-live-1';
  seconds: number | null;
  final: boolean;
  outcome: 'starting' | 'active' | 'closed' | 'failed' | 'interrupted';
}
export type LiveUsage = (attempt: LiveUsageAttempt) => void;
