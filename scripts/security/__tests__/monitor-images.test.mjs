import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monitorImages } from '../monitor-images.mjs';

const at = '2026-09-24T10:00:00.000Z';
const digest = (character) => `sha256:${character.repeat(64)}`;
const image = (character) => `ghcr.io/viscalyx/skyttel@${digest(character)}`;
const deployment = (id, character) => ({
  id,
  sha: 'a'.repeat(40),
  payload: { image: image(character), version: `0.1.${id}` },
});
const finding = {
  vulnerability: { id: 'CVE-2026-12345', severity: 'High', fix: { state: 'not-fixed' } },
  artifact: { name: 'private-synthetic-package', version: '1.0.0', type: 'npm' },
};

function reviewedException(imageId = digest('e')) {
  return {
    vulnerability: finding.vulnerability.id,
    package: finding.artifact.name,
    version: '1.0.0',
    type: 'npm',
    imageId,
    owner: 'maintainer',
    reviewer: 'reviewer',
    rationale: 'Synthetic exception',
    actionPlan: 'Check the upstream fix weekly and release the patched package before expiry.',
    evidence: 'https://example.test/assessment',
    created: '2026-09-23T00:00:00Z',
    expires: '2026-09-25T00:00:00Z',
  };
}

function evidence(reference, matches = []) {
  return {
    report: {
      source: {
        type: 'image',
        target: { manifestDigest: reference.split('@')[1], imageID: digest('e') },
      },
      descriptor: {
        name: 'grype',
        version: '0.119.0',
        db: { status: { valid: true, schemaVersion: '6.1.3', built: '2026-09-24T06:00:00Z' } },
      },
      matches,
    },
    sbom: {
      spdxVersion: 'SPDX-2.3',
      creationInfo: { creators: ['Tool: syft-1.52.0'] },
      packages: [{ primaryPackagePurpose: 'CONTAINER', versionInfo: reference.split('@')[1] }],
    },
  };
}

function fixture() {
  const state = {
    running: image('b'),
    records: [deployment(4, 'd'), deployment(3, 'b'), deployment(2, 'b'), deployment(1, 'c')],
    states: {
      4: ['failure'],
      3: ['success'],
      2: ['inactive', 'success'],
      1: ['inactive', 'success'],
    },
    issues: [],
    comments: [],
    requests: [],
    scans: [],
    matches: [],
    exceptions: { version: 1, exceptions: [] },
  };
  async function send(address, options) {
    const url = new URL(address);
    const body = options.body && JSON.parse(options.body);
    state.requests.push({ address, method: options.method, body });
    if (state.fail?.(address, options)) return new Response('private server data', { status: 500 });
    let result;
    if (url.hostname === 'api.render.com') {
      assert.equal(options.method, 'GET', 'Monitoring cannot deploy or modify the service');
      result = url.pathname.endsWith('/deploys')
        ? [
            {
              deploy: {
                status: state.renderStatus ?? 'live',
                image: { ref: state.running, sha: state.running.split('@')[1] },
              },
            },
          ]
        : { imagePath: state.savedImage ?? state.running };
      if (url.pathname.endsWith('/deploys')) {
        assert.equal(url.searchParams.get('status'), 'live');
        assert.equal(url.searchParams.get('limit'), '2');
      }
    } else if (url.pathname.endsWith('/deployments')) result = state.records;
    else if (url.pathname.endsWith('/statuses')) {
      const id = url.pathname.split('/').at(-2);
      result = state.states[id].map((status) => ({ state: status }));
    } else if (url.pathname.includes('/assignees/')) return new Response(null, { status: 204 });
    else if (url.pathname.endsWith('/comments')) {
      state.comments.push(body);
      result = { id: state.comments.length };
    } else if (options.method === 'GET') result = structuredClone(state.issues);
    else if (options.method === 'POST') {
      result = {
        ...body,
        number: state.issues.length + 100,
        state: 'open',
        assignees: body.assignees.map((login) => ({ login })),
      };
      state.issues.push(result);
    } else if (options.method === 'PATCH') {
      result = Object.assign(state.issues[0], body, {
        assignees: body.assignees.map((login) => ({ login })),
      });
    }
    return Response.json(result);
  }
  const run = (options = {}) =>
    monitorImages({
      githubToken: 'fake-github',
      renderToken: 'fake-render',
      serviceId: 'srv-synthetic',
      recipient: 'synthetic-maintainer',
      runUrl: 'https://github.com/viscalyx/skyttel/actions/runs/123',
      exceptions: state.exceptions,
      fetch: send,
      now: () => at,
      scan: async (reference) => {
        state.scans.push(reference);
        return evidence(reference, state.matches);
      },
      ...options,
    });
  return { state, run };
}

