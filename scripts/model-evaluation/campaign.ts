import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import audioManifest from './audio/manifest.json' with { type: 'json' };
import catalog from './catalog.json' with { type: 'json' };
import type { EvaluationPlan } from './evaluate.js';
import { scenarioUtterances } from './follow-ups.js';
import { judgeInstructions } from './judge.js';
import controls from './judge-controls.json' with { type: 'json' };
import type { LiveEvaluationProfile } from './live.js';
import optimization from './optimization-campaign-profiles.json' with { type: 'json' };
import type { PlaybackAssessorProfile } from './playback-assessor.js';
import { type EvaluationProfile, verifiedProfile } from './provider.js';
import { referenceSpeech } from './speech.js';
import type { Scenario } from './types.js';

export const optimizationProfiles = optimization;
export const optimizationApplicationCommits = {
  baseline: '8529cf04d6e5e1c42373bd7c14f46ca75185588c',
  candidate: '2f4dd4ad694aa0030ef2b1d6f64b00e8abacc073',
} as const;

export function optimizationBackend(id: string): EvaluationProfile {
  const profile = optimization.backendProfiles.find((value) => value.id === id);
  if (!profile) throw new Error('evaluation_campaign_profile_unknown');
  return verifiedProfile(id, profile as EvaluationProfile);
}

export function optimizationVoice(backendId: string): LiveEvaluationProfile {
  const profile = optimization.voiceProfiles.find((value) => value.backend === backendId);
  if (!profile) throw new Error('evaluation_campaign_voice_unknown');
  return profile as LiveEvaluationProfile;
}

/** Unknown billing semantics stay unrepresentable as an executable profile. */
export function optimizationPlaybackAssessor(): PlaybackAssessorProfile {
  throw new Error('evaluation_campaign_voice_billing_unresolved');
}

/** Portable preparation. A clean common evaluator revision is supplied only
 * after composition and is independently checked by evaluateModels at run time.
 * No authorization, spending ceiling or provider access is inferred here. */
