import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { type EvaluationPlan, evaluateModels } from './evaluate.js';
import type { LiveEvaluationProfile } from './live.js';
import { overlapEvaluationPlan } from './overlap.js';
import type { PlaybackAssessorProfile } from './playback-assessor.js';
import { type EvaluationProfile, verifiedProfile } from './provider.js';

type SharedCampaign = {
  optimizationProfiles: { judgeProfile: EvaluationProfile };
  optimizationBackend: (id: string) => EvaluationProfile;
  optimizationVoice: (id: string) => LiveEvaluationProfile;
  optimizationPlaybackAssessor: () => PlaybackAssessorProfile;
};

export type OverlapExecution = {
  format: 'skyttel-overlap-execution-v1';
  evaluatorCommit: string;
  applicationDirectory: string;
  profile: 'terra-6.1-high-668' | 'sol-6.1-high-668';
  modality: 'text' | 'voice';
  directory: string;
  issue: number | null;
  authorization: { explicit: boolean; reference: string };
  priorUsd: number;
  priorSource: string;
  limitUsd?: number;
  localVerification: EvaluationPlan['localVerification'];
};

/** Reviewable unpaid preparation, consuming the common exact-profile module
 * after composition. Importing this file never contacts a provider. */
export function prepareOverlapExecution(config: OverlapExecution, campaign: SharedCampaign) {
  if (
    config.format !== 'skyttel-overlap-execution-v1' ||
    !/^[a-f0-9]{40}$/.test(config.evaluatorCommit) ||
    !['terra-6.1-high-668', 'sol-6.1-high-668'].includes(config.profile) ||
    !['text', 'voice'].includes(config.modality) ||
    !config.applicationDirectory.startsWith('/') ||
    !config.directory.startsWith('/') ||
    !config.authorization ||
    typeof config.authorization.explicit !== 'boolean' ||
    typeof config.authorization.reference !== 'string' ||
    !Number.isFinite(config.priorUsd) ||
    config.priorUsd < 0 ||
    !config.priorSource ||
    (config.issue !== null && (!Number.isSafeInteger(config.issue) || config.issue <= 0))
  )
    throw new Error('evaluation_overlap_execution_invalid');
  const backend = verifiedProfile(config.profile, campaign.optimizationBackend(config.profile));
  const judge = verifiedProfile(
    campaign.optimizationProfiles.judgeProfile.id,
    campaign.optimizationProfiles.judgeProfile,
  );
  const exactModel = config.profile === 'terra-6.1-high-668' ? 'gpt-6.1-terra' : 'gpt-6.1-sol';
  if (
    backend.model !== exactModel ||
    backend.effort !== 'high' ||
    judge.model !== 'gpt-6.1-sol' ||
    judge.effort !== 'high'
  )
    throw new Error('evaluation_overlap_exact_profile_required');
  const voice = config.modality === 'voice';
  // The shared module refuses voice while primary billing evidence is missing.
  const assessor = voice ? campaign.optimizationPlaybackAssessor() : undefined;
  return overlapEvaluationPlan({
    applicationDirectory: config.applicationDirectory,
    shared: {
      issue: config.issue ?? 0,
      directory: config.directory,
      apiKey: '',
      authorized:
        config.authorization.explicit === true && Boolean(config.authorization.reference.trim()),
      priorUsd: config.priorUsd,
      priorSource: config.priorSource,
      ...(config.limitUsd === undefined ? {} : { limitUsd: config.limitUsd }),
      commit: config.evaluatorCommit,
      localVerification: config.localVerification,
      textProfiles: voice ? [] : [backend.id],
      backendProfiles: [backend],
      judgeProfile: judge,
      baselineProfiles: voice
        ? { voice: campaign.optimizationVoice(backend.id).id }
        : { text: backend.id },
      ...(voice
        ? {
            voice: true,
            voiceProfile: campaign.optimizationVoice(backend.id),
            playbackAssessorProfile: assessor,
            referenceVoice: 'marin' as const,
          }
        : {}),
    },
  });
}

async function main() {
  const [mode, path, ...extra] = process.argv.slice(2);
  if (!['prepare', 'execute'].includes(mode) || !path?.startsWith('/') || extra.length)
    throw new Error(
      'Usage: npm run test:env -- tsx scripts/model-evaluation/run-overlap.ts prepare|execute /absolute/config.json',
    );
  const config = JSON.parse(await readFile(path, 'utf8')) as OverlapExecution;
  // Both frontier preparations are composed into a clean common evaluator.
  // A URL import intentionally permits this worker to compile independently;
  // missing composition fails before the first provider request.
  const campaign = (await import(new URL('./campaign.js', import.meta.url).href)) as SharedCampaign;
  const plan = prepareOverlapExecution(config, campaign);
  if (mode === 'prepare') {
    const { apiKey: _key, ...reviewable } = plan;
    process.stdout.write(`${JSON.stringify({ status: 'not_run', plan: reviewable }, null, 2)}\n`);
    return;
  }
  if (!plan.authorized || !config.issue || config.localVerification.passed !== true)
    throw new Error('evaluation_overlap_explicit_authorization_and_final_evidence_required');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('evaluation_overlap_OPENAI_API_KEY_missing');
  const result = await evaluateModels({ ...plan, apiKey });
  process.stdout.write(
    `${JSON.stringify(
      {
        paths: result.paths,
        budget: result.budget,
        overlapStatus: result.overlapComparison?.status ?? null,
        defaultDecision: result.overlapComparison?.defaultDecision ?? 'retain sequential',
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
