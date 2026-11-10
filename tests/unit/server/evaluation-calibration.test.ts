import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, expect, test, vi } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import { type EvaluationPlan, evaluateModels } from '../../../scripts/model-evaluation/evaluate.js';
import { judgeInstructions } from '../../../scripts/model-evaluation/judge.js';
import {
  judgeCalibrationIdentity,
  prepareJudgeCalibration,
  reuseJudgeCalibration,
} from '../../../scripts/model-evaluation/judge-calibration.js';
import controls from '../../../scripts/model-evaluation/judge-controls.json' with { type: 'json' };
import { verifiedProfile } from '../../../scripts/model-evaluation/provider.js';
import type { Scenario } from '../../../scripts/model-evaluation/types.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
const profile = verifiedProfile('judge-sol-high');
const identity = { profile, origin: 'controlled' as const };
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-calibration-'));
  directories.push(directory);
  const record = <T>(type: string, data: T) => ({
    format: 'skyttel-model-evaluation',
    version: 1,
    issue: 713,
    type,
    data,
  });
  const manifest = record('manifest', {
    origin: 'controlled',
    commit,
    judgeProfile: profile,
    judgeSha256: judgeCalibrationIdentity(profile),
  });
  await writeFile(join(directory, '0001-manifest.json'), JSON.stringify(manifest));
  const calls = [];
  const now = Date.now() - 10000;
  for (const [index, control] of controls.cases.entries()) {
    const expected = Object.fromEntries(
      Object.entries(control.expected).filter((entry) => typeof entry[1] === 'string'),
    );
    await writeFile(
      join(directory, `${String(index + 2).padStart(4, '0')}-judge_control.json`),
      JSON.stringify(
        record('judge_control', {
          id: control.id,
          expected,
          costUsd: 0.01,
          result: Object.entries(expected).map(([id, outcome]) => ({
            id,
            outcome,
            reason: 'Controlled verdict.',
          })),
        }),
      ),
    );
    calls.push({
      id: String(index),
      kind: 'judge',
      startedAt: now + index,
      endedAt: now + index + 1,
      outcome: 'completed',
      costUsd: 0.01,
      request: {
        model: profile.model,
        reasoning: { effort: profile.effort },
        service_tier: profile.serviceTier,
        max_output_tokens: profile.maxOutputTokens,
        instructions: judgeInstructions,
        input: [
          {
            role: 'user',
            content: JSON.stringify({
              context: control.context,
              sources: control.sources,
              requirements: control.requirements,
            }),
          },
        ],
      },
    });
  }
  await writeFile(
    join(directory, 'private-calls.jsonl.gz'),
    gzipSync(calls.map((call) => JSON.stringify(call)).join('\n')),
  );
  return { directory, calls, manifest };
}

test('complete calibration is reusable with provenance and no new cost', {
  tags: ['technical'],
}, async () => {
  const { directory } = await fixture();
  const reference = await prepareJudgeCalibration(directory, identity);
  expect(await reuseJudgeCalibration(reference, identity)).toMatchObject({
    directory,
    issue: 713,
    commit,
    origin: 'controlled',
    controls: controls.cases.length,
    originalCostUsd: expect.closeTo(0.68),
    newCostUsd: 0,
    newCalls: 0,
    ageMs: expect.any(Number),
  });
  await expect(
    reuseJudgeCalibration({ ...reference, sha256: 'changed' }, identity),
  ).rejects.toThrow('evaluation_judge_calibration_changed');
});

test.each(['voice_dispatch', 'playback_transcription'])(
  'non-provider %s records do not invalidate complete calibration',
  {
    tags: ['technical'],
  },
  async (kind) => {
    const { directory, calls } = await fixture();
    await writeFile(
      join(directory, 'private-calls.jsonl.gz'),
      gzipSync([...calls, { kind, at: Date.now() }].map((call) => JSON.stringify(call)).join('\n')),
    );
    const reference = await prepareJudgeCalibration(directory, identity);
    expect((await reuseJudgeCalibration(reference, identity)).controls).toBe(68);
  },
);

test.each(['gzip', 'json', 'null', 'request', 'id', 'commit'])(
  'malformed %s evidence fails with the calibration error before reuse',
  { tags: ['technical'] },
  async (kind) => {
    const { directory, calls, manifest } = await fixture();
    let capture = calls.map((call) => JSON.stringify(call)).join('\n');
    if (kind === 'json') capture = '{';
    if (kind === 'null') capture = `null\n${capture}`;
    if (kind === 'request' || kind === 'id') {
      const first = JSON.parse(JSON.stringify(calls[0]));
      delete first[kind];
      capture = [first, ...calls.slice(1)].map((call) => JSON.stringify(call)).join('\n');
    }
    if (kind === 'commit') {
      manifest.data.commit = '0'.repeat(40);
      await writeFile(join(directory, '0001-manifest.json'), JSON.stringify(manifest));
    }
    await writeFile(
      join(directory, 'private-calls.jsonl.gz'),
      kind === 'gzip' ? 'invalid' : gzipSync(capture),
    );
    await expect(prepareJudgeCalibration(directory, identity)).rejects.toThrow(
      'evaluation_judge_calibration_invalid',
    );
  },
);

