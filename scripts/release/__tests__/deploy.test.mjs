import assert from 'node:assert/strict';
import test from 'node:test';
import { deployRelease } from '../deploy.mjs';
import { createReleasePlan } from '../plan.mjs';

const commit = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const previousDigest = `sha256:${'c'.repeat(64)}`;
const image = 'ghcr.io/viscalyx/skyttel';
const identity = {
  ...createReleasePlan({
    gitVersion: { Sha: commit, SemVer: '0.1.0-preview.2', FullSemVer: '0.1.0-preview.2+2' },
    repository: 'viscalyx/skyttel',
    commit,
    ref: 'refs/heads/main',
    eventName: 'push',
  }),
  digest,
};
const version = {
  version: identity.fullVersion,
  commit,
  database: { status: 'ready', schemaVersion: 7, schemaChecksum: 'd'.repeat(64) },
};

function platform() {
  const state = {
    main: commit,
    savedImage: `${image}@${previousDigest}`,
    deploy: {
      id: 'dep-previous',
      status: 'live',
      image: { ref: `${image}@${previousDigest}`, sha: previousDigest },
    },
    running: { ...version, commit: 'e'.repeat(40), version: '0.1.0-preview.1+1' },
    deploys: 0,
    patches: 0,
    statuses: [],
    waits: 0,
    requests: [],
    nextStatus: 'live',
    healthy: true,
    nextHealthy: true,
    nextDigest: digest,
    nextDeployId: 'dep-new',
    nextIdentity: version,
    ignorePatch: false,
    databasePath: '/data/skyttel.sqlite',
  };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const fetch = async (url, options = {}) => {
    const { pathname: path } = new URL(url);
    const method = options.method ?? 'GET';
    const body = options.body && JSON.parse(options.body);
    state.requests.push({ url, method, body });
    if (path.endsWith('/git/ref/heads/main')) return reply({ object: { sha: state.main } });
    if (path === '/repos/viscalyx/skyttel/deployments') return reply({ id: 42 });
    if (path.endsWith('/deployments/42/statuses')) {
      state.statuses.push(body.state);
      return reply({});
    }
    if (path === '/v1/services/srv-synthetic') {
      if (method === 'PATCH') {
        state.patches++;
        if (!state.ignorePatch) state.savedImage = body.image.imagePath;
      }
      return reply({
        type: 'web_service',
        suspended: 'not_suspended',
        autoDeploy: 'no',
        ownerId: 'tea-synthetic',
        imagePath: state.savedImage,
        serviceDetails: {
          runtime: 'image',
          numInstances: 1,
          disk: { mountPath: '/data' },
          healthCheckPath: '/healthz',
        },
      });
    }
    if (path === '/v1/services/srv-synthetic/deploys') {
      if (method === 'POST') {
        state.deploys++;
        state.healthy = state.nextHealthy;
        state.deploy = {
          id: state.nextDeployId,
          status: state.nextStatus,
          image: { ref: body.imageUrl, sha: state.nextDigest },
        };
        state.running = state.nextIdentity;
        return reply(state.deploy);
      }
      return reply([{ deploy: state.deploy }]);
    }
    if (path === '/v1/services/srv-synthetic/deploys/dep-new') return reply(state.deploy);
    if (path === '/api/version') return reply(state.running);
    if (path.endsWith('/env-vars/SKYTTEL_DATABASE_PATH'))
      return reply({ key: 'SKYTTEL_DATABASE_PATH', value: state.databasePath });
    if (path === '/healthz')
      return reply({ status: state.healthy ? 'ok' : 'unavailable' }, state.healthy ? 200 : 503);
    if (path === '/api/bootstrap')
      return reply({ status: 'anonymous', providers: ['google', 'microsoft'] });
    if (path === '/') return new Response('<html><body>Skyttel</body></html>');
    throw new Error(`Unexpected HTTP request: ${path}`);
  };
  const run = () =>
    deployRelease({
      identity,
      serviceId: 'srv-synthetic',
      origin: 'https://skyttel.example.test',
      githubToken: 'synthetic-github-secret',
      renderToken: 'synthetic-render-secret',
      fetch,
      sleep: async () => {
        state.waits++;
        await state.onWait?.();
      },
      attempts: 2,
    });
  return { state, run };
}

test('a verified release updates the saved image and running digest; retry verifies without another interruption', async () => {
  const { state, run } = platform();
  assert.equal((await run()).outcome, 'success');
  assert.equal(state.savedImage, `${image}@${digest}`);
  assert.equal(state.deploy.image.ref, `${image}@${digest}`);
  assert.equal(state.deploy.image.sha, digest);
  assert.equal(state.statuses.at(-1), 'success');
  assert.equal((await run()).outcome, 'success');
  assert.equal(state.deploys, 1, 'A retry must verify the already running image, not restart it');
});

