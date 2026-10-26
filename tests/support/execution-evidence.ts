import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { FullConfig, TestCase, TestResult } from '@playwright/test/reporter';

function available<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function git(...args: string[]) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    timeout: 2000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/** Only execution context: never copy environment variables, raw argv or test data. */
export function executionContext(config: FullConfig) {
  const version = (name: string) =>
    available(
      () =>
        JSON.parse(readFileSync(resolve('node_modules', name, 'package.json'), 'utf8'))
          .version as string,
    );
  const fontConfig = process.env.FONTCONFIG_FILE;
  return {
    id: randomUUID(),
    commit: available(() => git('rev-parse', 'HEAD')),
    dirty: available(() => git('status', '--porcelain').length > 0),
    ci: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      run: process.env.GITHUB_RUN_ID ?? null,
      attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      job: process.env.GITHUB_JOB ?? null,
      group: /^\d+\/\d+$/.test(process.env.SKYTTEL_INTEGRATION_GROUP ?? '')
        ? process.env.SKYTTEL_INTEGRATION_GROUP
        : null,
    },
    command: {
      runner: 'playwright test',
      script: process.env.npm_lifecycle_event ?? null,
      config: config.configFile ? relative(process.cwd(), config.configFile) : null,
      grep: [config.grep].flat().map(String),
      grepInvert: config.grepInvert ? [config.grepInvert].flat().map(String) : [],
      workers: config.workers,
      shard: config.shard,
    },
    runtime: { platform: process.platform, arch: process.arch, node: process.version },
    fonts: {
      profile: !fontConfig
        ? 'host-default'
        : resolve(fontConfig) === resolve('.cache/fontconfig/fonts.conf')
          ? 'ci-bundled'
          : 'custom',
      configDigest: fontConfig
        ? available(() => createHash('sha256').update(readFileSync(fontConfig)).digest('hex'))
        : null,
    },
    versions: {
      playwright: version('@playwright/test'),
      vitest: version('vitest'),
      typescript: version('typescript'),
      npm: process.env.npm_config_user_agent?.match(/npm\/([\d.]+)/)?.[1] ?? null,
    },
    dependencyLock: available(() =>
      createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),
    ),
    seed: null,
    experiment: /^[a-zA-Z0-9_.-]{1,80}$/.test(process.env.SKYTTEL_TEST_EXPERIMENT ?? '')
      ? process.env.SKYTTEL_TEST_EXPERIMENT
      : null,
  };
}

export function testIdentity(test: TestCase) {
  const project = test.parent.project()?.name ?? '';
  const file = relative(process.cwd(), test.location.file);
  const caseId = test.title.match(/^([A-ZÅÄÖ][A-ZÅÄÖ0-9_-]*-\d+):/)?.[1] ?? null;
  const title = test.titlePath().slice(1).join(' > ');
  return {
    key: createHash('sha256')
      .update(JSON.stringify(['playwright', project, caseId ?? [file, title]]))
      .digest('hex'),
    runner: 'playwright',
    project,
    file,
    title,
    caseId,
    sourceDigest: available(() =>
      createHash('sha256').update(readFileSync(test.location.file)).digest('hex'),
    ),
  };
}

export function executionEvidence(
  context: ReturnType<typeof executionContext>,
  test: TestCase,
  result: TestResult,
  order: { sequence: number; previousTest: string | null },
  directory: string,
) {
  const identity = testIdentity(test);
  return {
    version: 1,
    test: identity,
    execution: {
      ...context,
      id: `${context.id}:${test.id}:${test.repeatEachIndex}:${result.retry}`,
      startedAt: result.startTime.toISOString(),
      retry: result.retry,
      repeat: test.repeatEachIndex,
      worker: result.workerIndex,
      parallelWorker: result.parallelIndex,
      browser: test.parent.project()?.use.browserName ?? null,
      order,
    },
    outcome: result.status,
    expectedStatus: test.expectedStatus,
    durationMs: result.duration,
    errorCount: result.errors.length,
    artifacts: [
      { name: 'runner', path: relative(process.cwd(), resolve(directory, 'runner.log')) },
      { name: 'resources', path: relative(process.cwd(), resolve(directory, 'resources.jsonl')) },
      ...result.attachments.map((attachment) => ({
        name: attachment.name,
        path: attachment.path ? relative(process.cwd(), attachment.path) : null,
        contentType: attachment.contentType,
      })),
    ],
  };
}
