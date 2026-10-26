import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const start = Date.parse('2026-10-26T12:00:00Z');
const head = 'a'.repeat(40);
const root = 'repos/example/project';
const check = {
  context: 'application',
  appId: 15368,
  workflow: '.github/workflows/ci.yml',
  event: 'pull_request',
};
const input = {
  version: 1,
  repo: 'example/project',
  policyBranch: 'main',
  phase: 'published',
  prs: [{ number: 7, head, checks: [check] }],
};
const pr = {
  number: 7,
  state: 'open',
  draft: true,
  head: { sha: head, ref: 'feature' },
  base: { ref: 'main' },
};
const run = {
  id: 100,
  run_attempt: 1,
  run_number: 10,
  check_suite_id: 500,
  head_sha: head,
  head_branch: 'feature',
  path: check.workflow,
  event: check.event,
  status: 'in_progress',
  created_at: new Date(start).toISOString(),
  run_started_at: new Date(start).toISOString(),
  html_url: 'https://github.com/example/project/actions/runs/100',
};
const job = {
  id: 200,
  run_id: 100,
  run_attempt: 1,
  head_sha: head,
  name: 'application',
  status: 'in_progress',
  conclusion: null,
  check_run_url: 'https://api.github.com/repos/example/project/check-runs/200',
  html_url: 'https://github.com/example/project/actions/runs/100/job/200',
};
const paths = {
  pr: `${root}/pulls/7`,
  rules: `${root}/rules/branches/main?per_page=100&page=1`,
  branch: `${root}/branches/main`,
  runs: `${root}/actions/runs?head_sha=${head}&per_page=100&page=1`,
  checks: `${root}/commits/${head}/check-runs?filter=all&per_page=100&page=1`,
  jobs: `${root}/actions/runs/100/jobs?filter=all&per_page=100&page=1`,
  artifacts: `${root}/actions/runs/100/artifacts?per_page=100&page=1`,
};
function responses({ conclusion, attempt = 1, jobs, artifacts = [] } = {}) {
  return {
    [paths.pr]: { body: pr },
    [paths.rules]: {
      body: [
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: [{ context: 'application', integration_id: 15368 }],
          },
        },
      ],
    },
    [paths.branch]: { body: { protection: { enabled: false } } },
    [paths.runs]: {
      body: {
        workflow_runs: [
          {
            ...run,
            run_attempt: attempt,
            status: conclusion ? 'completed' : 'in_progress',
            conclusion,
          },
        ],
      },
    },
    [paths.checks]: {
      body: {
        check_runs: [
          {
            id: 200,
            name: 'application',
            head_sha: head,
            app: { id: 15368 },
            check_suite: { id: 500 },
          },
        ],
      },
    },
    [paths.jobs]: {
      body: {
        jobs: jobs ?? [
          {
            ...job,
            run_attempt: attempt,
            status: conclusion ? 'completed' : 'in_progress',
            conclusion: conclusion ?? null,
          },
        ],
      },
    },
    [paths.artifacts]: { body: { artifacts } },
  };
}
function harness(t, manifest = input) {
  const directory = mkdtempSync(join(tmpdir(), 'ci-watch-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = (name) => join(directory, name);
  writeFileSync(file('input.json'), JSON.stringify(manifest));
  function execute({
    steps = [],
    base = responses(),
    stopAfter = 1000,
    at = start,
    args = [],
    signal,
    probeError,
  } = {}) {
    writeFileSync(
      file('fixture.json'),
      JSON.stringify({
        start: at,
        stopAt: at + stopAfter,
        signal,
        probeError,
        responses: base,
        steps: [{ at: 0, responses: {} }, ...steps],
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        './scripts/__tests__/helpers/ci-watch-provider.mjs',
        '.agents/skills/implement-stack/scripts/watch-ci.mjs',
        '--input',
        file('input.json'),
        '--state',
        file('state.json'),
        ...args,
      ],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          GH_TOKEN: 'fake-never-print',
          CI_WATCH_FIXTURE: file('fixture.json'),
          CI_WATCH_TRACE: file('trace.jsonl'),
        },
      },
    );
    assert.equal(result.error, undefined, result.error?.message);
    assert.ok(!`${result.stdout}${result.stderr}`.includes('fake-never-print'));
    return {
      ...result,
      events: result.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    };
  }
  return {
    execute,
    file,
    state: () => JSON.parse(readFileSync(file('state.json'), 'utf8')),
    trace: () =>
      readFileSync(file('trace.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
  };
}

test('CLI bounds a three-hour unchanged wait and immediately serves accurate cached status', (t) => {
  const h = harness(t);
  const result = h.execute({ stopAfter: 3 * 3600_000 });
  assert.equal(result.status, 130, result.stderr);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].snapshot.state, 'pending');
  assert.ok(h.trace().filter((call) => call.path === paths.runs).length <= 41);
  assert.ok(h.trace().every((call) => call.method === 'GET'));
  const cached = h.execute({ at: start + 4 * 3600_000, args: ['--status'] });
  assert.equal(cached.status, 0);
  assert.equal(cached.events[0].stale, true);
  assert.ok(cached.events[0].ageSeconds >= 3600);
});

test('CLI emits failure, later diagnostics and completion without repeating unchanged snapshots', (t) => {
  const h = harness(t);
  const artifact = {
    id: 300,
    name: 'diagnostics-1',
    created_at: new Date(start + 60_000).toISOString(),
    expired: false,
    url: 'https://api.github.com/artifacts/300',
  };
  const result = h.execute({
    stopAfter: 600_000,
    steps: [
      { at: start + 15_000, responses: responses({ conclusion: 'failure' }) },
      {
        at: start + 45_000,
        responses: responses({ conclusion: 'failure', artifacts: [artifact] }),
      },
      { at: start + 120_000, responses: responses({ conclusion: 'success', attempt: 2 }) },
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.events.map((event) => event.snapshot.state),
    ['pending', 'failed', 'failed', 'successful'],
  );
  assert.deepEqual(
    result.events[2].snapshot.prs[0].checks[0].diagnostics.map((item) => item.id),
    [300],
  );
  assert.equal(result.events[3].snapshot.prs[0].checks[0].attempt, 2);
});

test('CLI preserves acknowledged notifications and unfinished work across interruption/resume', (t) => {
  const h = harness(t);
  const first = h.execute();
  assert.equal(first.status, 130);
  const second = h.execute({ at: start + 15_000, args: ['--ack', first.events[0].id] });
  assert.equal(second.status, 130, second.stderr);
  assert.deepEqual(second.events, []);
  assert.equal(h.state().snapshot.state, 'pending');
  const completed = h.execute({ at: start + 60_000, base: responses({ conclusion: 'success' }) });
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(completed.events.length, 1);
  assert.equal(completed.events[0].snapshot.state, 'successful');
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  test(`CLI releases its writer lock and preserves resumable state on ${signal}`, (t) => {
    const h = harness(t);
    const interrupted = h.execute({ signal });
    assert.equal(interrupted.status, 130, interrupted.stderr);
    assert.equal(existsSync(h.file('state.json.lock')), false);
    assert.equal(h.state().snapshot.state, 'pending');
    const resumed = h.execute({ at: start + 15_000, base: responses({ conclusion: 'success' }) });
    assert.equal(resumed.status, 0, resumed.stderr);
  });
}

test('CLI serializes stale-lock recovery and resumes preserved evidence', (t) => {
  const h = harness(t);
  const first = h.execute({ args: ['--once'] });
  const exited = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], {
    encoding: 'utf8',
  });
  assert.equal(exited.status, 0);
  const pid = Number(exited.stdout.trim());
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  mkdirSync(h.file('state.json.lock'));
  const owner = JSON.stringify({ pid });
  writeFileSync(h.file('state.json.lock/owner.json'), owner);
  mkdirSync(h.file('state.json.lock.reclaim'));
  const blocked = h.execute({ args: ['--once'] });
  assert.equal(blocked.status, 64);
  assert.ok(blocked.stderr.includes(`owner PID ${pid} has an unresolved recovery`));
  assert.equal(readFileSync(h.file('state.json.lock/owner.json'), 'utf8'), owner);
  rmSync(h.file('state.json.lock.reclaim'), { recursive: true });
  const resumed = h.execute({ args: ['--once'] });
  assert.equal(resumed.status, 2, resumed.stderr);
  assert.equal(resumed.events[0].id, first.events[0].id);
  assert.equal(existsSync(h.file('state.json.lock')), false);
  assert.equal(existsSync(h.file('state.json.lock.reclaim')), false);
});

for (const [name, owner, probeError, message] of [
  ['live', JSON.stringify({ pid: process.pid }), undefined, `live owner PID ${process.pid}`],
  ['missing', undefined, undefined, 'unverifiable owner in owner.json'],
  ['malformed', '{', undefined, 'unverifiable owner in owner.json'],
  ['invalid PID', JSON.stringify({ pid: 0 }), undefined, 'unverifiable owner in owner.json'],
  [
    'permission denied',
    JSON.stringify({ pid: process.pid }),
    'EPERM',
    `owner PID ${process.pid} is unverifiable`,
  ],
]) {
  test(`CLI preserves a lock and state when its owner is ${name}`, (t) => {
    const h = harness(t);
    h.execute({ args: ['--once'] });
    const saved = readFileSync(h.file('state.json'), 'utf8');
    mkdirSync(h.file('state.json.lock'));
    if (owner !== undefined) writeFileSync(h.file('state.json.lock/owner.json'), owner);
    const blocked = h.execute({ probeError });
    assert.equal(blocked.status, 64);
    assert.ok(blocked.stderr.includes(h.file('state.json.lock')), blocked.stderr);
    assert.ok(blocked.stderr.includes(message), blocked.stderr);
    assert.deepEqual(blocked.events, []);
    assert.equal(readFileSync(h.file('state.json'), 'utf8'), saved);
    assert.equal(existsSync(h.file('state.json.lock')), true);
    if (owner !== undefined)
      assert.equal(readFileSync(h.file('state.json.lock/owner.json'), 'utf8'), owner);
  });
}

test('CLI keeps a known failure visible when diagnostics are inaccessible', (t) => {
  const h = harness(t);
  const base = responses({ conclusion: 'failure' });
  base[paths.artifacts] = { status: 403, body: { message: 'Forbidden' } };
  const result = h.execute({ base, args: ['--once'] });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.events[0].snapshot.prs[0].checks[0].diagnosticState, 'inaccessible');
});

for (const [name, base, expected, code] of [
  [
    'missing workflow',
    { ...responses(), [paths.runs]: { body: { workflow_runs: [] } } },
    'pending',
    2,
  ],
  [
    'missing required job',
    { ...responses({ conclusion: 'success' }), [paths.jobs]: { body: { jobs: [] } } },
    'unknown',
    3,
  ],
  [
    'inaccessible policy',
    { ...responses(), [paths.rules]: { status: 403, body: {} } },
    'inaccessible',
    4,
  ],
  [
    'transient network error',
    { ...responses(), [paths.rules]: { networkError: 'network unavailable' } },
    'unknown',
    3,
  ],
  [
    'changed head',
    { ...responses(), [paths.pr]: { body: { ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } } } },
    'diverged',
    5,
  ],
  [
    'omitted required check',
    {
      ...responses(),
      [paths.rules]: {
        body: [
          {
            type: 'required_status_checks',
            parameters: {
              required_status_checks: [{ context: 'security-gate', integration_id: 15368 }],
            },
          },
        ],
      },
    },
    'unknown',
    3,
  ],
  [
    'wrong application',
    {
      ...responses({ conclusion: 'success' }),
      [paths.checks]: {
        body: { check_runs: [{ id: 200, name: 'application', head_sha: head, app: { id: 999 } }] },
      },
    },
    'unknown',
    3,
  ],
  [
    'duplicate job names',
    responses({
      conclusion: 'success',
      jobs: [
        { ...job, status: 'completed', conclusion: 'success' },
        { ...job, id: 201, status: 'completed', conclusion: 'success' },
      ],
    }),
    'unknown',
    3,
  ],
]) {
  test(`CLI distinguishes ${name}`, (t) => {
    const result = harness(t).execute({ base, args: ['--once'] });
    assert.equal(result.status, code, result.stderr);
    assert.equal(result.events[0].snapshot.state, expected);
  });
}

