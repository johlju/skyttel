import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import {
  executeAdvancedCampaign,
  prepareAdvancedCampaign,
} from '../../../scripts/model-evaluation/advanced-campaign.js';
import { executeAdvancedContext } from '../../../scripts/model-evaluation/advanced-context-run.js';
import { judgeInstructions } from '../../../scripts/model-evaluation/judge.js';
import controls from '../../../scripts/model-evaluation/judge-controls.json' with { type: 'json' };
import { pendingContext } from '../../../scripts/model-evaluation/pending-context.js';
import { modelMessage, modelTool, pricedProvider, textModel } from '../../support/text-model.js';

test('unpaid preparation freezes exact subsets and rejects dispatch without separate authorization', {
  tags: ['technical'],
}, async () => {
  const transport = vi.fn();
  const freeze = await prepareAdvancedCampaign();
  expect(freeze.authorized).toBe(false);
  expect(freeze.approvedCeilings).toBeNull();
  expect(freeze.runs.map((run) => [run.id, run.scenarioIds])).toEqual([
    [
      'A-terra',
      [
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
      ],
    ],
    ['A-sol', ['save-last', 'unknown-user', 'no-user']],
  ]);
  expect(freeze.judge.controlCount).toBe(68);
  expect(freeze.excludedCoverage).toEqual([
    'natural_context_saturation',
    'physical_provider_limit',
  ]);
  expect(freeze.runs.every((run) => run.proposedLimitUsd <= 25)).toBe(true);
  await expect(
    executeAdvancedCampaign(freeze, { authorized: false }, { transport }),
  ).rejects.toThrow('authorization');
  expect(transport).not.toHaveBeenCalled();
});

