import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import audioManifest from './audio/manifest.json' with { type: 'json' };
import { EvaluationBudget } from './budget.js';
import rawCatalog from './catalog.json' with { type: 'json' };
import { contentJudge, judgeInstructions, verifyJudge } from './judge.js';
import controls from './judge-controls.json' with { type: 'json' };
import { budgetedLive, type LiveEvaluationProfile, verifiedLiveProfile } from './live.js';
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
import type { Attempt, Catalog, Scenario } from './types.js';
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
  judgeProfile: EvaluationProfile;
  baselineProfiles: Partial<Record<'text' | 'voice', string>>;
  voice?: boolean;
  voiceProfile?: LiveEvaluationProfile;
  referenceVoice?: ReferenceVoice;
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
  const repetitions = plan.repetitions ?? [1];
  if (
    !repetitions.length ||
    repetitions.some((repetition) => !Number.isSafeInteger(repetition) || repetition <= 0) ||
    new Set(repetitions).size !== repetitions.length
  )
    throw new Error('evaluation_invalid_repetitions');
  if (!plan.judgeProfile) throw new Error('evaluation_judge_profile_required');
  if (!plan.baselineProfiles) throw new Error('evaluation_baseline_configuration_required');
  const judgeProfile = verifiedProfile(plan.judgeProfile.id, plan.judgeProfile);
  if (judgeProfile.role !== 'judge') throw new Error('evaluation_judge_profile_required');
  for (const id of plan.textProfiles) {
    if (verifiedProfile(id).role !== 'backend')
      throw new Error('evaluation_backend_profile_required');
  }
  if (plan.voice) {
    if (!plan.voiceProfile) throw new Error('evaluation_voice_model_required');
    const voiceProfile = verifiedLiveProfile(plan.voiceProfile);
    if (verifiedProfile(voiceProfile.backend).role !== 'backend')
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
  const audio = plan.voice
    ? await Promise.all(
        catalog.scenarios
          .filter((scenario) => scenario.voice)
          .flatMap((scenario) => scenario.steps)
          .filter((step) => !step.transition)
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
  try {
    await emit('manifest', 'Utvärderingskörning', {
      commit: plan.commit,
      catalog: {
        source: rawCatalog.source,
        decision: rawCatalog.decision,
        sha256: createHash('sha256').update(JSON.stringify(rawCatalog)).digest('hex'),
        scenarios: catalog.scenarios.map((scenario) => ({
          id: scenario.id,
          title: scenario.title,
          steps: scenario.steps.map((step) => step.id),
          voice: scenario.voice,
        })),
        fixtureObjects: catalog.base.objects.length,
        fixtureRelationships: catalog.base.relationships.length,
      },
      controls: controls.source,
      profiles: registry,
      repetitions,
      qualification: { minimumRepetitions: 1, allPlannedChecksRequired: true },
      textProfiles: profiles,
      judgeProfile,
      judgeSha256,
      baselineProfiles: plan.baselineProfiles,
      voice: plan.voice ?? false,
      voiceProfile,
      referenceVoice: plan.referenceVoice ?? 'marin',
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
            verifiedProfile(id).maxOutputTokens,
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
              verifiedProfile(id),
              verifiedProfile(id).maxOutputTokens,
            ),
            textTechnicalMaximumUsd:
              requestMaximum(verifiedProfile(id), verifiedProfile(id).maxOutputTokens) * 913 +
              requestMaximum(judgeProfile, judgeProfile.maxOutputTokens) * 20,
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
      const order = repetition % 2 ? [...profiles] : [...profiles].reverse();
      for (const id of order) {
        const profile = verifiedProfile(id);
        const provider = budgetedProvider(profile, budget, { record, countInput: counted });
        for (const scenario of catalog.scenarios) {
          if (budget.snapshot().stopped) {
            await missing(scenario, id, repetition, 'text', budget.snapshot().reason as string);
            continue;
          }
          const run = await runTextScenario(
            scenario,
            { providerApiKey: plan.apiKey, modelProfile: profile, modelFetch: provider.fetch },
            {
              profile: id,
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
            finalMap: run.finalMap,
          });
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
              scenario.steps
                .filter((step) => !step.transition)
                .map((step) => referenceSpeech(step.id, step.text, plan.referenceVoice)),
            )
          ).reduce((sum, item) => sum + item.clip.frames / item.clip.sampleRate, 0);
          const utterances = scenario.steps.filter((step) => !step.transition).length;
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
          const profile = verifiedProfile(voiceProfile.backend);
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
      summarizeProfile(attempts, catalog.scenarios, id, 'text', repetitions),
    );
    const voice = summarizeProfile(
      attempts,
      catalog.scenarios.filter((item) => item.voice),
      voiceProfile?.id ?? '',
      'voice',
      repetitions,
    );
    const catalogSha256 = createHash('sha256').update(JSON.stringify(rawCatalog)).digest('hex');
    const { comparisons, historicalComparisons, recommendation, recommendationBasis } =
      compareEvaluationProfiles(
        [...summaries, ...(plan.voice ? [voice] : [])],
        plan.references ?? [],
        {
          commit: plan.commit,
          catalogSha256,
          judgeSha256,
          baselineProfiles: plan.baselineProfiles,
        },
      );
    const diagnostics = [...calls.values()].map((call) => ({
      id: call.id,
      requestId: call.requestId ?? null,
      context: call.context ?? null,
      profile: call.profile,
      model: call.model,
      kind: call.kind,
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
      profiles: summaries,
      voice,
      comparisons,
      historicalComparisons,
    });
    await emit('recommendation', 'Rekommendation', {
      recommendation,
      recommendationBasis,
      preliminary: false,
      qualificationComplete:
        calibrated &&
        summaries.every((candidate) => candidate.finalQualified) &&
        (!plan.voice || voice.finalQualified),
      runCollected: attempts.every((item) => item.outcome !== 'not_run') && calibrated,
      missing: attempts
        .filter((item) => item.outcome !== 'pass')
        .map(({ scenario, step, profile, modality, outcome }) => ({
          scenario,
          step,
          profile,
          modality,
          outcome,
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
              verifiedProfile(item.profile),
              verifiedProfile(item.profile).maxOutputTokens,
            ) *
              (item.step === 'summary' ? 1 : 48) +
            requestMaximum(judgeProfile, judgeProfile.maxOutputTokens),
          0,
        ),
      productionModelChanged: false,
    });
    return { paths: published, attempts, budget: budget.snapshot() };
  } catch (error) {
    budget.stop(error instanceof Error ? error.message : 'evaluation_failed');
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
    return { paths: published, attempts, budget: budget.snapshot() };
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
  ) {
    for (const step of scenario.steps) {
      const attempt: Attempt = {
        scenario: scenario.id,
        step: step.id,
        profile,
        repetition,
        modality,
        outcome: 'not_run',
        fixed: [],
        elapsedMs: null,
        backendCostUsd: 0,
        reason,
      };
      attempts.push(attempt);
      await emit('attempt', `${scenario.title}: ${step.id}`, attempt);
    }
  }
}
