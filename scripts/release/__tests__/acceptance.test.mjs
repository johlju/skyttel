import assert from 'node:assert/strict';
import { it } from 'node:test';

import {
  conflicts,
  validateChangelog,
  validateFailedJobs,
  validateIdentity,
  validateRetry,
} from '../acceptance.mjs';
import { createReleasePlan } from '../plan.mjs';

const repository = 'viscalyx/skyttel';
const commit = 'a'.repeat(40);
const plan = createReleasePlan({
  repository,
  commit,
  ref: 'refs/heads/main',
  eventName: 'push',
  gitVersion: { Sha: commit, SemVer: '1.0.0-preview.2', FullSemVer: '1.0.0-preview.2' },
});
const identity = {
  ...plan,
  digest: `sha256:${'b'.repeat(64)}`,
  origin: {
    runId: '123',
    ref: 'refs/heads/main',
    workflow: `${repository}/.github/workflows/release.yml`,
  },
};

it('binds evidence to its repository, version plan and signing workflow', () => {
  validateIdentity(identity, plan);
  for (const changed of [
    { repository: 'someone/skyttel' },
    { commit: 'c'.repeat(40) },
    { image: 'ghcr.io/someone/skyttel' },
    { sourceRef: 'refs/heads/unreviewed' },
    { origin: { ...identity.origin, workflow: 'someone/skyttel/.github/workflows/release.yml' } },
    { origin: { ...identity.origin, ref: 'refs/tags/v1.0.0' } },
    { origin: { ...identity.origin, runId: '../123' } },
  ]) {
    assert.throws(() => validateIdentity({ ...identity, ...changed }, plan));
  }
  assert.throws(() =>
    validateIdentity(identity, plan, {
      Sha: commit,
      SemVer: '1.0.0-preview.3',
      FullSemVer: '1.0.0-preview.3',
    }),
  );
});

const changelog = (text) => `## Changelog\n\n${text}\n\n## Operator upgrade notes\n\nGuidance.\n`;
const compare = (before, after) => `https://github.com/${repository}/compare/${before}...${after}`;

it('rejects cross-channel, wrong-target and absent comparisons', () => {
  assert.equal(
    validateChangelog(changelog(compare('v1.0.0-preview.1', identity.tag)), identity),
    'same-channel',
  );
  for (const text of [
    compare('v0.9.0', identity.tag),
    compare('v1.0.0-preview.1', 'v1.0.0-preview.3'),
    'No comparison or explicit explanation.',
  ]) {
    assert.throws(() => validateChangelog(changelog(text), identity));
  }
  const stable = { channel: 'stable', tag: 'v1.0.0' };
  assert.equal(validateChangelog(changelog(compare('v0.9.0', stable.tag)), stable), 'same-channel');
  assert.throws(() =>
    validateChangelog(changelog(compare('v1.0.0-preview.1', stable.tag)), stable),
  );
});

it('distinguishes first releases and generation failures from comparisons', () => {
  for (const [text, expected] of [
    ['This is the first published preview release reachable from this revision.', 'first-release'],
    ['Changelog generation unavailable for the preview channel.', 'generation-unavailable'],
  ]) {
    assert.equal(
      validateChangelog(changelog(`${text} No cross-channel comparison was generated.`), identity),
      expected,
    );
    assert.throws(() => validateChangelog(changelog(text), identity));
    assert.throws(() =>
      validateChangelog(
        changelog(
          `${text} No cross-channel comparison was generated. ${compare('v0.9.0', identity.tag)}`,
        ),
        identity,
      ),
    );
  }
});

