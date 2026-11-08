import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { type ApplicationVersion, applicationAdapter, evaluatorVersion } from './application.js';
import audioManifest from './audio/manifest.json' with { type: 'json' };
import { EvaluationBudget } from './budget.js';
import rawCatalog from './catalog.json' with { type: 'json' };
import {
  type ApplicationComparison,
  compareApplicationVersions,
  prepareComparison,
} from './comparison.js';
import { scenarioUtterances } from './follow-ups.js';
import { contentJudge, judgeInstructions, verifyJudge } from './judge.js';
import controls from './judge-controls.json' with { type: 'json' };
import { budgetedLive, type LiveEvaluationProfile, verifiedLiveProfile } from './live.js';
import { modelMetrics } from './metrics.js';
import { privateEvaluationRecords } from './private-records.js';
import registry from './profiles.json' with { type: 'json' };
import {
  budgetedProvider,
  type EvaluationProfile,
  type ProviderCall,
  requestMaximum,
  verifiedProfile,
} from './provider.js';
import {
  compareEvaluationProfiles,
  evaluationReporter,
  type RecordedReference,
  summarizeProfile,
} from './report.js';
import { runTextScenario } from './runner.js';
import { type ReferenceVoice, referenceSpeech } from './speech.js';
import { type Attempt, type Catalog, type Scenario, scenarioGroups } from './types.js';
import { runVoiceScenario } from './voice-runner.js';

export type EvaluationPlan = {
  issue: number;
  directory: string;
  apiKey: string;
  authorized: boolean;
  limitUsd?: number;
  priorUsd: number;
  priorSource: string;
  commit: string;
  localVerification: { passed: boolean; commands: string[]; evidence: string };
  textProfiles: string[];
  /** Verified exact profiles supplied when the registry lacks a selected model. */
  backendProfiles?: EvaluationProfile[];
  applicationComparison?: ApplicationComparison;
  judgeProfile: EvaluationProfile;
  baselineProfiles: Partial<Record<'text' | 'voice', string>>;
  voice?: boolean;
  voiceProfile?: LiveEvaluationProfile;
  referenceVoice?: ReferenceVoice;
  followUps?: boolean;
  repetitions?: number[];
  references?: RecordedReference[];
  // Exact counting, including its verified billing, is supplied only by an
  // agent after checking the official endpoint/model/pricing documentation.
  counting?: {
    source: string;
    feeUsd: number;
    count: (payload: Record<string, unknown>) => Promise<number>;
  };
};

/** Agent-callable support. Reports remain local until the agent publishes each
 * Markdown artifact on the already-created model-evaluation run issue. */
