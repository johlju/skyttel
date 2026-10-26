import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

function plan(t, suites, weights) {
  const directory = mkdtempSync(join(tmpdir(), 'integration-groups-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const discovery = join(directory, 'discovery.json');
  const timings = join(directory, 'timings.json');
  writeFileSync(
    discovery,
    JSON.stringify({ config: { rootDir: resolve('tests/integration') }, errors: [], suites }),
  );
  writeFileSync(timings, JSON.stringify({ version: 1, groups: 2, files: weights }));
  return spawnSync(
    process.execPath,
    [
      'scripts/testing/integration-groups.mjs',
      '--plan',
      '--discovery',
      discovery,
      '--timings',
      timings,
    ],
    { encoding: 'utf8' },
  );
}
const file = (name, projects = ['chromium']) => ({
  title: name,
  file: name,
  specs: [
    {
      title: 'public journey',
      file: name,
      tests: projects.map((projectName) => ({ projectName })),
    },
  ],
});

test('group planning balances observed file durations and preserves every runtime identity exactly once', (t) => {
  const result = plan(
    t,
    [file('slow.spec.ts', ['chromium', 'mobile']), file('medium.spec.ts'), file('new.spec.ts')],
    {
      'tests/integration/slow.spec.ts': { seconds: 20, tests: 2 },
      'tests/integration/medium.spec.ts': { seconds: 12, tests: 1 },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.discovered.length, 4);
  const union = report.groups.flatMap((group) => group.tests);
  assert.equal(new Set(union).size, 4);
  assert.deepEqual([...union].sort(), [...report.discovered].sort());
  assert.ok(
    report.groups.some(
      (group) => group.files.includes('tests/integration/slow.spec.ts') && group.tests.length === 2,
    ),
  );
  assert.ok(report.groups.every((group) => group.files.length > 0));
});

test('planning rejects incomplete discovery and remains stable when discovery order changes', (t) => {
  const files = [file('one.spec.ts'), file('two.spec.ts'), file('three.spec.ts')];
  const weights = { 'tests/integration/one.spec.ts': { seconds: 10, tests: 1 } };
  const first = plan(t, files, weights);
  const reordered = plan(t, [...files].reverse(), weights);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(reordered.status, 0, reordered.stderr);
  assert.deepEqual(JSON.parse(first.stdout), JSON.parse(reordered.stdout));
  for (const invalid of [
    [],
    [file('same.spec.ts'), file('same.spec.ts')],
    [{ title: 'missing runtime', specs: [{ file: 'missing.spec.ts', tests: [] }] }],
  ]) {
    const result = plan(t, invalid, weights);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Empty or duplicate|Missing runtime/);
  }
});

test('group execution preserves file order, stops on failure and retains diagnostics for a complete rerun', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'integration-group-execution-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const config = join(directory, 'playwright.config.mjs');
  const output = join(directory, 'artifacts');
  writeFileSync(
    config,
    `export default { testDir: ${JSON.stringify(directory)}, outputDir: ${JSON.stringify(output)}, workers: 1, retries: 0 };`,
  );
  writeFileSync(
    join(directory, 'ordered.spec.mjs'),
    `
    import { test, expect } from ${JSON.stringify(resolve('node_modules/@playwright/test/index.mjs'))};
    let prepared = false;
    test.beforeAll(() => { prepared = true; });
    test('first', () => { expect(prepared).toBe(true); });
    test('controlled failure', () => { expect(process.env.GROUP_FIXTURE_FAILURE).not.toBe('1'); });
    test('last', () => { expect(prepared).toBe(true); });
  `,
  );
  function run(fail) {
    return spawnSync(
      process.execPath,
      [
        'scripts/testing/integration-groups.mjs',
        '--group',
        '1',
        '--groups',
        '1',
        '--config',
        config,
      ],
      {
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, GROUP_FIXTURE_FAILURE: fail ? '1' : '0' },
      },
    );
  }
  function records() {
    return readFileSync(join(output, 'diagnostics', 'executions.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
  }
  const failed = run(true);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stdout + failed.stderr, /controlled failure/);
  const attempts = records();
  assert.deepEqual(
    attempts.filter((entry) => entry.outcome !== 'skipped').map((entry) => entry.outcome),
    ['passed', 'failed'],
  );
  assert.ok(attempts.every((entry) => entry.execution.ci.group === '1/1'));
  assert.match(
    readFileSync(join(output, 'diagnostics', 'runner.log'), 'utf8'),
    /Run status: failed/,
  );
  const passed = run(false);
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  assert.deepEqual(
    records().map((entry) => entry.outcome),
    ['passed', 'passed', 'passed'],
  );
});

test('executing separate groups covers every configured project and escapes file patterns', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'integration-group-coverage-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const config = join(directory, 'playwright.config.mjs');
  const output = join(directory, 'artifacts');
  writeFileSync(
    config,
    `export default { testDir: ${JSON.stringify(directory)}, outputDir: ${JSON.stringify(output)}, workers: 1, projects: [{ name: 'desktop' }, { name: 'mobile' }] };`,
  );
  for (const name of ['[dynamic].spec.mjs', 'other.spec.mjs']) {
    writeFileSync(
      join(directory, name),
      `import { test } from ${JSON.stringify(resolve('node_modules/@playwright/test/index.mjs'))}; test('journey', () => {});`,
    );
  }
  const executions = [];
  for (const group of ['1', '2']) {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/testing/integration-groups.mjs',
        '--group',
        group,
        '--groups',
        '2',
        '--config',
        config,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const records = readFileSync(join(output, 'diagnostics', 'executions.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.equal(records.length, 2);
    assert.ok(records.every((record) => record.outcome === 'passed'));
    executions.push(
      ...records.map((record) => `${record.test.file.split('/').at(-1)}:${record.test.project}`),
    );
  }
  assert.deepEqual(executions.sort(), [
    '[dynamic].spec.mjs:desktop',
    '[dynamic].spec.mjs:mobile',
    'other.spec.mjs:desktop',
    'other.spec.mjs:mobile',
  ]);
});
