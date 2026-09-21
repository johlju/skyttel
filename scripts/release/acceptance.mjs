import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { checkRegistryTags, registryTags, verify } from './candidate.mjs';
import { preflightRelease, requiredAssets } from './github-release.mjs';
import { parseOperatorUpgradeNotes } from './operator-upgrade-notes.mjs';
import { validateReleasePlan } from './plan.mjs';

const repository = 'viscalyx/skyttel';
const releaseWorkflow = '.github/workflows/release.yml';
const acceptanceWorkflow = '.github/workflows/release-acceptance.yml';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (directory, name) => fs.readFileSync(path.join(directory, name));
const json = (directory, name) => JSON.parse(read(directory, name));
const write = (directory, name, value) =>
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);

function gh(...args) {
  return execFileSync('gh', args, { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 });
}

function api(route) {
  return JSON.parse(gh('api', `repos/${repository}/${route}`));
}

function list(route, key) {
  const pages = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repository}/${route}`));
  return pages.flatMap((page) => (key ? page[key] : page));
}

function run(id, workflow = releaseWorkflow) {
  assert.match(id ?? '', /^[1-9]\d*$/u, 'A numeric workflow run ID is required');
  const value = api(`actions/runs/${id}`);
  assert.equal(value.repository.full_name, repository);
  assert.equal(value.path, workflow, 'Unexpected workflow');
  assert.equal(value.event, workflow === releaseWorkflow ? 'push' : 'workflow_dispatch');
  assert.equal(value.status, 'completed', 'Wait for the workflow run to finish');
  return value;
}

function artifacts(id) {
  return list(`actions/runs/${id}/artifacts?per_page=100`, 'artifacts');
}

function jobs(id, attempt) {
  return list(`actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`, 'jobs');
}

function download(id, name, directory) {
  fs.mkdirSync(directory, { recursive: true });
  gh('run', 'download', String(id), '--repo', repository, '--name', name, '--dir', directory);
}

function releaseOptions(directory) {
  const names = fs.readdirSync(directory).filter((name) => name !== 'snapshot.json');
  for (const name of [...requiredAssets, 'release-body.md']) {
    assert.ok(names.includes(name), `Missing evidence: ${name}`);
  }
  return {
    release: json(directory, 'release.json'),
    body: read(directory, 'release-body.md').toString(),
    assets: names.map((name) => ({ name, content: read(directory, name) })),
    token: process.env.GH_TOKEN,
    // Enforce read-only use even if the shared preflight changes later.
    fetchImpl: (url, options) => {
      assert.equal(options.method, 'GET', 'Acceptance must not write to GitHub');
      return fetch(url, options);
    },
  };
}

export function validateIdentity(release, plan, gitVersion) {
  assert.equal(release.repository, repository);
  validateReleasePlan(plan, {
    repository,
    commit: release.commit,
    ref: release.sourceRef,
    eventName: 'push',
    gitVersion,
  });
  for (const [key, value] of Object.entries(plan)) assert.deepEqual(release[key], value);
  assert.equal(release.origin.workflow, `${repository}/${releaseWorkflow}`);
  assert.equal(release.origin.ref, release.sourceRef);
  assert.match(release.origin.runId, /^[1-9]\d*$/u);
  assert.match(release.digest, /^sha256:[a-f0-9]{64}$/u);
}

export function validateChangelog(body, release) {
  const section = body.split('## Changelog\n')[1]?.split('\n## Operator upgrade notes')[0];
  assert.ok(section?.trim(), 'Missing changelog');
  const first = `This is the first published ${release.channel} release reachable from this revision.`;
  const unavailable = `Changelog generation unavailable for the ${release.channel} channel`;
  const comparisons = [...section.matchAll(/\/compare\/(\S+)\.\.\.(v[^\s)]+)/gu)];
  if (section.includes(first) || section.includes(unavailable)) {
    assert.ok(section.includes('No cross-channel comparison was generated.'));
    assert.equal(comparisons.length, 0, 'Fallback notice includes a comparison');
    return section.includes(first) ? 'first-release' : 'generation-unavailable';
  }
  assert.ok(comparisons.length > 0, 'No explicit changelog comparison');
  for (const [, previous, current] of comparisons) {
    assert.equal(current, release.tag, 'Changelog compares a different release');
    assert.match(previous, /^v\d+\.\d+\.\d+(?:-preview\.\d+)?$/u);
    assert.equal(previous.includes('-preview.'), release.channel === 'preview');
  }
  return 'same-channel';
}

function identityOptions(options, release) {
  const body = options.body.replace(
    /^<!-- skyttel-release-identity .+ -->/mu,
    `<!-- skyttel-release-identity ${JSON.stringify(release)} -->`,
  );
  return {
    ...options,
    release,
    body,
    assets: options.assets.map((asset) => {
      if (asset.name === 'release.json') {
        return { ...asset, content: Buffer.from(JSON.stringify(release)) };
      }
      if (asset.name === 'release-body.md') return { ...asset, content: Buffer.from(body) };
      return asset;
    }),
  };
}

export async function conflicts(options, tags, inspectTags = registryTags) {
  const release = options.release;
  const otherCommit = `${release.commit[0] === 'a' ? 'b' : 'a'}${release.commit.slice(1)}`;
  await assert.rejects(
    preflightRelease(identityOptions(options, { ...release, commit: otherCommit })),
    /Conflict in release Git tag commit/u,
  );
  await assert.rejects(
    preflightRelease(
      identityOptions(options, {
        ...release,
        fullVersion: `${release.version}+acceptance-conflict.${release.fullVersion.length}`,
      }),
    ),
    /Conflict in GitHub release version, channel or body/u,
  );
  await assert.rejects(
    preflightRelease(
      identityOptions(options, {
        ...release,
        origin: { ...release.origin, runId: String(BigInt(release.origin.runId) + 1n) },
      }),
    ),
    /Conflict in GitHub release version, channel or body/u,
  );
  await assert.rejects(
    preflightRelease({
      ...options,
      assets: options.assets.map((asset) =>
        asset.name === 'manifest.json'
          ? { ...asset, content: Buffer.concat([asset.content, Buffer.from('\n')]) }
          : asset,
      ),
    }),
    /Conflict in release asset: manifest.json/u,
  );
  const otherDigest = `sha256:${release.digest[7] === 'a' ? 'b' : 'a'}${release.digest.slice(8)}`;
  assert.throws(
    () => checkRegistryTags({ ...release, digest: otherDigest }, tags),
    /Conflict in registry tag/u,
  );
  // Recheck the real resources after all probes. No published object is modified.
  await preflightRelease(options);
  assert.deepEqual(await inspectTags(release), tags);
  return ['source', 'version', 'origin', 'asset-bytes', 'registry-digest'];
}

async function inspectRelease(directory, requirePublic = true) {
  const options = releaseOptions(directory);
  const release = options.release;
  validateIdentity(release, json(directory, 'plan.json'), json(directory, 'gitversion.json'));
  const sourceRun = run(release.origin.runId);
  assert.equal(sourceRun.head_sha, release.commit);
  if (requirePublic) assert.equal(sourceRun.conclusion, 'success');
  await verify(directory);
  const checked = await preflightRelease(options);
  assert.ok(checked.remote, 'Expected an existing GitHub release');
  assert.equal(checked.commit, release.commit);
  if (requirePublic) {
    assert.equal(checked.remote.draft, false);
    assert.deepEqual([...checked.present].sort(), options.assets.map((asset) => asset.name).sort());
  }
  const tags = await registryTags(release);
  assert.deepEqual(checkRegistryTags(release, tags), [], 'Missing published image tags');
  const sourceNotes = execFileSync(
    'git',
    ['show', `${release.commit}:docs/operations/operator-upgrade-notes.md`],
    { encoding: 'utf8' },
  );
  assert.equal(read(directory, 'operator-upgrade-notes.source.md').toString(), sourceNotes);
  const notes = parseOperatorUpgradeNotes(sourceNotes).unreleased;
  assert.equal(
    read(directory, 'operator-upgrade-notes.md').toString(),
    `${notes || 'No operator upgrade actions apply to this release.'}\n`,
  );
  if (release.channel === 'stable') {
    execFileSync('git', ['merge-base', '--is-ancestor', release.commit, 'origin/main']);
  } else {
    const related = list(
      `actions/workflows/release.yml/runs?head_sha=${release.commit}&per_page=100`,
      'workflow_runs',
    );
    assert.equal(
      related.some((entry) => entry.event === 'push' && entry.head_branch === release.tag),
      false,
      'Preview tag starts a duplicate release run',
    );
  }
  return { options, checked, tags, sourceRun };
}

async function published(tag, directory) {
  assert.match(tag ?? '', /^v\d+\.\d+\.\d+(?:-preview\.\d+)?$/u, 'A release tag is required');
  fs.mkdirSync(directory, { recursive: true });
  gh('release', 'download', tag, '--repo', repository, '--dir', directory);
  const result = await inspectRelease(directory);
  assert.equal(result.options.release.tag, tag);
  return result;
}

function assetSnapshot(remote) {
  return list(`releases/${remote.id}/assets?per_page=100`).map((asset) => ({
    id: asset.id,
    name: asset.name,
    sha256: hash(
      gh(
        'api',
        `repos/${repository}/releases/assets/${asset.id}`,
        '-H',
        'Accept: application/octet-stream',
      ),
    ),
  }));
}

function retainedArtifacts(id) {
  const all = artifacts(id);
  return ['release-plan', 'release-candidate', 'release-evidence'].map((name) => {
    const matches = all.filter((artifact) => artifact.name === name);
    assert.equal(matches.length, 1, `Expected one ${name} artifact`);
    assert.equal(matches[0].expired, false, 'Retry evidence is expired');
    const { id: artifactId, digest, created_at: createdAt } = matches[0];
    assert.match(digest ?? '', /^sha256:[a-f0-9]{64}$/u, 'Missing artifact digest');
    return { name, id: artifactId, digest, createdAt };
  });
}

export function validateRetry(before, after) {
  assert.equal(before.schema, 1);
  assert.equal(before.repository, repository);
  assert.equal(before.runId, after.runId, 'Retry must use the original workflow run');
  assert.ok(after.attempt > before.attempt, 'No later attempt exists');
  assert.deepEqual(after.identity, before.identity, 'Retry changes release identity');
  assert.deepEqual(after.artifacts, before.artifacts, 'Retry replaces retained artifacts');
  assert.deepEqual(after.tags, before.tags, 'Retry changes image tags');
  assert.equal(after.releaseId, before.releaseId, 'Retry replaces the draft release');
  assert.equal(after.body, before.body, 'Retry changes release text');
  assert.ok(before.assets.length > 0, 'Baseline has no partial publication');
  for (const asset of before.assets) {
    assert.deepEqual(
      after.assets.find((entry) => entry.name === asset.name),
      asset,
    );
  }
  assert.ok(after.assets.length > before.assets.length, 'Retry adds no missing assets');
}

async function snapshot(id, directory) {
  const sourceRun = run(id);
  assert.equal(sourceRun.conclusion, 'failure', 'Snapshot requires a failed publication run');
  const attemptJobs = jobs(id, sourceRun.run_attempt);
  assert.ok(attemptJobs.some((job) => job.name === 'publish' && job.conclusion === 'failure'));
  const evidence = path.join(directory, 'original-evidence');
  download(id, 'release-evidence', evidence);
  const result = await inspectRelease(evidence, false);
  assert.equal(result.options.release.origin.runId, id);
  assert.equal(result.checked.remote.draft, true, 'Snapshot requires a partial draft release');
  assert.ok(result.checked.present.length > 0, 'No assets exist yet');
  assert.ok(result.checked.present.length < result.options.assets.length, 'No assets are missing');
  const before = {
    schema: 1,
    repository,
    runId: id,
    attempt: sourceRun.run_attempt,
    capturedAt: new Date().toISOString(),
    identity: result.options.release,
    artifacts: retainedArtifacts(id),
    tags: result.tags,
    releaseId: result.checked.remote.id,
    body: result.checked.remote.body,
    assets: assetSnapshot(result.checked.remote),
  };
  const current = run(id);
  assert.equal(current.run_attempt, before.attempt, 'Run changes while snapshot is captured');
  assert.equal(current.conclusion, 'failure');
  return before;
}

async function retry(id, baselineId, directory) {
  const baselineRun = run(baselineId, acceptanceWorkflow);
  assert.equal(baselineRun.conclusion, 'success');
  assert.equal(baselineRun.head_branch, 'main');
  const baselineDirectory = path.join(directory, 'baseline');
  download(baselineId, 'release-acceptance', baselineDirectory);
  const report = json(baselineDirectory, 'report.json');
  assert.equal(report.scenario, 'snapshot-retry');
  assert.equal(report.status, 'passed');
  const before = json(baselineDirectory, 'snapshot.json');
  assert.equal(before.runId, id);
  const sourceRun = run(id);
  assert.equal(sourceRun.conclusion, 'success');
  const result = await published(before.identity.tag, path.join(directory, 'published'));
  validateRetry(before, {
    runId: id,
    attempt: sourceRun.run_attempt,
    identity: result.options.release,
    artifacts: retainedArtifacts(id),
    tags: result.tags,
    releaseId: result.checked.remote.id,
    body: result.checked.remote.body,
    assets: assetSnapshot(result.checked.remote),
  });
  // Compare every original evidence byte, including both signed bundles.
  const original = releaseOptions(path.join(baselineDirectory, 'original-evidence'));
  for (const asset of original.assets) {
    assert.ok(asset.content.equals(read(path.join(directory, 'published'), asset.name)));
  }
  const attemptJobs = jobs(id, sourceRun.run_attempt);
  const publisher = attemptJobs.find((job) => job.name === 'publish');
  assert.equal(publisher?.conclusion, 'success');
  for (const name of ['Attest the image build', 'Attest the SPDX inventory for the same digest']) {
    assert.equal(publisher.steps.find((step) => step.name === name)?.conclusion, 'skipped');
  }
  const candidate = attemptJobs.find((job) => job.name === 'candidate');
  if (candidate) {
    assert.equal(
      candidate.steps.find((step) => step.name === 'Build one OCI archive')?.conclusion,
      'skipped',
    );
  }
  write(directory, 'retry-jobs.json', attemptJobs);
  return {
    release: result.checked.remote.html_url,
    originalRun: sourceRun.html_url,
    baseline: baselineRun.html_url,
  };
}

export function validateFailedJobs(attemptJobs) {
  assert.ok(
    attemptJobs.some(
      (job) =>
        ['checks / application', 'checks / security-gate', 'candidate'].includes(job.name) &&
        job.conclusion === 'failure',
    ),
    'No required application, security, or candidate check fails',
  );
  assert.equal(attemptJobs.find((job) => job.name === 'publish')?.conclusion, 'skipped');
}

function failedCheck(id, directory) {
  const sourceRun = run(id);
  assert.equal(sourceRun.conclusion, 'failure');
  const attemptJobs = jobs(id, sourceRun.run_attempt);
  validateFailedJobs(attemptJobs);
  const planDirectory = path.join(directory, 'plan');
  download(id, 'release-plan', planDirectory);
  const plan = json(planDirectory, 'plan.json');
  validateReleasePlan(plan, {
    repository,
    commit: sourceRun.head_sha,
    ref: plan.sourceRef,
    eventName: 'push',
  });
  const approved = list('releases?per_page=100').find(
    (release) => release.tag_name === plan.tag && !release.draft,
  );
  assert.equal(approved, undefined, 'A release exists despite the failed check');
  write(directory, 'failed-jobs.json', attemptJobs);
  return { run: sourceRun.html_url, tag: plan.tag, approvedRelease: false };
}

async function main() {
  const directory = process.env.ACCEPTANCE_DIRECTORY;
  assert.ok(directory, 'ACCEPTANCE_DIRECTORY is required');
  fs.mkdirSync(directory, { recursive: true });
  const scenario = process.env.ACCEPTANCE_SCENARIO;
  const report = { schema: 1, scenario, status: 'failed', recordedAt: new Date().toISOString() };
  try {
    assert.equal(process.env.GITHUB_REPOSITORY, repository);
    const id = process.env.ACCEPTANCE_RELEASE_RUN;
    if (scenario === 'release') {
      const result = await published(process.env.ACCEPTANCE_TAG, path.join(directory, 'published'));
      report.result = {
        release: result.checked.remote.html_url,
        run: result.sourceRun.html_url,
        identity: result.options.release,
        changelog: validateChangelog(result.options.body, result.options.release),
        rejectedConflicts: await conflicts(result.options, result.tags),
      };
    } else if (scenario === 'snapshot-retry') {
      const before = await snapshot(id, directory);
      write(directory, 'snapshot.json', before);
      report.result = { runId: id, attempt: before.attempt, readyForRetry: true };
    } else if (scenario === 'verify-retry') {
      report.result = await retry(id, process.env.ACCEPTANCE_SNAPSHOT_RUN, directory);
    } else if (scenario === 'failed-check') {
      report.result = failedCheck(id, directory);
    } else {
      throw new Error('Unknown acceptance scenario');
    }
    report.status = 'passed';
  } catch (error) {
    report.error = error.message;
    process.exitCode = 1;
  } finally {
    write(directory, 'report.json', report);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## Release acceptance: ${report.status}\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`,
      );
    }
    console.log(JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
