import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { prepareComparison } from '../../../scripts/model-evaluation/comparison.js';
import {
  compareOverlap,
  overlapComparison,
  overlapScenarios,
} from '../../../scripts/model-evaluation/overlap.js';
import { verifiedProfile } from '../../../scripts/model-evaluation/provider.js';
import { runTextScenario } from '../../../scripts/model-evaluation/runner.js';
import type { Scenario } from '../../../scripts/model-evaluation/types.js';
import type { MapState } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { waitForAbortOrTimeout } from '../../support/abort-wait.js';
import { type ModelRequest, modelMessage, modelTool, textModel } from '../../support/text-model.js';

function descriptionChange(body: ModelRequest, description: string) {
  const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
  const proposal = turn.draft.changes.find((item: { id: string }) => item.id === 'lo');
  return modelTool('submit_changes', {
    version: turn.draft.version,
    contentVersion: turn.draft.contentVersion,
    completion: 'draft',
    questions: [],
    operations: [
      {
        name: 'propose_object',
        arguments: {
          id: 'lo',
          baseRevision: proposal.before.revision,
          value: {
            ...proposal.after,
            properties: [
              { id: 'description', label: 'Beskrivning', kind: 'text', value: description },
            ],
          },
        },
      },
    ],
  });
}

const stopScenario: Scenario = {
  id: 'controlled-stop',
  title: 'Stop through the public conversation control',
  voice: false,
  steps: [
    {
      id: 'held-question',
      text: 'Vad kostar Spotify Premium Family?',
      expected: { requirements: [] },
      userStop: {
        trigger: 'first-working-after-input',
        maximumObservationMs: 5000,
        allowedStates: [{ saves: 0, saveAttempts: 0, requirements: [] }],
      },
    },
  ],
};

test.each(['sequential', 'overlap'] as const)(
  'scripted user Stop in %s retains cancellation as an unsuccessful task and verifies its own endpoint',
  { tags: ['technical'] },
  async (conversationWorkMode) => {
    let aborted = 0;
    const model = textModel(async (request, signal) => {
      await waitForAbortOrTimeout(1500, signal, () => {
        aborted++;
      });
      return [descriptionChange(request, 'Fel efter stopp.')];
    });
    const run = await runTextScenario(
      stopScenario,
      {
        modelFetch: model.provider,
        conversationWorkMode,
      },
      { profile: 'controlled', repetition: 1 },
    );
    expect(run.attempts[0]).toMatchObject({
      outcome: 'aborted',
      reason: 'evaluation_scripted_user_stop',
      elapsedMs: null,
      scriptedStop: {
        contract: 'public-user-stop-v1',
        verdict: 'pass',
        matchedState: 0,
        terminalStatus: 'canceled',
        stateFailures: [],
      },
    });
    expect(run.attempts[0].scriptedStop?.endpointMs).toEqual(expect.any(Number));
    expect(run.attempts[0].timing?.successfulCompletionMs).toBeNull();
    expect(aborted).toBeGreaterThan(0);
  },
);

test('a task completed before the declared working boundary is inconclusive rather than a successful Stop', {
  tags: ['technical'],
}, async () => {
  const model = textModel(() => [modelMessage('Det färdiga svaret.')]);
  const run = await runTextScenario(
    stopScenario,
    {
      modelFetch: model.provider,
      deliverResponse: async (request, response) => {
        if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/messages'))
          await new Promise((resolve) => setTimeout(resolve, 150));
        return response;
      },
    },
    { profile: 'controlled', repetition: 1 },
  );
  expect(run.attempts[0]).toMatchObject({
    outcome: 'inconclusive',
    elapsedMs: null,
    scriptedStop: { verdict: 'inconclusive', endpointMs: null, reason: 'working_boundary_missed' },
  });
});

test('Stop preserves a previously completed checked draft batch while rejecting the stopped turn late result', {
  tags: ['technical'],
}, async () => {
  let work = 0;
  const model = textModel(async (request, signal) => {
    if (work++ === 0) return [descriptionChange(request, 'Läser poesi.')];
    await waitForAbortOrTimeout(1500, signal);
    return [descriptionChange(request, 'Fel efter stopp.')];
  });
  const run = await runTextScenario(
    {
      ...stopScenario,
      steps: [
        {
          id: 'complete-batch',
          text: 'Ändra Lo Bergs beskrivning till Läser poesi. Spara inte.',
          expected: {
            objects: {
              lo: {
                properties: [
                  {
                    id: 'description',
                    label: 'Beskrivning',
                    kind: 'text',
                    value: 'Läser poesi.',
                  },
                ],
              },
            },
            saves: 0,
            requirements: [],
          },
        },
        ...stopScenario.steps,
      ],
    },
    { modelFetch: model.provider },
    { profile: 'controlled', repetition: 1 },
  );
  expect(run.attempts.map((attempt) => attempt.outcome)).toEqual(['pass', 'aborted']);
  expect(run.attempts[1].scriptedStop).toMatchObject({ verdict: 'pass', stateFailures: [] });
  expect(
    run.finalMap.draft.changes.find((change) => change.id === 'lo')?.after?.properties,
  ).toEqual([{ id: 'description', label: 'Beskrivning', kind: 'text', value: 'Läser poesi.' }]);
});

