import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const requiredAssets = [
  'plan.json',
  'release.json',
  'gitversion.json',
  'manifest.json',
  'image-id.txt',
  'sbom.spdx.json',
  'grype.json',
  'zap.json',
  'zap.html',
  'operator-upgrade-notes.source.md',
  'operator-upgrade-notes.md',
  'provenance.sigstore.json',
  'sbom.sigstore.json',
];
const optionalAssets = [
  'tool-versions.txt',
  'provenance-verification.json',
  'sbom-verification.json',
];

function earlierVersion(left, right) {
  const before = left.match(/\d+/gu).map(BigInt);
  const after = right.match(/\d+/gu).map(BigInt);
  for (let index = 0; index < before.length; index += 1) {
    if (before[index] !== after[index]) return before[index] < after[index];
  }
  return false;
}

function requireBodyIdentity(body, release) {
  const matches = [...body.matchAll(/^<!-- skyttel-release-identity (.+) -->$/gmu)];
  let identity;
  try {
    if (matches.length === 1) identity = JSON.parse(matches[0][1]);
  } catch {
    identity = undefined;
  }
  if (!isDeepStrictEqual(identity, release)) {
    throw new Error('Conflict in release body identity; the exact verified release is required.');
  }
}

function github({ release, token, fetchImpl = fetch, apiUrl = 'https://api.github.com' }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(release.repository)) {
    throw new Error('Invalid release repository.');
  }
  if (typeof token !== 'string' || !token.trim()) throw new Error('A GitHub token is required.');
  if (
    !/^[a-f0-9]{40}$/u.test(release.commit) ||
    !/^sha256:[a-f0-9]{64}$/u.test(release.digest) ||
    !['preview', 'stable'].includes(release.channel) ||
    !/^\d+\.\d+\.\d+(?:-preview\.\d+)?$/u.test(release.version) ||
    release.tag !== `v${release.version}` ||
    release.version.includes('-preview.') !== (release.channel === 'preview')
  ) {
    throw new Error('Invalid release commit, digest, version or channel.');
  }
  const root = `${apiUrl.replace(/\/$/u, '')}/repos/${release.repository}`;
  const request = async (
    path,
    { method = 'GET', body, optional = false, binary = false, uploadUrl } = {},
  ) => {
    let url = `${root}${path}`;
    if (uploadUrl) {
      const target = new URL(uploadUrl);
      const apiOrigin = new URL(apiUrl).origin;
      if (
        target.origin !== apiOrigin &&
        !(apiOrigin === 'https://api.github.com' && target.origin === 'https://uploads.github.com')
      ) {
        throw new Error('Untrusted release asset upload URL.');
      }
      url = target.href;
    }
    const response = await fetchImpl(url, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': binary ? 'application/octet-stream' : 'application/json',
        'user-agent': 'skyttel-release',
        'x-github-api-version': '2022-11-28',
      },
      body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status === 404 && optional) return undefined;
    if (!response.ok)
      throw new Error(`GitHub request failed (${response.status}): ${method} ${path}`);
    return response.json();
  };
  const list = async (path) => {
    const result = [];
    for (let page = 1; ; page += 1) {
      const entries = await request(`${path}?per_page=100&page=${page}`);
      if (!Array.isArray(entries)) throw new Error('GitHub returned an invalid list.');
      result.push(...entries);
      if (entries.length < 100) return result;
    }
  };
  const tagCommit = async (tag) => {
    const reference = await request(`/git/ref/tags/${encodeURIComponent(tag)}`, { optional: true });
    if (!reference) return undefined;
    let object = reference.object;
    const seen = new Set();
    while (object?.type === 'tag') {
      if (!/^[a-f0-9]{40}$/u.test(object.sha) || seen.has(object.sha)) {
        throw new Error('Invalid annotated Git tag.');
      }
      seen.add(object.sha);
      object = (await request(`/git/tags/${object.sha}`)).object;
    }
    if (object?.type !== 'commit' || !/^[a-f0-9]{40}$/u.test(object.sha)) {
      throw new Error('Release tag must resolve to a full commit.');
    }
    return object.sha;
  };
  const downloadAsset = async (id) => {
    let url = `${root}/releases/assets/${id}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          accept: 'application/octet-stream',
          ...(new URL(url).origin === new URL(apiUrl).origin
            ? { authorization: `Bearer ${token}` }
            : {}),
          'user-agent': 'skyttel-release',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(60_000),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Asset download redirect has no location.');
        const redirect = new URL(location, url);
        if (redirect.protocol !== 'https:') throw new Error('Asset download requires HTTPS.');
        url = redirect.href;
        continue;
      }
      if (!response.ok) throw new Error(`GitHub asset download failed (${response.status}).`);
      return Buffer.from(await response.arrayBuffer());
    }
    throw new Error('Too many asset download redirects.');
  };
  return { request, list, tagCommit, downloadAsset };
}

export async function prepareReleaseNotes(options) {
  const { release, ancestors, operatorNotes, assets } = options;
  const api = github(options);
  let releases;
  try {
    releases = await api.list('/releases');
  } catch {
    releases = undefined;
  }
  const existing = releases?.find((entry) => entry.tag_name === release.tag);
  if (existing) {
    await preflightRelease({
      ...options,
      body: existing.body,
      assets: assets.some((asset) => asset.name === 'release-body.md')
        ? assets
        : [...assets, { name: 'release-body.md', content: Buffer.from(existing.body ?? '') }],
    });
    return existing.body;
  }
  let predecessor;
  let changelog;
  try {
    if (!releases) throw new Error('GitHub release history unavailable.');
    const candidates = releases.filter(
      (entry) =>
        !entry.draft &&
        entry.tag_name !== release.tag &&
        entry.prerelease === (release.channel === 'preview') &&
        entry.tag_name.includes('-preview.') === (release.channel === 'preview') &&
        /^v\d+\.\d+\.\d+(?:-preview\.\d+)?$/u.test(entry.tag_name) &&
        earlierVersion(entry.tag_name, release.tag),
    );
    let nearest = Infinity;
    for (const entry of candidates) {
      const commit = await api.tagCommit(entry.tag_name);
      const distance = ancestors.indexOf(commit);
      if (
        distance >= 0 &&
        (distance < nearest ||
          (distance === nearest && earlierVersion(predecessor, entry.tag_name)))
      ) {
        predecessor = entry.tag_name;
        nearest = distance;
      }
    }
    const generated = predecessor
      ? await api.request('/releases/generate-notes', {
          method: 'POST',
          body: {
            tag_name: release.tag,
            target_commitish: release.commit,
            previous_tag_name: predecessor,
          },
        })
      : {
          body: `This is the first published ${release.channel} release reachable from this revision. No cross-channel comparison was generated.`,
        };
    if (typeof generated.body !== 'string' || !generated.body.trim()) {
      throw new Error('GitHub returned empty release notes.');
    }
    changelog = generated.body;
  } catch {
    changelog = `Changelog generation unavailable for the ${release.channel} channel${predecessor ? ` since ${predecessor}` : ''}. No cross-channel comparison was generated. Review the source commits before upgrading.`;
  }
  const identity = JSON.stringify(release).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
  const body = [
    `<!-- skyttel-release-identity ${identity} -->`,
    '',
    `# Skyttel ${release.fullVersion}`,
    '',
    `Channel: ${release.channel}`,
    `Commit: \`${release.commit}\``,
    `Image: \`${release.image}@${release.digest}\``,
    `Image tags: ${release.imageTags.map((tag) => `\`${tag}\``).join(', ')}`,
    `Build origin: workflow \`${release.origin.workflow}\`, run \`${release.origin.runId}\`, ref \`${release.origin.ref}\`.`,
    '',
    '## Changelog',
    '',
    changelog,
    '',
    '## Operator upgrade notes',
    '',
    operatorNotes || 'No operator upgrade guidance applies to this revision.',
    '',
    '## Evidence',
    '',
    ...assets
      .map((asset) => (typeof asset === 'string' ? asset : asset.name))
      .map(
        (name) =>
          `- [${name}](https://github.com/${release.repository}/releases/download/${release.tag}/${name})`,
      ),
    '',
  ].join('\n');
  requireBodyIdentity(body, release);
  return body;
}

