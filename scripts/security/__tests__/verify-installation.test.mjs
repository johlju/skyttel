import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { ZipFile } from 'yazl';
import { verifyInstallation } from '../verify-installation.mjs';

const now = '2026-09-25T10:00:00.000Z';
const started = '2026-09-25T06:23:00.000Z';
const scanned = '2026-09-25T06:25:00.000Z';
const completed = '2026-09-25T06:26:00.000Z';
const old = '2026-09-23T06:23:00.000Z';
const origin = 'https://skyttel.example.test';
const image = (character) => `ghcr.io/viscalyx/skyttel@sha256:${character.repeat(64)}`;
const target = (role, character, deployment) => ({
  role,
  image: image(character),
  commit: character.repeat(40),
  version: `0.1.${deployment}`,
  deployment,
});

async function zip(files) {
  const archive = new ZipFile();
  for (const [name, value] of files) archive.addBuffer(Buffer.from(value), name);
  archive.end();
  const parts = [];
  for await (const part of archive.outputStream) parts.push(part);
  return Buffer.concat(parts);
}

function fixture() {
  const retained = [target('running', 'a', 4), target('rollback', 'b', 2)];
  const state = {
    workflow: { state: 'active', path: '.github/workflows/image-monitor.yml' },
    latest: {
      id: 42,
      run_attempt: 1,
      head_branch: 'main',
      path: '.github/workflows/image-monitor.yml',
      head_sha: 'c'.repeat(40),
      repository: { full_name: 'viscalyx/skyttel' },
      head_repository: { full_name: 'viscalyx/skyttel' },
      event: 'schedule',
      status: 'completed',
      conclusion: 'success',
      created_at: started,
      updated_at: completed,
    },
    artifact: {
      id: 81,
      name: 'deployed-image-security',
      expired: false,
      size_in_bytes: 1_000,
      workflow_run: { id: 42, head_sha: 'c'.repeat(40), head_branch: 'main' },
    },
    status: {
      version: 1,
      checkedAt: scanned,
      status: 'passed',
      notification: 'not-needed',
      targets: retained.map((entry) => ({ ...entry, scannedAt: scanned, policy: 'passed' })),
    },
    retained,
    saved: image('a'),
    live: image('a'),
    version: {
      commit: 'a'.repeat(40),
      version: '0.1.4',
      database: { status: 'ready', schemaVersion: 42, schemaChecksum: 'd'.repeat(64) },
    },
    health: { status: 'ok' },
    bootstrap: { status: 'anonymous', providers: ['google', 'microsoft'] },
    page: '<html><body>Sign in</body></html>',
    requests: [],
  };
  async function send(address, options) {
    assert.equal(options.method, 'GET', 'Verification must not change external state');
    state.requests.push(address);
    const url = new URL(address);
    if (url.origin === origin || url.hostname === 'artifact.example.test') {
      assert.equal(options.headers.Authorization, undefined, 'Never forward API credentials');
    } else {
      assert.equal(
        options.headers.Authorization,
        url.hostname === 'api.github.com' ? 'Bearer synthetic-github' : 'Bearer synthetic-render',
      );
    }
    if (state.fail?.(url)) throw new Error('private-provider-response-and-token');
    if (url.pathname.endsWith('/image-monitor.yml')) return Response.json(state.workflow);
    if (url.pathname.endsWith('/image-monitor.yml/runs')) {
      const run = url.searchParams.get('event')
        ? (state.scheduled ?? state.latest)
        : state.finalRun && state.requests.filter((item) => item.endsWith('per_page=1')).length > 1
          ? state.finalRun
          : state.latest;
      return Response.json({ workflow_runs: run ? [run] : [] });
    }
    if (url.pathname.endsWith('/artifacts')) {
      return Response.json({ total_count: 1, artifacts: state.artifacts ?? [state.artifact] });
    }
    if (url.pathname.endsWith('/zip')) {
      assert.equal(options.redirect, 'manual');
      return new Response(null, {
        status: 302,
        headers: { location: state.location ?? 'https://artifact.example.test/status.zip?private' },
      });
    }
    if (url.hostname === 'artifact.example.test') {
      return new Response(
        await zip(state.files ?? [['status.json', JSON.stringify(state.status)]]),
      );
    }
    if (url.pathname.endsWith('/deployments')) {
      return Response.json([
        { id: 5, payload: { image: image('e') } },
        ...state.retained.map((entry) => ({
          id: entry.deployment,
          sha: entry.commit,
          payload: { image: entry.image, version: entry.version },
        })),
      ]);
    }
    if (url.pathname.endsWith('/statuses')) {
      return Response.json([{ state: url.pathname.includes('/5/') ? 'failure' : 'success' }]);
    }
    if (url.pathname.endsWith('/deploys')) {
      return Response.json([
        { deploy: { status: 'live', image: { ref: state.live, sha: state.live.split('@')[1] } } },
      ]);
    }
    if (url.hostname === 'api.render.com') return Response.json({ imagePath: state.saved });
    if (url.pathname === '/healthz') return Response.json(state.health);
    if (url.pathname === '/api/version') return Response.json(state.version);
    if (url.pathname === '/api/bootstrap') return Response.json(state.bootstrap);
    if (url.origin === origin && url.pathname === '/') {
      if (state.changeAfterPage) state.saved = image('f');
      return new Response(state.page);
    }
    throw new Error(`Unexpected fixture request: ${address}`);
  }
  const run = (options = {}) =>
    verifyInstallation({
      origin,
      githubToken: 'synthetic-github',
      renderToken: 'synthetic-render',
      serviceId: 'srv-synthetic',
      fetch: send,
      now: () => now,
      ...options,
    });
  return { state, run };
}

