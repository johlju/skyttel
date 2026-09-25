import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deploymentFailureLog, deployRelease } from '../deploy.mjs';
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
    serviceOverrides: {},
    comparison: { status: 'ahead', files: [{ filename: 'src/server/app.ts' }] },
  };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const fetch = async (url, options = {}) => {
    const { pathname: path } = new URL(url);
    const method = options.method ?? 'GET';
    const body = options.body && JSON.parse(options.body);
    state.requests.push({ url, method, body });
    const override = await state.respond?.({ path, method, body });
    if (override) return override;
    if (path.endsWith('/git/ref/heads/main')) return reply({ object: { sha: state.main } });
    if (path.startsWith('/repos/viscalyx/skyttel/compare/')) return reply(state.comparison);
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
        autoDeploy: 'yes',
        ownerId: 'tea-synthetic',
        imagePath: state.savedImage,
        serviceDetails: {
          runtime: 'image',
          numInstances: 1,
          disk: { mountPath: '/data' },
          healthCheckPath: '/healthz',
        },
        ...state.serviceOverrides,
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
  const events = [];
  const run = (overrides = {}) =>
    deployRelease({
      identity,
      sourceCommit: commit,
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
      onEvent: (event) => events.push(structuredClone(event)),
      ...overrides,
    });
  return { state, run, events };
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

test('image services deploy and retry regardless of the inapplicable autoDeploy field', async () => {
  for (const autoDeploy of ['yes', 'no', undefined]) {
    const { state, run } = platform();
    state.serviceOverrides = { autoDeploy };
    assert.equal((await run()).outcome, 'success');
    assert.equal((await run()).outcome, 'success');
    assert.equal(state.deploys, 1);
    assert.equal(state.savedImage, `${image}@${digest}`);
    assert.ok(
      state.requests
        .filter(({ method }) => method === 'PATCH')
        .every(({ body }) => !Object.hasOwn(body, 'autoDeploy')),
    );
  }
});

test('Git-backed services remain blocked even with automatic deployment disabled', async () => {
  const { state, run } = platform();
  state.serviceOverrides = {
    autoDeploy: 'no',
    serviceDetails: {
      runtime: 'docker',
      numInstances: 1,
      disk: { mountPath: '/data' },
      healthCheckPath: '/healthz',
    },
  };
  const report = await run();
  assert.equal(report.failure, 'unsafe_service_configuration');
  assert.deepEqual(report.configurationFailures, [
    { field: 'serviceDetails.runtime', expected: 'image', observed: 'docker' },
  ]);
  assert.ok(state.requests.every(({ method }) => method === 'GET'));
});

test('preflight reports every failed field in evidence and job errors without making changes', async () => {
  const { state, run } = platform();
  state.serviceOverrides = {
    autoDeploy: 'yes',
    serviceDetails: {
      runtime: 'image',
      numInstances: 2,
      healthCheckPath: '/healthz',
      envSpecificDetails: { dockerCommand: 'private-command-secret\n::warning::injected' },
    },
  };
  const report = await run();
  assert.equal(report.failure, 'unsafe_service_configuration');
  assert.deepEqual(report.configurationFailures, [
    { field: 'serviceDetails.numInstances', expected: 1, observed: 2 },
    { field: 'serviceDetails.disk.mountPath', expected: '/data', observed: 'missing' },
    {
      field: 'serviceDetails.envSpecificDetails.dockerCommand configured',
      expected: false,
      observed: true,
    },
  ]);
  const log = deploymentFailureLog(report);
  assert.match(log, /::error::Render deployment failed: unsafe_service_configuration/);
  for (const { field } of report.configurationFailures) assert.ok(log.includes(field));
  assert.match(log, /expected 1, observed 2/);
  assert.match(log, /No deployment was requested/);
  assert.doesNotMatch(log + JSON.stringify(report), /private-command-secret|::warning::injected/);
  assert.ok(state.requests.every(({ method }) => method === 'GET'));
});

test('missing service details and arbitrary API values remain diagnosable without leaking data', async () => {
  for (const serviceDetails of [
    null,
    {},
    { runtime: 'private-runtime-secret\n::error::injected' },
  ]) {
    const { state, run } = platform();
    state.serviceOverrides = { serviceDetails };
    const report = await run();
    assert.equal(report.failure, 'unsafe_service_configuration');
    assert.ok(report.configurationFailures.some(({ field }) => field === 'serviceDetails.runtime'));
    assert.doesNotMatch(
      deploymentFailureLog(report) + JSON.stringify(report),
      /private-runtime-secret|::error::injected/,
    );
    assert.ok(state.requests.every(({ method }) => method === 'GET'));
  }
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

test('documentation and devcontainer pushes cannot supersede a pending production release', async () => {
  const { state, run } = platform();
  state.main = 'f'.repeat(40);
  state.comparison.files = [
    { filename: 'docs/operations/render.md' },
    { filename: '.devcontainer/Dockerfile' },
    { filename: 'scripts/release/deploy.mjs' },
  ];
  assert.equal((await run()).outcome, 'success');
  assert.equal(state.deploys, 1);
  assert.equal(state.requests.filter(({ url }) => url.includes('/compare/')).length, 3);
  assert.ok(
    state.requests
      .filter(({ url }) => url.includes('/compare/'))
      .every(
        ({ url }) =>
          url === `https://api.github.com/repos/viscalyx/skyttel/compare/${commit}...${state.main}`,
      ),
  );
});

test('release identity must match a valid workflow revision before any outbound request', async () => {
  for (const sourceCommit of [undefined, '', 'main', `${commit}/private-data`, [commit]]) {
    const { state, run } = platform();
    const report = await run({ sourceCommit });
    assert.equal(report.failure, 'invalid_source_commit');
    assert.equal(state.requests.length, 0);
  }
  for (const artifactCommit of ['f'.repeat(40), `${commit}/private-data`, [commit]]) {
    const { state, run } = platform();
    const report = await run({ identity: { ...identity, commit: artifactCommit } });
    assert.equal(report.failure, 'release_commit_mismatch');
    assert.equal(state.requests.length, 0);
    assert.equal(report.requested.commit, commit);
    assert.doesNotMatch(JSON.stringify(report), /private-data/);
  }
});

test('renamed production inputs and rewritten main supersede a candidate', async () => {
  for (const comparison of [
    {
      status: 'ahead',
      files: [{ filename: 'docs/example.ts', previous_filename: 'src/server/app.ts' }],
    },
    { status: 'diverged', files: [] },
    { status: 'behind', files: [] },
  ]) {
    const { state, run } = platform();
    state.main = 'f'.repeat(40);
    state.comparison = comparison;
    assert.equal((await run()).outcome, 'superseded');
    assert.equal(state.patches, 0);
    assert.equal(state.deploys, 0);
  }
});

test('incomplete comparisons fail rather than treating unobserved changes as safe', async () => {
  for (const files of [
    undefined,
    Array.from({ length: 300 }, () => ({ filename: 'docs/readme.md' })),
    [{}],
  ]) {
    const { state, run } = platform();
    state.main = 'f'.repeat(40);
    state.comparison = { status: 'ahead', files };
    const report = await run();
    assert.equal(report.failure, 'main_comparison_incomplete');
    assert.equal(state.patches, 0);
    assert.equal(state.deploys, 0);
  }
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
  assert.equal(result.failurePhase, 'verify-application');
  assert.equal(result.failedRequest.path, '/healthz');
  assert.equal(result.failedRequest.target, 'application');
  assert.equal(result.failedRequest.status, 503);
  assert.match(deploymentFailureLog(result), /503/);
});

test('request diagnostics preserve the primary HTTP failure when snapshot and status recording also fail', async () => {
  const { state, run, events } = platform();
  state.respond = ({ path }) => {
    if (state.deploys && path !== '/healthz')
      return new Response('private-household-name synthetic-render-secret\n::error::injected', {
        status: path === '/api/version' ? 502 : 403,
        statusText: 'private-status-text',
        headers: { 'set-cookie': 'private-cookie' },
      });
  };
  const report = await run();
  assert.equal(report.failure, 'http_request_failed');
  assert.equal(report.failurePhase, 'verify-application');
  assert.equal(report.failedRequest.path, '/api/version');
  assert.equal(report.failedRequest.status, 502);
  assert.equal(report.statusRecording, 'failed');
  assert.equal(report.requests.at(-1).phase, 'record-failure');
  assert.equal(report.requests.at(-1).status, 403);
  assert.ok(report.requests.some(({ phase, failure }) => phase === 'failure-snapshot' && failure));
  assert.deepEqual(events, report.requests);
  for (const request of events) {
    assert.ok(Number.isFinite(Date.parse(request.timestamp)));
    assert.ok(request.durationMs >= 0);
  }
  assert.doesNotMatch(
    JSON.stringify(report) + deploymentFailureLog(report) + JSON.stringify(events),
    /private-|synthetic-.*-secret|::error::injected/,
  );
});

test('network, timeout, response-body and JSON errors retain endpoint context without raw error text', async () => {
  const cases = [
    {
      respond: () => {
        throw new TypeError('private-network-message', { cause: { code: 'ECONNRESET' } });
      },
      failure: 'network_request_failed',
      errorCode: 'ECONNRESET',
      status: null,
    },
    {
      respond: () => {
        throw new DOMException('private-timeout-message', 'TimeoutError');
      },
      failure: 'network_request_failed',
      errorCode: 'timeout',
      status: null,
    },
    {
      respond: () => ({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error('private-read-message');
        },
      }),
      failure: 'response_read_failed',
      errorCode: 'unknown',
      status: 200,
    },
    {
      respond: () => new Response('<html>private-response-body</html>'),
      failure: 'invalid_json_response',
      errorCode: undefined,
      status: 200,
    },
  ];
  for (const { respond, failure, errorCode, status } of cases) {
    const { state, run } = platform();
    state.respond = ({ path }) =>
      state.deploys && path === '/api/version' ? respond() : undefined;
    const report = await run();
    assert.equal(report.failure, failure);
    assert.equal(report.failedRequest.path, '/api/version');
    assert.equal(report.failedRequest.errorCode, errorCode);
    assert.equal(report.failedRequest.status, status);
    assert.doesNotMatch(JSON.stringify(report) + deploymentFailureLog(report), /private-/);
  }
});

test('CLI retains diagnostics in job output, artifact files and summary, including setup failures and interruption', () => {
  for (const scenario of ['http-failure', 'setup-failure', 'interruption']) {
    const directory = mkdtempSync(join(tmpdir(), 'skyttel-deploy-diagnostics-'));
    try {
      mkdirSync(join(directory, 'release'));
      if (scenario !== 'setup-failure')
        writeFileSync(join(directory, 'release/release.json'), JSON.stringify(identity));
      const script = `
        import { main } from ${JSON.stringify(new URL('../deploy.mjs', import.meta.url).href)};
        let calls = 0;
        globalThis.fetch = async () => {
          if (${JSON.stringify(scenario)} === 'interruption') {
            if (++calls === 2) process.exit(23);
            return new Response(JSON.stringify({ object: { sha: ${JSON.stringify(commit)} } }));
          }
          return new Response('private-response-secret', { status: 503 });
        };
        await main();
      `;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: directory,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'push',
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'viscalyx/skyttel',
          GITHUB_SHA: commit,
          GH_TOKEN: 'private-github-secret',
          RENDER_API_KEY: 'private-render-secret',
          RENDER_SERVICE_ID: 'srv-synthetic',
          SKYTTEL_ORIGIN: 'https://skyttel.example.test',
          DEPLOYMENT_DIRECTORY: join(directory, 'evidence'),
          GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
        },
        encoding: 'utf8',
      });
      const log = readFileSync(join(directory, 'evidence/requests.ndjson'), 'utf8');
      assert.equal(result.status, scenario === 'interruption' ? 23 : 1);
      if (scenario === 'interruption') {
        assert.equal(JSON.parse(log).status, 200);
        assert.ok(result.stdout.includes(log.trim()));
        continue;
      }
      const report = JSON.parse(readFileSync(join(directory, 'evidence/deployment.json'), 'utf8'));
      const summary = readFileSync(join(directory, 'summary.md'), 'utf8');
      assert.ok(result.stderr.includes(report.failure));
      assert.ok(summary.includes(report.failure));
      if (scenario === 'setup-failure') {
        assert.equal(report.failurePhase, 'setup');
        assert.equal(report.errorCode, 'ENOENT');
      } else {
        const requests = log
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        assert.deepEqual(requests, report.requests);
        assert.equal(report.failedRequest.status, 503);
        assert.match(result.stdout, /503/);
        assert.match(summary, /503/);
      }
      assert.doesNotMatch(
        result.stdout + result.stderr + log + summary + JSON.stringify(report),
        /private-/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
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

test('an invalid GitHub deployment ID cannot enter a status request or public request log', async () => {
  const { state, run } = platform();
  state.respond = ({ path }) => {
    if (path === '/repos/viscalyx/skyttel/deployments')
      return new Response(JSON.stringify({ id: 'private-id\n::error::injected' }));
  };
  const report = await run();
  assert.equal(report.failure, 'deployment_record_failed');
  assert.ok(state.requests.every(({ url }) => !url.includes('/statuses')));
  assert.doesNotMatch(JSON.stringify(report) + deploymentFailureLog(report), /private-id|injected/);
});
