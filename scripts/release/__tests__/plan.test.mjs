import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createReleasePlan, validateReleasePlan } from '../plan.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';
const context = {
  repository: 'Viscalyx/Skyttel',
  commit,
  ref: 'refs/heads/main',
  eventName: 'push',
};

describe('release plan', () => {
  it('binds a preview version and full metadata to its source and immutable image aliases', () => {
    assert.deepEqual(
      createReleasePlan({
        ...context,
        gitVersion: {
          Sha: commit,
          SemVer: '1.2.3-preview.4',
          FullSemVer: '1.2.3-preview.4+4.Branch.main',
        },
      }),
      {
        repository: 'Viscalyx/Skyttel',
        commit,
        sourceRef: 'refs/heads/main',
        channel: 'preview',
        version: '1.2.3-preview.4',
        fullVersion: '1.2.3-preview.4+4.Branch.main',
        tag: 'v1.2.3-preview.4',
        image: 'ghcr.io/viscalyx/skyttel',
        imageTags: [
          '1.2.3-preview.4',
          'sha-0123456',
          'sha-0123456789abcdef0123456789abcdef01234567',
        ],
      },
    );
  });

  it('binds a stable release to its exact version tag without taking preview commit aliases', () => {
    assert.deepEqual(
      createReleasePlan({
        ...context,
        ref: 'refs/tags/v1.2.3',
        gitVersion: { Sha: commit, SemVer: '1.2.3', FullSemVer: '1.2.3' },
      }),
      {
        repository: 'Viscalyx/Skyttel',
        commit,
        sourceRef: 'refs/tags/v1.2.3',
        channel: 'stable',
        version: '1.2.3',
        fullVersion: '1.2.3',
        tag: 'v1.2.3',
        image: 'ghcr.io/viscalyx/skyttel',
        imageTags: ['1.2.3'],
      },
    );
  });

  it('rejects untrusted triggers and contradictory source or version identities', () => {
    const input = {
      ...context,
      gitVersion: {
        Sha: commit,
        SemVer: '1.2.3-preview.4',
        FullSemVer: '1.2.3-preview.4+4',
      },
    };
    for (const changes of [
      { eventName: 'pull_request' },
      { ref: 'refs/heads/codex/release' },
      { ref: 'refs/tags/v1.2.3-preview.4' },
      { ref: 'refs/tags/v01.2.3' },
      { ref: 'refs/tags/v1.2.3\n' },
      { ref: 'refs/tags/v1.2.3' },
      { repository: '../repo' },
      { repository: 'viscalyx/skyttel\n' },
      { commit: '0123456' },
      { commit: `${commit}\n`, gitVersion: { ...input.gitVersion, Sha: `${commit}\n` } },
      { gitVersion: { ...input.gitVersion, Sha: 'abcdef0123456789abcdef0123456789abcdef01' } },
      { gitVersion: { ...input.gitVersion, SemVer: '1.2.4-preview.4' } },
      { gitVersion: { ...input.gitVersion, FullSemVer: '1.2.3-preview.4+line\nbreak' } },
      { gitVersion: { ...input.gitVersion, SemVer: '1.2.3', FullSemVer: '1.2.3' } },
      { gitVersion: { ...input.gitVersion, SemVer: '1.2.3-alpha.1', FullSemVer: '1.2.3-alpha.1' } },
      {
        gitVersion: {
          ...input.gitVersion,
          SemVer: '1.2.3-preview.01',
          FullSemVer: '1.2.3-preview.01',
        },
      },
      {
        ref: 'refs/tags/v1.2.3',
        gitVersion: { Sha: commit, SemVer: '1.2.4', FullSemVer: '1.2.4' },
      },
    ]) {
      assert.throws(
        () => createReleasePlan({ ...input, ...changes }),
        undefined,
        JSON.stringify(changes),
      );
    }
  });

  it('reuses a frozen release identity and rejects incompatible restored plans', () => {
    const frozen = {
      repository: 'Viscalyx/Skyttel',
      commit,
      sourceRef: 'refs/heads/main',
      channel: 'preview',
      version: '1.2.3-preview.4',
      fullVersion: '1.2.3-preview.4+4.Branch.main',
      tag: 'v1.2.3-preview.4',
      image: 'ghcr.io/viscalyx/skyttel',
      imageTags: ['1.2.3-preview.4', 'sha-0123456', 'sha-0123456789abcdef0123456789abcdef01234567'],
    };
    assert.deepEqual(validateReleasePlan(frozen, context), frozen);
    for (const changes of [
      { repository: 'another/repo' },
      { commit: 'abcdef0123456789abcdef0123456789abcdef01' },
      { sourceRef: 'refs/heads/feature' },
      { channel: 'stable' },
      { fullVersion: '1.2.4-preview.4' },
      { tag: 'v1.2.4-preview.4' },
      { image: 'ghcr.io/another/repo' },
      { imageTags: ['latest'] },
    ]) {
      assert.throws(() => validateReleasePlan({ ...frozen, ...changes }, context));
    }
  });
});
