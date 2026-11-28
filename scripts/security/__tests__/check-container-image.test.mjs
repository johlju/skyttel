import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const config = '{}';
const imageId = digest(config);
const manifest = JSON.stringify({ config: { digest: imageId } });
const manifestDigest = digest(manifest);
const upstream = `registry.example/base@${manifestDigest}`;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-image-gate-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (file, contents) => writeFileSync(join(directory, file), contents);
  write('registry-manifest.json', manifest);
  write('manifest.json', JSON.stringify([{ Config: 'config.json' }]));
  write('config.json', config);
  const executable = (file, script) =>
    writeFileSync(join(directory, file), `#!/usr/bin/env bash\nset -euo pipefail\n${script}\n`, {
      mode: 0o700,
    });
  executable(
    'docker',
    `printf '%s\\n' "$*" >> "$FIXTURE/docker.log"
case "$*" in
  "buildx imagetools inspect --raw $UPSTREAM") cat "$FIXTURE/registry-manifest.json" ;;
  "image inspect "*) printf '%s\\n' "$DOCKER_ID" ;;
  "image save --output "*" $DOCKER_ID")
    tar -cf "$4" -C "$FIXTURE" manifest.json config.json ;;
  *) exit 42 ;;
esac`,
  );
  executable(
    'syft',
    `case "$1" in
  "registry:$UPSTREAM") ;;
  docker-archive:*) test -f "\${1#docker-archive:}" ;;
  *) exit 42 ;;
esac
cat "$FIXTURE/sbom.json"`,
  );
  executable(
    'grype',
    `test "$GRYPE_DB_REQUIRE_UPDATE_CHECK" = true
test "$2 $3" = '--config .github/grype.yaml'
test "$4" = '--only-fixed=false'
cat "$FIXTURE/grype.json"`,
  );

  const report = {
    source: {
      type: 'image',
      target: { imageID: imageId, manifestDigest, os: 'linux', architecture: 'amd64' },
    },
    descriptor: {
      name: 'grype',
      db: { status: { valid: true, built: new Date(Date.now() - 1000).toISOString() } },
    },
    matches: [],
  };
  const evidence = join(directory, 'evidence');
  return {
    run({ mode = '--local', image = 'built-image', change = () => {} } = {}) {
      change(report);
      write('grype.json', JSON.stringify(report));
      write(
        'sbom.json',
        JSON.stringify({
          spdxVersion: 'SPDX-2.3',
          creationInfo: { creators: ['Tool: syft-fixture'] },
          packages: [
            {
              primaryPackagePurpose: 'CONTAINER',
              versionInfo: report.source.target.manifestDigest,
            },
          ],
        }),
      );
      return spawnSync(
        'bash',
        ['scripts/security/check-container-image.sh', mode, image, evidence],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            FIXTURE: directory,
            DOCKER_ID: manifestDigest,
            UPSTREAM: upstream,
          },
        },
      );
    },
    read: (file) => readFileSync(join(evidence, file), 'utf8'),
    dockerCalls: () => readFileSync(join(directory, 'docker.log'), 'utf8'),
  };
}

test('checks one exported image by immutable ID and refuses to reuse evidence', (t) => {
  const check = fixture(t);
  const result = check.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(check.dockerCalls(), new RegExp(`image save --output .* ${manifestDigest}`));
  assert.equal(check.read('image-id.txt').trim(), imageId);
  assert.match(check.read('policy.log'), /Security policy passed/);
  assert.notEqual(check.run().status, 0);
});

test('retains evidence for a blocked upstream image even when the finding has no fix', (t) => {
  const check = fixture(t);
  const result = check.run({
    mode: '--upstream',
    image: upstream,
    change(report) {
      report.matches.push({
        vulnerability: { id: 'CVE-test', severity: 'High', fix: { versions: [] } },
        artifact: { name: 'test-package', version: '1', type: 'apk' },
      });
    },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(check.dockerCalls(), `buildx imagetools inspect --raw ${upstream}\n`);
  assert.equal(check.read('image-reference.txt').trim(), upstream);
  assert.match(check.read('policy.log'), /blocked: high_critical/);
  assert.equal(JSON.parse(check.read('grype.json')).matches.length, 1);
});

test('rejects an upstream scan bound to a different manifest', (t) => {
  const check = fixture(t);
  const result = check.run({
    mode: '--upstream',
    image: upstream,
    change(report) {
      report.source.target.manifestDigest = `sha256:${'c'.repeat(64)}`;
    },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /manifest does not match/);
  assert.throws(() => check.read('policy.log'), { code: 'ENOENT' });
});
