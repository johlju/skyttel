import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { preflightRelease, prepareReleaseNotes, publishRelease } from '../github-release.mjs';

const repository = 'viscalyx/skyttel';
const base = `https://api.github.com/repos/${repository}`;
const release = {
  repository,
  commit: 'a'.repeat(40),
  channel: 'preview',
  version: '1.1.0-preview.3',
  fullVersion: '1.1.0-preview.3+7',
  tag: 'v1.1.0-preview.3',
  image: 'ghcr.io/viscalyx/skyttel',
  imageTags: ['1.1.0-preview.3', 'sha-aaaaaaa'],
  digest: `sha256:${'d'.repeat(64)}`,
  origin: { runId: '123', workflow: '.github/workflows/release.yml', ref: 'refs/heads/main' },
};
const ok = (value) => ({ ok: true, status: 200, json: async () => value });
const bytes = (value) => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from(value) });
const releaseBody = (identity = release, text = 'Reviewed release body') =>
  `<!-- skyttel-release-identity ${JSON.stringify(identity)} -->\n\n${text}\n`;

function fixture(routes) {
  const calls = [];
  return {
    calls,
    token: 'synthetic-test-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const route = routes[`${options.method} ${url}`] ?? routes[url];
      assert.ok(route, `Unexpected GitHub request: ${options.method} ${url}`);
      return typeof route === 'function' ? route(options) : route;
    },
  };
}