test('CLI retains successful jobs from a partial retry and excludes obsolete failures', (t) => {
  const h = harness(t);
  const base = responses({
    conclusion: 'success',
    attempt: 2,
    jobs: [{ ...job, status: 'completed', conclusion: 'success' }],
  });
  base[paths.runs].body.workflow_runs.push({
    ...run,
    id: 99,
    run_number: 9,
    status: 'completed',
    conclusion: 'cancelled',
  });
  const result = h.execute({ base, args: ['--once'] });
  assert.equal(result.status, 0, result.stderr);
  const evidence = result.events[0].snapshot.prs[0].checks[0];
  assert.equal(evidence.retained, true);
  assert.equal(evidence.jobAttempt, 1);
  assert.equal(evidence.attempt, 2);
  assert.deepEqual(evidence.history, [{ run: 99, attempt: 1, conclusion: 'cancelled' }]);
  const retry = harness(t).execute({
    base: responses({ attempt: 2, jobs: [{ ...job, status: 'completed', conclusion: 'failure' }] }),
    args: ['--once'],
  });
  assert.equal(retry.status, 2);
});

test('CLI waits for readiness-triggered checks after the recorded readiness boundary', (t) => {
  const manifest = {
    ...input,
    phase: 'ready',
    prs: [
      { ...input.prs[0], checks: [{ ...check, readyAfter: new Date(start + 1000).toISOString() }] },
    ],
  };
  const h = harness(t, manifest);
  const base = responses({ conclusion: 'success' });
  base[paths.pr] = { body: { ...pr, draft: false } };
  const ready = structuredClone(base);
  ready[paths.runs].body.workflow_runs[0].created_at = new Date(start + 2000).toISOString();
  const result = h.execute({
    base,
    stopAfter: 60_000,
    steps: [{ at: start + 15_000, responses: ready }],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.events.map((event) => event.snapshot.state),
    ['pending', 'successful'],
  );
});

test('CLI reuses successful same-head evidence in the ready phase without readyAfter', (t) => {
  const h = harness(t, { ...input, phase: 'ready' });
  const base = responses({ conclusion: 'success' });
  base[paths.pr] = { body: { ...pr, draft: false } };
  const result = h.execute({ base, args: ['--once'], at: start + 60_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.events[0].snapshot.state, 'successful');
});

test('CLI detects native stack membership divergence without retargeting', (t) => {
  const h = harness(t, { ...input, stack: 9 });
  const base = {
    ...responses(),
    [`${root}/stacks/9`]: {
      body: {
        number: 9,
        base: { ref: 'main' },
        pull_requests: [
          { number: 7, head: { sha: head } },
          { number: 8, head: { sha: head } },
        ],
      },
    },
  };
  const result = h.execute({ base });
  assert.equal(result.status, 5, result.stderr);
  assert.equal(result.events[0].snapshot.state, 'diverged');
});

test('CLI respects server retry timing across restart and recovers from uncertainty', (t) => {
  const h = harness(t);
  const base = {
    ...responses(),
    [paths.rules]: { status: 429, body: {}, headers: { 'retry-after': '600' } },
  };
  const first = h.execute({ base, args: ['--once'] });
  assert.equal(first.status, 3);
  const before = h.trace().length;
  const early = h.execute({ at: start + 1000, args: ['--once', '--ack', first.events[0].id] });
  assert.equal(early.status, 3);
  assert.equal(h.trace().length, before);
  const result = h.execute({
    at: start + 1000,
    stopAfter: 1000_000,
    base: responses({ conclusion: 'success' }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.events[0].snapshot.state, 'successful');
  assert.ok(
    h
      .trace()
      .slice(before)
      .every((call) => call.time >= start + 600_000),
  );
});

test('CLI replays unacknowledged event IDs, rejects changed input and preserves old state', (t) => {
  const h = harness(t);
  const first = h.execute({ args: ['--once'] });
  const again = h.execute({ args: ['--once'] });
  assert.equal(again.events[0].id, first.events[0].id);
  const saved = readFileSync(h.file('state.json'), 'utf8');
  writeFileSync(h.file('input.json'), JSON.stringify({ ...input, phase: 'ready' }));
  const changed = h.execute();
  assert.equal(changed.status, 64);
  assert.equal(readFileSync(h.file('state.json'), 'utf8'), saved);
});

test('CLI rejects an empty required-check manifest', (t) => {
  const result = harness(t, { ...input, prs: [{ ...input.prs[0], checks: [] }] }).execute();
  assert.equal(result.status, 64);
  assert.equal(result.events.length, 0);
});

test('CLI cannot satisfy checks with another branch at the same commit', (t) => {
  const base = responses({ conclusion: 'success' });
  base[paths.runs].body.workflow_runs[0].head_branch = 'unrelated';
  const result = harness(t).execute({ base, args: ['--once'] });
  assert.equal(result.status, 2);
});

test('CLI treats a recreated workflow as newer than its old high run number', (t) => {
  const base = responses({ conclusion: 'success' });
  base[paths.runs].body.workflow_runs.push({
    ...run,
    id: 101,
    run_number: 1,
    created_at: new Date(start + 1000).toISOString(),
  });
  base[`${root}/actions/runs/101/jobs?filter=all&per_page=100&page=1`] = { body: { jobs: [] } };
  const result = harness(t).execute({ base, args: ['--once'] });
  assert.equal(result.status, 2);
  assert.equal(result.events[0].snapshot.prs[0].checks[0].run, 101);
});

test('CLI follows pagination and legacy required-check policy', (t) => {
  const base = responses({ conclusion: 'success' });
  const bound = base[paths.checks].body.check_runs;
  base[paths.checks] = {
    body: { check_runs: Array.from({ length: 100 }, (_, index) => ({ id: 1000 + index })) },
  };
  base[paths.checks.replace('&page=1', '&page=2')] = { body: { check_runs: bound } };
  base[paths.branch] = { body: { protection: { enabled: true } } };
  base[`${root}/branches/main/protection`] = {
    body: { required_status_checks: { checks: [{ context: 'application', app_id: 15368 }] } },
  };
  const result = harness(t).execute({ base, args: ['--once'] });
  assert.equal(result.status, 0, result.stderr);
});

test('CLI emits only sparse configured heartbeats during an unchanged hour', (t) => {
  const result = harness(t).execute({ stopAfter: 3600_000, args: ['--heartbeat', '900'] });
  assert.equal(result.status, 130);
  assert.equal(result.events[0].kind, 'change');
  assert.ok(result.events.length >= 3 && result.events.length <= 5);
  assert.ok(result.events.slice(1).every((event) => event.kind === 'heartbeat'));
});

test('CLI reports dependency failures while the required aggregate job is still absent', (t) => {
  const base = responses({
    jobs: [{ ...job, name: 'unit', status: 'completed', conclusion: 'failure' }],
  });
  base[paths.checks].body.check_runs[0].name = 'unit';
  const result = harness(t).execute({ base, args: ['--once'] });
  assert.equal(result.status, 2);
  assert.deepEqual(
    result.events[0].snapshot.prs[0].checks[0].workflowFailures.map((failure) => failure.name),
    ['unit'],
  );
});

test('CLI never exits successfully when diagnostics rate limiting interrupts remaining gates', (t) => {
  const h = harness(t, {
    ...input,
    prs: [{ ...input.prs[0], checks: [check, { ...check, context: 'security-gate' }] }],
  });
  const base = responses({
    conclusion: 'success',
    jobs: [
      { ...job, status: 'completed', conclusion: 'success' },
      {
        ...job,
        id: 201,
        name: 'unit',
        status: 'completed',
        conclusion: 'failure',
        check_run_url: 'https://api.github.com/check-runs/201',
      },
    ],
  });
  base[paths.checks].body.check_runs.push({
    id: 201,
    name: 'unit',
    head_sha: head,
    app: { id: 15368 },
  });
  base[paths.artifacts] = { status: 429, body: {}, headers: { 'retry-after': '600' } };
  const result = h.execute({ base, args: ['--once'] });
  assert.equal(result.status, 3);
  assert.equal(result.events[0].snapshot.state, 'unknown');
  assert.equal(result.events[0].snapshot.prs[0].state, 'unknown');
});

test('CLI rejects a conflicting current producer of the required context in another workflow', (t) => {
  const base = responses({ conclusion: 'success' });
  base[paths.runs].body.workflow_runs.push({
    ...run,
    id: 101,
    check_suite_id: 501,
    path: '.github/workflows/other.yml',
    status: 'completed',
    conclusion: 'failure',
  });
  base[paths.checks].body.check_runs.push({
    id: 201,
    name: 'application',
    head_sha: head,
    app: { id: 15368 },
    check_suite: { id: 501 },
    conclusion: 'failure',
  });
  const result = harness(t).execute({ base, args: ['--once'] });
  assert.equal(result.status, 3);
  assert.match(result.events[0].snapshot.prs[0].checks[0].reason, /producer/);
});

test('CLI accepts explicit review-only legacy protection with no legacy status checks', (t) => {
  const base = responses({ conclusion: 'success' });
  base[paths.branch] = { body: { protection: { enabled: true } } };
  base[`${root}/branches/main/protection`] = {
    body: { required_pull_request_reviews: { required_approving_review_count: 1 } },
  };
  const result = harness(t).execute({ base, args: ['--once'] });
  assert.equal(result.status, 0, result.stderr);
});

test('CLI treats corrupt resume scheduling as invalid and preserves the state file', (t) => {
  const h = harness(t);
  h.execute({ args: ['--once'] });
  const state = h.state();
  state.interval = 0;
  const damaged = JSON.stringify(state);
  writeFileSync(h.file('state.json'), damaged);
  const result = h.execute({ args: ['--once'] });
  assert.equal(result.status, 64);
  assert.equal(readFileSync(h.file('state.json'), 'utf8'), damaged);
});

test('CLI separates a superseded failed attempt from its successful retry with the same name', (t) => {
  const base = responses({
    conclusion: 'success',
    attempt: 2,
    jobs: [
      { ...job, run_attempt: 2, status: 'completed', conclusion: 'success' },
      {
        ...job,
        id: 199,
        status: 'completed',
        conclusion: 'failure',
        check_run_url: 'https://api.github.com/check-runs/199',
      },
    ],
  });
  base[paths.checks].body.check_runs.push({
    ...base[paths.checks].body.check_runs[0],
    id: 199,
    conclusion: 'failure',
  });
  const result = harness(t).execute({ base, args: ['--once'] });
  assert.equal(result.status, 0, result.stderr);
  const evidence = result.events[0].snapshot.prs[0].checks[0];
  assert.deepEqual(evidence.workflowFailures, []);
  assert.deepEqual(evidence.history, [{ run: 100, attempt: 1, job: 199, conclusion: 'failure' }]);
});
