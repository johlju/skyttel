import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, vi } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import profiles from '../../../scripts/model-evaluation/profiles.json' with { type: 'json' };
import { verifiedProfile } from '../../../scripts/model-evaluation/provider.js';
import { runTextScenario } from '../../../scripts/model-evaluation/runner.js';
import type { Scenario } from '../../../scripts/model-evaluation/types.js';
import { modelMessage, pricedProvider, textModel } from '../../support/text-model.js';

async function applicationVersion(label: string, evaluator = false, sequentialOnly = false) {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-evaluation-version-'));
  const archive = execFileSync(
    'git',
    [
      'archive',
      'HEAD',
      '.gitignore',
      'package.json',
      'src',
      'migrations',
      'scripts/seeds',
      'tests/support',
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  execFileSync('tar', ['-x', '-C', directory], { input: archive });
  await symlink(resolve('node_modules'), join(directory, 'node_modules'), 'dir');
  if (evaluator)
    await cp(resolve('scripts/model-evaluation'), join(directory, 'scripts/model-evaluation'), {
      recursive: true,
    });
  if (sequentialOnly) {
    const installation = join(directory, 'tests/support/installation.ts');
    await writeFile(
      installation,
      (await readFile(installation, 'utf8')).replace(
        "export const supportedConversationWorkModes = ['sequential', 'overlap'] as const;",
        "export const supportedConversationWorkModes = ['sequential'] as const;",
      ),
    );
  }
  // Each committed server variant changes its public HTTP response. The
  // fixture knows the application factory, not the conversation internals.
  const path = join(directory, 'src/server/app.ts');
  await rename(path, join(directory, 'src/server/evaluation-original-app.ts'));
  await writeFile(
    path,
    `import { createApp as original } from './evaluation-original-app.js';
export function createApp(options: Parameters<typeof original>[0]) {
  const app = original(options);
  const originalFetch = app.fetch.bind(app);
  app.fetch = (async (request: Request) => {
    const response = await originalFetch(request);
    if (request.method === 'GET' && /\\/messages\\/[^/]+$/.test(new URL(request.url).pathname)) {
      const body = await response.clone().json();
      if (body.taskStatus === 'completed') {
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        return Response.json({ ...body, modelReply: ${JSON.stringify(label)} + ' ' + (body.modelReply ?? body.reply ?? '') }, { status: response.status, headers });
      }
    }
    return response;
  }) as typeof app.fetch;
  return app;
}

`,
  );
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q');
  git('add', '.');
  git(
    '-c',
    'user.name=Evaluation',
    '-c',
    'user.email=evaluation@example.test',
    '-c',
    'commit.gpgSign=false',
    'commit',
    '-qm',
    'Controlled application version',
  );
  return { id: label, directory, commit: git('rev-parse', 'HEAD') };
}

test('a declared stop-last comparison preserves whole ordinary dialogs and alternating variants in its attempts', {
  tags: ['technical'],
  timeout: 30_000,
}, async () => {
  const versions = [await applicationVersion('Baseline'), await applicationVersion('Candidate')];
  const evaluator = await applicationVersion('Evaluator', true);
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-comparison-order-'));
  const { evaluateModels } = (await import(
    /* @vite-ignore */ pathToFileURL(
      join(evaluator.directory, 'scripts/model-evaluation/evaluate.ts'),
    ).href
  )) as typeof import('../../../scripts/model-evaluation/evaluate.js');
  const scenarioSet: Scenario[] = [
    {
      id: 'stop',
      title: 'Declared cancellation',
      voice: false,
      steps: [
        {
          id: 'stop',
          text: 'Ändra och vänta.',
          expected: { requirements: [] },
          userStop: {
            trigger: 'first-working-after-input',
            maximumObservationMs: 1000,
            allowedStates: [{ requirements: [] }],
          },
        },
      ],
    },
    {
      id: 'change',
      title: 'Ordinary dialog',
      voice: false,
      steps: [
        { id: 'question', text: 'Ändra priset.', expected: { requirements: [] } },
        { id: 'reply', text: '99 kronor.', expected: { requirements: [] } },
      ],
    },
    {
      id: 'read',
      title: 'Ordinary question',
      voice: false,
      steps: [{ id: 'read', text: 'Vad vet du?', expected: { requirements: [] } }],
    },
  ];
  try {
    const run = await evaluateModels({
      issue: 686,
      directory,
      apiKey: 'synthetic-no-network-key',
      authorized: true,
      limitUsd: 0,
      priorUsd: 0,
      priorSource: 'Zero-payment ordering regression.',
      commit: evaluator.commit,
      textProfiles: ['sol-high'],
      judgeProfile: verifiedProfile('judge-sol-high'),
      baselineProfiles: { text: 'sol-high' },
      scenarioSet,
      applicationComparison: {
        baseline: versions[0],
        candidate: versions[1],
        plan: {
          id: 'controlled-stop-last',
          modality: 'text',
          models: ['gpt-6.1-sol'],
          effort: 'high',
          repetitions: [1, 2],
          targetScenarios: ['change'],
          targetMaximumRatio: 0.8,
          otherMaximumRatio: 1.1,
          maximumRelativeRange: 0.2,
          executionOrder: 'ordinary-before-stop-v1',
        },
      },
      localVerification: {
        passed: true,
        commands: ['npm run test:unit'],
        evidence: 'Controlled evaluation ordering and zero-payment boundary.',
      },
    });
    expect(
      run.attempts.map(
        (attempt) => `${attempt.repetition}:${attempt.applicationVersion}:${attempt.step}`,
      ),
    ).toEqual([
      '1:Baseline:question',
      '1:Baseline:reply',
      '1:Baseline:read',
      '1:Candidate:question',
      '1:Candidate:reply',
      '1:Candidate:read',
      '1:Baseline:stop',
      '1:Candidate:stop',
      '2:Candidate:question',
      '2:Candidate:reply',
      '2:Candidate:read',
      '2:Baseline:question',
      '2:Baseline:reply',
      '2:Baseline:read',
      '2:Candidate:stop',
      '2:Baseline:stop',
    ]);
    expect(run.attempts.every((attempt) => attempt.outcome === 'not_run')).toBe(true);
    expect(run.budget).toMatchObject({ spentUsd: 0, reservedUsd: 0, stopped: true });
    const manifest = JSON.parse(await readFile(join(directory, '0001-manifest.json'), 'utf8'));
    expect(manifest.data.applicationComparison.plan.executionOrder).toBe('ordinary-before-stop-v1');
  } finally {
    await Promise.all(
      [...versions.map((version) => version.directory), evaluator.directory, directory].map(
        (path) => rm(path, { recursive: true, force: true }),
      ),
    );
  }
});

test('committed application modes retain comparable actual work and usage through public evaluation', {
  tags: ['technical'],
  timeout: 30_000,
}, async () => {
  const version = await applicationVersion('Overlap-capable');
  try {
    for (const conversationWorkMode of ['sequential', 'overlap'] as const) {
      let releaseScope = () => {};
      const scope = new Promise<void>((resolve) => {
        releaseScope = resolve;
      });
      const model = textModel(
        () => [modelMessage('Hela svaret.')],
        async () => {
          await scope;
          return [modelMessage(JSON.stringify({ mode: 'read', request: 'Besvara frågan.' }))];
        },
      );
      const executing = runTextScenario(
        {
          id: 'overlap-comparison',
          title: 'Same bounded request',
          voice: false,
          steps: [
            { id: 'read', text: 'Vad vet du?', expected: { requirements: ['Ge hela svaret.'] } },
          ],
        },
        {
          modelProfile: verifiedProfile('sol-high'),
          modelFetch: pricedProvider(model.provider),
        },
        {
          profile: 'local',
          repetition: 1,
          application: { ...version, id: conversationWorkMode, conversationWorkMode },
          judge: async (input) => {
            expect(input.sources.backend?.text).toBe('Overlap-capable Hela svaret.');
            return input.requirements.map(({ id }) => ({
              id,
              outcome: 'pass',
              reason: 'The complete controlled answer is delivered.',
            }));
          },
        },
      );
      try {
        await expect.poll(() => model.authorizationRequests.length, { timeout: 5000 }).toBe(1);
        if (conversationWorkMode === 'overlap')
          await expect.poll(() => model.requests.length).toBe(1);
        else expect(model.requests).toHaveLength(0);
      } finally {
        releaseScope();
      }
      const result = await executing;
      expect(result.attempts[0].outcome).toBe('pass');
      expect(result.attempts[0].diagnostics?.workResults).toMatchObject([
        {
          executionMode: conversationWorkMode,
          disposition: 'used',
          usage: { input: 120, output: 30, cached: 20, reasoning: 10 },
          outcome: 'completed',
        },
      ]);
      expect(model.requests).toHaveLength(1);
      expect(model.authorizationRequests).toHaveLength(1);
      expect(model.requests[0]).toMatchObject({
        model: 'gpt-6.1-sol',
        reasoning: { effort: 'high' },
      });
    }
  } finally {
    await rm(version.directory, { recursive: true, force: true });
  }
});

test('a committed application without overlap capability refuses the experimental mode before model work', {
  tags: ['technical'],
  timeout: 30_000,
}, async () => {
  const application = await applicationVersion('Sequential-only', false, true);
  const model = textModel(() => [modelMessage('Unused.')]);
  try {
    await expect(
      runTextScenario(
        {
          id: 'unsupported-overlap',
          title: 'Unavailable experimental mode',
          voice: false,
          steps: [{ id: 'read', text: 'Vad vet du?', expected: { requirements: [] } }],
        },
        { modelFetch: model.provider },
        {
          profile: 'local',
          repetition: 1,
          application: { ...application, conversationWorkMode: 'overlap' },
        },
      ),
    ).rejects.toThrow('evaluation_application_incompatible:Sequential-only');
    expect(model.requests).toHaveLength(0);
    expect(model.authorizationRequests).toHaveLength(0);
  } finally {
    await rm(application.directory, { recursive: true, force: true });
  }
});

test('explicit application versions execute their own committed server with the same scenario', {
  tags: ['technical'],
  timeout: 30_000,
}, async () => {
  const versions = [await applicationVersion('Baseline'), await applicationVersion('Candidate')];
  try {
    for (const application of versions) {
      const model = textModel(() => [modelMessage('Svar.')]);
      const run = await runTextScenario(
        {
          id: 'same-contract',
          title: 'Same controlled request',
          voice: false,
          steps: [
            { id: 'read', text: 'Vad vet du?', expected: { requirements: ['Ge hela svaret.'] } },
          ],
        },
        {
          modelProfile: verifiedProfile('sol-high'),
          modelFetch: pricedProvider(model.provider),
        },
        {
          profile: 'local',
          repetition: 1,
          application,
          judge: async (input) => {
            expect(input.sources.backend?.text).toBe(`${application.id} Svar.`);
            return input.requirements.map(({ id }) => ({
              id,
              outcome: 'pass',
              reason: 'Full selected application response.',
            }));
          },
        },
      );
      expect(run.attempts[0]).toMatchObject({
        outcome: 'pass',
        applicationVersion: application.id,
        applicationCommit: application.commit,
      });
      expect(model.requests).toHaveLength(1);
      expect(model.requests[0]).toMatchObject({
        model: 'gpt-6.1-sol',
        reasoning: { effort: 'high' },
      });
    }
  } finally {
    await Promise.all(
      versions.map(({ directory }) => rm(directory, { recursive: true, force: true })),
    );
  }
});

test.each(['dirty', 'untracked', 'ignored-source', 'wrong-commit'] as const)(
  'application selection rejects %s before any model call',
  { tags: ['technical'], timeout: 30_000 },
  async (kind) => {
    const application = await applicationVersion('Unverified');
    const model = textModel(() => [modelMessage('Unused.')]);
    try {
      if (kind === 'dirty')
        await writeFile(join(application.directory, 'src/server/app.ts'), '// Uncommitted source');
      if (kind === 'ignored-source')
        await writeFile(
          join(application.directory, '.git/info/exclude'),
          'src/server/unrecorded.ts\n',
        );
      if (kind === 'untracked' || kind === 'ignored-source')
        await writeFile(
          join(application.directory, 'src/server/unrecorded.ts'),
          'export const unrecorded = true;\n',
        );
      if (kind === 'wrong-commit') application.commit = '0'.repeat(40);
      await expect(
        runTextScenario(
          {
            id: 'unverified',
            title: 'Unverified source',
            voice: false,
            steps: [{ id: 'read', text: 'Fråga.', expected: { requirements: [] } }],
          },
          { modelFetch: model.provider },
          { profile: 'local', repetition: 1, application },
        ),
      ).rejects.toThrow('evaluation_application_unverified:Unverified');
      expect(model.requests).toHaveLength(0);
      expect(model.authorizationRequests).toHaveLength(0);
    } finally {
      await rm(application.directory, { recursive: true, force: true });
    }
  },
);

test('a reused application path cannot mislabel already imported code as a different commit', {
  tags: ['technical'],
  timeout: 30_000,
}, async () => {
  const application = await applicationVersion('Immutable');
  const scenario = {
    id: 'immutable',
    title: 'Immutable application',
    voice: false,
    steps: [{ id: 'read', text: 'Fråga.', expected: { requirements: [] } }],
  };
  const model = textModel(() => [modelMessage('Svar.')]);
  try {
    await runTextScenario(
      scenario,
      { modelFetch: model.provider },
      { profile: 'local', repetition: 1, application },
    );
    await writeFile(
      join(application.directory, 'src/server/app.ts'),
      `${await readFile(join(application.directory, 'src/server/app.ts'), 'utf8')}\n// Different committed application source.\n`,
    );
    execFileSync('git', ['-C', application.directory, 'add', 'src/server/app.ts']);
    execFileSync('git', [
      '-C',
      application.directory,
      '-c',
      'user.name=Evaluation',
      '-c',
      'user.email=evaluation@example.test',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '-qm',
      'Next controlled source',
    ]);
    application.commit = execFileSync('git', ['-C', application.directory, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const requests = model.requests.length;
    await expect(
      runTextScenario(
        scenario,
        { modelFetch: model.provider },
        { profile: 'local', repetition: 1, application },
      ),
    ).rejects.toThrow('evaluation_application_path_reused:Immutable');
    expect(model.requests).toHaveLength(requests);
  } finally {
    await rm(application.directory, { recursive: true, force: true });
  }
});

test.each([false, true])(
  'an application comparison accounts for both versions in the five-repeat plan without paying after a stop (voice: %s)',
  {
    tags: ['technical'],
    timeout: 30_000,
  },
  async (voice) => {
    const versions = [await applicationVersion('Baseline'), await applicationVersion('Candidate')];
    const evaluator = await applicationVersion('Evaluator', true);
    const directory = await mkdtemp(join(tmpdir(), 'skyttel-comparison-plan-'));
    const { evaluateModels } = (await import(
      /* @vite-ignore */ pathToFileURL(
        join(evaluator.directory, 'scripts/model-evaluation/evaluate.ts'),
      ).href
    )) as typeof import('../../../scripts/model-evaluation/evaluate.js');
    const modelClient = (await import(
      /* @vite-ignore */ pathToFileURL(join(evaluator.directory, 'src/server/model-client.ts')).href
    )) as typeof import('../../../src/server/model-client.js');
    const network = vi
      .spyOn(modelClient, 'modelTransport')
      .mockRejectedValue(new Error('unexpected_network'));
    try {
      const configuration = {
        issue: 341,
        directory,
        apiKey: 'synthetic-no-network-key',
        authorized: true,
        limitUsd: 0,
        priorUsd: 0,
        priorSource: 'Controlled zero-payment plan.',
        commit: evaluator.commit,
        textProfiles: voice ? [] : ['sol-high'],
        ...(voice
          ? {
              voice: true,
              voiceProfile: {
                ...profiles.profiles.find((item) => item.role === 'voice'),
                id: 'controlled-live-sol',
                backend: 'sol-high',
              } as import('../../../scripts/model-evaluation/live.js').LiveEvaluationProfile,
              playbackAssessorProfile: {
                id: 'controlled-transcriber',
                model: 'whisper-1' as const,
                language: 'sv' as const,
                usdPerMinute: 0.01,
                billingQuantumSeconds: 1,
                alignmentMarginMs: 100,
                minimumAverageLogProbability: -1,
                maximumNoSpeechProbability: 0.5,
                maximumCandidates: 8,
                checkedAt: 'controlled-profile',
                sources: ['https://example.test/controlled-transcription'],
              },
            }
          : {}),
        judgeProfile: verifiedProfile('judge-sol-high'),
        baselineProfiles: { text: 'sol-high' },
        applicationComparison: { baseline: versions[0], candidate: versions[1] },
        localVerification: {
          passed: true,
          commands: ['npm run test:unit'],
          evidence: 'Controlled application comparison contract.',
        },
      };
      const run = await evaluateModels(configuration);
      expect(network).not.toHaveBeenCalled();
      const steps = catalog.scenarios
        .filter((scenario) => !voice || scenario.voice)
        .reduce((sum, scenario) => sum + scenario.steps.length, 0);
      expect(run.attempts).toHaveLength(steps * 10);
      expect(
        run.attempts.every(
          (attempt) => attempt.outcome === 'not_run' && attempt.elapsedMs === null,
        ),
      ).toBe(true);
      expect(
        run.attempts
          .filter((attempt) => attempt.repetition === 1)
          .map((attempt) => attempt.applicationVersion),
      ).toEqual([...Array(steps).fill('Baseline'), ...Array(steps).fill('Candidate')]);
      expect(
        run.attempts
          .filter((attempt) => attempt.repetition === 2)
          .map((attempt) => attempt.applicationVersion),
      ).toEqual([...Array(steps).fill('Candidate'), ...Array(steps).fill('Baseline')]);
      expect(run.applicationComparison).toMatchObject({
        status: 'inconclusive',
        model: 'gpt-6.1-sol',
        modality: voice ? 'voice' : 'text',
      });
      const manifest = JSON.parse(await readFile(join(directory, '0001-manifest.json'), 'utf8'));
      expect(manifest.data.applicationComparison).toMatchObject({
        contractId: expect.any(String),
        plan: { repetitions: [1, 2, 3, 4, 5] },
        versions: versions.map(({ id, commit }) => ({ id, commit })),
      });
      expect(manifest.data.evaluator).toEqual({
        commit: evaluator.commit,
        contract: 'committed-evaluator-v1',
      });
      await expect(evaluateModels({ ...configuration, commit: '0'.repeat(40) })).rejects.toThrow(
        'evaluation_application_unverified:evaluator',
      );
      await writeFile(
        join(evaluator.directory, 'scripts/model-evaluation/optimization-comparison-plan.json'),
        '{}\n',
      );
      await expect(evaluateModels(configuration)).rejects.toThrow(
        'evaluation_application_unverified:evaluator',
      );
      execFileSync('git', [
        '-C',
        evaluator.directory,
        'add',
        'scripts/model-evaluation/optimization-comparison-plan.json',
      ]);
      execFileSync('git', [
        '-C',
        evaluator.directory,
        '-c',
        'user.name=Evaluation',
        '-c',
        'user.email=evaluation@example.test',
        '-c',
        'commit.gpgSign=false',
        'commit',
        '-qm',
        'Change imported evaluator data',
      ]);
      const changedCommit = execFileSync('git', ['-C', evaluator.directory, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim();
      await expect(evaluateModels({ ...configuration, commit: changedCommit })).rejects.toThrow(
        'evaluation_application_unverified:evaluator',
      );
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
      await Promise.all(
        [...versions.map((version) => version.directory), evaluator.directory, directory].map(
          (path) => rm(path, { recursive: true, force: true }),
        ),
      );
    }
  },
);