describe('release notes through the GitHub API', () => {
  it('rejects unidentified or conflicting empty drafts before adopting their body or publishing', async () => {
    for (const body of [
      'A draft without a release identity.',
      releaseBody({ ...release, commit: 'b'.repeat(40) }),
      releaseBody({ ...release, digest: `sha256:${'e'.repeat(64)}` }),
      releaseBody({ ...release, origin: { ...release.origin, runId: '456' } }),
      `${releaseBody()}${releaseBody()}`,
    ]) {
      const api = fixture({
        [`${base}/releases?per_page=100&page=1`]: ok([
          {
            id: 7,
            tag_name: release.tag,
            name: release.fullVersion,
            prerelease: true,
            draft: true,
            body,
          },
        ]),
        [`${base}/git/ref/tags/${release.tag}`]: ok({
          object: { type: 'commit', sha: release.commit },
        }),
        [`${base}/releases/7/assets?per_page=100&page=1`]: ok([]),
      });
      const options = {
        ...api,
        release,
        assets: [{ name: 'release.json', content: Buffer.from(JSON.stringify(release)) }],
        ancestors: [release.commit],
        operatorNotes: '',
      };
      await assert.rejects(prepareReleaseNotes(options), /release body identity/u);
      await assert.rejects(publishRelease({ ...options, body }), /release body identity/u);
      assert.ok(api.calls.every((call) => call.options.method === 'GET'));
    }
  });

  it('keeps the reviewed body and completes a compatible draft before its first asset upload', async () => {
    const body = releaseBody(release, 'Reviewed body: original unavailable changelog explanation.');
    const assets = [{ name: 'release.json', content: Buffer.from(JSON.stringify(release)) }];
    const api = fixture({
      [`${base}/releases?per_page=100&page=1`]: ok([
        {
          id: 7,
          tag_name: release.tag,
          name: release.fullVersion,
          prerelease: true,
          draft: true,
          body,
          upload_url: `${base}/releases/7/assets{?name,label}`,
        },
      ]),
      [`${base}/git/ref/tags/${release.tag}`]: ok({
        object: { type: 'commit', sha: release.commit },
      }),
      [`${base}/releases/7/assets?per_page=100&page=1`]: ok([]),
      [`POST ${base}/releases/7/assets?name=release.json`]: (options) => {
        assert.deepEqual(options.body, assets[0].content);
        return ok({ id: 77, name: 'release.json' });
      },
      [`${base}/releases/assets/77`]: bytes(assets[0].content),
      [`PATCH ${base}/releases/7`]: ok({ id: 7, draft: false }),
    });
    assert.equal(
      await prepareReleaseNotes({
        ...api,
        release,
        assets,
        ancestors: [release.commit],
        operatorNotes: 'Back up the database.',
      }),
      body,
    );
    assert.equal((await publishRelease({ ...api, release, assets, body })).draft, false);
  });

  it('makes unavailable generation explicit without falling back to GitHub default comparison', async () => {
    const api = fixture({
      [`${base}/releases?per_page=100&page=1`]: ok([
        { tag_name: 'v1.0.0', prerelease: false, draft: false },
      ]),
      [`${base}/git/ref/tags/v1.0.0`]: ok({ object: { type: 'commit', sha: 'b'.repeat(40) } }),
      [`POST ${base}/releases/generate-notes`]: { ok: false, status: 503 },
    });
    const body = await prepareReleaseNotes({
      ...api,
      release: { ...release, channel: 'stable', tag: 'v1.1.0', version: '1.1.0' },
      ancestors: [release.commit, 'b'.repeat(40)],
      operatorNotes: 'Keep the rollback image.',
      assets: [],
    });
    assert.match(body, /Changelog generation unavailable/u);
    assert.match(body, /v1\.0\.0/u);
    assert.match(body, /No cross-channel comparison/u);
    assert.match(body, /Keep the rollback image/u);
  });

  it('reports the first release in a channel without letting GitHub choose another channel', async () => {
    const api = fixture({
      [`${base}/releases?per_page=100&page=1`]: ok([
        { tag_name: 'v1.0.0-preview.1', prerelease: true, draft: false },
        { tag_name: 'v1.0.0-preview.2', prerelease: false, draft: false },
      ]),
    });
    const body = await prepareReleaseNotes({
      ...api,
      release: { ...release, channel: 'stable', tag: 'v1.1.0', version: '1.1.0' },
      ancestors: [release.commit],
      operatorNotes: '',
      assets: [],
    });
    assert.match(body, /first published stable release/u);
    assert.match(body, /No cross-channel comparison/u);
  });

  it('compares with the nearest published predecessor in the same channel', async () => {
    const api = fixture({
      [`${base}/releases?per_page=100&page=1`]: ok([
        { tag_name: 'v1.1.0', prerelease: false, draft: false },
        { tag_name: 'v1.1.0-preview.4', prerelease: true, draft: false },
        { tag_name: 'v1.1.0-preview.2', prerelease: true, draft: false },
        { tag_name: 'v1.1.0-preview.1', prerelease: true, draft: false },
      ]),
      [`${base}/git/ref/tags/v1.1.0-preview.4`]: ok({
        object: { type: 'commit', sha: 'b'.repeat(40) },
      }),
      [`${base}/git/ref/tags/v1.1.0-preview.2`]: ok({
        object: { type: 'commit', sha: 'b'.repeat(40) },
      }),
      [`${base}/git/ref/tags/v1.1.0-preview.1`]: ok({
        object: { type: 'commit', sha: 'c'.repeat(40) },
      }),
      [`POST ${base}/releases/generate-notes`]: (options) => {
        assert.equal(JSON.parse(options.body).previous_tag_name, 'v1.1.0-preview.2');
        assert.equal(JSON.parse(options.body).target_commitish, release.commit);
        return ok({ body: '## Features\n\n* Household map by @maintainer in #38' });
      },
    });
    const body = await prepareReleaseNotes({
      ...api,
      release,
      ancestors: [release.commit, 'b'.repeat(40), 'c'.repeat(40)],
      operatorNotes: 'Back up the database.',
      assets: ['release.json', 'sbom.spdx.json'],
    });
    assert.match(body, /1\.1\.0-preview\.3\+7/u);
    const marker = body.match(/^<!-- skyttel-release-identity (.+) -->$/mu);
    assert.deepEqual(JSON.parse(marker[1]), release);
    assert.ok(body.includes(`${release.image}@${release.digest}`));
    assert.match(body, /Household map/u);
    assert.match(body, /Back up the database/u);
    assert.match(body, /releases\/download\/v1\.1\.0-preview\.3\/sbom\.spdx\.json/u);
  });
});

