import { Tiktoken } from 'js-tiktoken/lite';
import ranks from 'js-tiktoken/ranks/o200k_base';
import type OpenAI from 'openai';
import type { InitialItem } from 'openai/resources/live/live';
import type { SidebandWS } from 'openai/resources/live/sideband/ws';

// GPT-Live allows 8,192 rendered tokens at startup. Its renderer is private.
// Estimate the text with the local o200k_base encoding and reserve 512 tokens
// overall plus eight per message for framing and encoding differences.
const initialHistoryTokens = 8_192 - 512;
const initialHistoryBytes = 64 * 1024;
const initialHistoryItems = 128;
let encoder: Tiktoken | undefined;
const limitedHistory: InitialItem = {
  role: 'developer',
  content: [
    {
      type: 'input_text',
      text: 'Bara de senaste replikerna ryms i röstkontexten. Delegera frågor om äldre uppgifter till Skyttel.',
    },
  ],
};
const limitedState: InitialItem = {
  role: 'developer',
  content: [
    {
      type: 'input_text',
      text: 'Utdraget är begränsat. Delegera frågor om pågående uppdrag, utkast, tidigare repliker och sparanden till Skyttel.',
    },
  ],
};

export type LiveHistoryRow = {
  role: 'user' | 'assistant';
  text: string;
  partial?: boolean;
};
export type LiveHandoff = { dialogue: LiveHistoryRow[]; currentState?: string };

export function boundedLiveHistory(
  history: readonly InitialItem[],
  current: InitialItem | undefined,
): InitialItem[] {
  if (!history.length && !current) return [];
  function bytes(item: InitialItem) {
    return Buffer.byteLength(JSON.stringify(item)) + 1;
  }
  function tokens(item: InitialItem) {
    encoder ??= new Tiktoken(ranks);
    return encoder.encode(item.content[0].text, [], []).length + 8;
  }
  // A large snapshot can stay entirely with the delegated backend. Its
  // current draft, waiting parts, and save operation references remain exact.
  const stateBytes = current ? bytes(current) : 0;
  const stateTokens =
    current && 2 + bytes(limitedHistory) + stateBytes <= initialHistoryBytes
      ? tokens(current)
      : Infinity;
  const preserveState = current && tokens(limitedHistory) + stateTokens <= initialHistoryTokens;
  const stateDeferred = Boolean(current && !preserveState);
  const notice = stateDeferred ? limitedState : limitedHistory;
  const state = preserveState ? current : undefined;
  let usedBytes = 2 + bytes(notice) + (state ? stateBytes : 0);
  let usedTokens = tokens(notice) + (state ? stateTokens : 0);
  const recent: InitialItem[] = [];
  for (let index = history.length - 1; index >= 0; index--) {
    const item = history[index];
    usedBytes += bytes(item);
    if (usedBytes > initialHistoryBytes || recent.length >= initialHistoryItems - (state ? 2 : 1))
      break;
    usedTokens += tokens(item);
    if (usedTokens > initialHistoryTokens) break;
    recent.push(item);
  }
  if (stateDeferred || recent.length < history.length) recent.push(notice);
  recent.reverse();
  if (state) recent.push(state);
  return recent;
}

export type LiveSideband = Pick<SidebandWS, 'on' | 'off' | 'send' | 'close' | 'socket'>;
export type LiveSidebandFactory = (client: OpenAI, sessionId: string) => LiveSideband;
export type LiveModelProfile = { provider: 'openai'; model: string; tokens: number };

export interface LiveUsageAttempt {
  attemptId: string;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  model: string;
  seconds: number | null;
  final: boolean;
  outcome: 'starting' | 'active' | 'closed' | 'failed' | 'interrupted';
}
export type LiveUsage = (attempt: LiveUsageAttempt) => void;