async function lateStateChange(
  pendingRegisteredOutcome = false,
  startLateTask = false,
  holdLateTask = false,
) {
  let canceled = false;
  let changed = false;
  let requests = 0;
  let lateStarted!: () => void;
  const lateStart = new Promise<void>((resolve) => {
    lateStarted = resolve;
  });
  const model = textModel(async (_request, signal) => {
    if (requests++ > 0) {
      lateStarted();
      if (holdLateTask) await waitForAbortOrTimeout(1500, signal);
      return [modelMessage('Ett nytt arbete efter stopp.')];
    }
    await waitForAbortOrTimeout(1500, signal);
    return [modelMessage('Sent svar.')];
  });
  const scenario = structuredClone(stopScenario);
  const stop = scenario.steps[0].userStop;
  if (!stop) throw new Error('Missing controlled Stop contract');
  if (holdLateTask) stop.maximumObservationMs = 200;
  stop.allowedStates.push({
    objects: {
      lo: {
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text',
            value: 'Fel efter stopp.',
          },
        ],
      },
    },
    saves: 0,
    requirements: [],
  });
  const run = await runTextScenario(
    scenario,
    {
      modelFetch: model.provider,
      deliverResponse: async (request, response) => {
        const path = new URL(request.url).pathname;
        if (request.method === 'POST' && path.endsWith('/cancel')) {
          canceled = true;
          // Fault at the public delivery boundary: a registered effect remains
          // pending at acknowledgment, independently of the later forbidden task.
          if (pendingRegisteredOutcome)
            return Response.json(
              { ...(await response.json()), batchPending: true },
              { status: response.status, headers: response.headers },
            );
        }
        if (canceled && !changed && request.method === 'GET' && /\/messages\/[^/]+$/.test(path)) {
          changed = true;
          const base = request.url.split('/text-assistant/')[0];
          const headers = {
            cookie: request.headers.get('cookie') ?? '',
            origin: new URL(base).origin,
            'content-type': 'application/json',
          };
          const map = (await (await fetch(`${base}/map`, { headers })).json()) as MapState;
          const lo = map.objects.find((item) => item.id === 'lo');
          if (!lo) throw new Error('Missing Lo fixture');
          const { id, revision, householdId: _household, ...value } = lo;
          const mutation = await fetch(`${base}/map/draft`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              version: map.draft.version,
              contentVersion: map.contentVersion,
              id,
              baseRevision: revision,
              value: {
                ...value,
                properties: [
                  {
                    id: 'description',
                    label: 'Beskrivning',
                    kind: 'text',
                    value: 'Fel efter stopp.',
                  },
                ],
              },
            }),
          });
          expect(mutation.ok).toBe(true);
          if (startLateTask) {
            const conversation = request.url.split('/messages/')[0];
            const current = (await (
              await fetch(conversation, { headers })
            ).json()) as TextAssistantView;
            const requestId = randomUUID();
            const accepted = await fetch(`${conversation}/messages`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                requestId,
                revision: current.revision,
                draftVersion: current.review.version,
                contentVersion: current.review.contentVersion,
                text: 'Ett otillåtet nytt uppdrag efter stopp.',
              }),
            });
            expect(accepted.ok).toBe(true);
            await lateStart;
            const deadline = Date.now() + 2000;
            for (; !holdLateTask; ) {
              const status = (await (
                await fetch(`${conversation}/messages/${requestId}`, { headers })
              ).json()) as TextAssistantView;
              if (status.taskStatus === 'completed') break;
              if (Date.now() > deadline) throw new Error('Controlled late task did not complete');
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
          }
        }
        return response;
      },
    },
    { profile: 'controlled', repetition: 1 },
  );
  expect(changed).toBe(true);
  return run;
}

test('an otherwise allowed state introduced after Stop acknowledgement is rejected', {
  tags: ['technical'],
}, async () => {
  const run = await lateStateChange();
  expect(run.attempts[0]).toMatchObject({
    outcome: 'fail',
    elapsedMs: null,
    scriptedStop: { verdict: 'fail', stateFailures: ['state_changed_after_stop_acknowledgment'] },
  });
});

test('proven task work after Stop remains a correctness failure alongside unattributed registered effects', {
  tags: ['technical'],
}, async () => {
  const result = await lateStateChange(true, true);
  expect(result.attempts[0]).toMatchObject({
    outcome: 'fail',
    scriptedStop: {
      verdict: 'fail',
      reason: 'registered_outcome_attribution_incomplete',
      stateFailures: expect.arrayContaining(['new_task_work_after_stop_acknowledgment']),
      endpointMs: null,
    },
  });
  const comparison = prepareComparison(
    overlapComparison({ directory: '/controlled/app', modality: 'text' }),
    overlapScenarios(),
    verifiedProfile('sol-high'),
    { catalog: 'controlled', audio: 'controlled', judge: 'controlled', followUps: true },
  );
  expect(
    compareOverlap(
      [
        {
          ...result.attempts[0],
          scenario: 'overlap-early-stop',
          step: overlapScenarios()[2].steps[0].id,
          profile: comparison.profile.id,
          applicationVersion: comparison.versions[0].id,
          applicationCommit: comparison.versions[0].commit,
          comparisonContract: comparison.contractId,
        },
      ],
      comparison,
    ),
  ).toMatchObject({ status: 'rejected', waitDecision: 'rejected' });
});

test('an unattributed registered state change without proven late work remains inconclusive', {
  tags: ['technical'],
}, async () => {
  const run = await lateStateChange(true);
  expect(run.attempts[0]).toMatchObject({
    outcome: 'inconclusive',
    scriptedStop: {
      verdict: 'inconclusive',
      reason: 'registered_outcome_attribution_incomplete',
      stateFailures: [],
      endpointMs: null,
    },
  });
});

test('proven work after Stop remains a failure while later provider settlement is incomplete', {
  tags: ['technical'],
}, async () => {
  const run = await lateStateChange(true, true, true);
  expect(run.attempts[0]).toMatchObject({
    outcome: 'fail',
    scriptedStop: {
      verdict: 'fail',
      reason: 'stop_endpoint_observation_incomplete',
      stateFailures: ['new_task_work_after_stop_acknowledgment'],
      endpointMs: null,
    },
  });
});
