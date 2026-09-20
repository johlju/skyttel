import assert from 'node:assert/strict';
import { it } from 'node:test';

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
  const predicateType = 'https://spdx.dev/Document';
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