test('a superseded candidate never changes Render, including when main advances during a migration', async () => {
  const { state, run } = platform();
  state.main = 'f'.repeat(40);
  assert.equal((await run()).outcome, 'superseded');
  assert.equal(
    state.requests.filter((r) => new URL(r.url).hostname === 'api.render.com').length,
    0,
  );
  state.main = commit;
  state.deploy.status = 'update_in_progress';
  state.onWait = () => {
    state.main = 'f'.repeat(40);
    state.deploy.status = 'live';
  };
  assert.equal((await run()).outcome, 'superseded');
  assert.equal(state.waits, 1);
  assert.equal(state.patches, 0);
  assert.equal(state.deploys, 0);
  assert.ok(state.requests.every((r) => !r.url.includes('/cancel')));
});

test('migration failure records failure and prevents a blind retry or rollback', async () => {
  const { state, run } = platform();
  state.nextStatus = 'update_failed';
  const result = await run();
  assert.equal(result.outcome, 'failure');
  assert.equal(result.observedDeploy.status, 'update_failed');
  assert.equal(state.statuses.at(-1), 'failure');
  assert.equal((await run()).failure, 'previous_deployment_requires_diagnosis');
  assert.equal(state.deploys, 1);
  assert.ok(state.requests.every((r) => !r.url.includes('/rollback')));
  assert.doesNotMatch(JSON.stringify(result), /synthetic-.*-secret/);
});

test('a failed health check never records deployment success', async () => {
  const { state, run } = platform();
  state.nextHealthy = false;
  const result = await run();
  assert.equal(result.outcome, 'failure');
  assert.equal(result.observedDeploy.status, 'live');
  assert.equal(state.statuses.at(-1), 'failure');
  assert.ok(!state.statuses.includes('success'));
});

test('timeout leaves a migration running and the next attempt waits without starting a competing deploy', async () => {
  const { state, run } = platform();
  state.nextStatus = 'update_in_progress';
  assert.equal((await run()).failure, 'deployment_still_active');
  assert.equal((await run()).failure, 'deployment_still_active');
  assert.equal(state.deploys, 1);
  assert.ok(state.requests.every((r) => !r.url.includes('/cancel')));
});

test('a live but unhealthy previous application prevents retry before any mutation', async () => {
  const { state, run } = platform();
  state.healthy = false;
  assert.equal((await run()).outcome, 'failure');
  assert.equal(state.deploys, 0);
  assert.equal(state.patches, 0);
});

test('an ephemeral database path blocks rollout even when a persistent disk is attached', async () => {
  const { state, run } = platform();
  state.databasePath = '/tmp/skyttel.sqlite';
  assert.equal((await run()).outcome, 'failure');
  assert.equal(state.deploys, 0);
  assert.equal(state.patches, 0);
});

test('a failed service-setting update never triggers a deployment with a temporary image override', async () => {
  const { state, run } = platform();
  state.ignorePatch = true;
  assert.equal((await run()).failure, 'saved_image_mismatch');
  assert.equal(state.deploys, 0);
});

test('a live deployment must match both the resolved digest and the application identity', async () => {
  const wrongDigest = platform();
  wrongDigest.state.nextDigest = previousDigest;
  assert.equal((await wrongDigest.run()).failure, 'running_digest_mismatch');
  const wrongCommit = platform();
  wrongCommit.state.nextIdentity = { ...version, commit: 'f'.repeat(40) };
  assert.equal((await wrongCommit.run()).failure, 'running_identity_mismatch');
  assert.ok(!wrongDigest.state.statuses.includes('success'));
  assert.ok(!wrongCommit.state.statuses.includes('success'));
});

test('unknown database state is reported without copying an unexpected application response', async () => {
  const { state, run } = platform();
  state.nextIdentity = { household: 'private-household-name', token: 'private-token' };
  const report = await run();
  assert.equal(report.outcome, 'failure');
  assert.equal(report.database, 'unknown');
  assert.equal(report.application, null);
  assert.doesNotMatch(JSON.stringify(report), /private-household-name|private-token/);
});

test('malformed deployment IDs are rejected before polling and excluded from public evidence', async () => {
  for (const id of [
    ['dep-private'],
    { id: 'dep-private' },
    'dep-private/../secret',
    `dep-${'a'.repeat(65)}`,
  ]) {
    const { state, run } = platform();
    state.nextDeployId = id;
    const report = await run();
    assert.equal(report.outcome, 'failure');
    assert.equal(report.failure, 'missing_deploy_id');
    assert.equal(report.deployId, undefined);
    assert.equal(report.observedDeploy.id, null);
    assert.equal(state.waits, 0);
    assert.doesNotMatch(JSON.stringify(report), /dep-private|secret/);
  }
});
