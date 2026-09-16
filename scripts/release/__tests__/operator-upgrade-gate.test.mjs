import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluateOperatorUpgradeGate,
  main,
  parseArgs,
  readPullRequestFromGitHub,
} from '../operator-upgrade-gate.mjs';

const document = '# Operator Upgrade Notes\n\n## Unreleased\n\nBack up the database.\n';
const declaration = id => `- [x] Declaration <!-- DO NOT REMOVE: operator-upgrade:${id} -->`;
const env = {
  GITHUB_REPOSITORY: 'viscalyx/skyttel',
  GITHUB_TOKEN: 'synthetic-test-token',
  PR_NUMBER: '66',
};
const pr = {
  body: declaration('updated'),
  base: { sha: 'a'.repeat(40) },
  head: { sha: 'b'.repeat(40), repo: { full_name: 'contributor/skyttel' } },
};
const baseContents = `https://api.github.com/repos/viscalyx/skyttel/contents/docs/operations/operator-upgrade-notes.md?ref=${pr.base.sha}`;
const headContents = `https://api.github.com/repos/contributor/skyttel/contents/docs/operations/operator-upgrade-notes.md?ref=${pr.head.sha}`;
const baseCommit = `https://api.github.com/repos/viscalyx/skyttel/git/commits/${pr.base.sha}`;
const baseTree = `https://api.github.com/repos/viscalyx/skyttel/git/trees/${'c'.repeat(40)}?recursive=1`;
const ok = value => ({ ok: true, json: async () => value });
const notes = content => ok({ encoding: 'base64', content: Buffer.from(content).toString('base64') });

function githubFixture(overrides = {}) {
  const calls = [];
  const routes = {
    'https://api.github.com/repos/viscalyx/skyttel/pulls/66': ok(pr),
    [baseContents]: notes(document),
    [headContents]: notes(document.replace('database.', 'database and keyring.')),
    [baseCommit]: ok({ tree: { sha: 'c'.repeat(40) } }),
    [baseTree]: ok({ truncated: false, tree: [{ path: 'README.md', type: 'blob' }] }),
    ...overrides,
  };
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.ok(Object.hasOwn(routes, url), `Unexpected GitHub API request: ${url}`);
      return routes[url];
    },
  };
}

async function runGate(overrides = {}) {
  const logs = [];
  const errors = [];
  const fixture = githubFixture(overrides);
  const exitCode = await main([], {
    env,
    fetchImpl: fixture.fetchImpl,
    consoleObj: { log: message => logs.push(message), error: message => errors.push(message) },
  });
  return { ...fixture, exitCode, logs, errors };
}

describe('committed operator-note declarations', () => {
  it('accepts meaningful committed corrections and both supported marker forms', () => {
    for (const prBody of [declaration('updated'), '- [X] Updated <!-- operator-upgrade:updated -->']) {
      assert.equal(evaluateOperatorUpgradeGate({
        prBody, baseNotes: document,
        headNotes: document.replace('database.', 'database and keyring.'),
      }).passed, true);
    }
  });

  it('requires exactly one checked declaration', () => {
    for (const prBody of [
      '',
      declaration('updated').replace('[x]', '[ ]'),
      `${declaration('updated')}\n${declaration('no-notes')}`,
      `${declaration('no-notes')}\n${declaration('no-notes')}`,
    ]) {
      assert.equal(evaluateOperatorUpgradeGate({ prBody, baseNotes: document, headNotes: document }).passed, false);
    }
  });

  it('rejects unchanged wording, whitespace changes and deletions as updated notes', () => {
    for (const headNotes of [
      document,
      document.replace('the database', 'the\n database'),
      document.replace('Back up the database.', ''),
      document.replace('Back up the database.', 'the database.'),
    ]) {
      assert.equal(evaluateOperatorUpgradeGate({
        prBody: declaration('updated'), baseNotes: document, headNotes,
      }).passed, false);
    }
  });

  it('validates head notes even when no new guidance is needed', () => {
    for (const headNotes of [undefined, '# Notes', `${document}\n## Unreleased\n`]) {
      assert.equal(evaluateOperatorUpgradeGate({
        prBody: declaration('no-notes'), baseNotes: document, headNotes,
      }).passed, false);
    }
    assert.equal(evaluateOperatorUpgradeGate({
      prBody: declaration('no-notes'), headNotes: '# Notes\n\n## Unreleased\n',
    }).passed, true);
  });
});

