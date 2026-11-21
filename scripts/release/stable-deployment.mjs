import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkRegistryTags, registryTags, verify } from './candidate.mjs';
import { requireStableSource, stableTagPattern, validateReleasePlan } from './plan.mjs';

const repository = 'viscalyx/skyttel';
const releaseWorkflow = '.github/workflows/release.yml';
const deployAssets = [
  'release.json',
  'manifest.json',
  'grype.json',
  'sbom.spdx.json',
  'provenance.sigstore.json',
  'sbom.sigstore.json',
];

export function stableDeploymentSource(env) {
  assert.equal(env.GITHUB_REPOSITORY, repository);
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_run');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const run = event.workflow_run;
  assert.equal(event.action, 'completed');
  assert.equal(run.path, releaseWorkflow);
  assert.equal(run.head_repository?.full_name, repository);
  assert.equal(run.event, 'push');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  assert.ok(Number.isSafeInteger(run.id) && run.id > 0, 'Invalid release run ID');
  // Use the Actions context for outbound requests and check it against the event file.
  const commit = env.STABLE_RELEASE_SHA;
  assert.match(commit ?? '', /^[a-f0-9]{40}$/u, 'Invalid release run source commit');
  assert.equal(commit === run.head_sha, true, 'Release source commit does not match the event');
  assert.equal(typeof run.head_branch, 'string');
  const ref = `refs/tags/${run.head_branch}`;
  assert.match(ref, stableTagPattern, 'Expected a stable release tag');
  return { repository, ref, commit, eventName: run.event, runId: String(run.id) };
}

export function validateStableIdentity(identity, source) {
  validateReleasePlan(identity, source);
  assert.equal(identity.origin?.workflow, `${repository}/${releaseWorkflow}`);
  assert.equal(identity.origin?.ref, source.ref);
  assert.equal(identity.origin?.runId, source.runId);
  assert.match(identity.digest ?? '', /^sha256:[a-f0-9]{64}$/u, 'Invalid release digest');
}

async function prepare(env) {
  const source = stableDeploymentSource(env);
  requireStableSource(source.ref, source.commit);
  const tag = source.ref.slice('refs/tags/'.length);
  const release = JSON.parse(
    execFileSync('gh', ['api', `repos/${repository}/releases/tags/${tag}`], {
      encoding: 'utf8',
    }),
  );
  assert.equal(release.tag_name, tag);
  assert.equal(release.draft, false, 'Stable release is still a draft');
  assert.equal(release.prerelease, false, 'Expected a published stable release');
  execFileSync('gh', [
    'release',
    'download',
    tag,
    '--repo',
    repository,
    '--dir',
    'release',
    ...deployAssets.flatMap((name) => ['--pattern', name]),
  ]);
  const identity = JSON.parse(readFileSync('release/release.json', 'utf8'));
  validateStableIdentity(identity, source);
  await verify('release');
  assert.deepEqual(
    checkRegistryTags(identity, await registryTags(identity)),
    [],
    'Published stable image tag is missing',
  );
  console.log(`Verified published stable release ${tag} at ${identity.digest}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepare(process.env);
}