export async function preflightRelease(options) {
  const { release, body, assets } = options;
  const api = github(options);
  if (!body?.trim()) throw new Error('A prepared release body is required.');
  requireBodyIdentity(body, release);
  const names = new Set();
  for (const asset of assets) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(asset.name) || names.has(asset.name)) {
      throw new Error('Invalid or duplicate release asset name.');
    }
    names.add(asset.name);
  }
  const identity = assets.find((asset) => asset.name === 'release.json');
  if (!identity || !isDeepStrictEqual(JSON.parse(identity.content.toString()), release)) {
    throw new Error('Release evidence must contain the exact release.json identity.');
  }
  const commit = await api.tagCommit(release.tag);
  if (commit && commit !== release.commit) throw new Error('Conflict in release Git tag commit.');
  if (!commit && release.channel !== 'preview') {
    throw new Error('Stable release Git tag must already exist.');
  }
  const matches = (await api.list('/releases')).filter((entry) => entry.tag_name === release.tag);
  if (matches.length > 1) throw new Error('Multiple GitHub releases use the release tag.');
  const remote = matches[0];
  const present = [];
  if (remote) {
    if (
      remote.name !== release.fullVersion ||
      remote.prerelease !== (release.channel === 'preview') ||
      remote.body !== body
    ) {
      throw new Error('Conflict in GitHub release version, channel or body.');
    }
    for (const asset of await api.list(`/releases/${remote.id}/assets`)) {
      const local = assets.find((entry) => entry.name === asset.name);
      if (!local || present.includes(asset.name)) {
        throw new Error(`Conflict in unexpected or duplicate release asset: ${asset.name}`);
      }
      const content = await api.downloadAsset(asset.id);
      if (!content.equals(Buffer.from(local.content))) {
        throw new Error(`Conflict in release asset: ${asset.name}`);
      }
      present.push(asset.name);
    }
    if (remote.immutable && present.length < assets.length) {
      throw new Error('The immutable release has missing evidence; it cannot be repaired.');
    }
  }
  return { remote, commit, present };
}