describe('GitHub API boundary', () => {
  it('reads exact committed snapshots from the base repository and fork', async () => {
    const result = await runGate();
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.calls.map(call => call.url), [
      'https://api.github.com/repos/viscalyx/skyttel/pulls/66', baseContents, headContents,
    ]);
    assert.equal(result.logs[0], 'Operator Upgrade gate passed.');
    for (const call of result.calls) {
      assert.equal(call.options.headers.authorization, 'Bearer synthetic-test-token');
      assert.equal(call.options.headers['user-agent'], 'skyttel-operator-upgrade-gate');
      assert.ok(call.options.signal instanceof AbortSignal);
    }
  });

  it('accepts first adoption only after proving base notes are absent in the committed tree', async () => {
    const result = await runGate({ [baseContents]: { ok: false, status: 404 } });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.calls.map(call => call.url), [
      'https://api.github.com/repos/viscalyx/skyttel/pulls/66',
      baseContents, baseCommit, baseTree, headContents,
    ]);
  });

  it('does not accept empty initial notes as a meaningful addition', async () => {
    const result = await runGate({
      [baseContents]: { ok: false, status: 404 },
      [headContents]: notes('# Notes\n\n## Unreleased\n'),
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.errors[0], /meaningful Unreleased addition/u);
  });

  it('does not treat denied or unavailable base contents as missing notes', async () => {
    for (const status of [401, 403, 429, 500]) {
      const result = await runGate({ [baseContents]: { ok: false, status } });
      assert.equal(result.exitCode, 1);
      assert.equal(result.calls.length, 2);
      assert.match(result.errors[0], new RegExp(`request failed \\(${status}\\)`, 'u'));
    }
  });

  it('fails when base absence cannot be verified or the notes are present in its tree', async () => {
    for (const overrides of [
      { [baseCommit]: { ok: false, status: 404 } },
      { [baseTree]: { ok: false, status: 403 } },
      { [baseTree]: ok({ truncated: true, tree: [] }) },
      { [baseTree]: ok({ tree: [] }) },
      { [baseTree]: ok({ truncated: false }) },
      { [baseTree]: ok({ truncated: false, tree: [{}] }) },
      { [baseTree]: ok({ truncated: false, tree: [{ path: 'docs/operations/operator-upgrade-notes.md' }] }) },
    ]) {
      const result = await runGate({ [baseContents]: { ok: false, status: 404 }, ...overrides });
      assert.equal(result.exitCode, 1);
      assert.equal(result.calls.some(call => call.url === headContents), false);
    }
  });

  it('always fails for missing head notes and unavailable content encodings', async () => {
    for (const overrides of [
      { [headContents]: { ok: false, status: 404 } },
      { [headContents]: ok({ encoding: 'none' }) },
      { [baseContents]: ok({ encoding: 'none' }) },
    ]) {
      assert.equal((await runGate(overrides)).exitCode, 1);
    }
  });

  it('fails for a missing declaration or unavailable pull request', async () => {
    for (const response of [{ ok: false, status: 404 }, ok({ ...pr, body: undefined })]) {
      assert.equal((await runGate({
        'https://api.github.com/repos/viscalyx/skyttel/pulls/66': response,
      })).exitCode, 1);
    }
  });

  it('rejects missing or malformed API inputs before requesting GitHub', async () => {
    for (const override of [
      { repository: '' }, { token: '' }, { prNumber: '' },
      { repository: 'invalid' }, { repository: 'owner/repo/extra' },
      { prNumber: '66?ignored=1' },
    ]) {
      await assert.rejects(readPullRequestFromGitHub({
        repository: env.GITHUB_REPOSITORY, token: env.GITHUB_TOKEN,
        prNumber: env.PR_NUMBER, fetchImpl: () => assert.fail('Unexpected API request'), ...override,
      }));
    }
  });

  it('rejects invalid snapshot identities and deleted forks', async () => {
    for (const response of [
      { ...pr, head: { ...pr.head, sha: 'main' } },
      { ...pr, head: { ...pr.head, repo: null } },
      { ...pr, head: { ...pr.head, repo: { full_name: 'owner/repo?bad=1' } } },
    ]) {
      const result = await runGate({ 'https://api.github.com/repos/viscalyx/skyttel/pulls/66': ok(response) });
      assert.equal(result.exitCode, 1);
      assert.equal(result.calls.length, 1);
    }
  });
});

describe('local command interface', () => {
  it('accepts local committed snapshots without a GitHub token', async () => {
    const files = {
      'pr.md': declaration('updated'), 'base.md': document,
      'head.md': document.replace('database.', 'database and keyring.'),
    };
    assert.equal(await main([
      '--pr-body', 'pr.md', '--base-notes', 'base.md', '--head-notes', 'head.md',
    ], {
      env: {}, consoleObj: { log() {}, error: assert.fail },
      fsImpl: { readFileSync: file => files[file] },
    }), 0);
  });

  it('supports help and reports useful argument errors', async () => {
    const errors = [];
    const consoleObj = { log() {}, error: message => errors.push(message) };
    assert.equal(await main(['--help'], { consoleObj }), 0);
    assert.deepEqual(parseArgs(['-h']), { help: true });
    assert.throws(() => parseArgs(['--pr-body']), /Missing/u);
    assert.throws(() => parseArgs(['file']), /Unexpected/u);
    assert.throws(() => parseArgs(['--unknown', 'file']), /Unknown/u);
    assert.equal(await main(['--pr-body', 'pr.md'], { consoleObj }), 1);
    assert.match(errors[0], /--base-notes is required/u);
  });
});
