import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
function job(name, source = workflow) {
  const body = source.match(new RegExp(`^ {2}${name}:\\n((?: {4}.*\\n|\\n)+)`, 'mu'))?.[1];
  assert.ok(body, `Missing ${name} job`);
  return body;
}
function bashArguments(source, body, step) {
  const shell =
    step.match(/^ {8}shell: (.+)$/mu)?.[1] ??
    body.match(/^ {4}defaults:\n {6}run:\n {8}shell: (.+)$/mu)?.[1] ??
    source.match(/^defaults:\n {2}run:\n {4}shell: (.+)$/mu)?.[1];
  assert.ok(shell === undefined || shell === 'bash', `Unsupported shell: ${shell}`);
  // GitHub's unspecified Linux shell uses bash -e; explicit bash also enables pipefail.
  return shell === 'bash' ? ['--noprofile', '--norc', '-eo', 'pipefail'] : ['-e'];
}

test('CI retains test output without turning failing commands into successful tee pipelines', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-ci-test-logs-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [jobName, name] of [
    ['application', 'Workflow gate tests'],
    ['application', 'Manual mapping'],
    ['unit', 'Unit coverage with CI fonts'],
    ['integration', 'Integration tests with CI fonts'],
    ['application', 'Container checks'],
  ]) {
    const body = job(jobName);
    const step = body.match(new RegExp(`- name: ${name}\\n((?: {8}.*\\n)+)`));
    assert.ok(step, `Missing ${name}`);
    const script = step[1].match(/ {8}run: \|\n((?: {10}.*\n)+)/)?.[1].replace(/^ {10}/gmu, '');
    assert.ok(script, `Missing script for ${name}`);
    if (name === 'Manual mapping')
      assert.match(script, /^npm run test:manual-mapping 2>&1 \| tee /mu);
    await t.test(name, () => {
      const result = spawnSync(
        'bash',
        [
          ...bashArguments(workflow, body, step[1]),
          '-c',
          `mkdir -p logs/tests\nnpm() { echo synthetic-fixture-error >&2; return 13; }\n${script}`,
        ],
        { cwd: directory, encoding: 'utf8' },
      );
      assert.equal(result.status, 13, name);
      const path = script.match(/tee (\S+)/)[1];
      assert.match(readFileSync(join(directory, path), 'utf8'), /synthetic-fixture-error/);
    });
  }
});

test('image workflows reject upstream failures even when hashing succeeds', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-workflow-pipelines-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [file, jobName, pattern] of [
    ['release', 'candidate', /^\s+(loaded_id=\$\(tar .+\| sha256sum \| awk .+\))$/mu],
    ['security', 'container', /^\s+(tar .+\| sha256sum \| awk .+)$/mu],
  ]) {
    await t.test(file, () => {
      const source = readFileSync(`.github/workflows/${file}.yml`, 'utf8');
      const body = job(jobName, source);
      const step = body.split(/^ {6}- /mu).find((block) => pattern.test(block));
      assert.ok(step, `Missing pipeline in ${file}`);
      const command = step.match(pattern)[1];
      const result = spawnSync(
        'bash',
        [
          ...bashArguments(source, body, step),
          '-c',
          `tar() { echo synthetic-fixture-error >&2; return 13; }
mkdir -p reports
config=synthetic
${command}`,
        ],
        {
          cwd: directory,
          encoding: 'utf8',
          env: {
            ...process.env,
            RUNNER_TEMP: directory,
          },
        },
      );
      assert.equal(result.status, 13, result.stderr);
      assert.match(result.stderr, /synthetic-fixture-error/);
    });
  }
});

test('independent unit and integration jobs feed an application check that rejects every incomplete result', () => {
  for (const name of ['unit', 'integration']) {
    const body = job(name);
    assert.doesNotMatch(body, /^ {4}needs:/mu, `${name} must start independently`);
    assert.doesNotMatch(body, /^ {4}timeout-minutes:/mu);
    assert.match(body, new RegExp(`name: ${name}-test-diagnostics-`));
  }
  assert.match(job('unit'), /npm run test:unit:ci -- --coverage/);
  assert.match(job('unit'), /- run: npm run build[\s\S]+- name: Unit coverage with CI fonts/);
  assert.match(job('integration'), /npm run build/);
  assert.match(job('integration'), /npm run test:integration:ci/);
  const application = job('application');
  assert.match(
    application,
    /- run: npx playwright install --with-deps chromium[\s\S]+- name: Workflow gate tests/,
  );
  assert.match(application, /^ {4}if: always\(\)$/mu);
  assert.match(application, /REQUIRED_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  const required = application.match(/^ {4}needs: \[(.+)\]$/mu)?.[1].split(', ');
  assert.deepEqual(required, ['unit', 'integration']);
  const command = application.match(
    /^ {8}run: (node scripts\/security\/check-results.mjs jobs .+)$/mu,
  )?.[1];
  assert.ok(command, 'Missing aggregate result check');
  assert.match(application, /- name: Require successful test jobs\n {8}if: always\(\)/);
  const args = command.split(' ').slice(1);
  assert.deepEqual(args.slice(2), required);
  const successes = Object.fromEntries(required.map((name) => [name, { result: 'success' }]));
  function run(results) {
    return spawnSync(process.execPath, args, {
      encoding: 'utf8',
      env: { ...process.env, REQUIRED_RESULTS: JSON.stringify(results) },
    });
  }
  assert.equal(run(successes).status, 0);
  for (const name of required) {
    for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
      const results = { ...successes, [name]: { result } };
      if (result === undefined) delete results[name];
      assert.equal(run(results).status, 1, `${name}: ${result}`);
    }
  }
});
