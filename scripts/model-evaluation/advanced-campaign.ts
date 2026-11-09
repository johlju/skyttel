import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { executeAdvancedContext } from './advanced-context-run.js';
import { evaluatorVersion } from './application.js';
import type { EvaluationBudget } from './budget.js';
import catalog from './catalog.json' with { type: 'json' };
import { contextLimitFixture } from './context-limit.js';
import { evaluateModels } from './evaluate.js';
import { judgeInstructions } from './judge.js';
import controls from './judge-controls.json' with { type: 'json' };
import profiles from './optimization-campaign-profiles.json' with { type: 'json' };
import { pendingContext } from './pending-context.js';
import { type EvaluationProfile, verifiedProfile } from './provider.js';
import type { Catalog } from './types.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args: string[]) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const sourcePaths = [
  'src',
  'migrations',
  'scripts/model-evaluation',
  'tests/support',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
];
const terra = [
  'late-price-correction',
  'save-last',
  'relationship-direction',
  'questions-and-changes',
  'custom-type-date',
  'unknown-user',
  'no-user',
  'uncertain-user',
  'summary-last-price',
  'long-conversation-question',
];
const sol = ['save-last', 'unknown-user', 'no-user'];

/** Read-only, unpaid preparation. The complete source tree is content-bound;
 * documentation-only commits do not change the evaluator source revision. */
export async function prepareAdvancedCampaign() {
  const fileHashes: Record<string, string> = {};
  const paths = git(
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    ...sourcePaths,
  ).split('\n');
  for (const path of [...new Set(paths)].sort())
    fileHashes[path] = sha256(await readFile(join(root, path)));
  const backendProfiles = ['gpt-6.1-terra', 'gpt-6.1-sol'].map((model) => {
    const profile = profiles.backendProfiles.find((item) => item.model === model);
    if (
      profile?.effort !== 'high' ||
      profile.maxOutputTokens !== 128000 ||
      profile.tokens !== 1050000
    )
      throw new Error('evaluation_advanced_profile_changed');
    return verifiedProfile(profile.id, profile as EvaluationProfile);
  });
  const judgeProfile = verifiedProfile(
    profiles.judgeProfile.id,
    profiles.judgeProfile as EvaluationProfile,
  );
  if (
    judgeProfile.model !== 'gpt-6.1-sol' ||
    judgeProfile.effort !== 'high' ||
    judgeProfile.maxOutputTokens !== 4096
  )
    throw new Error('evaluation_advanced_judge_changed');
  const runs = backendProfiles.map((profile, index) => {
    const selected = index ? sol : terra;
    const scenarioIds = catalog.scenarios
      .filter((scenario) => selected.includes(scenario.id))
      .map(({ id }) => id);
    if (JSON.stringify(scenarioIds) !== JSON.stringify(selected))
      throw new Error('evaluation_advanced_selection_changed');
    return {
      id: index ? 'A-sol' : 'A-terra',
      phase: 'A' as const,
      profile,
      scenarioIds,
      proposedLimitUsd: 25,
    };
  });
  const frozen = {
    format: 'skyttel-advanced-context-preparation-v1',
    authorized: false,
    approvedCeilings: null,
    applicationCommit: git('log', '-1', '--format=%H', '--', 'src', 'migrations', 'tests/support'),
    evaluatorSourceCommit: git('log', '-1', '--format=%H', '--', ...sourcePaths),
    sourceIdentity:
      'sha256-of-working-source-files; execution additionally requires a clean committed evaluator',
    fileHashes,
    runtime: {
      modality: 'text',
      conversationWorkMode: 'sequential',
      repetitions: [1],
      followUps: true,
      retryFailedAttempts: false,
    },
    judge: {
      profile: judgeProfile,
      controlCount: controls.cases.length,
      sha256: sha256(
        JSON.stringify({
          provider: judgeProfile.provider,
          model: judgeProfile.model,
          effort: judgeProfile.effort,
          serviceTier: judgeProfile.serviceTier,
          outputLimit: judgeProfile.maxOutputTokens,
          instructions: judgeInstructions,
          controls,
        }),
      ),
    },
    cachePolicy: profiles.cachePolicy,
    ratesStatus: 'dated research from 2026-11-04; no fresh provider verification or authorization',
    runs: [
      ...runs,
      ...backendProfiles.map((profile, index) => ({
        id: index ? 'B-sol' : 'B-terra',
        phase: 'B' as const,
        profile,
        scenarioIds: [] as string[],
        proposedLimitUsd: 100,
      })),
    ],
    phaseB: {
      ...pendingContext,
      startStateSha256: sha256(
        JSON.stringify({ base: catalog.base, variant: catalog.variants['known-cloud-user'] }),
      ),
      growthSha256: contextLimitFixture().sha256,
      maximumGrowthMessages: 2048,
      maximumUserMessages: 2052,
      maximumRecallMessages: 1,
      maximumContinuationMessages: 1,
    },
    phaseC: {
      status: 'blocked',
      countingFeeUsd: null,
      approvedCeiling: null,
      prerequisites: [
        'verified counting fee',
        'exact complete payload count',
        'count/generation payload parity',
        'separate execution authorization',
      ],
    },
    measurement: {
      physicalProviderMaximum: 'unverified',
      waitingCompletionTime: null,
      boundaryPolicy:
        '95 percent is classification only; missing usage, early summary or exhausted cap cannot prove a physical boundary',
    },
    prerequisites: [
      'controlled verification evidence',
      'clean committed source matching this freeze',
      'separate explicit execution authorization with each phase/model ceiling',
    ],
  };
  return { ...frozen, freezeSha256: sha256(JSON.stringify(frozen)) };
}