test('verifies live HTTPS, accepted retained digests and fresh scheduled evidence using GET only', async () => {
  const { state, run } = fixture();
  const result = await run();
  assert.equal(result.outcome, 'success', result.reason);
  assert.equal(result.scheduledRun, 42);
  assert.equal(result.humanNotification, 'unverified');
  assert.deepEqual(result.targets, state.retained);
  assert.ok(result.checks.includes('database-ready'));
  assert.ok(state.requests.some((address) => address.includes('event=schedule')));
  assert.equal(state.requests.filter((address) => address.includes('status=live')).length, 2);
});

test('accepts a first deployment without inventing a rollback image', async () => {
  const { state, run } = fixture();
  state.retained.pop();
  state.status.targets.pop();
  assert.equal((await run()).outcome, 'success');
});

test('manual success does not replace a missing, failed or stale scheduled run', async () => {
  for (const change of [
    { event: 'workflow_dispatch' },
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { created_at: old },
  ]) {
    const { state, run } = fixture();
    state.scheduled = { ...state.latest, ...change };
    state.latest.event = 'workflow_dispatch';
    assert.equal((await run()).outcome, 'failure', JSON.stringify(change));
  }
  const { state, run } = fixture();
  state.scheduled = false;
  assert.equal((await run()).reason, 'invalid_workflow_run');
});

test('an earlier green schedule cannot hide a newer failed run or a disabled workflow', async () => {
  for (const change of [
    (state) => {
      state.latest.conclusion = 'failure';
    },
    (state) => {
      state.latest.status = 'queued';
    },
    (state) => {
      state.workflow.state = 'disabled_inactivity';
    },
  ]) {
    const { state, run } = fixture();
    state.scheduled = structuredClone(state.latest);
    change(state);
    assert.equal((await run()).outcome, 'failure');
  }
});

