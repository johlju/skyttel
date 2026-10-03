/** Provider profiles used by the actual requests, not a client-selected denominator. */
export const textConversationModel = {
  provider: 'openai',
  model: 'gpt-5.6-terra',
  tokens: 1_050_000,
} as const;
export const voiceConversationModel = {
  provider: 'openai',
  model: 'gpt-live-1',
  tokens: 128_000,
} as const;

const tokens = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const percentage = (used: number, capacity: number) =>
  Math.max(0, Math.min(100, Math.floor((used / capacity) * 100)));

/**
 * Ephemeral occupancy, independent of billing's cumulative token/duration totals.
 * Responses input+output usage measures the latest completed request, including
 * instructions, tool schemas, cached input and generated reasoning. This is a
 * conservative snapshot until the next request because some generated tokens
 * are not retained as dialogue. It is replaced, not
 * summed across turns. Until another measurement exists, additional serialized
 * UTF-8 bytes / 3 estimate tokens (Swedish text and JSON; explicitly approximate).
 * This avoids new provider requests and retaining another copy of private text.
 * Live's official usage_ratio includes otherwise invisible audio tokens. Before
 * its first measurement, estimate the canonical dialogue with its own capacity.
 * Report the larger proportion: either model can constrain this same conversation.
 * Reset retires every measurement, so an empty conversation starts at zero.
 * Sources checked 2026-10-03:
 * https://developers.openai.com/api/docs/models/gpt-5.6-terra
 * https://developers.openai.com/api/docs/guides/live-conversations
 */
export class ConversationCapacity {
  private measuredText?: { tokens: number; bytes: number };
  private voiceSource?: string;
  private measuredVoice?: number;

  text(
    usage: { input_tokens?: unknown; output_tokens?: unknown } | null | undefined,
    bytes: number,
  ) {
    if (tokens(usage?.input_tokens) && tokens(usage?.output_tokens))
      this.measuredText = { tokens: usage.input_tokens + usage.output_tokens, bytes };
  }

  beginVoice(source: string) {
    this.voiceSource = source;
    this.measuredVoice = undefined;
  }
  voice(source: string, ratio: unknown) {
    if (
      source === this.voiceSource &&
      typeof ratio === 'number' &&
      Number.isFinite(ratio) &&
      ratio >= 0
    )
      this.measuredVoice = Math.min(1, ratio);
  }

  private textTokens(textBytes: number) {
    const measured = this.measuredText;
    return measured ? measured.tokens + Math.max(0, textBytes - measured.bytes) / 3 : textBytes / 3;
  }

  private voiceRatio(dialogueBytes: number) {
    return (
      this.measuredVoice ??
      (this.voiceSource ? dialogueBytes / 3 / voiceConversationModel.tokens : 0)
    );
  }

  needsSummary(textBytes: number, dialogueBytes: number) {
    // Live automatically replaces history above 90%; reserve one percentage
    // point for usage-event and polling latency. This is an effective limit.
    return (
      this.textTokens(textBytes) >= textConversationModel.tokens * 0.95 ||
      this.voiceRatio(dialogueBytes) >= 0.89
    );
  }

  percent(textBytes: number, dialogueBytes: number) {
    return Math.max(
      percentage(this.textTokens(textBytes), textConversationModel.tokens),
      percentage(this.voiceRatio(dialogueBytes), 1),
    );
  }

  reset() {
    this.measuredText = undefined;
    this.measuredVoice = undefined;
    this.voiceSource = undefined;
  }
}