const executionSchema = z
  .object({
    authorized: z.literal(true),
    authorizationSource: z.string().trim().min(1),
    freezeSha256: z.string(),
    directory: z.string().startsWith('/'),
    issue: z.number().int().positive(),
    runs: z
      .array(z.object({ id: z.string(), limitUsd: z.number().positive().max(1_000_000) }).strict())
      .min(1),
    localVerification: z
      .object({
        passed: z.literal(true),
        commands: z.array(z.string()).min(1),
        evidence: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export async function executeAdvancedCampaign(
  freeze: Awaited<ReturnType<typeof prepareAdvancedCampaign>>,
  authorization: unknown,
  options: { transport?: typeof fetch; apiKey?: string } = {},
) {
  const parsed = executionSchema.safeParse(authorization);
  if (!parsed.success) throw new Error('evaluation_advanced_authorization_scope_ceiling_invalid');
  const execution = parsed.data;
  const fresh = await prepareAdvancedCampaign();
  if (!isDeepStrictEqual(freeze, fresh) || execution.freezeSha256 !== fresh.freezeSha256)
    throw new Error('evaluation_advanced_freeze_changed');
  if (
    new Set(execution.runs.map(({ id }) => id)).size !== execution.runs.length ||
    execution.runs.some(({ id }) => !fresh.runs.some((run) => run.id === id))
  )
    throw new Error('evaluation_advanced_scope_invalid');
  const origin = options.transport ? 'controlled' : 'provider';
  if (origin === 'provider') await evaluatorVersion(git('rev-parse', 'HEAD'));
  const apiKey = options.transport ? 'controlled' : options.apiKey;
  if (!apiKey) throw new Error('evaluation_advanced_credentials_missing');
  // Exclusive creation makes this a single-use execution scope: no retries or
  // implicit continuation can silently reset any ledger.
  await mkdir(execution.directory);
  const evidence = {
    origin,
    freezeSha256: freeze.freezeSha256,
    applicationCommit: freeze.applicationCommit,
    evaluatorSourceCommit: freeze.evaluatorSourceCommit,
    executionCommit: git('rev-parse', 'HEAD'),
    authorization: execution,
    stopReason: null as string | null,
    runs: fresh.runs.map((run) => ({
      id: run.id,
      phase: run.phase,
      model: run.profile.model,
      scenarioIds: run.scenarioIds,
      status: 'not_run',
      reason: 'not_selected',
      budget: null as ReturnType<EvaluationBudget['snapshot']> | null,
      outcomes: (run.phase === 'A'
        ? catalog.scenarios
            .filter(({ id }) => run.scenarioIds.includes(id))
            .flatMap((scenario) =>
              scenario.steps.map((step) => ({
                scenario: scenario.id,
                step: step.id,
                outcome: 'not_run',
                reason: 'pending_execution',
              })),
            )
        : [
            {
              scenario: 'pending-context-growth',
              step: 'dialog',
              outcome: 'not_run',
              reason: 'pending_execution',
            },
          ]) as { scenario: string; step: string; outcome: string; reason?: string }[],
    })),
  };
  const save = () =>
    writeFile(join(execution.directory, 'campaign.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(join(execution.directory, 'freeze.json'), `${JSON.stringify(freeze, null, 2)}\n`);
  for (const run of evidence.runs)
    if (execution.runs.some(({ id }) => id === run.id)) run.reason = 'pending_execution';
  await save();
  for (const run of fresh.runs) {
    const ceiling = execution.runs.find(({ id }) => id === run.id);
    if (!ceiling) continue;
    const item = evidence.runs.find(({ id }) => id === run.id);
    if (!item) throw new Error('evaluation_advanced_scope_invalid');
    if (evidence.stopReason) {
      item.reason = evidence.stopReason;
      continue;
    }
    item.status = 'started';
    await save();
    const directory = join(execution.directory, run.id);
    try {
      if (run.phase === 'A') {
        const result = await evaluateModels(
          {
            issue: execution.issue,
            directory,
            apiKey,
            authorized: true,
            limitUsd: ceiling.limitUsd,
            priorUsd: 0,
            priorSource: execution.authorizationSource,
            commit: freeze.evaluatorSourceCommit,
            localVerification: execution.localVerification,
            textProfiles: [run.profile.id],
            backendProfiles: [run.profile],
            judgeProfile: freeze.judge.profile,
            baselineProfiles: {},
            repetitions: [1],
            followUps: true,
            voice: false,
            scenarioSet: (catalog as Catalog).scenarios.filter(({ id }) =>
              run.scenarioIds.includes(id),
            ),
          },
          { transport: options.transport, conversationWorkMode: 'sequential' },
        );
        item.budget = result.budget;
        item.outcomes = result.attempts.map(({ scenario, step, outcome, reason }) => ({
          scenario,
          step,
          outcome,
          reason,
        }));
        // Preserve unrun selection even if setup or reporting aborts before the runner.
        for (const scenario of catalog.scenarios.filter(({ id }) => run.scenarioIds.includes(id)))
          for (const step of scenario.steps)
            if (
              !item.outcomes.some(
                (value) => value.scenario === scenario.id && value.step === step.id,
              )
            )
              item.outcomes.push({
                scenario: scenario.id,
                step: step.id,
                outcome: 'not_run',
                reason: result.budget.reason ?? 'execution_incomplete',
              });
      } else {
        await mkdir(directory);
        const result = await executeAdvancedContext({
          directory,
          issue: execution.issue,
          apiKey,
          limitUsd: ceiling.limitUsd,
          authorizationSource: execution.authorizationSource,
          profile: run.profile,
          judgeProfile: freeze.judge.profile,
          transport: options.transport,
        });
        item.budget = result.budget;
        item.outcomes = result.context?.turns.map((turn) => ({
          scenario: 'pending-context-growth',
          step: turn.stage,
          outcome: turn.outcome,
          reason: turn.reason,
        })) ?? [
          {
            scenario: 'pending-context-growth',
            step: 'dialog',
            outcome: 'not_run',
            reason: result.budget.reason ?? 'execution_incomplete',
          },
        ];
      }
      item.status = item.budget.stopped ? 'stopped' : 'recorded';
      item.reason = item.budget.reason ?? 'evidence_recorded_not_model_qualification';
      if (item.budget.stopped) evidence.stopReason = item.budget.reason;
    } catch (error) {
      item.status = 'error';
      item.reason = 'evaluation_advanced_execution_error';
      evidence.stopReason = item.reason;
      await writeFile(
        join(execution.directory, 'private-error.json'),
        JSON.stringify({ error: String(error) }),
        { mode: 0o600 },
      );
    }
    await save();
  }
  await save();
  return evidence;
}
