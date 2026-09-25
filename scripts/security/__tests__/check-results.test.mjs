import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, it } from 'node:test';

const cli = resolve('scripts/security/check-results.mjs');
const directories = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'skyttel-security-policy-'));
  directories.push(path);
  return path;
}
function run(args, results) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, REQUIRED_RESULTS: JSON.stringify(results) },
  });
}
function json(path, value) {
  writeFileSync(path, JSON.stringify(value));
}

it('accepts only explicit success for every required job', () => {
  assert.equal(
    run(['jobs', 'application', 'security'], {
      application: { result: 'success' },
      security: { result: 'success' },
    }).status,
    0,
  );
  for (const result of ['failure', 'cancelled', 'skipped', '', null]) {
    assert.equal(
      run(['jobs', 'application', 'security'], {
        application: { result: 'success' },
        security: { result },
      }).status,
      1,
    );
  }
  assert.equal(
    run(['jobs', 'application', 'security'], {
      application: { result: 'success' },
    }).status,
    1,
  );
  assert.equal(run(['jobs']).status, 1);
});

it('blocks high CodeQL findings and incomplete SARIF evidence', () => {
  const path = directory();
  const report = {
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'CodeQL',
            rules: [{ id: 'test/rule', properties: { 'security-severity': '8.1' } }],
          },
        },
        results: [],
      },
    ],
  };
  json(join(path, 'javascript.sarif'), report);
  json(join(path, 'actions.sarif'), report);
  assert.equal(run(['codeql', path]).status, 0);
  report.runs[0].results.push({ ruleId: 'test/rule', level: 'warning' });
  json(join(path, 'javascript.sarif'), report);
  assert.equal(run(['codeql', path]).status, 1);
  report.runs[0].results = [];
  json(join(path, 'javascript.sarif'), report);
  rmSync(join(path, 'actions.sarif'));
  assert.equal(run(['codeql', path]).status, 1);
  json(join(path, 'actions.sarif'), { runs: [] });
  assert.equal(run(['codeql', path]).status, 1);
});

it('requires a scanned ZAP target and blocks high risk while retaining lower risk reports', () => {
  const path = join(directory(), 'zap.json');
  const report = { site: [{ '@name': 'http://localhost:3000', alerts: [] }] };
  json(path, report);
  assert.equal(run(['zap', path]).status, 0);
  report.site[0].alerts.push({ pluginid: '10001', riskcode: '2' });
  json(path, report);
  assert.equal(run(['zap', path]).status, 0);
  report.site[0].alerts[0].riskcode = '3';
  json(path, report);
  assert.equal(run(['zap', path]).status, 1);
  for (const invalid of [
    {},
    { site: [] },
    { site: [{ alerts: [] }] },
    { site: [{ '@name': 'http://localhost:3000' }] },
  ]) {
    json(path, invalid);
    assert.equal(run(['zap', path]).status, 1);
  }
  writeFileSync(path, '{');
  assert.equal(run(['zap', path]).status, 1);
  rmSync(path);
  assert.equal(run(['zap', path]).status, 1);
});

const imageId = `sha256:${'1'.repeat(64)}`;

