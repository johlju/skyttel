import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkPublication,
  checkRegistryTags,
  validateAttestation,
  validateCandidateReports,
} from '../candidate.mjs';

const identity = {
  repository: 'viscalyx/skyttel',
  commit: 'a'.repeat(40),
  image: 'ghcr.io/viscalyx/skyttel',
  digest: `sha256:${'b'.repeat(64)}`,
  version: '1.2.3-preview.4',
  fullVersion: '1.2.3-preview.4+5',
  channel: 'preview',
  origin: { runId: '123' },
};

it('preserves compatible published identities and rejects conflicting immutable tags', () => {
  assert.equal(checkPublication(identity, undefined), 'create');
  assert.equal(checkPublication(identity, { ...identity }), 'preserve');
  for (const [field, value] of [
    ['commit', 'c'.repeat(40)],
    ['digest', `sha256:${'d'.repeat(64)}`],
    ['version', '1.2.3'],
    ['fullVersion', '1.2.3-preview.4+6'],
    ['image', 'ghcr.io/another/image'],
  ]) {
    assert.throws(() => checkPublication(identity, { ...identity, [field]: value }), /Conflict/u);
  }
});

it('rejects provenance from another run and scan reports for another manifest', () => {
  const predicateType = 'https://slsa.dev/provenance/v1';
  const verified = [
    {
      verificationResult: {
        statement: {
          subject: [{ name: identity.image, digest: { sha256: 'b'.repeat(64) } }],
          predicateType,
          predicate: {
            runDetails: {
              metadata: {
                invocationId: 'https://github.com/viscalyx/skyttel/actions/runs/123/attempts/1',
              },
            },
          },
        },
      },
    },
  ];
  assert.doesNotThrow(() => validateAttestation(identity, verified, predicateType));
  assert.throws(
    () => validateAttestation({ ...identity, origin: { runId: '456' } }, verified, predicateType),
    /origin/u,
  );
  const report = { source: { target: { manifestDigest: identity.digest } } };
  assert.doesNotThrow(() => validateCandidateReports(identity, report));
  assert.throws(
    () =>
      validateCandidateReports(identity, {
        source: { target: { manifestDigest: `sha256:${'d'.repeat(64)}` } },
      }),
    /manifest/u,
  );
});

it('fills only absent image tags and fails the entire preflight on a conflicting alias', () => {
  const plan = { ...identity, imageTags: ['1.2.3-preview.4', 'sha-aaaaaaa'] };
  assert.deepEqual(checkRegistryTags(plan, {}), plan.imageTags);
  assert.deepEqual(checkRegistryTags(plan, { '1.2.3-preview.4': identity.digest }), [
    'sha-aaaaaaa',
  ]);
  assert.deepEqual(
    checkRegistryTags(
      plan,
      Object.fromEntries(plan.imageTags.map((tag) => [tag, identity.digest])),
    ),
    [],
  );
  assert.throws(
    () => checkRegistryTags(plan, { 'sha-aaaaaaa': `sha256:${'c'.repeat(64)}` }),
    /Conflict/u,
  );
});

it('accepts only verified provenance for the exact image and SBOM predicate', () => {
  const predicateType = 'https://spdx.dev/Document/v2.3';
  const sbom = { spdxVersion: 'SPDX-2.3', packages: [{ name: 'skyttel' }] };
  const result = (subject, predicate = sbom) => [
    { verificationResult: { statement: { subject, predicateType, predicate } } },
  ];
  const subject = [{ name: identity.image, digest: { sha256: 'b'.repeat(64) } }];
  assert.doesNotThrow(() => validateAttestation(identity, result(subject), predicateType, sbom));
  assert.throws(() => validateAttestation(identity, [], predicateType, sbom), /attestation/u);
  assert.throws(
    () =>
      validateAttestation(
        identity,
        result([{ ...subject[0], name: 'another' }]),
        predicateType,
        sbom,
      ),
    /attestation/u,
  );
  assert.throws(
    () =>
      validateAttestation(
        identity,
        result(subject, { ...sbom, packages: [] }),
        predicateType,
        sbom,
      ),
    /SBOM/u,
  );
});

it('verifies SPDX 2.3 bundles through the CLI and rejects inconsistent evidence', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-candidate-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const writeJson = (name, value) => writeFileSync(join(directory, name), JSON.stringify(value));
  const manifest = '{}';
  const release = {
    ...identity,
    digest: `sha256:${createHash('sha256').update(manifest).digest('hex')}`,
    origin: {
      ...identity.origin,
      workflow: 'viscalyx/skyttel/.github/workflows/release.yml',
      ref: 'refs/heads/main',
    },
  };
  const verified = (predicateType, predicate) => [
    {
      verificationResult: {
        statement: {
          subject: [{ name: release.image, digest: { sha256: release.digest.slice(7) } }],
          predicateType,
          predicate,
        },
      },
    },
  ];
  writeFileSync(join(directory, 'manifest.json'), manifest);
  writeJson('release.json', release);
  writeJson('grype.json', { source: { target: { manifestDigest: release.digest } } });
  writeJson(
    'provenance.sigstore.json',
    verified('https://slsa.dev/provenance/v1', {
      runDetails: {
        metadata: {
          invocationId: 'https://github.com/viscalyx/skyttel/actions/runs/123/attempts/1',
        },
      },
    }),
  );
  // Stand in for gh's verified output while enforcing its predicate-type filter.
  writeFileSync(
    join(directory, 'gh'),
    `#!${process.execPath}
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(join(directory, 'calls.jsonl'))}, JSON.stringify(args) + '\\n');
const results = JSON.parse(readFileSync(args[args.indexOf('--bundle') + 1], 'utf8'));
const predicateType = args[args.indexOf('--predicate-type') + 1];
if (!results.some((result) => result.verificationResult.statement.predicateType === predicateType)) {
  console.error('No attestations found with predicate type: ' + predicateType);
  process.exit(1);
}
console.log(JSON.stringify(results));
`,
    { mode: 0o755 },
  );
  const verify = () =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../candidate.mjs', import.meta.url)), 'verify', directory],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}` },
      },
    );

  const predicateType = 'https://spdx.dev/Document/v2.3';
  const sbom = { spdxVersion: 'SPDX-2.3', packages: [{ name: 'skyttel' }] };
  writeJson('sbom.spdx.json', sbom);
  writeJson('sbom.sigstore.json', verified(predicateType, sbom));
  const result = verify();
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(join(directory, 'calls.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.deepEqual(
    calls,
    [
      ['provenance', 'https://slsa.dev/provenance/v1'],
      ['sbom', predicateType],
    ].map(([name, type]) => [
      'attestation',
      'verify',
      join(directory, 'manifest.json'),
      '--bundle',
      join(directory, `${name}.sigstore.json`),
      '--repo',
      release.repository,
      '--signer-workflow',
      release.origin.workflow,
      '--source-digest',
      release.commit,
      '--source-ref',
      release.origin.ref,
      '--deny-self-hosted-runners',
      '--predicate-type',
      type,
      '--format',
      'json',
    ]),
  );
  writeJson('sbom.spdx.json', { ...sbom, packages: [] });
  const mismatch = verify();
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /Signed SBOM does not match inventory/u);

  writeJson('sbom.spdx.json', sbom);
  for (const type of ['https://spdx.dev/Document', 'https://spdx.dev/Document/v2.2']) {
    writeJson('sbom.sigstore.json', verified(type, sbom));
    const wrongType = verify();
    assert.equal(wrongType.status, 1);
    assert.match(wrongType.stderr, /No attestations found with predicate type/u);
  }
});
