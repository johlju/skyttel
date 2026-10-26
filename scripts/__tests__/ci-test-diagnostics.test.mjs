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

test('release gates allow skipped devcontainer checks while pull requests require them', () => {
  const condition = "github.event_name == 'pull_request'";
  assert.equal(job('devcontainer').match(/^ {4}if: (.+)$/mu)?.[1], condition);
  const gate = job('security-gate');
  assert.match(gate, /^ {4}if: always\(\)$/mu);
  assert.match(gate, /^ {4}needs: \[application, devcontainer, security\]$/mu);
  const steps = gate.split(/^ {6}- /mu).filter((step) => step.includes('check-results.mjs jobs'));
  assert.equal(steps.length, 2);
  assert.equal(steps[0].match(/^ {8}if: (.+)$/mu), null);
  assert.equal(steps[1].match(/^ {8}if: (.+)$/mu)?.[1], condition);
  for (const step of steps) {
    assert.match(step, /REQUIRED_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  }
  function run(event, results) {
    return steps
      .filter((step) => !step.includes(`if: ${condition}`) || event === 'pull_request')
      .map((step) => {
        const command = step.match(/run: (node scripts\/security\/check-results.mjs jobs .+)/)?.[1];
        assert.ok(command);
        return spawnSync(process.execPath, command.split(' ').slice(1), {
          encoding: 'utf8',
          env: { ...process.env, REQUIRED_RESULTS: JSON.stringify(results) },
        }).status;
      });
  }
  const successes = {
    application: { result: 'success' },
    security: { result: 'success' },
    devcontainer: { result: 'success' },
  };
  assert.deepEqual(run('pull_request', successes), [0, 0]);
  assert.deepEqual(run('push', { ...successes, devcontainer: { result: 'skipped' } }), [0]);
  for (const event of ['push', 'pull_request']) {
    const required = event === 'push' ? ['application', 'security'] : Object.keys(successes);
    for (const name of required) {
      for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
        const results = { ...successes, [name]: { result } };
        if (result === undefined) delete results[name];
        assert.ok(run(event, results).includes(1), `${event}: ${name}: ${result}`);
      }
    }
  }
});

test('CI retains test output without turning failing commands into successful tee pipelines', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-ci-test-logs-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [jobName, name] of [
    ['checks', 'Workflow gate tests'],
    ['checks', 'Manual mapping'],
    ['unit', 'Unit coverage with CI fonts'],
    ['integration', 'Integration tests with CI fonts'],
    ['checks', 'Container checks'],
  ]) {
    const source =
      jobName === 'integration'
        ? readFileSync('.github/workflows/integration-group.yml', 'utf8')
        : workflow;
    const body = job(jobName, source);
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
          ...bashArguments(source, body, step[1]),
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

test('independent checks and every integration group feed a small gate that rejects incomplete results', () => {
  for (const name of ['unit', 'checks']) {
    const body = job(name);
    assert.doesNotMatch(body, /^ {4}needs:/mu, `${name} must start independently`);
    assert.doesNotMatch(body, /^ {4}timeout-minutes:/mu);
  }
  assert.match(job('unit'), /npm run test:unit:ci -- --coverage/);
  assert.match(job('unit'), /- run: npm run build[\s\S]+- name: Unit coverage with CI fonts/);
  const count = JSON.parse(
    readFileSync('scripts/testing/integration-durations.json', 'utf8'),
  ).groups;
  const groupNames = Array.from({ length: count }, (_, i) => `integration-${i + 1}`);
  for (const [i, name] of groupNames.entries()) {
    const body = job(name);
    assert.doesNotMatch(body, /^ {4}needs:/mu);
    assert.match(body, /uses: .\/\.github\/workflows\/integration-group.yml/);
    assert.match(body, new RegExp(`group: ${i + 1}\\n`));
    assert.doesNotMatch(body, /continue-on-error|if:/);
  }
  const integration = job(
    'integration',
    readFileSync('.github/workflows/integration-group.yml', 'utf8'),
  );
  assert.match(integration, /npm run build/);
  assert.match(integration, /npm run test:integration:group -- --group "\$INTEGRATION_GROUP"/);
  assert.match(
    integration,
    /name: integration-test-diagnostics-group-\$\{\{ inputs.group \}\}-\$\{\{ github.run_attempt \}\}/,
  );
  assert.match(integration, /if: always\(\)[\s\S]+retention-days: 7/);
  assert.match(integration, /test-results\/[\s\S]+logs\/tests\//);
  const application = job('application');
  assert.match(
    job('checks'),
    /- run: npx playwright install --with-deps chromium[\s\S]+- name: Workflow gate tests/,
  );
  assert.match(application, /^ {4}if: always\(\)$/mu);
  assert.match(application, /REQUIRED_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  const required = application.match(/^ {4}needs: \[(.+)\]$/mu)?.[1].split(', ');
  assert.deepEqual(required, ['checks', 'unit', ...groupNames]);
  assert.doesNotMatch(application, /npm ci|npm run|playwright install|upload-artifact/);
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