export async function publishRelease(options) {
  const { release, body, assets } = options;
  const api = github(options);
  const checked = await preflightRelease(options);
  if (!checked.commit) {
    await api.request('/git/refs', {
      method: 'POST',
      body: { ref: `refs/tags/${release.tag}`, sha: release.commit },
    });
  }
  let remote = checked.remote;
  if (!remote) {
    remote = await api.request('/releases', {
      method: 'POST',
      body: {
        tag_name: release.tag,
        target_commitish: release.commit,
        name: release.fullVersion,
        body,
        draft: true,
        prerelease: release.channel === 'preview',
        make_latest: 'false',
      },
    });
  }
  for (const asset of assets) {
    if (checked.present.includes(asset.name)) continue;
    const uploaded = await api.request('', {
      method: 'POST',
      binary: true,
      uploadUrl: `${remote.upload_url.split('{')[0]}?name=${encodeURIComponent(asset.name)}`,
      body: asset.content,
    });
    const content = await api.downloadAsset(uploaded.id);
    if (!content.equals(Buffer.from(asset.content))) {
      throw new Error(`Uploaded release asset differs: ${asset.name}`);
    }
  }
  if (!remote.draft) return remote;
  return api.request(`/releases/${remote.id}`, {
    method: 'PATCH',
    body: { draft: false, make_latest: 'false' },
  });
}
export async function main(args = process.argv.slice(2), options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const env = options.env ?? process.env;
  const consoleObj = options.consoleObj ?? console;
  try {
    const [command, directory, ...extra] = args;
    if (!['prepare', 'preflight', 'publish'].includes(command) || !directory || extra.length) {
      throw new Error(
        'Usage: node scripts/release/github-release.mjs prepare|preflight|publish <evidence-directory>',
      );
    }
    const read = (name) => fsImpl.readFileSync(path.join(directory, name));
    const release = JSON.parse(read('release.json').toString());
    const bodyPath = path.join(directory, 'release-body.md');
    if (command === 'prepare' && fsImpl.existsSync(bodyPath)) {
      consoleObj.log('Preserving the prepared release body.');
      return 0;
    }
    const assets = [
      ...requiredAssets,
      ...optionalAssets.filter((name) => fsImpl.existsSync(path.join(directory, name))),
    ].map((name) => ({ name, content: read(name) }));
    const input = {
      release,
      assets,
      token: env.GH_TOKEN ?? env.GITHUB_TOKEN,
      apiUrl: env.GITHUB_API_URL ?? 'https://api.github.com',
      fetchImpl: options.fetchImpl ?? fetch,
    };
    if (command === 'prepare') {
      const ancestors = (options.execImpl ?? execFileSync)(
        'git',
        ['rev-list', '--topo-order', release.commit],
        {
          encoding: 'utf8',
        },
      )
        .trim()
        .split('\n');
      const body = await prepareReleaseNotes({
        ...input,
        ancestors,
        operatorNotes: read('operator-upgrade-notes.md').toString(),
      });
      fsImpl.writeFileSync(bodyPath, body, { flag: 'wx' });
      consoleObj.log(`Prepared ${release.tag} release notes.`);
    } else {
      const body = read('release-body.md').toString();
      input.assets.push({ name: 'release-body.md', content: Buffer.from(body) });
      const checked = { ...input, body };
      if (command === 'preflight') await preflightRelease(checked);
      else await publishRelease(checked);
      consoleObj.log(
        `${command === 'preflight' ? 'Verified' : 'Published'} ${release.tag} GitHub release.`,
      );
    }
    return 0;
  } catch (error) {
    consoleObj.error(`Release publication error: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