test('scans live and last distinct accepted rollback digests, without rebuilding or deploying', async () => {
  const { state, run } = fixture();
  const result = await run();
  assert.equal(result.status, 'passed');
  assert.deepEqual(state.scans, [image('b'), image('c')]);
  assert.deepEqual(
    result.targets.map((target) => target.role),
    ['running', 'rollback'],
  );
  assert.equal(result.targets[0].deployment, 3);
  assert.equal(result.targets[0].scannedAt, at);
  assert.equal(result.targets[0].scanner, 'grype-0.119.0');
  assert.deepEqual(result.targets[0].database, {
    schemaVersion: '6.1.3',
    built: '2026-09-24T06:00:00.000Z',
  });
  assert.equal(state.issues.length, 0);
});

test('first accepted deployment has no rollback target; missing or drifted records give unknown', async () => {
  const { state, run } = fixture();
  state.records = [deployment(3, 'b')];
  assert.equal((await run()).targets.length, 1);
  state.records = [];
  assert.equal((await run()).status, 'unknown');
  state.records = [deployment(3, 'c')];
  assert.equal((await run()).status, 'unknown');
  assert.equal(state.issues.length, 1);
});

test('a failed newer attempt cannot hide the older live image; saved-setting drift still scans it', async () => {
  const { state, run } = fixture();
  // Record 4 is a failed newer attempt; Render's status filter returns the live 3.
  assert.equal((await run()).status, 'passed');
  assert.deepEqual(state.scans, [image('b'), image('c')]);
  state.scans.length = 0;
  state.savedImage = image('d');
  const result = await run();
  assert.deepEqual(state.scans, [image('b'), image('c')]);
  assert.equal(result.targets[0].image, image('b'));
  assert.equal(result.status, 'unknown');
});

test('new and repeated findings reconcile one issue; new findings notify and unknown never closes it', async () => {
  const { state, run } = fixture();
  state.matches = [finding];
  assert.equal((await run()).status, 'blocked');
  assert.equal(state.issues.length, 1);
  assert.equal((await run()).status, 'blocked');
  assert.equal(state.issues.length, 1);
  assert.equal(
    state.comments.length,
    0,
    'Identical findings do not send daily duplicate notifications',
  );
  state.matches.push({ ...finding, vulnerability: { id: 'CVE-2026-54321', severity: 'Critical' } });
  await run();
  assert.equal(state.comments.length, 1);
  const failed = await run({
    scan: async () => {
      throw new Error('private scanner failure');
    },
  });
  assert.equal(failed.status, 'unknown');
  assert.equal(state.issues[0].state, 'open');
  state.matches = [];
  assert.equal((await run()).status, 'passed');
  assert.equal(state.issues[0].state, 'closed');
  state.matches = [finding];
  await run();
  assert.equal(state.issues.length, 1);
  assert.equal(state.issues[0].state, 'open');
  const publicOutput = JSON.stringify([state.issues, state.comments, failed]);
  for (const secret of [
    'private-synthetic-package',
    'CVE-2026-12345',
    'private scanner failure',
    'fake-render',
  ]) {
    assert.equal(publicOutput.includes(secret), false);
  }
});

test('same reviewed exact-image policy accepts valid exceptions and blocks expiry or invalid scope', async () => {
  const { state, run } = fixture();
  state.matches = [finding];
  const exception = reviewedException();
  state.exceptions.exceptions = [exception];
  assert.equal((await run()).status, 'passed');
  delete exception.actionPlan;
  assert.equal((await run()).status, 'blocked');
  exception.actionPlan = '   ';
  assert.equal((await run()).status, 'blocked');
  exception.actionPlan = 'Release the patched package before expiry.';
  exception.expires = '2026-09-24T09:00:00Z';
  assert.equal((await run()).status, 'blocked');
  exception.expires = '2026-09-25T00:00:00Z';
  exception.imageId = digest('f');
  assert.equal((await run()).status, 'blocked');
  exception.imageId = digest('e');
  exception.package = '*';
  assert.equal((await run()).status, 'blocked');
});

