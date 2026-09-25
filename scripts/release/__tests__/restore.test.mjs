import assert from 'node:assert/strict';
import { it } from 'node:test';

import { findRetryArtifact } from '../restore.mjs';

it('stops a retry when previously preserved evidence expires or disappears', () => {
  const name = 'release-candidate';
  const preserved = [{ steps: [{ name: 'Preserve verified candidate', conclusion: 'success' }] }];
  assert.equal(findRetryArtifact([], [], name), undefined);
  assert.throws(() => findRetryArtifact([], preserved, name), /missing/u);
  assert.throws(() => findRetryArtifact([{ name, expired: true }], preserved, name), /expired/u);
  const artifact = { name, expired: false };
  assert.equal(findRetryArtifact([artifact], preserved, name), artifact);
  assert.throws(() => findRetryArtifact([artifact, artifact], preserved, name), /Conflicting/u);
});

it('never restores failed candidate diagnostics as verified release evidence', () => {
  const name = 'release-candidate-diagnostics-2';
  const diagnostics = { name, expired: false };
  const jobs = [{ steps: [{ name: 'Preserve candidate diagnostics', conclusion: 'success' }] }];
  assert.equal(findRetryArtifact([diagnostics], jobs, 'release-candidate'), undefined);
  assert.throws(() => findRetryArtifact([diagnostics], jobs, name), /Unknown release artifact/u);
  const verified = { name: 'release-candidate', expired: false };
  assert.equal(findRetryArtifact([diagnostics, verified], jobs, 'release-candidate'), verified);
});