test('dispatch rechecks changed evidence and elapsed freshness after preparation', {
  tags: ['technical'],
}, async () => {
  const { directory } = await fixture();
  const reference = await prepareJudgeCalibration(directory, identity);
  const file = join(directory, '0002-judge_control.json');
  const original = await readFile(file, 'utf8');
  const changed = JSON.parse(original);
  changed.data.result[0].reason = 'Another valid explanation.';
  await writeFile(file, JSON.stringify(changed));
  await expect(reuseJudgeCalibration(reference, identity)).rejects.toThrow(
    'evaluation_judge_calibration_changed',
  );
  await writeFile(file, original);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
  try {
    await expect(reuseJudgeCalibration(reference, identity)).rejects.toThrow(
      'evaluation_judge_calibration_expired',
    );
  } finally {
    clock.mockRestore();
  }
});

test.each([
  'missing',
  'failed',
  'duplicate',
  'expected',
  'request',
  'cost',
  'unfinished',
  'stale',
  'future',
  'profile',
  'implementation',
  'origin',
])('rejects %s calibration evidence', { tags: ['technical'] }, async (failure) => {
  const { directory, calls, manifest } = await fixture();
  const file = join(directory, '0002-judge_control.json');
  const control = JSON.parse(await readFile(file, 'utf8'));
  if (failure === 'missing') await rm(file);
  if (failure === 'failed') control.data.result[0].outcome = 'inconclusive';
  if (failure === 'duplicate') control.data.result.push(control.data.result[0]);
  if (failure === 'expected') control.data.expected = {};
  if (['failed', 'duplicate', 'expected'].includes(failure))
    await writeFile(file, JSON.stringify(control));
  if (failure === 'request') calls[0].request.model = 'another-model';
  if (failure === 'cost') calls[0].costUsd = 1;
  if (failure === 'unfinished') calls[0].outcome = 'started';
  if (failure === 'stale' || failure === 'future') {
    const shift = (failure === 'stale' ? -48 : 48) * 60 * 60 * 1000;
    for (const call of calls) {
      call.startedAt += shift;
      call.endedAt += shift;
    }
  }
  await writeFile(
    join(directory, 'private-calls.jsonl.gz'),
    gzipSync(calls.map((call) => JSON.stringify(call)).join('\n')),
  );
  if (failure === 'profile')
    manifest.data.judgeProfile = { ...profile, maxOutputTokens: profile.maxOutputTokens - 1 };
  if (failure === 'implementation') manifest.data.commit = '0'.repeat(40);
  await writeFile(join(directory, '0001-manifest.json'), JSON.stringify(manifest));
  await expect(
    prepareJudgeCalibration(
      directory,
      failure === 'origin' ? { ...identity, origin: 'provider' } : identity,
    ),
  ).rejects.toThrow();
});

test('reuse skips calibration calls, reduces bounds and does not charge historical usage', {
  tags: ['technical'],
}, async () => {
  const { directory } = await fixture();
  const reference = await prepareJudgeCalibration(directory, identity);
  const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('unexpected_network'));
  const plan: EvaluationPlan = {
    issue: 713,
    directory: join(directory, 'next'),
    apiKey: 'controlled',
    authorized: true,
    priorUsd: 0,
    priorSource: 'Controlled test',
    commit,
    limitUsd: 0.000001,
    textProfiles: ['sol-high'],
    judgeProfile: profile,
    baselineProfiles: {},
    scenarioSet: [catalog.scenarios[0] as Scenario],
    repetitions: [1],
    localVerification: { passed: true, commands: ['npm run test:unit'], evidence: 'Controlled' },
    judgeCalibration: reference,
  };
  const result = await evaluateModels(plan, { transport });
  expect(transport).not.toHaveBeenCalled();
  expect(result.budget.spentUsd).toBe(0);
  expect(result.budget.reason).toBe('evaluation_budget_exceeded');
  const files = await readdir(plan.directory);
  expect(files.filter((file) => file.endsWith('-judge_control.json'))).toHaveLength(0);
  const reused = JSON.parse(
    await readFile(
      join(
        plan.directory,
        files.find((file) => file.endsWith('-judge_calibration_reuse.json')) ?? '',
      ),
      'utf8',
    ),
  );
  expect(reused.data).toMatchObject({ newCostUsd: 0, newCalls: 0, sha256: reference.sha256 });
  const manifest = JSON.parse(await readFile(join(plan.directory, '0001-manifest.json'), 'utf8'));
  expect(manifest.data.judgeCalibration.mode).toBe('reused');
  expect(manifest.data.estimates['sol-high'].judgeMaximumCalls).toBe(3);
  // Revalidate before creating output or contacting any provider.
  await expect(
    evaluateModels(
      {
        ...plan,
        directory: join(directory, 'invalid'),
        judgeCalibration: { ...reference, sha256: 'changed' },
      },
      { transport },
    ),
  ).rejects.toThrow('evaluation_judge_calibration_changed');
  expect(transport).not.toHaveBeenCalled();
});
