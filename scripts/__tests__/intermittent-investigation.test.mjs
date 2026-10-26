import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function harness(t) {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-investigation-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const record = join(directory, 'record.json');
  const input = join(directory, 'input.json');
  const execute = (option, value, { nodeArgs = [], env = {} } = {}) => {
    writeFileSync(input, JSON.stringify(value));
    return spawnSync(
      process.execPath,
      [...nodeArgs, 'scripts/testing/investigation.mjs', '--record', record, option, input],
      { encoding: 'utf8', env: { ...process.env, ...env } },
    );
  };
  return { execute, input, read: () => JSON.parse(readFileSync(record, 'utf8')) };
}

const evidence = (id, outcome) => ({
  version: 1,
  test: {
    key: 'synthetic-case',
    runner: 'vitest',
    project: 'server',
    file: 'synthetic.test.ts',
    title: 'controlled readiness',
  },
  execution: {
    id,
    commit: 'a'.repeat(40),
    startedAt: '2026-10-26T12:00:00Z',
    command: null,
    runtime: null,
    fonts: null,
    versions: null,
    order: null,
    seed: null,
  },
  outcome,
  expectedStatus: 'passed',
  durationMs: 10,
  errorCount: outcome === 'failed' ? 1 : 0,
  artifacts: [{ name: 'runner', path: 'retained/original.log' }],
});

test('an unchanged passing retry preserves the original failure and unresolved cause', (t) => {
  const h = harness(t);
  assert.equal(h.execute('--append', evidence('first', 'failed')).status, 0);
  assert.equal(h.execute('--append', evidence('second', 'passed')).status, 0);
  const record = h.read();
  assert.equal(record.original, 'first');
  assert.deepEqual(
    record.executions.map((entry) => entry.outcome),
    ['failed', 'passed'],
  );
  assert.equal(record.disposition.cause, 'unresolved');
  assert.equal(record.disposition.resolution, 'open');
  assert.equal(h.execute('--append', evidence('second', 'passed')).status, 0);
  assert.equal(h.read().executions.length, 2);
});

test('evidence that grows when opened cannot bypass the byte limit or replace the record', (t) => {
  const h = harness(t);
  assert.equal(h.execute('--append', evidence('original', 'failed')).status, 0);
  const before = h.read();
  const result = h.execute('--append', evidence('later', 'passed'), {
    nodeArgs: ['--import', './scripts/__tests__/helpers/growing-evidence.mjs'],
    env: { FS_RACE_INPUT: h.input },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Evidence exceeds 8 MiB/);
  assert.deepEqual(h.read(), before);
});

test('a pass alone cannot close a cause investigation and conflicting imports preserve evidence', (t) => {
  const h = harness(t);
  assert.equal(h.execute('--append', evidence('pass-only', 'passed')).status, 1);
  assert.equal(h.execute('--append', evidence('first', 'failed')).status, 0);
  assert.equal(h.execute('--append', evidence('second', 'passed')).status, 0);
  const original = h.read();
  assert.equal(h.execute('--append', evidence('first', 'passed')).status, 1);
  assert.deepEqual(h.read(), original);
  const automaticClosure = {
    ...original.disposition,
    resolution: 'fixed',
    repair: 'retry was green',
    regressions: ['second'],
  };
  assert.equal(h.execute('--disposition', automaticClosure).status, 1);
  assert.deepEqual(h.read(), original);
  const unsupportedCause = {
    ...original.disposition,
    cause: 'confirmed',
    classification: 'test-synchronization',
    explanation: 'suspected mixed clocks',
  };
  assert.equal(h.execute('--disposition', unsupportedCause).status, 1);
});

test('a new failure reopens a repaired investigation without discarding its assessment', (t) => {
  const h = harness(t);
  h.execute('--append', evidence('first', 'failed'));
  h.execute('--append', evidence('regression', 'passed'));
  const fixed = {
    ...h.read().disposition,
    cause: 'confirmed',
    resolution: 'fixed',
    classification: 'environment',
    explanation:
      'Controlled environment fixture starts without the required resource and passes when restored.',
    facts: [{ execution: 'first', observation: 'Controlled required resource is absent.' }],
    repair: 'Restore the required fixture resource',
    regressions: ['regression'],
    nextStep: '',
  };
  assert.equal(h.execute('--disposition', fixed).status, 0);
  assert.equal(h.execute('--append', evidence('later', 'failed')).status, 0);
  assert.equal(h.read().disposition.cause, 'unresolved');
  assert.equal(h.read().disposition.resolution, 'open');
  assert.ok(h.read().previousDispositions.some((entry) => entry.resolution === 'fixed'));
});