test('rejects substituted workflows, branches, artifacts and stale or unsuccessful scan evidence', async () => {
  for (const change of [
    (state) => {
      state.latest.head_branch = 'unreviewed';
    },
    (state) => {
      state.latest.head_repository.full_name = 'someone/skyttel';
    },
    (state) => {
      state.latest.path = '.github/workflows/other.yml';
    },
    (state) => {
      state.artifact.workflow_run.head_sha = 'f'.repeat(40);
    },
    (state) => {
      state.artifact.workflow_run.id = 41;
    },
    (state) => {
      state.artifact.expired = true;
    },
    (state) => {
      state.artifacts = [];
    },
    (state) => {
      state.artifacts = [state.artifact, state.artifact];
    },
    (state) => {
      state.status.checkedAt = old;
    },
    (state) => {
      state.status.checkedAt = '2026-09-25T09:00:00.000Z';
    },
    (state) => {
      state.status.targets[0].scannedAt = old;
    },
    (state) => {
      state.status.status = 'unknown';
    },
    (state) => {
      state.status.status = 'blocked';
    },
    (state) => {
      state.status.notification = 'failed';
    },
    (state) => {
      state.status.targets[1].policy = 'blocked';
    },
    (state) => {
      state.status.targets[0].image = image('f');
    },
    (state) => {
      state.status.targets[1].deployment = 1;
    },
    (state) => {
      state.status.targets[0].commit = 'f'.repeat(40);
    },
    (state) => {
      state.status.targets.pop();
    },
    (state) => {
      state.saved = image('f');
    },
  ]) {
    const { state, run } = fixture();
    change(state);
    const result = await run();
    assert.equal(result.outcome, 'failure', String(change));
  }
});

test('fails on real endpoint mismatches and evidence changing during verification', async () => {
  for (const change of [
    (state) => {
      state.health.status = 'unavailable';
    },
    (state) => {
      state.version.commit = 'f'.repeat(40);
    },
    (state) => {
      state.version.database.status = 'unknown';
    },
    (state) => {
      state.bootstrap.providers = ['google'];
    },
    (state) => {
      state.bootstrap.status = 'authenticated';
    },
    (state) => {
      state.page = 'proxy error';
    },
    (state) => {
      state.changeAfterPage = true;
    },
    (state) => {
      state.finalRun = { ...state.latest, id: 43 };
    },
    (state) => {
      state.finalRun = { ...state.latest, run_attempt: 2 };
    },
  ]) {
    const { state, run } = fixture();
    change(state);
    assert.equal((await run()).outcome, 'failure', String(change));
  }
});

test('rejects unexpected archive entries, duplicate status, malformed JSON and insecure downloads', async () => {
  for (const files of [
    [['different.json', '{}']],
    [['status.json', '{']],
    [
      ['status.json', '{}'],
      ['status.json', '{}'],
    ],
    [['status.json', 'x'.repeat(2 * 1024 * 1024 + 1)]],
  ]) {
    const { state, run } = fixture();
    state.files = files;
    assert.equal((await run()).outcome, 'failure');
  }
  const { state, run } = fixture();
  state.location = 'http://artifact.example.test/status.zip';
  assert.equal((await run()).outcome, 'failure');
});

test('does not disclose external responses or credentials and never implies human delivery', async () => {
  const { state, run } = fixture();
  state.fail = (url) => url.pathname.endsWith('/healthz');
  const failed = await run();
  assert.equal(failed.outcome, 'failure');
  assert.doesNotMatch(JSON.stringify(failed), /private-provider|synthetic-github|synthetic-render/);
  state.fail = undefined;
  state.status.notification = 'accepted-by-github';
  assert.equal((await run()).humanNotification, 'unverified');
});

test('the CLI fails without supplied credentials and makes no live verification claim', () => {
  const result = spawnSync(process.execPath, ['scripts/security/verify-installation.mjs'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).reason, 'missing_credentials');
});

test('rejects missing credentials or an HTTP origin before contacting external services', async () => {
  for (const options of [
    { githubToken: '' },
    { renderToken: '' },
    { origin: 'http://localhost' },
  ]) {
    const { state, run } = fixture();
    assert.equal((await run(options)).outcome, 'failure');
    assert.deepEqual(state.requests, []);
  }
});
