import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from 'vitest';
import { EvaluationBudget } from '../../../scripts/model-evaluation/budget.js';
import { prepareContinuation } from '../../../scripts/model-evaluation/continuation.js';
import { evaluationReporter } from '../../../scripts/model-evaluation/report.js';

const selection = { applicationVersion: 'overlap', repetition: 1, scenario: 'change' };
const manifest = {
  applicationComparison: {
    contractId: 'new-contract',
    plan: { id: 'pilot', repetitions: [1] },
    versions: [
      { id: 'sequential', commit: 'same-app' },
      { id: 'overlap', commit: 'same-app' },
    ],
  },
  catalog: { sha256: 'catalog', scenarios: [{ id: 'change', steps: ['first', 'second'] }] },
  textProfiles: ['sol-high'],
  selectedBackendProfiles: [{ id: 'sol-high', model: 'gpt-6.1-sol' }],
  judgeSha256: 'judge',
  judgeProfile: { id: 'judge' },
  voice: false,
  followUps: true,
  repetitions: [1],
};

async function source(
  directory: string,
  options: {
    attempted?: boolean;
    unknown?: boolean;
    manifest?: Record<string, unknown>;
  } = {},
) {
  const report = evaluationReporter(directory, 696);
  await report('manifest', 'Source', {
    ...manifest,
    applicationComparison: { ...manifest.applicationComparison, contractId: 'old-contract' },
    ...options.manifest,
  });
  for (const step of ['first', 'second'])
    await report('attempt', step, {
      ...selection,
      step,
      profile: 'sol-high',
      modality: 'text',
      applicationCommit: 'same-app',
      comparisonContract: 'old-contract',
      outcome: options.attempted && step === 'first' ? 'aborted' : 'not_run',
    });
  await report('recommendation', 'Stopped', { qualificationComplete: false });
  const db = new Database(join(directory, 'budget.sqlite'));
  const budget = new EvaluationBudget(db, { authorized: true, priorUsd: 0, priorSource: 'Test' });
  const charge = budget.reserve('backend', 1);
  budget.settle(charge, options.unknown ? null : 0.5);
  budget.stop('evaluation_usage_unknown');
  db.close();
  return {
    directory,
    manifestSha256: createHash('sha256')
      .update(await readFile(join(directory, '0001-manifest.json')))
      .digest('hex'),
  };
}

test('continuation selects only a fully unrun dialog and labels a changed evaluator contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'evaluation-continuation-'));
  try {
    const prior = await source(join(directory, 'prior'));
    const result = await prepareContinuation(
      {
        sourceDirectories: [prior],
        scenarios: [selection],
      },
      manifest,
      0.5,
      join(directory, 'next'),
    );
    expect(result.manifest).toMatchObject({
      sameContract: false,
      aggregation: 'separate_segments',
    });
    expect(result.includes(selection)).toBe(true);
    expect(result.includes({ ...selection, applicationVersion: 'sequential' })).toBe(false);
    const matching = await prepareContinuation(
      { sourceDirectories: [prior], scenarios: [selection] },
      {
        ...manifest,
        applicationComparison: { ...manifest.applicationComparison, contractId: 'old-contract' },
      },
      0.5,
      join(directory, 'next'),
    );
    expect(matching.manifest.sameContract).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test.each([
  {
    name: 'an aborted first step',
    options: { attempted: true },
    priorUsd: 0.5,
    error: 'dialog_already_attempted',
  },
  {
    name: 'an unknown canceled charge',
    options: { unknown: true },
    priorUsd: 1,
    error: 'usage_unknown',
  },
  { name: 'omitted prior spending', options: {}, priorUsd: 0.49, error: 'prior_spending_missing' },
  {
    name: 'changed scenario conditions',
    options: { manifest: { catalog: { ...manifest.catalog, sha256: 'different' } } },
    priorUsd: 0.5,
    error: 'conditions_changed',
  },
])('continuation refuses $name before paid execution', async ({ options, priorUsd, error }) => {
  const directory = await mkdtemp(join(tmpdir(), 'evaluation-continuation-'));
  try {
    const prior = await source(join(directory, 'prior'), options);
    await expect(
      prepareContinuation(
        { sourceDirectories: [prior], scenarios: [selection] },
        manifest,
        priorUsd,
        join(directory, 'next'),
      ),
    ).rejects.toThrow(`evaluation_continuation_${error}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an older unrun record cannot hide an attempted dialog in a later segment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'evaluation-continuation-'));
  try {
    const first = await source(join(directory, 'first'));
    const second = await source(join(directory, 'second'), {
      attempted: true,
      manifest: { continuation: { sources: [first] } },
    });
    await expect(
      prepareContinuation(
        { sourceDirectories: [second], scenarios: [selection] },
        manifest,
        1,
        join(directory, 'next'),
      ),
    ).rejects.toThrow('evaluation_continuation_lineage_incomplete');
    await expect(
      prepareContinuation(
        { sourceDirectories: [first, second], scenarios: [selection] },
        manifest,
        1,
        join(directory, 'next'),
      ),
    ).rejects.toThrow('evaluation_continuation_dialog_already_attempted');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('continuation verifies source manifests, preserves a ceiling and refuses an existing destination', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'evaluation-continuation-'));
  try {
    const prior = await source(join(directory, 'prior'));
    await expect(
      prepareContinuation(
        { sourceDirectories: [{ ...prior, manifestSha256: 'changed' }], scenarios: [selection] },
        manifest,
        0.5,
        join(directory, 'next'),
      ),
    ).rejects.toThrow('evaluation_continuation_manifest_changed');
    await expect(
      prepareContinuation(
        { sourceDirectories: [prior], scenarios: [selection] },
        manifest,
        0.5,
        join(directory, 'next'),
        10,
      ),
    ).rejects.toThrow('evaluation_continuation_budget_changed');
    await expect(
      prepareContinuation(
        { sourceDirectories: [prior], scenarios: [selection] },
        manifest,
        0.5,
        prior.directory,
      ),
    ).rejects.toThrow('evaluation_continuation_destination_exists');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
