import { afterEach, expect, test, vi } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import * as environments from '../../../scripts/model-evaluation/environment.js';
import * as speech from '../../../scripts/model-evaluation/speech.js';
import type { Scenario } from '../../../scripts/model-evaluation/types.js';
import { runVoiceScenario } from '../../../scripts/model-evaluation/voice-runner.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(complete = false) {
  vi.useFakeTimers();
  const view = {
    revision: 1,
    review: { version: 1, contentVersion: 1 },
    phase: 'listening',
    queuedMessages: 0,
    reply: 'Done',
  };
  const post = vi.fn(async (path: string) => {
    if (complete && path.endsWith('/poll')) {
      observe?.({
        at: Date.now() - 3000,
        sessionId: 'assistant',
        kind: 'voice_event',
        data: { role: 'assistant', delta: 'Done' },
      });
      observe?.({
        at: Date.now() - 3000,
        sessionId: 'assistant',
        kind: 'voice_commentary',
        data: {},
      });
    }
    return { assistant: view, voice: { phase: 'listening' } };
  });
  const environment = {
    path: 'assistant',
    assistant: { id: 'assistant' },
    get: vi.fn(async () => view),
    post,
    check: vi.fn(async () => []),
    judgeContext: vi.fn(() => 'Test context'),
    read: vi.fn(async () => ({})),
    close: vi.fn(async () => {}),
    installation: {
      summarizeForEvaluation: vi.fn(async () => ({
        installed: true,
        summary: 'Summary',
        retained: structuredClone(catalog.summaryHistory),
        view,
      })),
    },
  };
  let observe: NonNullable<Parameters<typeof environments.evaluationEnvironment>[1]>['observe'];
  vi.spyOn(environments, 'evaluationEnvironment').mockImplementation(async (_scenario, options) => {
    observe = options?.observe;
    return environment as unknown as Awaited<ReturnType<typeof environments.evaluationEnvironment>>;
  });
  const connection = {
    start: vi.fn(async () => 'voice'),
    play: vi.fn(async () => ({
      startedAt: Date.now() - 3000,
      endedAt: Date.now() - 2500,
      frames: 1,
      sha256: 'test',
    })),
    retire: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  vi.spyOn(speech, 'speechConnection').mockResolvedValue(
    connection as unknown as Awaited<ReturnType<typeof speech.speechConnection>>,
  );
  vi.spyOn(speech, 'referenceSpeech').mockResolvedValue({
    clip: { frames: 24000, sampleRate: 24000 },
    pcm: '',
  } as Awaited<ReturnType<typeof speech.referenceSpeech>>);
  let stopped = false;
  const timeLimit = vi.fn(() => {
    stopped = true;
  });
  const options = {
    profile: 'test',
    repetition: 1,
    maximumSeconds: 6,
    sessionTimeLimit: timeLimit,
    stopped: () => stopped,
    stopReason: () => (stopped ? 'evaluation_live_time_limit' : null),
  };
  const step = { id: 'utterance', text: 'Test', expected: { requirements: ['Test requirement'] } };
  const scenario: Scenario = {
    id: 'deadline',
    title: 'Session deadline',
    voice: true,
    steps: [step, { ...step, id: 'second' }],
  };
  return { environment, connection, options, scenario, timeLimit };
}

test('a voice deadline closes media and the session during endless polling', {
  tags: ['technical'],
}, async () => {
  const { scenario, options, connection, environment, timeLimit } = setup();
  const run = runVoiceScenario(scenario, {}, options);
  await vi.advanceTimersByTimeAsync(3999);
  expect(connection.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(26);
  const result = await run;
  expect(timeLimit).toHaveBeenCalledOnce();
  expect(connection.retire).toHaveBeenCalledOnce();
  expect(connection.close).toHaveBeenCalledOnce();
  expect(environment.post).toHaveBeenCalledWith('assistant/voice/voice/stop', {});
  expect(result.attempts[0]).toMatchObject({
    outcome: 'aborted',
    reason: 'evaluation_live_time_limit',
  });
  expect(result.attempts[1].outcome).toBe('not_run');
  expect(vi.getTimerCount()).toBe(0);
});

test('the voice deadline remains active during an intermediate judge wait', {
  tags: ['technical'],
}, async () => {
  const { scenario, options, connection, timeLimit } = setup(true);
  let release!: () => void;
  const judge = vi.fn(
    () =>
      new Promise<[]>((resolve) => {
        release = () => resolve([]);
      }),
  );
  const run = runVoiceScenario(scenario, {}, { ...options, judge });
  await vi.advanceTimersByTimeAsync(0);
  expect(judge).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(4000);
  expect(timeLimit).toHaveBeenCalledOnce();
  expect(connection.close).toHaveBeenCalledOnce();
  release();
  const result = await run;
  expect(result.attempts[0].outcome).toBe('aborted');
  expect(connection.start).toHaveBeenCalledOnce();
});

test('voice deadlines retire a connection even when startup never finishes', {
  tags: ['technical'],
}, async () => {
  const { scenario, options, connection, timeLimit } = setup();
  let rejectStartup!: (error: Error) => void;
  connection.start.mockImplementation(
    () =>
      new Promise<string>((_resolve, reject) => {
        rejectStartup = reject;
      }),
  );
  connection.close.mockImplementation(async () => {
    rejectStartup(new Error('browser_closed'));
  });
  const run = runVoiceScenario(
    scenario,
    {},
    { ...options, providerCalls: () => connection.start.mock.calls.length },
  );
  await vi.advanceTimersByTimeAsync(4000);
  const result = await run;
  expect(timeLimit).toHaveBeenCalledOnce();
  expect(connection.retire).toHaveBeenCalledOnce();
  expect(connection.close).toHaveBeenCalledOnce();
  expect(result.attempts[0]).toMatchObject({
    outcome: 'aborted',
    reason: 'evaluation_live_time_limit',
  });
});

test('normal closure clears deadlines and summary transitions start a fresh timer', {
  tags: ['technical'],
}, async () => {
  const { scenario, options, connection, timeLimit } = setup(true);
  scenario.steps.splice(1, 0, {
    id: 'summary',
    transition: 'summary',
    expected: { requirements: [] },
  });
  const result = await runVoiceScenario(scenario, {}, { ...options, judge: async () => [] });
  expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(['pass', 'pass', 'pass']);
  expect(connection.start).toHaveBeenCalledTimes(2);
  expect(connection.close).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(12_000);
  expect(timeLimit).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