describe('release publication through the GitHub API', () => {
  it('resumes a stable draft by adding only missing assets and strips credentials from download redirects', async () => {
    const stable = {
      ...release,
      channel: 'stable',
      version: '1.1.0',
      fullVersion: '1.1.0',
      tag: 'v1.1.0',
      imageTags: ['1.1.0'],
      origin: { ...release.origin, ref: 'refs/tags/v1.1.0' },
    };
    const assets = [
      { name: 'release.json', content: Buffer.from(JSON.stringify(stable)) },
      { name: 'sbom.spdx.json', content: Buffer.from('{"spdxVersion":"SPDX-2.3"}') },
    ];
    const remote = {
      id: 7,
      tag_name: stable.tag,
      name: stable.fullVersion,
      prerelease: false,
      draft: true,
      body: releaseBody(stable, 'Reviewed stable release'),
      upload_url: `${base}/releases/7/assets{?name,label}`,
    };
    let sbomPresent = false;
    const api = fixture({
      [`${base}/git/ref/tags/v1.1.0`]: ok({ object: { type: 'commit', sha: stable.commit } }),
      [`${base}/releases?per_page=100&page=1`]: () => ok([remote]),
      [`${base}/releases/7/assets?per_page=100&page=1`]: () =>
        ok([
          { id: 77, name: 'release.json' },
          ...(sbomPresent ? [{ id: 78, name: 'sbom.spdx.json' }] : []),
        ]),
      [`${base}/releases/assets/77`]: {
        status: 302,
        headers: { get: () => 'https://release-assets.example.test/release.json' },
      },
      'https://release-assets.example.test/release.json': (options) => {
        assert.equal(options.headers.authorization, undefined);
        return bytes(assets[0].content);
      },
      [`POST ${base}/releases/7/assets?name=sbom.spdx.json`]: (options) => {
        assert.deepEqual(options.body, assets[1].content);
        sbomPresent = true;
        return ok({ id: 78 });
      },
      [`${base}/releases/assets/78`]: bytes(assets[1].content),
      [`PATCH ${base}/releases/7`]: () => {
        assert.ok(sbomPresent);
        remote.draft = false;
        return ok(remote);
      },
    });
    const options = { ...api, release: stable, assets, body: remote.body };
    assert.equal((await publishRelease(options)).draft, false);
    const mutations = () => api.calls.filter((call) => call.options.method !== 'GET').length;
    assert.equal(mutations(), 2);
    assert.equal((await publishRelease(options)).draft, false);
    assert.equal(mutations(), 2);
  });

  it('leaves a draft unpublished when an evidence upload fails', async () => {
    const assets = [{ name: 'release.json', content: Buffer.from(JSON.stringify(release)) }];
    const api = fixture({
      [`${base}/git/ref/tags/${release.tag}`]: ok({
        object: { type: 'commit', sha: release.commit },
      }),
      [`${base}/releases?per_page=100&page=1`]: ok([]),
      [`POST ${base}/releases`]: (options) => {
        assert.equal(JSON.parse(options.body).draft, true);
        return ok({ id: 7, draft: true, upload_url: `${base}/releases/7/assets{?name,label}` });
      },
      [`POST ${base}/releases/7/assets?name=release.json`]: { ok: false, status: 503 },
    });
    await assert.rejects(publishRelease({ ...api, release, assets, body: releaseBody() }), /503/u);
    assert.equal(
      api.calls.some((call) => call.options.method === 'PATCH'),
      false,
    );
  });

  it('preserves compatible published evidence and refuses to repair an immutable incomplete release', async () => {
    const assets = [
      { name: 'release.json', content: Buffer.from(JSON.stringify(release)) },
      { name: 'sbom.spdx.json', content: Buffer.from('{"spdxVersion":"SPDX-2.3"}') },
    ];
    const existing = {
      id: 7,
      tag_name: release.tag,
      name: release.fullVersion,
      prerelease: true,
      draft: false,
      immutable: true,
      body: releaseBody(),
    };
    const api = fixture({
      [`${base}/git/ref/tags/${release.tag}`]: ok({
        object: { type: 'tag', sha: 'f'.repeat(40) },
      }),
      [`${base}/git/tags/${'f'.repeat(40)}`]: ok({
        object: { type: 'commit', sha: release.commit },
      }),
      [`${base}/releases?per_page=100&page=1`]: ok([existing]),
      [`${base}/releases/7/assets?per_page=100&page=1`]: ok([{ id: 77, name: 'release.json' }]),
      [`${base}/releases/assets/77`]: bytes(assets[0].content),
    });
    const options = { ...api, release, body: existing.body, assets };
    await assert.rejects(publishRelease(options), /immutable.*missing/u);
    assert.ok(api.calls.every((call) => call.options.method === 'GET'));
    assert.equal((await publishRelease({ ...options, assets: assets.slice(0, 1) })).id, 7);
  });

  it('rejects conflicting published evidence before changing tags, releases or assets', async () => {
    for (const change of [
      { commit: 'b'.repeat(40) },
      { digest: `sha256:${'e'.repeat(64)}` },
      { version: '1.1.0-preview.4' },
      { origin: { ...release.origin, runId: '456' } },
    ]) {
      const api = fixture({
        [`${base}/git/ref/tags/${release.tag}`]: ok({
          object: { type: 'commit', sha: release.commit },
        }),
        [`${base}/releases?per_page=100&page=1`]: ok([
          {
            id: 7,
            tag_name: release.tag,
            name: release.fullVersion,
            prerelease: true,
            draft: false,
            body: releaseBody(),
          },
        ]),
        [`${base}/releases/7/assets?per_page=100&page=1`]: ok([{ id: 77, name: 'release.json' }]),
        [`${base}/releases/assets/77`]: bytes(JSON.stringify({ ...release, ...change })),
      });
      await assert.rejects(
        preflightRelease({
          ...api,
          release,
          body: releaseBody(),
          assets: [{ name: 'release.json', content: Buffer.from(JSON.stringify(release)) }],
        }),
        /Conflict.*release\.json/u,
      );
      assert.ok(api.calls.every((call) => call.options.method === 'GET'));
    }
  });

  it('creates a preview tag at the verified commit and publishes only after evidence is uploaded', async () => {
    const uploads = [];
    const assets = [{ name: 'release.json', content: Buffer.from(JSON.stringify(release)) }];
    const api = fixture({
      [`${base}/git/ref/tags/${release.tag}`]: { ok: false, status: 404 },
      [`${base}/releases?per_page=100&page=1`]: ok([]),
      [`POST ${base}/git/refs`]: (options) => {
        assert.deepEqual(JSON.parse(options.body), {
          ref: 'refs/tags/v1.1.0-preview.3',
          sha: 'a'.repeat(40),
        });
        return ok({});
      },
      [`POST ${base}/releases`]: (options) => {
        const request = JSON.parse(options.body);
        assert.equal(request.draft, true);
        assert.equal(request.prerelease, true);
        assert.equal(request.make_latest, 'false');
        return ok({ id: 7, draft: true, upload_url: `${base}/releases/7/assets{?name,label}` });
      },
      [`POST ${base}/releases/7/assets?name=release.json`]: (options) => {
        uploads.push(options.body);
        return ok({ id: 77, name: 'release.json' });
      },
      [`${base}/releases/assets/77`]: bytes(assets[0].content),
      [`PATCH ${base}/releases/7`]: (options) => {
        assert.equal(uploads.length, 1);
        assert.deepEqual(JSON.parse(options.body), { draft: false, make_latest: 'false' });
        return ok({ id: 7, draft: false });
      },
    });
    const result = await publishRelease({ ...api, release, assets, body: releaseBody() });
    assert.equal(result.draft, false);
    assert.deepEqual(uploads, [assets[0].content]);
  });
});