export async function evaluateModels(plan: EvaluationPlan) {
  if (
    !plan.authorized ||
    !plan.apiKey ||
    !plan.localVerification.passed ||
    !plan.localVerification.commands.length ||
    !plan.localVerification.evidence ||
    !Number.isSafeInteger(plan.issue) ||
    plan.issue <= 0
  )
    throw new Error('evaluation_prerequisites_missing');
  if (new Set(plan.textProfiles).size !== plan.textProfiles.length)
    throw new Error('evaluation_duplicate_profiles');
  const selected = plan.textProfiles.length + (plan.voice ? 1 : 0);
  if (!selected) throw new Error('evaluation_models_required');
  if (selected !== 1) throw new Error('evaluation_one_model_per_issue');
  let repetitions = plan.repetitions ?? [1];
  if (
    !repetitions.length ||
    repetitions.some((repetition) => !Number.isSafeInteger(repetition) || repetition <= 0) ||
    new Set(repetitions).size !== repetitions.length
  )
    throw new Error('evaluation_invalid_repetitions');
  if (!plan.judgeProfile) throw new Error('evaluation_judge_profile_required');
  if (!plan.baselineProfiles) throw new Error('evaluation_baseline_configuration_required');
  const judgeProfile = verifiedProfile(plan.judgeProfile.id, plan.judgeProfile);
  if (
    new Set(plan.backendProfiles?.map((profile) => profile.id)).size !==
    (plan.backendProfiles?.length ?? 0)
  )
    throw new Error('evaluation_duplicate_profiles');
  const backendProfile = (id: string) =>
    verifiedProfile(
      id,
      plan.backendProfiles?.find((profile) => profile.id === id),
    );
  if (judgeProfile.role !== 'judge') throw new Error('evaluation_judge_profile_required');
  for (const id of plan.textProfiles) {
    if (backendProfile(id).role !== 'backend')
      throw new Error('evaluation_backend_profile_required');
  }
  if (plan.voice) {
    if (!plan.voiceProfile) throw new Error('evaluation_voice_model_required');
    const voiceProfile = verifiedLiveProfile(plan.voiceProfile);
    if (backendProfile(voiceProfile.backend).role !== 'backend')
      throw new Error('evaluation_backend_profile_required');
  }
  const judgeSha256 = createHash('sha256')
    .update(
      JSON.stringify({
        provider: judgeProfile.provider,
        model: judgeProfile.model,
        effort: judgeProfile.effort,
        serviceTier: judgeProfile.serviceTier,
        outputLimit: judgeProfile.maxOutputTokens,
        instructions: judgeInstructions,
        controls,
      }),
    )
    .digest('hex');
  const catalog = rawCatalog as Catalog;
  if (plan.applicationComparison && (plan.voice || plan.textProfiles.length !== 1))
    throw new Error('evaluation_application_comparison_text_required');
  const evaluator = plan.applicationComparison ? await evaluatorVersion(plan.commit) : undefined;
  const comparisonRun = plan.applicationComparison
    ? prepareComparison(
        plan.applicationComparison,
        catalog.scenarios,
        backendProfile(plan.textProfiles[0]),
        {
          catalog: rawCatalog,
          audio: { manifest: audioManifest, referenceVoice: plan.referenceVoice ?? 'marin' },
          judge: { sha256: judgeSha256, profile: judgeProfile },
          followUps: plan.followUps ?? false,
          evaluator,
          counting: plan.counting
            ? { source: plan.counting.source, feeUsd: plan.counting.feeUsd }
            : registry.counting,
        },
      )
    : undefined;
  if (comparisonRun) {
    if (
      plan.repetitions &&
      JSON.stringify(plan.repetitions) !== JSON.stringify(comparisonRun.plan.repetitions)
    )
      throw new Error('evaluation_comparison_repetitions_mismatch');
    repetitions = comparisonRun.plan.repetitions;
    // Validate actual source and protocol before the first paid calibration.
    await Promise.all(comparisonRun.versions.map((version) => applicationAdapter(version)));
  }
  const comparisonManifest = comparisonRun
    ? {
        contractId: comparisonRun.contractId,
        plan: comparisonRun.plan,
        versions: comparisonRun.versions.map(({ id, commit }) => ({ id, commit })),
        order: comparisonRun.order.map(({ repetition, application }) => ({
          repetition,
          applicationVersion: application.id,
        })),
      }
    : undefined;
  const audio = plan.voice
    ? await Promise.all(
        catalog.scenarios
          .filter((scenario) => scenario.voice)
          .flatMap((scenario) => scenarioUtterances(scenario, plan.followUps))
          .map((step) => referenceSpeech(step.id, step.text, plan.referenceVoice)),
      )
    : [];
  const directory = plan.directory;
  await mkdir(directory, { recursive: true });
  const db = new Database(join(directory, 'budget.sqlite'));
  const budget = new EvaluationBudget(db, plan);
  const report = evaluationReporter(directory, plan.issue);
  const published: string[] = [];
  async function emit(...args: Parameters<typeof report>) {
    const path = await report(...args);
    published.push(path);
  }
  const calls = new Map<string, ProviderCall>();
  const privateRecords = privateEvaluationRecords(directory);
  const record = (call: ProviderCall) => {
    privateRecords.call(call);
    calls.set(call.id, {
      ...call,
      request: {},
      response: call.response
        ? {
            model: call.response.model,
            status: call.response.status,
            usage: call.response.usage,
            output: Array.isArray(call.response.output)
              ? call.response.output
                  .filter((item) => item.type === 'function_call')
                  .map((item) => ({ type: item.type, call_id: item.call_id }))
              : [],
          }
        : undefined,
    });
  };
  const cost = (kind: 'backend' | 'summary' | 'judge') => {
    const selected = [...calls.values()].filter((call) => call.kind === kind && call.endedAt);
    return selected.some((call) => call.costUsd === null)
      ? null
      : selected.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
  };
  const backendCost = () => {
    const a = cost('backend');
    const b = cost('summary');
    return a === null || b === null ? null : a + b;
  };
  const counted = plan.counting
    ? async (payload: Record<string, unknown>) => {
        const fee = plan.counting?.feeUsd;
        if (fee === undefined || !Number.isFinite(fee) || fee < 0 || !plan.counting?.source)
          throw new Error('evaluation_count_fee_unverified');
        const charge = budget.reserve('counting', fee);
        try {
          budget.beginCall();
          const tokens = await plan.counting.count(payload);
          budget.settle(charge, fee);
          return tokens;
        } catch (error) {
          budget.settle(charge, null);
          throw error;
        }
      }
    : undefined;
  const judgeProvider = budgetedProvider(judgeProfile, budget, {
    record,
    countInput: counted,
  });
  const judge = contentJudge(plan.apiKey, judgeProvider);
  const attempts: Attempt[] = [];
  const profiles = [...plan.textProfiles];
  const voiceProfile = plan.voiceProfile;
  const plannedUtterances = catalog.scenarios.reduce(
    (sum, scenario) => sum + scenarioUtterances(scenario, plan.followUps).length,
    0,
  );
  const rounds = repetitions.length * (comparisonRun ? comparisonRun.versions.length : 1);
  const backendMaximumCalls = plannedUtterances * 48 * rounds;
  const maximumFollowUpCandidates = Math.max(
    0,
    ...catalog.scenarios.flatMap((scenario) =>
      scenario.steps.map((step) => step.followUps?.length ?? 0),
    ),
  );
  const judgeMaximumCalls =
    controls.cases.length + plannedUtterances * (2 + maximumFollowUpCandidates) * rounds;
  try {
    await emit('manifest', 'Utvärderingskörning', {
      commit: plan.commit,
      applicationComparison: comparisonManifest,
      evaluator,
      measurementContracts: { text: 'text-delivery-v2', summary: 'summary-execution-v1' },
      textTimingDefinitions: {
        firstResponseMs:
          'First delivered answer/prose observation for this request; not certified useful.',
        firstUsefulMs:
          'Earliest useful response only when established. Unknown when earlier prose has unverified usefulness. Activity labels are excluded.',
        firstVerifiedUsefulMs:
          'Delivered completed response later verified correct or a necessary question; does not prove no earlier fragment was useful.',
        successfulCompletionMs:
          'Submission through the delivered entire response and correct result; excludes evaluator scoring time.',
        assistedElapsedMs:
          'Sum of delivered application turns under the immediate scripted-reply policy. Harness-only gaps are excluded.',
        assistedWallElapsedMs:
          'First submission through final delivery, including harness-only gaps.',
        assistedEvaluationOverheadMs:
          'Measured gaps between response delivery and the next scripted submission, including scoring and harness bookkeeping.',
      },
      assistanceTimingPolicy: 'immediate-scripted-reply-excluding-evaluator-gaps-v1',
      catalog: {
        source: rawCatalog.source,
        decision: rawCatalog.decision,
        sha256: createHash('sha256').update(JSON.stringify(rawCatalog)).digest('hex'),
        scenarios: catalog.scenarios.map((scenario) => ({
          id: scenario.id,
          title: scenario.title,
          group: scenario.group,
          dimensions: scenario.dimensions,
          history: scenario.history
            ? { id: scenario.history, posts: catalog.histories?.[scenario.history]?.length }
            : null,
          steps: scenario.steps.map((step) => step.id),
          voice: scenario.voice,
        })),
        fixtureObjects: catalog.base.objects.length,
        fixtureRelationships: catalog.base.relationships.length,
      },
      controls: controls.source,
      profiles: registry,
      repetitions,
      qualification: {
        minimumRepetitions: 1,
        allPlannedChecksRequired: true,
        policy: 'scenario-groups-v1',
        scope: 'everyday',
        groups: scenarioGroups,
        correctnessRequiredAcrossAllGroups: true,
      },
      textProfiles: profiles,
      selectedBackendProfiles: profiles.map(backendProfile),
      judgeProfile,
      judgeSha256,
      baselineProfiles: plan.baselineProfiles,
      voice: plan.voice ?? false,
      voiceProfile,
      referenceVoice: plan.referenceVoice ?? 'marin',
      followUps: plan.followUps ?? false,
      audio: audioManifest,
      frames: audio.reduce((sum, item) => sum + item.clip.frames, 0),
      budget: budget.snapshot(),
      priorSource: plan.priorSource,
      counting: plan.counting
        ? { source: plan.counting.source, feeUsd: plan.counting.feeUsd }
        : registry.counting,
      maxima: {
        backendPerStep: 48,
        backendOutput: Object.fromEntries(
          [...profiles, ...(voiceProfile ? [voiceProfile.backend] : [])].map((id) => [
            id,
            backendProfile(id).maxOutputTokens,
          ]),
        ),
        summaryOutput: 'Uses the selected backend profile output limit.',
        judgeOutput: judgeProfile.maxOutputTokens,
        processingDeadlineSeconds: null,
        startupSeconds: 30,
        voicePaidSeconds: 3420,
      },
      estimates: Object.fromEntries(
        profiles.map((id) => [
          id,
          {
            singleBackendReservationUsd: requestMaximum(
              backendProfile(id),
              backendProfile(id).maxOutputTokens,
            ),
            backendMaximumCalls,
            judgeMaximumCalls,
            textTechnicalMaximumUsd:
              requestMaximum(backendProfile(id), backendProfile(id).maxOutputTokens) *
                backendMaximumCalls +
              requestMaximum(judgeProfile, judgeProfile.maxOutputTokens) * judgeMaximumCalls +
              (plan.counting?.feeUsd ?? 0) * (backendMaximumCalls + judgeMaximumCalls),
          },
        ]),
      ),
    });
    await emit('local_verification', 'Lokal verifiering', plan.localVerification);
    let previousJudgeCost: number | null = cost('judge');
    const calibrated = await verifyJudge(judge, async (id, result, expected) => {
      const cumulativeJudgeCostUsd = cost('judge');
      await emit('judge_control', `Bedömarkontroll ${id}`, {
        id,
        result,
        expected,
        costUsd:
          previousJudgeCost === null || cumulativeJudgeCostUsd === null
            ? null
            : cumulativeJudgeCostUsd - previousJudgeCost,
        cumulativeJudgeCostUsd,
      });
      previousJudgeCost = cumulativeJudgeCostUsd;
    });
    if (!calibrated) {
      budget.stop(budget.snapshot().reason ?? 'evaluation_judge_control_failed');
      await emit('diagnostic', 'Bedömaren är inte verifierad', {
        reason: budget.snapshot().reason,
        controls: controls.cases.map((item) => item.id),
        comparisonAllowed: false,
      });
    }
    for (const repetition of repetitions) {
      const applications = comparisonRun
        ? comparisonRun.order
            .filter((entry) => entry.repetition === repetition)
            .map((entry) => entry.application)
        : [undefined];
      for (const application of applications) {
        const order = repetition % 2 ? [...profiles] : [...profiles].reverse();
        for (const id of order) {
          const profile = backendProfile(id);
          const provider = budgetedProvider(profile, budget, { record, countInput: counted });
          for (const scenario of catalog.scenarios) {
            if (budget.snapshot().stopped) {
              await missing(
                scenario,
                id,
                repetition,
                'text',
                budget.snapshot().reason as string,
                application,
              );
              continue;
            }
            try {
              const run = await runTextScenario(
                scenario,
                { providerApiKey: plan.apiKey, modelProfile: profile, modelFetch: provider.fetch },
                {
                  profile: id,
                  repetition,
                  application,
                  comparisonContract: comparisonRun?.contractId,
                  followUps: plan.followUps,
                  judge,
                  beginStep: provider.beginStep,
                  costs: backendCost,
                  judgeCosts: () => cost('judge'),
                  stopped: () => budget.snapshot().stopped,
                  stopReason: () => budget.snapshot().reason,
                  providerCalls: () => budget.callsStarted,
                  providerRecords: () => [...calls.values()],
                  recordObservation: (event) =>
                    privateRecords.observation({
                      scenario: scenario.id,
                      profile: id,
                      repetition,
                      applicationVersion: application?.id,
                      applicationCommit: application?.commit,
                      modality: 'text',
                      event,
                    }),
                  record: async (attempt) => {
                    attempts.push(attempt);
                    await emit('attempt', `${scenario.title}: ${attempt.step}`, attempt);
                  },
                },
              );
              privateRecords.observation({
                scenario: scenario.id,
                profile: id,
                repetition,
                applicationVersion: application?.id,
                applicationCommit: application?.commit,
                finalMap: run.finalMap,
              });
            } catch (error) {
              budget.stop(error instanceof Error ? error.message : 'evaluation_application_failed');
              await missing(
                scenario,
                id,
                repetition,
                'text',
                budget.snapshot().reason as string,
                application,
              );
            }
          }
        }
      }
      if (plan.voice === true)
        for (const scenario of catalog.scenarios.filter((item) => item.voice)) {
          if (!voiceProfile) throw new Error('evaluation_voice_model_required');
          const id = voiceProfile.id;
          if (budget.snapshot().stopped) {
            await missing(scenario, id, repetition, 'voice', budget.snapshot().reason as string);
            continue;
          }
          const audioSeconds = (
            await Promise.all(
              scenarioUtterances(scenario, plan.followUps).map((step) =>
                referenceSpeech(step.id, step.text, plan.referenceVoice),
              ),
            )
          ).reduce((sum, item) => sum + item.clip.frames / item.clip.sampleRate, 0);
          const utterances = scenarioUtterances(scenario, plan.followUps).length;
          const maximumSeconds = Math.ceil(
            audioSeconds + utterances * 180 + 32 + (utterances - 1) * 120,
          );
          const liveUsage: unknown[] = [];
          const live = budgetedLive(
            budget,
            maximumSeconds,
            (usage) => liveUsage.push(usage),
            fetch,
            voiceProfile,
          );
          const profile = backendProfile(voiceProfile.backend);
          const provider = budgetedProvider(profile, budget, { record, countInput: counted });
          const run = await runVoiceScenario(
            scenario,
            {
              providerApiKey: plan.apiKey,
              modelProfile: profile,
              modelFetch: provider.fetch,
              liveFetch: live.fetch,
              liveUsage: live.usage,
              liveProfile: voiceProfile,
            },
            {
              profile: id,
              referenceVoice: plan.referenceVoice,
              followUps: plan.followUps,
              maximumSeconds,
              sessionTimeLimit: () => budget.stop('evaluation_live_time_limit'),
              repetition,
              judge,
              beginStep: provider.beginStep,
              costs: backendCost,
              judgeCosts: () => cost('judge'),
              stopped: () => budget.snapshot().stopped,
              stopReason: () => budget.snapshot().reason,
              providerCalls: () => budget.callsStarted,
              recordObservation: (event) =>
                privateRecords.observation({
                  scenario: scenario.id,
                  profile: id,
                  repetition,
                  followUps: plan.followUps,
                  modality: 'voice',
                  event,
                }),
              record: async (attempt) => {
                attempts.push(attempt);
                await emit('attempt', `${scenario.title}: ${attempt.step}`, attempt);
              },
            },
          );
          await emit('diagnostic', `Talkostnad: ${scenario.title}`, {
            sessions: liveUsage,
            maximumSeconds,
            stepCost: 'Estimated allocations are not used to rank models.',
            observation: 'Output transcript is observed; acoustic audibility is not measured.',
          });
          privateRecords.observation({
            scenario: scenario.id,
            repetition,
            finalMap: run.finalMap,
            liveUsage,
          });
        }
    }
    const summaries = profiles.map((id) =>
      summarizeProfile(
        comparisonRun
          ? attempts.filter(
              (attempt) => attempt.applicationVersion === comparisonRun.versions[1].id,
            )
          : attempts,
        catalog.scenarios,
        id,
        'text',
        repetitions,
      ),
    );
    const voice = summarizeProfile(
      attempts,
      catalog.scenarios.filter((item) => item.voice),
      voiceProfile?.id ?? '',
      'voice',
      repetitions,
    );
    const catalogSha256 = createHash('sha256').update(JSON.stringify(rawCatalog)).digest('hex');
    const applicationResult = comparisonRun
      ? compareApplicationVersions(attempts, catalog.scenarios, comparisonRun)
      : undefined;
    const { comparisons, historicalComparisons, recommendation, recommendationBasis } =
      comparisonRun
        ? {
            comparisons: [],
            historicalComparisons: [],
            recommendationBasis: null,
            recommendation:
              applicationResult?.status === 'accepted'
                ? 'Den deklarerade förbättringen av väntetid uppfyller planen inom samma modell. Redovisa avancerade förmågegränser och kostnader separat.'
                : 'Ändringen uppfyller inte den deklarerade planen eller har otillräckligt jämförbart underlag.',
          }
        : compareEvaluationProfiles(
            [...summaries, ...(plan.voice ? [voice] : [])],
            plan.references ?? [],
            {
              commit: plan.commit,
              catalogSha256,
              judgeSha256,
              followUps: plan.followUps,
              baselineProfiles: plan.baselineProfiles,
              measurementContracts: { text: 'text-delivery-v2' },
            },
          );
    const diagnostics = [...calls.values()].map((call) => ({
      id: call.id,
      requestId: call.requestId ?? null,
      context: call.context ?? null,
      profile: call.profile,
      model: call.model,
      kind: call.kind,
      ...modelMetrics([call]),
      startedAt: call.startedAt,
      endedAt: call.endedAt ?? null,
      outcome: call.outcome,
      costUsd: call.costUsd,
      reservationUsd: call.reservationUsd,
      toolCallIds: Array.isArray(call.response?.output)
        ? call.response.output
            .filter((item) => item && typeof item === 'object' && item.type === 'function_call')
            .map((item) => item.call_id)
        : [],
      correlation: call.context
        ? 'Observed step identity; tool-call IDs link to application model_action records.'
        : 'Step identity unavailable; inspect the private request before attributing.',
    }));
    let batch: typeof diagnostics = [];
    for (const diagnostic of diagnostics) {
      if (batch.length && JSON.stringify([...batch, diagnostic], null, 2).length > 45_000) {
        await emit('diagnostic', 'Observerade provideranrop', batch);
        batch = [];
      }
      batch.push(diagnostic);
    }
    if (batch.length || !diagnostics.length)
      await emit('diagnostic', 'Observerade provideranrop', batch);
    await emit('comparison', 'Modelljämförelse', {
      profiles: comparisonRun ? [] : summaries,
      voice,
      comparisons,
      historicalComparisons,
      applicationComparison: applicationResult,
    });
    await emit('recommendation', 'Rekommendation', {
      recommendation,
      recommendationBasis,
      preliminary: Boolean(comparisonRun),
      qualificationScope: 'everyday',
      fullCatalogQualified:
        calibrated &&
        (applicationResult
          ? applicationResult.versions.every((version) => version.summary.fullCatalogQualified)
          : summaries.every((candidate) => candidate.fullCatalogQualified)) &&
        (!plan.voice || voice.fullCatalogQualified),
      qualificationComplete:
        calibrated &&
        (applicationResult
          ? applicationResult.versions.every((version) => version.summary.finalQualified)
          : summaries.every((candidate) => candidate.finalQualified)) &&
        (!plan.voice || voice.finalQualified),
      runCollected: attempts.every((item) => item.outcome !== 'not_run') && calibrated,
      missing: attempts
        .filter((item) => item.outcome !== 'pass')
        .map(({ scenario, step, profile, modality, outcome, applicationVersion }) => ({
          scenario,
          step,
          profile,
          modality,
          outcome,
          applicationVersion,
        })),
      budget: budget.snapshot(),
      remainingEstimate:
        'Account for remaining complete-request maxima; apply a ceiling only if the user supplies one.',
      remainingTechnicalMaximumUsd: attempts
        .filter((item) => item.outcome === 'not_run' && item.modality === 'text')
        .reduce(
          (sum, item) =>
            sum +
            requestMaximum(
              backendProfile(item.profile),
              backendProfile(item.profile).maxOutputTokens,
            ) *
              (item.step === 'summary' ? 1 : 48) +
            requestMaximum(judgeProfile, judgeProfile.maxOutputTokens),
          0,
        ),
      productionModelChanged: false,
    });
    return {
      paths: published,
      attempts,
      budget: budget.snapshot(),
      applicationComparison: applicationResult,
    };
  } catch (error) {
    budget.stop(error instanceof Error ? error.message : 'evaluation_failed');
    if (comparisonRun)
      for (const { repetition, application } of comparisonRun.order)
        for (const scenario of catalog.scenarios)
          await missing(
            scenario,
            comparisonRun.profile.id,
            repetition,
            'text',
            budget.snapshot().reason ?? 'evaluation_failed',
            application,
          );
    await emit('diagnostic', 'Körningen avbröts', { reason: budget.snapshot().reason });
    await emit('recommendation', 'Rekommendation efter avbrott', {
      recommendation: 'Otillräckligt underlag för ett modellbyte.',
      qualificationComplete: false,
      runCollected: false,
      budget: budget.snapshot(),
      completedAttempts: attempts.length,
      remaining:
        'All selected attempts absent from the attempt records remain not run. Recalculate full-request and voice reservations before resuming.',
    });
    return {
      paths: published,
      attempts,
      budget: budget.snapshot(),
      applicationComparison: comparisonRun
        ? compareApplicationVersions(attempts, catalog.scenarios, comparisonRun)
        : undefined,
    };
  } finally {
    try {
      privateRecords.close();
    } finally {
      db.close();
    }
  }
  async function missing(
    scenario: Scenario,
    profile: string,
    repetition: number,
    modality: 'text' | 'voice',
    reason: string,
    application?: ApplicationVersion,
  ) {
    for (const step of scenario.steps) {
      if (
        attempts.some(
          (attempt) =>
            attempt.scenario === scenario.id &&
            attempt.step === step.id &&
            attempt.profile === profile &&
            attempt.repetition === repetition &&
            attempt.modality === modality &&
            attempt.applicationVersion === application?.id,
        )
      )
        continue;
      const attempt: Attempt = {
        scenario: scenario.id,
        group: scenario.group ?? 'everyday',
        step: step.id,
        profile,
        repetition,
        modality,
        outcome: 'not_run',
        fixed: [],
        elapsedMs: null,
        backendCostUsd: 0,
        reason,
        applicationVersion: application?.id,
        applicationCommit: application?.commit,
        comparisonContract: application ? comparisonRun?.contractId : undefined,
      };
      attempts.push(attempt);
      await emit('attempt', `${scenario.title}: ${step.id}`, attempt);
    }
  }
}
