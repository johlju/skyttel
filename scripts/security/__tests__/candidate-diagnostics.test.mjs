import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';

const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const candidate = workflow.split('\n  candidate:\n')[1].split('\n  publish:\n')[0];
const scanner = resolve('scripts/security/scan-running-image.sh');

function step(name) {
  const block = candidate.split(`      - name: ${name}\n`)[1];
  assert.ok(block, `The ${name} step must exist`);
  return block.split(/\n {6}(?:- |#)/u)[0];
}

it('retains available ZAP reports after scanner and policy failures', () => {
  const collection = step('Collect available candidate diagnostics');
  assert.match(collection, /if: always\(\)/u);
  const script = collection.match(/run: \|\n((?: {10}.*\n?)+)/u)[1].replace(/^ {10}/gmu, '');
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-candidate-diagnostics-'));
  try {
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'docker'),
      `#!/usr/bin/env bash
if [[ " $* " != *" zap-baseline.py "* ]]; then exit 0; fi
for argument in "$@"; do
  if [[ "$argument" == *:/zap/wrk:rw ]]; then reports="\${argument%:/zap/wrk:rw}"; fi
done
printf '%s' "$ZAP_REPORT" > "$reports/zap.json"
if [ "$ZAP_HTML" = true ]; then printf '%s' 'Synthetic ZAP HTML' > "$reports/zap.html"; fi
exit "$SCAN_STATUS"
`,
      { mode: 0o755 },
    );
    writeFileSync(join(bin, 'curl'), '#!/usr/bin/env bash\nprintf synthetic\n', { mode: 0o755 });
    for (const [scannerStatus, risk, html, expectedStatus] of [
      [0, '0', true, 0],
      [1, '0', true, 1],
      [3, '0', false, 3],
      [0, '3', true, 1],
    ]) {
      const runner = join(directory, `runner-${scannerStatus}-${risk}`);
      const release = join(runner, 'release');
      const report = JSON.stringify({
        site: [{ '@name': 'http://localhost:3000', alerts: [{ riskcode: risk }] }],
      });
      mkdirSync(release, { recursive: true });
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: runner,
        SCAN_STATUS: String(scannerStatus),
        ZAP_REPORT: report,
        ZAP_HTML: String(html),
      };
      const scan = spawnSync('bash', [scanner, 'synthetic-image', join(runner, 'zap')], {
        encoding: 'utf8',
        env,
      });
      assert.equal(scan.status, expectedStatus, scan.stderr);
      const collected = spawnSync(
        'bash',
        ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script],
        {
          cwd: runner,
          encoding: 'utf8',
          env,
        },
      );
      assert.equal(collected.status, 0, collected.stderr);
      assert.equal(readFileSync(join(release, 'zap.json'), 'utf8'), report);
      if (html) assert.equal(readFileSync(join(release, 'zap.html'), 'utf8'), 'Synthetic ZAP HTML');
    }
    const noScan = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, RUNNER_TEMP: directory },
    });
    assert.equal(noScan.status, 0, 'An earlier failure may leave no ZAP report');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps per-attempt diagnostics separate from success-only verified candidate artifacts', () => {
  const diagnostics = step('Preserve candidate diagnostics');
  assert.match(diagnostics, /if: always\(\)/u);
  assert.match(diagnostics, /uses: actions\/upload-artifact@/u);
  assert.match(diagnostics, /name: release-candidate-diagnostics-\$\{\{ github.run_attempt \}\}/u);
  assert.match(diagnostics, /path: \|\n {12}release\n {12}!release\/image\.oci\.tar/u);
  assert.match(diagnostics, /if-no-files-found: warn/u);
  const verified = step('Preserve verified candidate');
  assert.match(verified, /if: success\(\) && steps\.restore\.outputs\.found != 'true'/u);
  assert.match(verified, /name: release-candidate\n/u);
  assert.doesNotMatch(candidate, /continue-on-error:\s*true/u);
});
