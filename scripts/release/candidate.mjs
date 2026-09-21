import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkPublication(expected, existing) {
  if (!existing) return 'create';
  assert.deepEqual(existing, expected, 'Conflict in release identity');
  return 'preserve';
}

export function checkRegistryTags(identity, tags) {
  for (const tag of identity.imageTags) {
    if (tags[tag] && tags[tag] !== identity.digest) {
      throw new Error(`Conflict in registry tag ${tag}`);
    }
  }
  return identity.imageTags.filter((tag) => !tags[tag]);
}

// Input is the output of gh attestation verify, never an unverified bundle.
export function validateAttestation(identity, results, predicateType, sbom) {
  const statement = results?.find((result) => {
    const value = result.verificationResult?.statement;
    return (
      value?.predicateType === predicateType &&
      value.subject?.length === 1 &&
      value.subject[0].name === identity.image &&
      value.subject[0].digest?.sha256 === identity.digest.slice(7)
    );
  })?.verificationResult.statement;
  if (!statement) throw new Error('Missing matching verified attestation');
  if (predicateType === 'https://slsa.dev/provenance/v1') {
    const run = `https://github.com/${identity.repository}/actions/runs/${identity.origin.runId}/attempts/`;
    const invocation = statement.predicate?.runDetails?.metadata?.invocationId;
    assert.ok(
      typeof invocation === 'string' &&
        invocation.startsWith(run) &&
        /^\d+$/u.test(invocation.slice(run.length)),
      'Conflicting attestation origin',
    );
  }
  if (sbom) assert.deepEqual(statement.predicate, sbom, 'Signed SBOM does not match inventory');
}

export function validateCandidateReports(identity, grype) {
  assert.equal(
    grype.source?.target?.manifestDigest,
    identity.digest,
    'Scan manifest does not match release',
  );
}

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function blob(layout, descriptor) {
  assert.match(descriptor.digest, /^sha256:[a-f0-9]{64}$/u);
  const path = join(layout, 'blobs', 'sha256', descriptor.digest.slice(7));
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  assert.equal(`sha256:${hash.digest('hex')}`, descriptor.digest, 'OCI blob digest mismatch');
  assert.equal(size, descriptor.size, 'OCI blob size mismatch');
  return path;
}

async function inspect(directory, layout) {
  const plan = await readJson(join(directory, 'plan.json'));
  const index = await readJson(join(layout, 'index.json'));
  assert.equal(index.schemaVersion, 2);
  assert.equal(index.manifests?.length, 1, 'Expected exactly one platform manifest');
  const descriptor = index.manifests[0];
  assert.equal(descriptor.mediaType, 'application/vnd.oci.image.manifest.v1+json');
  const manifestBytes = await readFile(await blob(layout, descriptor));
  const manifest = JSON.parse(manifestBytes);
  const config = await readJson(await blob(layout, manifest.config));
  assert.equal(config.os, 'linux');
  assert.equal(config.architecture, 'amd64');
  assert.equal(config.config.Labels['org.opencontainers.image.version'], plan.fullVersion);
  assert.equal(config.config.Labels['org.opencontainers.image.revision'], plan.commit);
  assert.equal(
    config.config.Labels['org.opencontainers.image.source'],
    `https://github.com/${plan.repository}`,
  );
  for (const layer of manifest.layers) await blob(layout, layer);
  const identity = {
    ...plan,
    digest: descriptor.digest,
    imageID: manifest.config.digest,
    origin: {
      runId: process.env.GITHUB_RUN_ID,
      workflow: `${plan.repository}/.github/workflows/release.yml`,
      ref: process.env.GITHUB_REF,
    },
  };
  const existing = await readJson(join(directory, 'release.json')).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (checkPublication(identity, existing) === 'create') {
    await writeFile(join(directory, 'release.json'), `${JSON.stringify(identity, null, 2)}\n`);
  }
  await writeFile(join(directory, 'manifest.json'), manifestBytes);
  await writeFile(join(directory, 'image-id.txt'), `${identity.imageID}\n`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `digest=${identity.digest}\nimage=${identity.image}\n`,
    );
  }
}

export async function verify(directory) {
  const identity = await readJson(join(directory, 'release.json'));
  assert.equal(digest(await readFile(join(directory, 'manifest.json'))), identity.digest);
  validateCandidateReports(identity, await readJson(join(directory, 'grype.json')));
  for (const [name, predicateType] of [
    ['provenance', 'https://slsa.dev/provenance/v1'],
    ['sbom', 'https://spdx.dev/Document/v2.3'],
  ]) {
    const output = execFileSync(
      'gh',
      [
        'attestation',
        'verify',
        join(directory, 'manifest.json'),
        '--bundle',
        join(directory, `${name}.sigstore.json`),
        '--repo',
        identity.repository,
        '--signer-workflow',
        identity.origin.workflow,
        '--source-digest',
        identity.commit,
        '--source-ref',
        identity.origin.ref,
        '--deny-self-hosted-runners',
        '--predicate-type',
        predicateType,
        '--format',
        'json',
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    validateAttestation(
      identity,
      JSON.parse(output),
      predicateType,
      name === 'sbom' ? await readJson(join(directory, 'sbom.spdx.json')) : undefined,
    );
  }
}

export async function registryTags(identity) {
  // GHCR credentials are sent only to GHCR's own token endpoint.
  const tokenUrl = new URL('https://ghcr.io/token');
  tokenUrl.searchParams.set('service', 'ghcr.io');
  tokenUrl.searchParams.set('scope', `repository:${identity.repository.toLowerCase()}:pull`);
  const response = await fetch(tokenUrl, {
    headers: {
      authorization: `Basic ${Buffer.from(`${process.env.GITHUB_ACTOR}:${process.env.GH_TOKEN}`).toString('base64')}`,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Registry authorization failed: ${response.status}`);
  const { token } = await response.json();
  assert.ok(token, 'Missing registry token');
  const tags = {};
  for (const tag of identity.imageTags) {
    const result = await fetch(
      `https://ghcr.io/v2/${identity.repository.toLowerCase()}/manifests/${tag}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept:
            'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (result.status === 404) continue;
    if (!result.ok) throw new Error(`Registry inspection failed: ${result.status}`);
    tags[tag] = digest(Buffer.from(await result.arrayBuffer()));
  }
  return tags;
}

async function publish(directory, dryRun) {
  const identity = await readJson(join(directory, 'release.json'));
  await verify(directory);
  const missing = checkRegistryTags(identity, await registryTags(identity));
  if (dryRun) return;
  for (const tag of missing) {
    // Repeat the preflight immediately before each write. Workflow-wide
    // concurrency prevents competing trusted publishers in this repository.
    const remaining = checkRegistryTags(identity, await registryTags(identity));
    if (!remaining.includes(tag)) continue;
    execFileSync(
      'skopeo',
      [
        'copy',
        '--preserve-digests',
        `oci-archive:${join(directory, 'image.oci.tar')}`,
        `docker://${identity.image}:${tag}`,
      ],
      { stdio: 'inherit' },
    );
  }
  assert.deepEqual(checkRegistryTags(identity, await registryTags(identity)), []);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, directory, layout] = process.argv.slice(2);
    if (mode === 'inspect' && directory && layout) await inspect(directory, layout);
    else if (mode === 'verify' && directory) await verify(directory);
    else if (mode === 'preflight' && directory) await publish(directory, true);
    else if (mode === 'publish' && directory) await publish(directory, false);
    else
      throw new Error(
        'Usage: candidate.mjs inspect|verify|preflight|publish <directory> [OCI layout]',
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
