import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkboxState, classifyChangedFiles, evaluateSsdlcGate, formatGateReport,
  main, matchesPathPattern, parseArgs, readPullRequestFromGitHub,
} from '../ssdlc-gate.mjs';

const completePrBody = `## SSDLC Gate

- [x] I have reviewed SSDLC requirements. <!-- DO NOT REMOVE: ssdlc:requirements -->
`;
const githubInput = { prNumber: '66', repository: 'viscalyx/skyttel', token: 'synthetic-test-token' };

function fakeGitHub({ pages = [], body = completePrBody, changedFiles } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const page = new URL(url).searchParams.get('page');
    return {
      ok: true,
      status: 200,
      json: async () => page
        ? pages[Number(page) - 1] ?? []
        : { body, changed_files: changedFiles ?? pages.flat().length },
    };
  };
  return { calls, fetchImpl };
}

function capturedConsole() {
  const output = { errors: [], logs: [] };
  return {
    output,
    consoleObj: {
      error: (message) => output.errors.push(message),
      log: (message) => output.logs.push(message),
    },
  };
}

describe('SSDLC gate', () => {
  it('allows ordinary documentation changes without a security declaration', () => {
    const result = evaluateSsdlcGate({ changedFiles: ['README.md'], prBody: '' });
    assert.equal(result.passed, true);
    assert.equal(result.requiresGate, false);
    assert.match(formatGateReport(result), /not required/u);
  });

  it('requires evidence for Skyttel application, configuration, deployment, and validation paths', () => {
    const paths = [
      'src/server/auth.ts', 'src/client/App.tsx', 'src/shared/household-name.ts',
      'migrations/001_initial.sql', 'Dockerfile', 'compose.yaml', '.env.example',
      '.dockerignore', '.node-version', 'vite.config.ts', 'tsconfig.server.json',
      'index.html', 'package.json', 'package-lock.json',
      '.github/workflows/ci.yml', '.github/pull_request_template.md',
      '.codex/config.toml', '.codex/rules/github.rules', 'docs/development/codex-permissions.md',
      'scripts/check-container.mjs', 'scripts/security/ssdlc-gate.mjs',
      'tests/integration/access.spec.ts', 'playwright.config.ts',
      'docs/operations/installation.md', 'docs/adr/0008-autentisering-av-skyttel-anvandare.md',
    ];
    for (const path of paths) {
      const result = evaluateSsdlcGate({ changedFiles: [path], prBody: '' });
      assert.equal(result.requiresGate, true, path);
      assert.equal(result.passed, false, path);
    }
    assert.equal(matchesPathPattern('./src/server/auth.ts', 'src/**'), true);
    assert.equal(matchesPathPattern('src-other/server/auth.ts', 'src/**'), false);
    assert.equal(matchesPathPattern('src', 'src/**'), true);
    assert.equal(matchesPathPattern('', 'src/**'), false);
    assert.deepEqual(classifyChangedFiles(['src/server/auth.ts', 'src/server/auth.ts'])
      .find((group) => group.id === 'authentication-authorization').files, ['src/server/auth.ts']);
  });

  it('requires one completed checkbox with the exact marker', () => {
    assert.equal(checkboxState(completePrBody, 'requirements'), 'checked');
    assert.equal(checkboxState(completePrBody.replace('[x]', '[X]'), 'requirements'), 'checked');
    assert.equal(checkboxState(completePrBody.replace('[x]', '[ ]'), 'requirements'), 'unchecked');
    assert.equal(checkboxState(completePrBody.replace('requirements -->', 'requirements-extra -->'), 'requirements'), 'missing');
    assert.equal(checkboxState(completePrBody + completePrBody, 'requirements'), 'ambiguous');
    for (const prBody of ['', completePrBody.replace('[x]', '[ ]'), completePrBody + completePrBody]) {
      const result = evaluateSsdlcGate({ changedFiles: ['src/server/auth.ts'], prBody });
      assert.equal(result.passed, false);
      assert.match(formatGateReport(result), /src\/server\/auth.ts/u);
    }
    assert.equal(evaluateSsdlcGate({
      changedFiles: ['src/server/auth.ts'], prBody: completePrBody,
    }).passed, true);
  });

  it('reads every page and attaches a timeout without following redirects', async () => {
    const pages = [
      Array.from({ length: 100 }, (_, index) => ({ filename: `docs/note-${index}.md` })),
      [{ filename: 'src/server/auth.ts' }],
    ];
    const { calls, fetchImpl } = fakeGitHub({ pages });
    const result = await readPullRequestFromGitHub({ ...githubInput, fetchImpl });
    assert.equal(result.changedFiles.length, 101);
    assert.equal(result.changedFiles.at(-1), 'src/server/auth.ts');
    assert.equal(result.prBody, completePrBody);
    assert.equal(calls.length, 3);
    for (const { options } of calls) {
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.redirect, 'error');
    }
  });

  it('classifies the former sensitive path when a file is renamed into documentation', async () => {
    const { fetchImpl } = fakeGitHub({ pages: [[{
      filename: 'docs/old-auth.md', previous_filename: 'src/server/auth.ts', status: 'renamed',
    }]], body: '' });
    const result = await readPullRequestFromGitHub({ ...githubInput, fetchImpl });
    assert.deepEqual(result.changedFiles, ['docs/old-auth.md', 'src/server/auth.ts']);
    assert.equal(evaluateSsdlcGate(result).passed, false);
  });

  it('accepts a complete 3,000-file response without requesting beyond the API limit', async () => {
    const pages = Array.from({ length: 30 }, (_, page) =>
      Array.from({ length: 100 }, (_, index) => ({ filename: `docs/note-${page}-${index}.md` })));
    const { calls, fetchImpl } = fakeGitHub({ pages });
    const result = await readPullRequestFromGitHub({ ...githubInput, fetchImpl });
    assert.equal(result.changedFiles.length, 3_000);
    assert.equal(calls.length, 31);
  });

  it('fails if a later page is missing instead of classifying the partial response', async () => {
    const { fetchImpl } = fakeGitHub({
      changedFiles: 101,
      pages: [Array.from({ length: 100 }, (_, index) => ({ filename: `docs/note-${index}.md` }))],
    });
    await assert.rejects(readPullRequestFromGitHub({ ...githubInput, fetchImpl }), /incomplete/u);
  });

  it('fails closed for missing counts, truncation, duplicates, invalid paths, and incomplete renames', async () => {
    const cases = [
      { changedFiles: 3_001 },
      { changedFiles: -1 },
      { changedFiles: 1.5 },
      { changedFiles: '1' },
      { changedFiles: 2, pages: [[{ filename: 'README.md' }]] },
      { pages: [[{ filename: 'README.md' }, { filename: 'README.md' }]] },
      { pages: [[{}]] },
      { pages: [[{ filename: 'README.md', status: 'renamed' }]] },
      { pages: [[{ filename: 'README.md', previous_filename: 42 }]] },
    ];
    for (const value of cases) {
      await assert.rejects(readPullRequestFromGitHub({ ...githubInput, ...fakeGitHub(value) }));
    }
    await assert.rejects(readPullRequestFromGitHub({
      ...githubInput,
      fetchImpl: async () => ({ ok: true, json: async () => ({ body: completePrBody }) }),
    }), /changed-file count/u);
  });

  it('rejects missing credentials, invalid identities, API failures, and aborted requests', async () => {
    const noFetch = async () => { throw new Error('Unexpected network request'); };
    for (const overrides of [
      { repository: '' }, { repository: 'owner/repo/extra' }, { token: '' },
      { prNumber: '' }, { prNumber: '0' }, { prNumber: '66/files' },
    ]) {
      await assert.rejects(readPullRequestFromGitHub({ ...githubInput, ...overrides, fetchImpl: noFetch }));
    }
    await assert.rejects(readPullRequestFromGitHub({
      ...githubInput, fetchImpl: async () => ({ ok: false, status: 403 }),
    }), /GitHub API request failed \(403\)/u);
    await assert.rejects(readPullRequestFromGitHub({
      ...githubInput, fetchImpl: async () => { throw new DOMException('Timed out', 'TimeoutError'); },
    }), /Timed out/u);
  });

  it('runs local CLI inputs and reports pass, evidence failure, and argument errors', async () => {
    const { output, consoleObj } = capturedConsole();
    const fsImpl = { readFileSync: (path) => path === 'changed.txt' ? 'src/server/auth.ts\n' : completePrBody };
    assert.equal(await main(['--changed-files', 'changed.txt', '--pr-body', 'body.md'], { consoleObj, fsImpl }), 0);
    assert.match(output.logs[0], /SSDLC gate passed/u);
    assert.equal(await main(['--help'], { consoleObj }), 0);
    assert.equal(await main(['--changed-files', 'changed.txt'], { consoleObj }), 1);
    assert.match(output.errors[0], /must be provided together/u);
    assert.deepEqual(parseArgs(['--github-pr', '66']), { 'github-pr': '66' });
    assert.throws(() => parseArgs(['--github-pr']), /Missing value/u);
    assert.throws(() => parseArgs(['--unknown', '66']), /Unexpected argument/u);
    assert.throws(() => parseArgs(['--github-pr', '66', '--pr-body', 'body.md']), /cannot be combined/u);
  });

  it('returns a failing exit code for incomplete GitHub evidence or API data', async () => {
    const { output, consoleObj } = capturedConsole();
    const env = { GITHUB_REPOSITORY: githubInput.repository, GITHUB_TOKEN: githubInput.token, PR_NUMBER: '66' };
    const { fetchImpl } = fakeGitHub({ pages: [[{ filename: 'src/server/auth.ts' }]], body: '' });
    assert.equal(await main([], { consoleObj, env, fetchImpl }), 1);
    assert.match(output.errors[0], /SSDLC gate failed/u);
    assert.equal(await main([], {
      consoleObj, env, fetchImpl: async () => ({ ok: false, status: 500 }),
    }), 1);
    assert.ok(output.errors.some((message) => message.includes('SSDLC gate error')));
  });
});
