import { randomUUID } from 'node:crypto';
import { toFile } from 'openai';
import { ModelClient } from '../../src/server/model-client.js';
import type { EvaluationBudget } from './budget.js';
import type { PlaybackRecognition, PlaybackRecording } from './playback.js';

/** Supplied only after verifying the exact transcription endpoint, timestamp
 * support, usage, pricing and confidence limits. Credentials are not consent. */
export type PlaybackAssessorProfile = {
  id: string;
  model: 'whisper-1';
  language: 'sv';
  usdPerMinute: number;
  billingQuantumSeconds: number | null;
  billingMode?: 'usage-estimate';
  alignmentMarginMs: number;
  minimumAverageLogProbability: number;
  maximumNoSpeechProbability: number;
  maximumCandidates: number;
  checkedAt: string;
  sources: string[];
};

export function verifiedPlaybackAssessor(profile: PlaybackAssessorProfile) {
  if (
    !profile.id ||
    profile.model !== 'whisper-1' ||
    profile.language !== 'sv' ||
    !Number.isFinite(profile.usdPerMinute) ||
    profile.usdPerMinute <= 0 ||
    (profile.billingMode !== undefined && profile.billingMode !== 'usage-estimate') ||
    (profile.billingMode !== 'usage-estimate' &&
      (!Number.isFinite(profile.billingQuantumSeconds) ||
        profile.billingQuantumSeconds === null ||
        profile.billingQuantumSeconds <= 0)) ||
    !Number.isFinite(profile.alignmentMarginMs) ||
    profile.alignmentMarginMs < 100 ||
    !Number.isFinite(profile.minimumAverageLogProbability) ||
    profile.minimumAverageLogProbability >= 0 ||
    !Number.isFinite(profile.maximumNoSpeechProbability) ||
    profile.maximumNoSpeechProbability <= 0 ||
    profile.maximumNoSpeechProbability >= 1 ||
    !Number.isSafeInteger(profile.maximumCandidates) ||
    profile.maximumCandidates < 1 ||
    !profile.checkedAt ||
    !profile.sources.length
  )
    throw new Error('evaluation_playback_assessor_unverified');
  return profile;
}

/** No expected words or server transcript are sent to the recognizer. It sees
 * only the PCM rendered by the user-facing graph. Semantic judging follows. */
export function playbackAssessor(
  apiKey: string,
  supplied: PlaybackAssessorProfile,
  budget: EvaluationBudget,
  record: (value: unknown) => void,
  transport: typeof fetch = fetch,
) {
  const profile = verifiedPlaybackAssessor(supplied);
  const estimated = profile.billingMode === 'usage-estimate';
  if (estimated && !budget.estimatesAllowed) throw new Error('evaluation_estimate_not_authorized');
  const client = new ModelClient({
    apiKey,
    baseURL: 'https://api.openai.com/v1',
    fetch: transport,
    maxRetries: 0,
    logLevel: 'off',
  });
  return async (recording: PlaybackRecording): Promise<PlaybackRecognition> => {
    const seconds = recording.frames / recording.sampleRate;
    // In estimate mode this is an allowance, not a claimed provider billing quantum.
    const quantum = profile.billingQuantumSeconds as number;
    const billedSeconds = estimated
      ? Math.ceil(seconds / 60) * 60
      : Math.ceil(seconds / quantum) * quantum;
    const maximum = (billedSeconds * profile.usdPerMinute) / 60;
    const reservation = budget.reserve('playback_transcription', maximum);
    const callId = randomUUID();
    const startedAt = Date.now();
    let settled = false;
    let response: unknown;
    let recognition: PlaybackRecognition = {
      outcome: 'inconclusive',
      text: '',
      lastWordEndSeconds: null,
      alignmentMarginMs: profile.alignmentMarginMs,
      profile: profile.id,
      callId,
      costUsd: null,
    };
    try {
      budget.beginCall();
      const result = await client.audio.transcriptions.create({
        model: profile.model,
        language: profile.language,
        file: await toFile(recording.wav, 'rendered.wav', { type: 'audio/wav' }),
        response_format: 'verbose_json',
        timestamp_granularities: ['word', 'segment'],
      });
      response = result;
      const usage = result.usage;
      const charged =
        usage?.type === 'duration' && Number.isFinite(usage.seconds) && usage.seconds > 0
          ? ((estimated ? usage.seconds : Math.ceil(usage.seconds / quantum) * quantum) *
              profile.usdPerMinute) /
            60
          : null;
      if (estimated && charged !== null)
        budget.estimate(
          reservation,
          charged,
          'Provider-reported duration at published rate; Whisper billing rounding unresolved.',
        );
      else budget.settle(reservation, charged);
      settled = true;
      recognition = {
        ...recognition,
        text: result.text,
        costUsd: estimated ? null : charged,
        ...(estimated ? { estimatedCostUsd: charged } : {}),
      };
      const words = result.words;
      const segments = result.segments;
      const normalized = (text: string) =>
        text
          .normalize('NFC')
          .toLocaleLowerCase('sv')
          .replace(/[^\p{L}\p{N}]/gu, '');
      if (
        charged === null ||
        !Number.isFinite(result.duration) ||
        Math.abs(result.duration - seconds) > profile.alignmentMarginMs / 1000 ||
        !result.text.trim() ||
        !words?.length ||
        !segments?.length ||
        normalized(words.map((word) => word.word).join(' ')) !== normalized(result.text) ||
        words.some(
          (word) =>
            !Number.isFinite(word.start) ||
            !Number.isFinite(word.end) ||
            word.start < 0 ||
            word.end <= word.start ||
            word.end > seconds,
        ) ||
        segments.some(
          (segment) =>
            !Number.isFinite(segment.avg_logprob) ||
            segment.avg_logprob > 0 ||
            segment.avg_logprob < profile.minimumAverageLogProbability ||
            !Number.isFinite(segment.no_speech_prob) ||
            segment.no_speech_prob < 0 ||
            segment.no_speech_prob > profile.maximumNoSpeechProbability ||
            !Number.isFinite(segment.start) ||
            !Number.isFinite(segment.end) ||
            segment.start < 0 ||
            segment.end <= segment.start ||
            segment.end > seconds,
        )
      )
        recognition.reason = 'Rendered recording recognition or billing is uncertain.';
      else
        recognition = {
          ...recognition,
          outcome: 'recognized',
          lastWordEndSeconds: Math.max(...words.map((word) => word.end)),
        };
    } catch (error) {
      if (!settled) budget.settle(reservation, null);
      recognition.reason =
        error instanceof Error ? error.message : 'evaluation_playback_assessment_failed';
    } finally {
      record({
        kind: 'playback_transcription',
        callId,
        profile,
        startedAt,
        endedAt: Date.now(),
        recordingSha256: recording.sha256,
        response,
        recognition,
      });
    }
    return recognition;
  };
}
