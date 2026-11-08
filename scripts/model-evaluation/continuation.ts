import { createHash } from 'node:crypto';
import { access, readdir, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Database from 'better-sqlite3';
import { z } from 'zod';

const dialog = z.object({
  applicationVersion: z.string().min(1),
  repetition: z.number().int().positive(),
  scenario: z.string().min(1),
});
export type ContinuationDialog = z.infer<typeof dialog>;
export type EvaluationContinuation = {
  sourceDirectories: { directory: string; manifestSha256: string }[];
  scenarios: ContinuationDialog[];
};
const manifestSchema = z.looseObject({
  applicationComparison: z.looseObject({
    contractId: z.string().min(1),
    plan: z.unknown(),
    versions: z.array(
      z.object({
        id: z.string(),
        commit: z.string(),
        conversationWorkMode: z.enum(['sequential', 'overlap']).optional(),
      }),
    ),
  }),
  catalog: z.looseObject({
    sha256: z.string(),
    scenarios: z.array(z.looseObject({ id: z.string(), steps: z.array(z.string()) })),
  }),
  textProfiles: z.array(z.string()).length(1),
  repetitions: z.array(z.number().int().positive()),
  voice: z.literal(false),
});
const attemptSchema = dialog.extend({
  step: z.string(),
  profile: z.string(),
  modality: z.literal('text'),
  applicationCommit: z.string(),
  comparisonContract: z.string(),
  outcome: z.enum(['pass', 'fail', 'inconclusive', 'error', 'aborted', 'not_run']),
});
const key = (value: ContinuationDialog) =>
  JSON.stringify([value.applicationVersion, value.repetition, value.scenario]);
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const conditions = (manifest: z.infer<typeof manifestSchema>) => ({
  plan: manifest.applicationComparison.plan,
  versions: manifest.applicationComparison.versions.map((version) => ({
    ...version,
    conversationWorkMode: version.conversationWorkMode ?? 'sequential',
  })),
  ...Object.fromEntries(
    [
      'textProfiles',
      'selectedBackendProfiles',
      'judgeProfile',
      'judgeSha256',
      'repetitions',
      'voice',
      'followUps',
      'measurementContracts',
      'assistanceTimingPolicy',
      'referenceVoice',
      'audio',
      'counting',
    ].map((name) => [name, manifest[name]]),
  ),
  catalogSha256: manifest.catalog.sha256,
});

/** Preflight a fresh text segment without changing its sources. Whole dialogs
 * are indivisible: even one attempted step prevents replay of that dialog.
 * Different evaluator contracts stay separate evidence, never merged verdicts. */
export async function prepareContinuation(
  continuation: EvaluationContinuation,
  currentManifest: unknown,
  priorUsd: number,
  destination: string,
  limitUsd?: number,
) {
  const current = manifestSchema.parse(currentManifest);
  if (!continuation.sourceDirectories.length || !continuation.scenarios.length)
    throw new Error('evaluation_continuation_empty');
  try {
    await access(destination);
    throw new Error('evaluation_continuation_destination_exists');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const selections = continuation.scenarios.map((value) => dialog.parse(value));
  if (new Set(selections.map(key)).size !== selections.length)
    throw new Error('evaluation_continuation_duplicate_selection');
  const directories = await Promise.all(
    continuation.sourceDirectories.map(async (source) => ({
      ...source,
      directory: await realpath(source.directory),
    })),
  );
  if (
    new Set(directories.map((source) => source.directory)).size !== directories.length ||
    directories.some((source) => source.directory === resolve(destination))
  )
    throw new Error('evaluation_continuation_duplicate_source');
  const sources = [];
  const attempts: z.infer<typeof attemptSchema>[] = [];
  let chargesUsd = 0;
  let rootPriorUsd = 0;
  let largestSourceTotalUsd = 0;
  for (const source of directories) {
    const names = (await readdir(source.directory))
      .filter((name) => /^\d+-.+\.json$/.test(name))
      .sort();
    const records = await Promise.all(
      names.map(async (name) => {
        const bytes = await readFile(join(source.directory, name));
        const record = z
          .looseObject({
            format: z.literal('skyttel-model-evaluation'),
            version: z.literal(1),
            type: z.string(),
            data: z.unknown(),
          })
          .parse(JSON.parse(bytes.toString('utf8')));
        return { name, bytes, record };
      }),
    );
    const manifests = records.filter(({ record }) => record.type === 'manifest');
    if (manifests.length !== 1 || !records.some(({ record }) => record.type === 'recommendation'))
      throw new Error('evaluation_continuation_source_incomplete');
    const original = manifests[0];
    if (sha256(original.bytes) !== source.manifestSha256)
      throw new Error('evaluation_continuation_manifest_changed');
    const prior = manifestSchema.parse(original.record.data);
    if (!isDeepStrictEqual(conditions(prior), conditions(current)))
      throw new Error('evaluation_continuation_conditions_changed');
    const lineage = z
      .object({ sources: z.array(z.object({ directory: z.string(), manifestSha256: z.string() })) })
      .optional()
      .parse(prior.continuation);
    for (const ancestor of lineage?.sources ?? []) {
      if (
        !directories.some(
          (item) =>
            item.directory === ancestor.directory &&
            item.manifestSha256 === ancestor.manifestSha256,
        )
      )
        throw new Error('evaluation_continuation_lineage_incomplete');
    }
    for (const { record } of records.filter(({ record }) => record.type === 'attempt')) {
      const attempt = attemptSchema.parse(record.data);
      if (
        attempt.comparisonContract !== prior.applicationComparison.contractId ||
        attempt.profile !== prior.textProfiles[0] ||
        !prior.applicationComparison.versions.some(
          (version) =>
            version.id === attempt.applicationVersion &&
            version.commit === attempt.applicationCommit,
        )
      )
        throw new Error('evaluation_continuation_attempt_identity_changed');
      attempts.push(attempt);
    }
    const db = new Database(join(source.directory, 'budget.sqlite'), {
      readonly: true,
      fileMustExist: true,
    });
    let spentUsd: number;
    try {
      const totals = db
        .prepare('SELECT COUNT(*) AS unsettled FROM evaluation_charge WHERE actual IS NULL')
        .get() as { unsettled: number };
      if (totals.unsettled) throw new Error('evaluation_continuation_usage_unknown');
      const budget = db
        .prepare('SELECT prior, ceiling FROM evaluation_budget WHERE id = 1')
        .get() as { prior: number; ceiling: number | null };
      if (budget.ceiling !== (limitUsd === undefined ? null : Math.ceil(limitUsd * 1e6)))
        throw new Error('evaluation_continuation_budget_changed');
      spentUsd =
        (
          db.prepare('SELECT COALESCE(SUM(actual), 0) AS actual FROM evaluation_charge').get() as {
            actual: number;
          }
        ).actual / 1e6;
      chargesUsd += spentUsd;
      largestSourceTotalUsd = Math.max(largestSourceTotalUsd, budget.prior / 1e6 + spentUsd);
      if (!lineage) rootPriorUsd = Math.max(rootPriorUsd, budget.prior / 1e6);
    } finally {
      db.close();
    }
    sources.push({
      ...source,
      recordsSha256: sha256(Buffer.concat(records.map(({ bytes }) => bytes))),
      contractId: prior.applicationComparison.contractId,
      spentUsd,
    });
  }
  if (
    !Number.isFinite(priorUsd) ||
    Math.round(priorUsd * 1e6) <
      Math.round(Math.max(rootPriorUsd + chargesUsd, largestSourceTotalUsd) * 1e6)
  )
    throw new Error('evaluation_continuation_prior_spending_missing');
  for (const selection of selections) {
    const scenario = current.catalog.scenarios.find((item) => item.id === selection.scenario);
    if (
      !scenario ||
      !current.repetitions.includes(selection.repetition) ||
      !current.applicationComparison.versions.some(
        (version) => version.id === selection.applicationVersion,
      )
    )
      throw new Error('evaluation_continuation_selection_invalid');
    const previous = attempts.filter((attempt) => key(attempt) === key(selection));
    if (previous.some((attempt) => attempt.outcome !== 'not_run'))
      throw new Error('evaluation_continuation_dialog_already_attempted');
    if (!scenario.steps.every((step) => previous.some((attempt) => attempt.step === step)))
      throw new Error('evaluation_continuation_unrun_evidence_missing');
  }
  const selected = new Set(selections.map(key));
  return {
    includes: (value: ContinuationDialog) => selected.has(key(value)),
    manifest: {
      sources,
      scenarios: selections,
      sameContract: sources.every(
        (source) => source.contractId === current.applicationComparison.contractId,
      ),
      aggregation: 'separate_segments' as const,
      limitation:
        'Only explicitly selected, previously unrun whole dialogs execute. Prior verdicts and costs remain in their source records; this segment alone cannot establish complete comparison coverage. Different evaluator contracts cannot establish comparable performance.',
    },
  };
}
