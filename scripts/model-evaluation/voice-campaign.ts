import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import audioManifest from './audio/manifest.json' with { type: 'json' };
import { optimizationBackend, optimizationVoice } from './campaign.js';
import catalog from './catalog.json' with { type: 'json' };
import type { EvaluationPlan } from './evaluate.js';
import { scenarioUtterances } from './follow-ups.js';
import { judgeCalibrationIdentity } from './judge-calibration.js';
import controls from './judge-controls.json' with { type: 'json' };
import profiles from './optimization-campaign-profiles.json' with { type: 'json' };
import { overlapScenarios } from './overlap.js';
import { type EvaluationProfile, requestMaximum } from './provider.js';
import { referenceSpeech } from './speech.js';
import type { Scenario } from './types.js';
import selection from './voice-campaign-selection.json' with { type: 'json' };

/** Unpaid review artifact, deliberately not an EvaluationPlan. In particular,
 * unknown transcription billing stays null and authorization stays false. */
export async function prepareVoiceCampaign(options: {
  evaluatorCommit: string;
  localVerification?: EvaluationPlan['localVerification'];
}) {
  if (!/^[a-f0-9]{40}$/.test(options.evaluatorCommit))
    throw new Error('evaluation_campaign_evaluator_required');
  if (selection.referenceVoice !== 'marin')
    throw new Error('evaluation_voice_selection_invalid:referenceVoice');
  const referenceVoice = selection.referenceVoice;
  const localVerification = options.localVerification ?? {
    passed: false,
    commands: [],
    evidence: '',
  };
  const locallyVerified =
    localVerification.passed &&
    localVerification.commands.length > 0 &&
    Boolean(localVerification.evidence.trim());
  const scenarios = Object.entries(selection.groups).flatMap(([group, ids]) =>
    ids.map((id) => {
      const scenario = (catalog.scenarios as Scenario[]).find((item) => item.id === id);
      if (!scenario || scenario.group !== group)
        throw new Error(`evaluation_voice_selection_invalid:${id}`);
      // Selection is explicit, independent of the catalog's historical voice flag.
      return { ...structuredClone(scenario), voice: true };
    }),
  );
  const availableOverlap = overlapScenarios();
  const overlap = selection.overlap.scenarios.map((id) => {
    const scenario = availableOverlap.find((item) => item.id === id);
    if (!scenario) throw new Error(`evaluation_voice_selection_invalid:${id}`);
    return scenario;
  });
  const judge = profiles.judgeProfile as EvaluationProfile;
  const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
  const audio = await Promise.all(
    [...scenarios, ...overlap].flatMap((scenario) =>
      scenarioUtterances(scenario, selection.followUps).map(async ({ id, text }) => {
        const reference = { scenario: scenario.id, id, text };
        try {
          const { clip } = await referenceSpeech(id, text, referenceVoice);
          return {
            ...reference,
            status: 'verified' as const,
            sha256: clip.sha256,
            frames: clip.frames,
            sampleRate: clip.sampleRate,
            format: 'PCM mono signed 16-bit',
            listeningApproval: 'review' in clip ? clip.review : audioManifest.review,
          };
        } catch (error) {
          return {
            ...reference,
            status: 'blocked' as const,
            reason: error instanceof Error ? error.message : 'evaluation_audio_unverified',
          };
        }
      }),
    ),
  );
  const sourcePaths = [
    'catalog.json',
    'everyday-source.json',
    'audio/manifest.json',
    'optimization-campaign-profiles.json',
    'voice-campaign-selection.json',
    'voice-campaign-evidence.md',
    'judge-controls.json',
  ];
  const sources = Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (path) => [
        path,
        sha256(await readFile(new URL(path, import.meta.url))),
      ]),
    ),
  );
  return structuredClone({
    format: 'skyttel-voice-preparation-v1',
    status: 'blocked',
    authorized: false,
    applicationCommit: options.evaluatorCommit,
    evaluatorCommit: options.evaluatorCommit,
    localVerification,
    revisionStatus: 'Declared identity; execution must independently verify the clean checkout.',
    providerVerification: {
      checkedAt: '2026-11-11',
      evidence: 'voice-campaign-evidence.md',
      status: 'partial; unresolved fields remain blocked',
    },
    sources,
    fixtureSha256: sha256(JSON.stringify(catalog.base)),
    judgeSha256: judgeCalibrationIdentity(judge),
    audio,
    blockers: [
      'voice_billing_semantics_unresolved',
      'live_context_capacity_unverified',
      'playback_assessor_threshold_calibration_required',
      ...(!locallyVerified ? ['local_verification_not_bound'] : []),
      'explicit_payment_authorization_missing',
      ...audio
        .filter((item) => item.status === 'blocked')
        .map((item) => `audio:${item.id}:${item.reason}`),
    ],
    selection,
    runs: profiles.backendProfiles.map(({ id }) => {
      const backend = optimizationBackend(id);
      const voice = optimizationVoice(id);
      const plan = {
        commit: options.evaluatorCommit,
        authorized: false,
        voice: true,
        textProfiles: [],
        backendProfiles: [backend],
        voiceProfile: voice,
        playbackAssessorProfile: profiles.playbackAssessor,
        judgeProfile: judge,
        baselineProfiles: { voice: voice.id },
        referenceVoice,
        followUps: selection.followUps,
        repetitions: [...selection.repetitions],
        scenarioSet: structuredClone(scenarios),
      };
      return {
        status: 'not_run',
        backendProfile: backend,
        plan,
        overlap: {
          interpretation: 'observations-only',
          defaultDecision: 'retain sequential',
          variants: selection.overlap.variants.map((conversationWorkMode) => ({
            applicationCommit: options.evaluatorCommit,
            conversationWorkMode,
            plan: {
              ...structuredClone(plan),
              repetitions: [...selection.overlap.repetitions],
              scenarioSet: structuredClone(overlap),
            },
          })),
        },
      };
    }),
    costs: {
      estimatedTotalUsd: null,
      unknownUsage:
        'Retain full reservation and stop; no zero-cost substitution or automatic retry.',
      layers: {
        listening: { sharedCharge: 'Live session', usdPerMinute: 0.05 },
        speaking: { sharedCharge: 'Live session; do not charge twice', usdPerMinute: 0.05 },
        backend: profiles.backendProfiles.map(({ id }) => {
          const backend = optimizationBackend(id);
          return {
            profile: id,
            maximumReservationPerCallUsd: requestMaximum(backend, backend.maxOutputTokens),
          };
        }),
        summary: 'Same selected backend profile and whole-context reservation as backend calls.',
        contentAssessment: {
          maximumReservationPerCallUsd: requestMaximum(judge, judge.maxOutputTokens),
        },
        renderedRecordingTranscription: {
          usdPerMinute: profiles.playbackAssessor.usdPerMinute,
          billingQuantumSeconds: null,
          estimatedUsd: null,
        },
      },
      calibrationCallsPerRun: controls.cases.length,
      calibrationReservationPerRunUsd:
        requestMaximum(judge, judge.maxOutputTokens) * controls.cases.length,
      reservationMeaning: 'Conservative holds, not expected spending or a user ceiling.',
      estimateBlockers: [
        'Short-session final charge and transcription rounding are unresolved.',
        'Session/recording durations and backend, summary and assessment usage are not measured.',
      ],
    },
  });
}

// This entry point only prepares an artifact; it has no execute mode or key input.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3)
    throw new Error(
      'Usage: npm run test:env -- tsx scripts/model-evaluation/voice-campaign.ts <evaluator-commit>',
    );
  process.stdout.write(
    `${JSON.stringify(await prepareVoiceCampaign({ evaluatorCommit: process.argv[2] }), null, 2)}\n`,
  );
}