export async function prepareOptimizationCampaign(options: {
  evaluatorCommit: string;
  baselineDirectory: string;
  candidateDirectory: string;
}) {
  if (!/^[a-f0-9]{40}$/.test(options.evaluatorCommit))
    throw new Error('evaluation_campaign_evaluator_required');
  const files = [
    'catalog.json',
    'everyday-source.json',
    'judge-controls.json',
    'audio/manifest.json',
    'optimization-campaign-profiles.json',
    'optimization-comparison-plan.json',
    'optimization-voice-comparison-plan.json',
    'context-limit.ts',
    'context-probe.ts',
  ];
  const sources = Object.fromEntries(
    await Promise.all(
      files.map(async (path) => {
        const bytes = await readFile(fileURLToPath(new URL(path, import.meta.url)));
        return [path, createHash('sha256').update(bytes).digest('hex')];
      }),
    ),
  );
  const utterances = new Map(
    (catalog.scenarios as Scenario[])
      .filter((scenario) => scenario.voice)
      .flatMap((scenario) => scenarioUtterances(scenario, true))
      .map((utterance) => [utterance.id, utterance.text]),
  );
  const audioVerification = await Promise.all(
    [...utterances].map(async ([id, text]) => {
      const { clip } = await referenceSpeech(id, text, 'marin');
      return {
        id,
        text,
        sha256: clip.sha256,
        frames: clip.frames,
        sampleRate: clip.sampleRate,
        format: 'PCM mono signed 16-bit',
        listeningApproval: 'review' in clip ? clip.review : audioManifest.review,
      };
    }),
  );
  return {
    format: 'skyttel-optimization-campaign-v1',
    authorized: false,
    evaluatorCommit: options.evaluatorCommit,
    sources,
    audioVerification,
    profiles: optimization,
    judgeSha256: createHash('sha256')
      .update(
        JSON.stringify({
          provider: optimization.judgeProfile.provider,
          model: optimization.judgeProfile.model,
          effort: optimization.judgeProfile.effort,
          serviceTier: optimization.judgeProfile.serviceTier,
          outputLimit: optimization.judgeProfile.maxOutputTokens,
          instructions: judgeInstructions,
          controls,
        }),
      )
      .digest('hex'),
    applicationComparison: {
      baseline: {
        id: 'original',
        commit: optimizationApplicationCommits.baseline,
        directory: options.baselineDirectory,
        conversationWorkMode: 'sequential' as const,
      },
      candidate: {
        id: 'proposed',
        commit: optimizationApplicationCommits.candidate,
        directory: options.candidateDirectory,
        conversationWorkMode: 'sequential' as const,
      },
    },
    runs: optimization.backendProfiles.flatMap((profile) =>
      (['text', 'voice'] as const).map((modality) => ({
        id: `${profile.id}-${modality}`,
        profile: profile.id,
        modality,
        status: 'not_run',
        repetitions: [1, 2, 3, 4, 5],
        order: [
          'original/proposed',
          'proposed/original',
          'original/proposed',
          'proposed/original',
          'original/proposed',
        ],
        calibrationCalls: controls.cases.length,
        blockers: [
          'explicit_payment_authorization_missing',
          ...(modality === 'voice' ? ['voice_billing_semantics_unresolved'] : []),
        ],
      })),
    ),
    clarificationPolicy: 'catalog-unique-matching-reply-once; preserve-direct-and-assisted-v1',
    counting: 'disabled; whole-context reservations',
    contextLimitSupplement: {
      status: 'not_run',
      ordinaryGrowth:
        'contextLimitFixture(2048); stop at first summary or generation increase; at most one recall',
      providerBoundary: 'bounded captured-request probe; explicit context_length_exceeded only',
      physicalVoiceBoundary:
        'unrun; ordinary summary or text-backend boundary cannot establish Live context limit',
      repetitions: 1,
      scope: 'advanced capability evidence; outside everyday percentage thresholds',
    },
    costBasis: {
      backendMaximumUsd: { 'terra-6.1-high-668': 3.265, 'sol-6.1-high-668': 6.53 },
      judgeMaximumUsd: 4.67144,
      calibrationMaximumHoldUsd: 4.67144 * controls.cases.length,
      label: `Conservative per-call/${controls.cases.length}-control holds; neither expected spending nor a user ceiling.`,
      layers: [
        'calibration',
        'backend',
        'summary',
        'content_judge',
        'voice',
        'playback_transcription',
      ],
      unknownCharge: 'retain full hold and stop; no assumed zero or retry',
    },
  };
}

export function optimizationEvaluationPlan(options: {
  campaign: Awaited<ReturnType<typeof prepareOptimizationCampaign>>;
  profile: string;
  modality: 'text' | 'voice';
  issue: number;
  directory: string;
  apiKey: string;
  authorized: boolean;
  priorUsd: number;
  priorSource: string;
  limitUsd?: number;
  localVerification: EvaluationPlan['localVerification'];
}): EvaluationPlan {
  const backend = optimizationBackend(options.profile);
  if (options.modality === 'voice') optimizationPlaybackAssessor();
  return {
    issue: options.issue,
    directory: options.directory,
    apiKey: options.apiKey,
    authorized: options.authorized,
    priorUsd: options.priorUsd,
    priorSource: options.priorSource,
    ...(options.limitUsd === undefined ? {} : { limitUsd: options.limitUsd }),
    commit: options.campaign.evaluatorCommit,
    localVerification: options.localVerification,
    backendProfiles: [backend],
    textProfiles: [backend.id],
    judgeProfile: optimization.judgeProfile as EvaluationProfile,
    baselineProfiles: { text: backend.id },
    applicationComparison: options.campaign.applicationComparison,
    followUps: true,
    repetitions: [1, 2, 3, 4, 5],
  };
}