test.each(['interpretation', 'checking', 'work', 'judging', 'summary'] as const)(
  'unknown %s usage stops the campaign without retries or borrowing',
  { tags: ['technical'], timeout: 30_000 },
  async (category) => {
    const directory = await mkdtemp(join(tmpdir(), 'advanced-categories-'));
    try {
      const freeze = await prepareAdvancedCampaign();
      let calibration = 0;
      let uncertain = 0;
      let laterDispatches = 0;
      const model = textModel((body) => {
        if (category === 'summary') {
          const message = JSON.parse(
            String(body.input.findLast((item) => item.role === 'user')?.content),
          ).message;
          if (message === pendingContext.request)
            return [
              modelTool('ask_questions', {
                questions: [
                  {
                    kind: 'change',
                    request: message,
                    question: 'Vem avses?',
                    dependsOnDraft: true,
                  },
                ],
              }),
            ];
        }
        return [modelMessage('Ett kontrollerat svar.')];
      });
      const transport: typeof fetch = async (url, init) => {
        if (uncertain) laterDispatches++;
        const body = JSON.parse(String(init?.body));
        const isJudge = body.instructions === judgeInstructions;
        const isControl = isJudge && calibration < controls.cases.length;
        const target =
          !isControl &&
          ((category === 'interpretation' && body.instructions.startsWith('SKYTTEL_TURN_SCOPE')) ||
            (category === 'checking' && body.instructions.startsWith('SKYTTEL_TURN_ACTIONS')) ||
            (category === 'work' && !isJudge && !body.instructions.startsWith('SKYTTEL_TURN_')) ||
            (category === 'judging' && isJudge) ||
            (category === 'summary' && body.instructions.startsWith('Sammanfatta avslutad')));
        if (target) {
          uncertain++;
          return Response.json({ error: { message: 'Controlled unknown usage' } }, { status: 503 });
        }
        if (isJudge) {
          const input = JSON.parse(body.input[0].content);
          const control = isControl ? controls.cases[calibration++] : undefined;
          const output = modelMessage(
            JSON.stringify({
              verdicts: input.requirements.map(({ id }: { id: string }) => ({
                id,
                outcome: control
                  ? (control.expected as Record<string, string | undefined>)[id]
                  : 'pass',
                reason: 'Controlled verdict.',
              })),
            }),
          );
          return Response.json({
            id: `response-${calibration}`,
            object: 'response',
            status: 'completed',
            model: body.model,
            service_tier: 'default',
            output: [output],
            usage: {
              input_tokens: 120,
              output_tokens: 30,
              input_tokens_details: { cached_tokens: 20, cache_write_tokens: 0 },
              output_tokens_details: { reasoning_tokens: 10 },
            },
          });
        }
        const response = await pricedProvider(model.provider)(url, init);
        if (
          category === 'summary' &&
          !body.instructions.startsWith('SKYTTEL_TURN_') &&
          JSON.stringify(body.input.at(-1)).includes('Planeringsrad 1.1')
        ) {
          const data = await response.json();
          data.usage.input_tokens = 1_000_000;
          return Response.json(data);
        }
        return response;
      };
      if (category === 'summary') {
        // Keep the generic accounting regression without scheduling a paid
        // context-growth phase in the model-evaluation campaign.
        const contextDirectory = join(directory, 'controlled-context');
        await mkdir(contextDirectory);
        const result = await executeAdvancedContext({
          directory: contextDirectory,
          issue: 737,
          apiKey: 'controlled',
          limitUsd: 25,
          maximumGrowthMessages: 2,
          authorizationSource: 'Controlled summary accounting only',
          profile: freeze.runs[0].profile,
          judgeProfile: freeze.judge.profile,
          transport,
        });
        expect(calibration).toBe(68);
        expect(uncertain).toBe(1);
        expect(laterDispatches).toBe(0);
        expect(result.budget).toMatchObject({ stopped: true, reason: 'evaluation_usage_unknown' });
        expect(result.budget.reservedUsd).toBeGreaterThan(0);
        return;
      }
      const first = 'A-terra';
      const result = await executeAdvancedCampaign(
        freeze,
        {
          authorized: true,
          authorizationSource: 'Controlled only',
          freezeSha256: freeze.freezeSha256,
          directory: join(directory, 'run'),
          issue: 737,
          runs: [
            { id: first, limitUsd: 25 },
            { id: 'A-sol', limitUsd: 25 },
          ],
          localVerification: {
            passed: true,
            commands: ['controlled test'],
            evidence: 'controlled',
          },
        },
        { transport },
      );
      expect(calibration).toBe(68);
      expect(uncertain).toBe(1);
      expect(laterDispatches).toBe(0);
      expect(result.stopReason).toBe('evaluation_usage_unknown');
      expect(result.runs.find(({ id }) => id === first)?.budget?.reservedUsd).toBeGreaterThan(0);
      expect(result.runs.find(({ id }) => id === 'A-sol')?.status).toBe('not_run');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test.each([
  'freeze',
  'scope',
  'B-terra',
  'B-sol',
  'zero',
  'negative',
  'missing',
  'nan',
  'over-cap',
  'source',
])(
  'advanced execution refuses invalid %s before transport dispatch',
  { tags: ['technical'] },
  async (invalid) => {
    const freeze = await prepareAdvancedCampaign();
    const transport = vi.fn();
    const execution = {
      authorized: true,
      authorizationSource: 'Explicit controlled test authorization',
      freezeSha256: freeze.freezeSha256,
      directory: '/tmp/advanced-never-created',
      issue: 737,
      runs: [{ id: 'A-terra', limitUsd: 25 }],
      localVerification: { passed: true, commands: ['controlled test'], evidence: 'controlled' },
    };
    if (invalid === 'freeze') execution.freezeSha256 = 'stale';
    if (invalid === 'scope') execution.runs[0].id = 'C-terra';
    if (invalid === 'B-terra' || invalid === 'B-sol') execution.runs[0].id = invalid;
    if (invalid === 'source') execution.authorizationSource = '';
    if (invalid === 'zero') execution.runs[0].limitUsd = 0;
    if (invalid === 'negative') execution.runs[0].limitUsd = -1;
    if (invalid === 'over-cap') execution.runs[0].limitUsd = 25.01;
    if (invalid === 'nan') execution.runs[0].limitUsd = Number.NaN;
    if (invalid === 'missing') delete (execution.runs[0] as { limitUsd?: number }).limitUsd;
    await expect(executeAdvancedCampaign(freeze, execution, { transport })).rejects.toThrow(
      /authorization|freeze|scope|ceiling/,
    );
    expect(transport).not.toHaveBeenCalled();
  },
);

test('unknown calibration usage retains its whole hold and blocks every later phase/model', {
  tags: ['technical'],
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'advanced-test-'));
  try {
    const freeze = await prepareAdvancedCampaign();
    const transport = vi.fn(async () =>
      Response.json({ error: { message: 'Controlled unavailable usage.' } }, { status: 503 }),
    );
    const result = await executeAdvancedCampaign(
      freeze,
      {
        authorized: true,
        authorizationSource: 'Controlled authorization; no provider',
        freezeSha256: freeze.freezeSha256,
        directory: join(directory, 'run'),
        issue: 737,
        runs: freeze.runs.map(({ id }) => ({ id, limitUsd: 25 })),
        localVerification: { passed: true, commands: ['controlled test'], evidence: 'controlled' },
      },
      { transport },
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.runs[0]).toMatchObject({
      budget: { stopped: true, reason: 'evaluation_usage_unknown', reservedUsd: 4.67144 },
    });
    expect(result.runs.slice(1).every((run) => run.status === 'not_run')).toBe(true);
    expect(
      JSON.parse(await readFile(join(directory, 'run', 'campaign.json'), 'utf8')),
    ).toMatchObject({ origin: 'controlled', stopReason: 'evaluation_usage_unknown' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a phase cap cannot borrow a later model budget or restart the same execution', {
  tags: ['technical'],
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'advanced-cap-'));
  try {
    const freeze = await prepareAdvancedCampaign();
    const transport = vi.fn();
    const execution = {
      authorized: true,
      authorizationSource: 'Controlled only',
      freezeSha256: freeze.freezeSha256,
      directory: join(directory, 'run'),
      issue: 737,
      runs: [
        { id: 'A-terra', limitUsd: 1 },
        { id: 'A-sol', limitUsd: 25 },
      ],
      localVerification: { passed: true, commands: ['controlled test'], evidence: 'controlled' },
    };
    const result = await executeAdvancedCampaign(freeze, execution, { transport });
    expect(result.stopReason).toBe('evaluation_budget_exceeded');
    expect(result.runs[0].budget).toMatchObject({ spentUsd: 0, reservedUsd: 0, limitUsd: 1 });
    expect(result.runs[1].status).toBe('not_run');
    await expect(executeAdvancedCampaign(freeze, execution, { transport })).rejects.toThrow(
      'EEXIST',
    );
    expect(transport).not.toHaveBeenCalled();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
