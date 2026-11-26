type Speaker = 'user' | 'assistant';

export const voiceTranscriptGapMs = 2000;

/** Group interleaved fragments on each speaker's media timeline. */
export function voiceTranscriptBoundaries() {
  const previous: Partial<Record<Speaker, { endMs: number | undefined }>> = {};
  return {
    append(
      speaker: Speaker,
      startMs: number,
      endMs: number | undefined,
      { newUtterance = false, fallbackGapMs = 0 } = {},
    ) {
      const prior = previous[speaker];
      const priorEndMs = prior?.endMs;
      const gapMs =
        priorEndMs !== undefined && Number.isFinite(startMs) && startMs >= priorEndMs
          ? startMs - priorEndMs
          : fallbackGapMs;
      const starts = !prior || newUtterance || gapMs >= voiceTranscriptGapMs;
      // A new user turn also ends the previous assistant turn.
      if (starts && speaker === 'user') delete previous.assistant;
      previous[speaker] = { endMs };
      return starts;
    },
    reset({ preserveUser = false } = {}) {
      if (!preserveUser) delete previous.user;
      delete previous.assistant;
    },
  };
}
