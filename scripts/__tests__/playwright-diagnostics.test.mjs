import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

test('a failed browser run retains its trace, screenshot, fixture output and assertion', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-browser-diagnostics-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const reporter = resolve('tests/support/diagnostics-reporter.ts');
  const config = join(directory, 'playwright.config.mjs');
  writeFileSync(
    config,
    `export default {
    testDir: ${JSON.stringify(directory)},
    outputDir: ${JSON.stringify(join(directory, 'artifacts'))},
    workers: 1,
    reporter: [['line'], [${JSON.stringify(reporter)}]],
    use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }
  };\n`,
  );
  const playwright = resolve('node_modules/@playwright/test/index.mjs');
  writeFileSync(
    join(directory, 'failure.spec.mjs'),
    `import { test, expect } from ${JSON.stringify(playwright)};
    test('synthetic diagnostic failure', async ({ page }) => {
      console.error('synthetic fixture-server failure');
      await page.setContent('<p>Synthetic fixture</p>');
      expect(1, 'synthetic failing assertion').toBe(2);
    });\n`,
  );
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', config],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(result.status, 1, result.stderr);
  const output = join(directory, 'artifacts');
  const log = readFileSync(join(output, 'diagnostics', 'runner.log'), 'utf8');
  assert.match(log, /synthetic fixture-server failure/);
  assert.match(log, /synthetic failing assertion/);
  assert.match(log, /Run status: failed/);
  const executions = readFileSync(join(output, 'diagnostics', 'executions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(executions.length, 1);
  assert.equal(executions[0].outcome, 'failed');
  assert.equal(executions[0].test.runner, 'playwright');
  assert.equal(executions[0].execution.order.sequence, 1);
  assert.equal(executions[0].execution.order.previousTest, null);
  assert.ok(executions[0].artifacts.some((artifact) => artifact.name === 'trace'));
  const artifacts = readdirSync(output, { recursive: true });
  assert.ok(artifacts.some((path) => path.endsWith('trace.zip')));
  assert.ok(artifacts.some((path) => path.endsWith('.png')));
  const noTests = spawnSync(
    process.execPath,
    [
      resolve('node_modules/@playwright/test/cli.js'),
      'test',
      '--config',
      config,
      '--grep',
      'absent',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(noTests.status, 1);
  assert.match(noTests.stdout + noTests.stderr, /No tests found/);
  assert.doesNotMatch(noTests.stdout + noTests.stderr, /ENOENT|appendFileSync/);
});

test('controlled mixed-clock readiness and cleanup/order failures retain correlated evidence', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-intermittent-fixtures-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const config = join(directory, 'playwright.config.mjs');
  const output = join(directory, 'artifacts');
  const residue = join(directory, 'owned-resource');
  writeFileSync(
    config,
    `export default {
    testDir: ${JSON.stringify(directory)}, outputDir: ${JSON.stringify(output)}, workers: 1,
    reporter: [['line'], [${JSON.stringify(resolve('tests/support/diagnostics-reporter.ts'))}]],
    use: { trace: 'retain-on-failure' }
  };`,
  );
  writeFileSync(
    join(directory, 'controlled.spec.mjs'),
    `
    import { test, expect } from ${JSON.stringify(resolve('node_modules/@playwright/test/index.mjs'))};
    import { existsSync, writeFileSync, rmSync } from 'node:fs';
    import { liveBrowserFixtureSource } from ${JSON.stringify(resolve('tests/support/live-browser.ts'))};
    const residue = ${JSON.stringify(residue)};
    test('clock readiness', async ({ page }, info) => {
      await page.clock.install();
      await page.route('http://localhost/**', route => route.fulfill({ contentType: 'text/html', body: '<button>Start</button>' }));
      await page.addInitScript({ content: liveBrowserFixtureSource });
      await page.goto('http://localhost/');
      await page.getByRole('button').click();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      await page.evaluate(() => {
        window.skyttelVoiceFixture.setMicrophone('hold');
        window.ready = false;
        window.pending = navigator.mediaDevices.getUserMedia({ audio: true }).then(() => { window.ready = true; });
      });
      await page.clock.runFor(5000);
      if (process.env.PROBE_MODE === 'observable') await page.evaluate(async () => {
        window.skyttelVoiceFixture.releaseMicrophone();
        await window.pending;
      });
      const media = await page.evaluate(() => window.skyttelVoiceFixture.diagnostics());
      const timelinePath = info.outputPath('clock-timeline.json');
      writeFileSync(timelinePath, JSON.stringify(media));
      await info.attach('clock-timeline', { path: timelinePath, contentType: 'application/json' });
      expect(await page.evaluate(() => window.ready), 'clock advancement does not release held asynchronous work').toBe(true);
      await page.evaluate(() => {
        for (let i = 0; i < 150; i++) window.skyttelVoiceFixture.setSound('microphone', i % 2 === 0);
      });
      const bounded = await page.evaluate(() => window.skyttelVoiceFixture.diagnostics());
      expect(bounded.timeline).toHaveLength(128);
      expect(bounded.droppedEvents).toBeGreaterThan(0);
    });
    test('order setup', () => {
      writeFileSync(residue, 'synthetic owned resource');
      if (process.env.PROBE_MODE === 'cleanup') rmSync(residue);
    });
    test('order consumer', () => {
      expect(existsSync(residue), 'the predecessor must release its resource').toBe(false);
    });
  `,
  );
  const run = (grep, mode) => {
    const result = spawnSync(
      process.execPath,
      [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', config, '--grep', grep],
      {
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          PROBE_MODE: mode,
          SKYTTEL_TEST_EXPERIMENT: mode,
          PRIVATE_TEST_TOKEN: 'never-copy-this-secret',
        },
      },
    );
    const text = readFileSync(join(output, 'diagnostics', 'executions.jsonl'), 'utf8');
    assert.doesNotMatch(text, /never-copy-this-secret|PRIVATE_TEST_TOKEN/);
    return { result, entries: text.trim().split('\n').map(JSON.parse) };
  };
  const first = run('clock readiness', 'premature');
  assert.equal(first.result.status, 1, first.result.stdout + first.result.stderr);
  const failed = first.entries[0];
  const timeline = JSON.parse(
    readFileSync(
      resolve(failed.artifacts.find((item) => item.name === 'clock-timeline').path),
      'utf8',
    ),
  );
  assert.equal(timeline.pendingMicrophone, 1);
  assert.ok(timeline.timeline.some((event) => event.event === 'microphone-held'));
  const repaired = run('clock readiness', 'observable');
  assert.equal(repaired.result.status, 0, repaired.result.stdout + repaired.result.stderr);
  assert.equal(repaired.entries[0].test.key, failed.test.key);
  assert.notEqual(repaired.entries[0].execution.id, failed.execution.id);
  const media = JSON.parse(
    readFileSync(
      resolve(repaired.entries[0].artifacts.find((item) => item.name === 'clock-timeline').path),
      'utf8',
    ),
  );
  assert.equal(media.pendingMicrophone, 0);
  assert.equal(media.timeSources.audioContextSeconds, 'real-audio-context');
  assert.ok(
    media.timeline.some(
      (event) =>
        event.event === 'microphone-ready' && typeof event.audioContextSeconds === 'number',
    ),
  );
  const ordered = run('order', 'leak');
  assert.equal(ordered.result.status, 1);
  const original = ordered.entries.find((entry) => entry.outcome === 'failed');
  assert.equal(original.execution.order.previousTest, ordered.entries[0].test.key);
  rmSync(residue);
  const isolated = run('order consumer', 'leak');
  assert.equal(isolated.result.status, 0);
  const fixed = run('order', 'cleanup');
  assert.equal(fixed.result.status, 0, fixed.result.stdout + fixed.result.stderr);
  const record = join(directory, 'investigation.json');
  const append = (entry) => {
    const input = join(directory, 'execution.json');
    writeFileSync(input, JSON.stringify(entry));
    const result = spawnSync(
      process.execPath,
      ['scripts/testing/investigation.mjs', '--record', record, '--append', input],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
  };
  append(original);
  append(isolated.entries[0]);
  let investigation = JSON.parse(readFileSync(record, 'utf8'));
  assert.equal(investigation.disposition.cause, 'unresolved');
  append(fixed.entries.find((entry) => entry.test.key === original.test.key));
  investigation = JSON.parse(readFileSync(record, 'utf8'));
  const assessment = join(directory, 'assessment.json');
  writeFileSync(
    assessment,
    JSON.stringify({
      cause: 'confirmed',
      resolution: 'fixed',
      classification: 'test-isolation',
      explanation:
        'The predecessor leaves the controlled resource; releasing it restores the ordered run.',
      facts: [
        { execution: original.execution.id, observation: 'Predecessor resource still exists.' },
      ],
      hypotheses: [],
      experiments: [
        {
          hypothesis: 'Missing predecessor cleanup',
          command: 'controlled fixture: order',
          selection: 'both order cases',
          maxAttempts: 2,
          stop: 'One trigger and one repaired run',
          results: [original.execution.id, investigation.executions.at(-1).execution.id],
        },
      ],
      repair: 'Controlled fixture releases its owned resource',
      regressions: [investigation.executions.at(-1).execution.id],
      nextStep: '',
    }),
  );
  const assessed = spawnSync(
    process.execPath,
    ['scripts/testing/investigation.mjs', '--record', record, '--disposition', assessment],
    { encoding: 'utf8' },
  );
  assert.equal(assessed.status, 0, assessed.stderr);
  assert.equal(JSON.parse(readFileSync(record, 'utf8')).disposition.cause, 'confirmed');
});

test('unavailable diagnostic storage does not turn a passing test into a failure', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-unavailable-diagnostics-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, 'artifacts');
  const config = join(directory, 'playwright.config.mjs');
  writeFileSync(
    config,
    `export default { testDir: ${JSON.stringify(directory)}, outputDir: ${JSON.stringify(output)}, reporter: [['line'], [${JSON.stringify(resolve('tests/support/diagnostics-reporter.ts'))}]] };`,
  );
  writeFileSync(
    join(directory, 'storage.spec.mjs'),
    `
    import { test } from ${JSON.stringify(resolve('node_modules/@playwright/test/index.mjs'))};
    import { rmSync, mkdirSync } from 'node:fs';
    test('original outcome', () => {
      const path = ${JSON.stringify(join(output, 'diagnostics', 'runner.log'))};
      rmSync(path); mkdirSync(path); console.log('synthetic runner output');
    });
  `,
  );
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', config],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /diagnostics unavailable/);
});
