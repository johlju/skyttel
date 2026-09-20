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
