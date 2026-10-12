import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import {
  compareEvaluationProfiles,
  compareProfiles,
  evaluationReporter,
  summarizeProfile,
} from '../../../scripts/model-evaluation/report.js';
import { referenceSpeech } from '../../../scripts/model-evaluation/speech.js';
import type { Attempt } from '../../../scripts/model-evaluation/types.js';

test.each(['json', 'md'])(
  'reporter refuses to overwrite existing %s evidence in a reused directory',
  { tags: ['technical'] },
  async (extension) => {
    const directory = await mkdtemp(join(tmpdir(), 'skyttel-report-collision-'));
    const path = join(directory, `0001-diagnostic.${extension}`);
    const original = 'Original evaluation evidence.\n';
    try {
      await writeFile(path, original, { flag: 'wx' });
      await expect(
        evaluationReporter(directory, 368)('diagnostic', 'Replacement', { replacement: true }),
      ).rejects.toMatchObject({ code: 'EEXIST' });
      expect(await readFile(path, 'utf8')).toBe(original);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test('public report artifacts hash session IDs throughout JSON, titles and prose', {
  tags: ['technical'],
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-public-report-'));
  const sessionId = ['live', 'u1', 'A'.repeat(32)].join('_');
  const otherId = ['live', 'u1', 'B'.repeat(32)].join('_');
  const reference = (id: string) =>
    `session-sha256-${createHash('sha256').update(id).digest('hex')}`;
  const data = {
    sessions: [{ sessionId }, { sessionId }, { sessionId: otherId }, { sessionId: null }],
    details: { reason: `Session ${sessionId} ended.`, attemptId: 'voice-attempt' },
    seconds: 5,
    costUsd: 0.01,
  };
  const original = structuredClone(data);
  try {
    const path = await evaluationReporter(directory, 368)(
      'diagnostic',
      `Session ${sessionId}`,
      data,
      `Compared with ${otherId}.`,
    );
    const json = await readFile(join(directory, '0001-diagnostic.json'), 'utf8');
    const markdown = await readFile(path, 'utf8');
    expect(JSON.parse(json)).toEqual({
      format: 'skyttel-model-evaluation',
      version: 1,
      issue: 368,
      type: 'diagnostic',
      data: {
        ...data,
        sessions: [
          { sessionId: reference(sessionId) },
          { sessionId: reference(sessionId) },
          { sessionId: reference(otherId) },
          { sessionId: null },
        ],
        details: { ...data.details, reason: `Session ${reference(sessionId)} ended.` },
      },
    });
    expect(markdown).toBe(
      `## Session ${reference(sessionId)}\n\nCompared with ${reference(otherId)}.\n\n` +
        `\`\`\`json\n${json}\`\`\`\n`,
    );
    expect(json + markdown).not.toContain(sessionId);
    expect(json + markdown).not.toContain(otherId);
    expect(data).toEqual(original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('qualification needs every step and repetition, with equal scenario weighting', {
  tags: ['technical'],
}, () => {
  const scenarios = [
    { id: 'one', steps: [{ id: 'a' }] },
    { id: 'two', steps: [{ id: 'b' }, { id: 'c' }] },
  ];
  const values: Attempt[] = [1, 2, 3].flatMap((repetition) =>
    scenarios.flatMap((scenario) =>
      scenario.steps.map((step) => ({
        scenario: scenario.id,
        step: step.id,
        profile: 'reference',
        repetition,
        modality: 'text' as const,
        outcome: 'pass' as const,
        fixed: [],
        elapsedMs: 10_000,
        backendCostUsd: 0.01,
      })),
    ),
  );
  const reference = summarizeProfile(values, scenarios, 'reference', 'text', [1, 2, 3]);
  expect(reference.meanScenarioMedianMs).toBe(15_000);
  const faster: Attempt[] = values.map((item) => ({
    ...item,
    profile: 'candidate',
    elapsedMs: 8000,
  }));
  expect(
    compareProfiles(reference, summarizeProfile(faster, scenarios, 'candidate', 'text', [1, 2, 3])),
  ).toMatchObject({ faster: true, deltaSeconds: 3, percent: 20 });
  faster[0].outcome = 'fail';
  faster[0].elapsedMs = null;
  expect(
    compareProfiles(reference, summarizeProfile(faster, scenarios, 'candidate', 'text', [1, 2, 3]))
      .label,
  ).toBe('Ej jämförbart');
  const singleRound = values.filter((item) => item.repetition === 1);
  const singleReference = summarizeProfile(singleRound, scenarios, 'reference', 'text', [1]);
  expect(singleReference.finalQualified).toBe(true);
  const singleCandidate = summarizeProfile(
    singleRound.map((item) => ({ ...item, profile: 'candidate', elapsedMs: 8000 })),
    scenarios,
    'candidate',
    'text',
    [1],
  );
  expect(compareProfiles(singleReference, singleCandidate)).toMatchObject({ faster: true });
  const slightlyFaster = compareProfiles(singleReference, {
    ...singleCandidate,
    meanScenarioMedianMs: 14_900,
    totals: [29_800],
  });
  expect(slightlyFaster).toMatchObject({ faster: true, deltaSeconds: 0.1 });
  expect(slightlyFaster.recommendation).toContain('Bedöm redovisad svarstid och kostnad');
  expect(compareProfiles(reference, singleCandidate)).toMatchObject({ label: 'Ej jämförbart' });
  expect(summarizeProfile(singleRound.slice(1), scenarios, 'reference', 'text', [1])).toMatchObject(
    { qualified: false, finalQualified: false },
  );
  expect(summarizeProfile(singleRound, scenarios, 'reference', 'text', [1, 2])).toMatchObject({
    qualified: false,
    finalQualified: false,
  });
  expect(summarizeProfile([], scenarios, 'reference', 'text', [])).toMatchObject({
    qualified: false,
    finalQualified: false,
  });
});

test.each(['marin', 'cedar'] as const)(
  '%s has verified PCM matching every voice utterance',
  {
    tags: ['technical'],
  },
  async (voice) => {
    const steps = catalog.scenarios
      .filter((scenario) => scenario.voice)
      .flatMap((scenario) => scenario.steps.filter((step) => 'text' in step));
    expect(steps).toHaveLength(13);
    for (const step of steps) {
      const reference = await referenceSpeech(step.id, step.text, voice);
      expect(reference.clip.sampleRate).toBe(24000);
      expect(reference.clip.file).toBe(`${voice}/${step.id}.wav`);
      expect(Buffer.from(reference.pcm, 'base64').length).toBe(reference.clip.frames * 2);
      expect(reference.clip.durationSeconds).toBe(
        reference.clip.frames / reference.clip.sampleRate,
      );
    }
  },
);

test('voice references reject scenario wording that differs from their recorded text', {
  tags: ['technical'],
}, async () => {
  const id = 'kort-utan-sparande';
  const reference = await referenceSpeech(id);
  await expect(referenceSpeech(id, reference.clip.text)).resolves.toEqual(reference);
  await expect(referenceSpeech(id, `${reference.clip.text} Extra text.`)).rejects.toThrow(
    `evaluation_audio_reference_mismatch:${id}`,
  );
});

test('one supplied candidate can be recommended using a recorded text or voice reference', {
  tags: ['technical'],
}, () => {
  const summary = {
    profile: 'reference',
    modality: 'text' as 'text' | 'voice',
    qualified: true,
    finalQualified: true,
    meanScenarioMedianMs: 10_000,
    totals: [10_000, 10_000, 10_000],
    scenarioTimes: [{ scenario: 'one', medianMs: 10_000, minMs: 10_000, maxMs: 10_000 }],
    outcomes: { pass: 3 },
    backendCostUsd: 0.03,
  };
  for (const modality of ['text', 'voice'] as const) {
    const reference = {
      issue: 300,
      url: 'https://github.com/viscalyx/skyttel/issues/300',
      commit: 'same',
      catalogSha256: 'catalog',
      judgeSha256: 'judge',
      summary: { ...summary, modality },
    };
    const candidate = {
      ...summary,
      profile: 'supplied',
      modality,
      meanScenarioMedianMs: 8000,
      totals: [8000, 8000, 8000],
    };
    const current = {
      commit: 'same',
      catalogSha256: 'catalog',
      judgeSha256: 'judge',
      baselineProfiles: { [modality]: 'reference' },
    };
    const result = compareEvaluationProfiles([candidate], [reference], current);
    expect(result.comparisons).toEqual([]);
    expect(result.historicalComparisons).toHaveLength(1);
    expect(result.recommendation).toContain('Bedöm redovisad svarstid och kostnad');
    expect(result.recommendationBasis).toMatchObject({
      reference: 'reference',
      referenceIssue: 300,
      candidate: 'supplied',
      faster: true,
    });
    expect(
      compareEvaluationProfiles(
        [{ ...candidate, totals: [8000], outcomes: { pass: 1 } }],
        [
          {
            ...reference,
            summary: {
              ...reference.summary,
              finalQualified: false,
              totals: [10_000],
              outcomes: { pass: 1 },
            },
          },
        ],
        current,
      ).recommendationBasis,
    ).toMatchObject({ referenceIssue: 300, faster: true });
    expect(
      compareEvaluationProfiles([candidate], [reference], {
        ...current,
        commit: 'changed',
      }).recommendationBasis,
    ).toBeNull();
    expect(
      compareEvaluationProfiles([{ ...candidate, finalQualified: false }], [reference], current)
        .recommendationBasis,
    ).toBeNull();
    expect(
      compareEvaluationProfiles(
        [candidate],
        [
          {
            ...reference,
            summary: {
              ...reference.summary,
              finalQualified: false,
              qualified: false,
              outcomes: { not_run: 3 },
            },
          },
        ],
        current,
      ).recommendationBasis,
    ).toBeNull();
    expect(
      compareEvaluationProfiles(
        [candidate],
        [
          {
            ...reference,
            summary: {
              ...reference.summary,
              finalQualified: false,
              qualified: false,
              outcomes: { fail: 1, pass: 2 },
            },
          },
        ],
        current,
      ).recommendationBasis,
    ).toMatchObject({ referenceIssue: 300, baseline: true });
    for (const judgeSha256 of ['different-judge', undefined]) {
      expect(
        compareEvaluationProfiles([candidate], [{ ...reference, judgeSha256 }], current)
          .recommendationBasis,
      ).toBeNull();
    }
    expect(
      compareEvaluationProfiles([candidate], [reference], {
        ...current,
        baselineProfiles: { [modality]: 'current-application-model' },
      }).recommendationBasis,
    ).toBeNull();
  }
});