it('probes preflight conflicts with GET requests and rejects transport errors', async () => {
  const body = `<!-- skyttel-release-identity ${JSON.stringify(identity)} -->\n\nRelease.\n`;
  const assets = [
    { name: 'release.json', content: Buffer.from(JSON.stringify(identity)) },
    { name: 'manifest.json', content: Buffer.from('{}') },
    { name: 'release-body.md', content: Buffer.from(body) },
  ];
  const remote = {
    id: 20,
    name: identity.fullVersion,
    tag_name: identity.tag,
    prerelease: true,
    draft: false,
    body,
  };
  const calls = [];
  const root = `https://api.github.com/repos/${repository}`;
  const options = {
    release: identity,
    body,
    assets,
    token: 'synthetic-test-token',
    fetchImpl: async (url, request) => {
      calls.push(request.method);
      assert.equal(request.method, 'GET');
      const route = url.slice(root.length);
      let value;
      if (route === `/git/ref/tags/${identity.tag}`) {
        value = { object: { type: 'commit', sha: commit } };
      } else if (route === '/releases?per_page=100&page=1') {
        value = [remote];
      } else if (route === '/releases/20/assets?per_page=100&page=1') {
        value = assets.map((asset, index) => ({ name: asset.name, id: index + 1 }));
      } else {
        const match = route.match(/^\/releases\/assets\/([1-3])$/u);
        assert.ok(match, `Unexpected request ${url}`);
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => assets[Number(match[1]) - 1].content,
        };
      }
      return { ok: true, status: 200, json: async () => value };
    },
  };
  const tags = Object.fromEntries(identity.imageTags.map((tag) => [tag, identity.digest]));
  assert.deepEqual(await conflicts(options, tags, async () => tags), [
    'source',
    'version',
    'origin',
    'asset-bytes',
    'registry-digest',
  ]);
  assert.ok(calls.length > 4);
  await assert.rejects(
    conflicts(
      { ...options, fetchImpl: async () => ({ ok: false, status: 403 }) },
      tags,
      async () => tags,
    ),
  );
  await assert.rejects(
    conflicts(options, tags, async () => ({ ...tags, [identity.version]: 'changed' })),
  );
});

const before = {
  schema: 1,
  repository,
  runId: '123',
  attempt: 1,
  identity,
  artifacts: [{ name: 'release-evidence', id: 10, digest: 'original' }],
  tags: { '1.0.0-preview.2': identity.digest },
  releaseId: 20,
  body: 'Original release text',
  assets: [{ name: 'release.json', id: 30, sha256: 'original' }],
};
const after = {
  ...before,
  attempt: 2,
  assets: [...before.assets, { name: 'manifest.json', id: 31, sha256: 'new' }],
};

it('requires a later retry to preserve evidence and add missing assets', () => {
  validateRetry(before, after);
  for (const changed of [
    { runId: '456' },
    { attempt: 1 },
    { identity: { ...identity, digest: `sha256:${'c'.repeat(64)}` } },
    { artifacts: [{ ...before.artifacts[0], id: 11 }] },
    { tags: { '1.0.0-preview.2': `sha256:${'c'.repeat(64)}` } },
    { releaseId: 21 },
    { body: 'New release text' },
    { assets: before.assets },
    { assets: [{ ...before.assets[0], id: 32 }, after.assets[1]] },
    { assets: [{ ...before.assets[0], sha256: 'changed' }, after.assets[1]] },
    { assets: [after.assets[1]] },
  ]) {
    assert.throws(() => validateRetry(before, { ...after, ...changed }));
  }
  assert.throws(() => validateRetry({ ...before, assets: [] }, after));
});

it('requires a failed mandatory gate and a skipped publisher', () => {
  for (const name of ['checks / application', 'checks / security-gate', 'candidate']) {
    validateFailedJobs([
      { name, conclusion: 'failure' },
      { name: 'publish', conclusion: 'skipped' },
    ]);
  }
  for (const attemptJobs of [
    [{ name: 'publish', conclusion: 'failure' }],
    [{ name: 'checks / application', conclusion: 'failure' }],
    [
      { name: 'checks / application', conclusion: 'failure' },
      { name: 'publish', conclusion: 'success' },
    ],
    [
      { name: 'checks / application', conclusion: 'cancelled' },
      { name: 'publish', conclusion: 'skipped' },
    ],
  ]) {
    assert.throws(() => validateFailedJobs(attemptJobs));
  }
});