test('malformed exception records block clean scans and open the status alert', async () => {
  for (const record of [{}, { imageId: digest('f') }, null]) {
    const { state, run } = fixture();
    state.exceptions.exceptions = [record];
    const result = await run();
    assert.equal(result.status, 'blocked');
    assert.equal(result.notification, 'accepted-by-github');
    assert.equal(state.issues[0].state, 'open');
    assert.equal(
      result.targets.every((target) => target.reason === 'invalid_exception'),
      true,
    );
  }
});

test('an exception for an image no longer retained blocks clean scans and opens the alert', async () => {
  const { state, run } = fixture();
  state.exceptions.exceptions = [reviewedException(digest('f'))];
  const result = await run();
  assert.equal(result.status, 'blocked');
  assert.equal(result.notification, 'accepted-by-github');
  assert.equal(state.issues[0].state, 'open');
});

test('each retained image needs its own matched exception, including the same finding on both', async () => {
  const { state, run } = fixture();
  let rollbackMatches = [finding];
  const scan = async (reference) => {
    const running = reference === image('b');
    const data = evidence(reference, running ? [finding] : rollbackMatches);
    data.report.source.target.imageID = running ? digest('e') : digest('f');
    return data;
  };
  state.exceptions.exceptions = [reviewedException()];
  const unexceptedRollback = await run({ scan });
  assert.equal(unexceptedRollback.status, 'blocked');
  assert.deepEqual(
    unexceptedRollback.targets.map((target) => target.policy),
    ['passed', 'blocked'],
  );
  state.exceptions.exceptions.push(reviewedException(digest('f')));
  assert.equal((await run({ scan })).status, 'passed');
  assert.equal(state.issues[0].state, 'closed');
  rollbackMatches = [];
  const unmatchedRollback = await run({ scan });
  assert.equal(unmatchedRollback.status, 'blocked');
  assert.equal(unmatchedRollback.targets[1].reason, 'unused_exception');
  assert.equal(state.issues[0].state, 'open');
});

test('missing, different-image, stale-database and malformed scan evidence all remain unknown', async () => {
  for (const mutate of [
    (data) => {
      data.report.source.target.manifestDigest = digest('f');
    },
    (data) => {
      data.report.descriptor.db.status.built = '2026-09-10T00:00:00Z';
    },
    (data) => {
      delete data.report.descriptor.version;
    },
    (data) => {
      delete data.report.descriptor.db.status.schemaVersion;
    },
    (data) => {
      delete data.sbom;
    },
    (data) => {
      delete data.report.matches;
    },
  ]) {
    const { state, run } = fixture();
    const result = await run({
      scan: async (reference) => {
        const data = evidence(reference);
        mutate(data);
        return data;
      },
    });
    assert.equal(result.status, 'unknown');
    assert.equal(state.issues[0].state, 'open');
  }
  assert.equal((await fixture().run({ exceptions: undefined })).status, 'unknown');
});

test('unavailable image and changed production state cannot report a clean running image', async () => {
  const { state, run } = fixture();
  const result = await run({
    scan: async (reference) => {
      state.running = image('f');
      return evidence(reference);
    },
  });
  assert.equal(result.status, 'unknown');
  state.renderStatus = 'update_failed';
  assert.equal((await run()).status, 'unknown');
});

test('alarm API failure or invalid recipient makes monitoring unknown, even after a clean scan', async () => {
  const { state, run } = fixture();
  state.fail = (url) => url.includes('/assignees/');
  assert.equal((await run()).status, 'unknown');
  state.fail = (_url, options) => options.method === 'POST';
  state.matches = [finding];
  const result = await run();
  assert.equal(result.notification, 'failed');
  assert.equal(result.status, 'unknown');
  assert.equal((await run({ recipient: '@not-valid' })).notification, 'failed');
});

test('explicit delivery check records API acceptance separately from human receipt', async () => {
  const { state, run } = fixture();
  assert.equal((await run({ verifyNotification: true })).notification, 'accepted-by-github');
  assert.equal(state.issues.length, 1);
  assert.equal(state.comments.length, 1);
  assert.match(state.comments[0].body, /Confirm receipt through the private operator record/u);
  assert.equal((await run()).notification, 'accepted-by-github');
  assert.equal(state.issues[0].state, 'closed');
});