it('requires Trivy to inspect both production and development Dockerfiles', () => {
  const path = join(directory(), 'trivy.json');
  const report = {
    SchemaVersion: 2,
    Results: [
      { Target: 'Dockerfile', Class: 'config', MisconfSummary: { Successes: 20, Failures: 0 } },
      {
        Target: '.devcontainer/Dockerfile',
        Class: 'config',
        MisconfSummary: { Successes: 20, Failures: 0 },
      },
    ],
  };
  json(path, report);
  assert.equal(run(['trivy', path]).status, 0);
  report.Results[0].MisconfSummary.Failures = 1;
  json(path, report);
  assert.equal(run(['trivy', path]).status, 1);
  report.Results.shift();
  json(path, report);
  assert.equal(run(['trivy', path]).status, 1);
});
function containerEvidence() {
  const path = directory();
  writeFileSync(join(path, 'image-id.txt'), `${imageId}\n`);
  const report = {
    source: { type: 'image', target: { imageID: imageId, manifestDigest: imageId } },
    descriptor: { name: 'grype', db: { status: { valid: true, built: new Date().toISOString() } } },
    matches: [],
  };
  json(join(path, 'grype.json'), report);
  json(join(path, 'sbom.spdx.json'), {
    spdxVersion: 'SPDX-2.3',
    creationInfo: { creators: ['Tool: syft-1.52.0'] },
    packages: [
      { name: 'synthetic-package', SPDXID: 'SPDXRef-test' },
      {
        name: 'synthetic-image',
        primaryPackagePurpose: 'CONTAINER',
        versionInfo: imageId,
      },
    ],
  });
  const exceptionsPath = join(path, 'exceptions.json');
  json(exceptionsPath, { version: 1, exceptions: [] });
  return { path, report, exceptionsPath };
}
const finding = {
  vulnerability: {
    id: 'CVE-2026-12345',
    severity: 'High',
    fix: { state: 'not-fixed', versions: [] },
  },
  artifact: { name: 'synthetic-package', version: '1.2.3', type: 'deb' },
};

it('blocks unfixed high container findings and absent or mismatched evidence', () => {
  const { path, report, exceptionsPath } = containerEvidence();
  const args = ['grype', path, exceptionsPath];
  assert.equal(run(args).status, 0);
  report.matches.push(finding);
  json(join(path, 'grype.json'), report);
  assert.equal(run(args).status, 1);
  report.matches = [];
  report.source.target.imageID = `sha256:${'2'.repeat(64)}`;
  json(join(path, 'grype.json'), report);
  assert.equal(run(args).status, 1);
  report.source.target.imageID = imageId;
  report.descriptor.db.status.valid = false;
  json(join(path, 'grype.json'), report);
  assert.equal(run(args).status, 1);
  report.descriptor.db.status.valid = true;
  json(join(path, 'grype.json'), report);
  rmSync(join(path, 'sbom.spdx.json'));
  assert.equal(run(args).status, 1);
});

it('accepts only reviewed, exact, current container exceptions and rejects stale records', () => {
  const { path, report, exceptionsPath } = containerEvidence();
  report.matches = [finding];
  json(join(path, 'grype.json'), report);
  const now = Date.now();
  const exception = {
    vulnerability: 'CVE-2026-12345',
    package: 'synthetic-package',
    version: '1.2.3',
    type: 'deb',
    imageId,
    owner: 'maintainer',
    reviewer: 'maintainer',
    rationale: 'Synthetic assessment for policy tests',
    actionPlan: 'Check the upstream fix weekly and release the patched package before expiry.',
    evidence: 'https://example.test/advisory',
    created: new Date(now - 60_000).toISOString(),
    expires: new Date(now + 86_400_000).toISOString(),
  };
  const args = ['grype', path, exceptionsPath];
  json(exceptionsPath, { version: 1, exceptions: [exception] });
  assert.equal(run(args).status, 0);
  for (const change of [
    { package: '*' },
    { version: '2.0.0' },
    { imageId: `sha256:${'2'.repeat(64)}` },
    { reviewer: '' },
    { owner: '' },
    { rationale: '' },
    { actionPlan: undefined },
    { actionPlan: '' },
    { actionPlan: '   ' },
    { actionPlan: 123 },
    { evidence: 'http://example.test/advisory' },
    { created: new Date(now + 60_000).toISOString() },
    { expires: new Date(now - 1).toISOString() },
    { expires: new Date(now + 31 * 86_400_000).toISOString() },
    { expires: 'never' },
  ]) {
    json(exceptionsPath, { version: 1, exceptions: [{ ...exception, ...change }] });
    assert.equal(run(args).status, 1, JSON.stringify(change));
  }
  json(exceptionsPath, { version: 1, exceptions: [exception, exception] });
  assert.equal(run(args).status, 1);
  json(exceptionsPath, { version: 1, exceptions: [exception] });
  report.matches = [];
  json(join(path, 'grype.json'), report);
  assert.equal(run(args).status, 1, 'An unused exception must be removed');
});
