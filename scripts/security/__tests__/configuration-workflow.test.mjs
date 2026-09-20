import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';

it('rejects Trivy execution and parser errors before accepting its report', () => {
  const workflow = readFileSync('.github/workflows/security.yml', 'utf8');
  const step = workflow.match(
    /- name: Scan configuration and reject parser errors\n {8}run: \|\n((?: {10}.*\n)+)/u,
  );
  assert.ok(step, 'The configuration scan step must exist');
  const script = step[1].replace(/^ {10}/gmu, '');
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-trivy-workflow-'));
  try {
    for (const [log, scannerStatus, expectedStatus] of [
      ['ERROR: parsing failed', 0, 1],
      ['', 0, 0],
      ['WARN: informational warning', 0, 0],
      ['', 1, 1],
    ]) {
      const result = spawnSync(
        'bash',
        [
          '--noprofile',
          '--norc',
          '-eo',
          'pipefail',
          '-c',
          `trivy() { printf '%s\\n' "$SCAN_LOG" >&2; return "$SCAN_STATUS"; }
node() { echo report-checked; }
${script}`,
        ],
        {
          cwd: directory,
          encoding: 'utf8',
          env: { ...process.env, SCAN_LOG: log, SCAN_STATUS: String(scannerStatus) },
        },
      );
      assert.equal(result.status, expectedStatus, JSON.stringify({ log, scannerStatus }));
      assert.equal(result.stdout.includes('report-checked'), expectedStatus === 0);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
