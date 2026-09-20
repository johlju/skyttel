import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, copyFile, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const preservationSteps = {
  'release-plan': 'Preserve release plan',
  'release-candidate': 'Preserve verified candidate',
  'release-evidence': 'Preserve signed release evidence',
};

export function findRetryArtifact(artifacts, jobs, name) {
  assert.ok(preservationSteps[name], 'Unknown release artifact');
  const matches = artifacts.filter((artifact) => artifact.name === name);
  assert.ok(matches.length <= 1, 'Conflicting retry artifacts');
  if (matches.length) {
    assert.equal(
      matches[0].expired,
      false,
      'Verified retry artifact expired; do not rebuild this version',
    );
    return matches[0];
  }
  const preserved = jobs.some((job) =>
    job.steps?.some(
      (step) => step.name === preservationSteps[name] && step.conclusion === 'success',
    ),
  );
  assert.equal(
    preserved,
    false,
    'Previously preserved release artifact is missing; do not rebuild',
  );
}

async function hash(path) {
  const value = createHash('sha256');
  for await (const bytes of createReadStream(path)) value.update(bytes);
  return value.digest('hex');
}

async function merge(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await merge(from, to);
    else {
      const exists = await stat(to).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
      if (exists)
        assert.equal(await hash(from), await hash(to), `Conflict restoring ${entry.name}`);
      else await copyFile(from, to);
    }
  }
}

async function main() {
  const [name, directory] = process.argv.slice(2);
  assert.ok(name && directory, 'Usage: restore.mjs <artifact name> <directory>');
  assert.match(process.env.GITHUB_RUN_ID ?? '', /^\d+$/u);
  const pages = JSON.parse(
    execFileSync(
      'gh',
      [
        'api',
        '--paginate',
        '--slurp',
        `repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/artifacts?per_page=100`,
      ],
      { encoding: 'utf8' },
    ),
  );
  const jobs = JSON.parse(
    execFileSync(
      'gh',
      [
        'api',
        '--paginate',
        '--slurp',
        `repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/jobs?filter=all&per_page=100`,
      ],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    ),
  ).flatMap((page) => page.jobs);
  const artifact = findRetryArtifact(
    pages.flatMap((page) => page.artifacts),
    jobs,
    name,
  );
  if (artifact) {
    const temporary = await mkdtemp(join(tmpdir(), 'skyttel-release-'));
    try {
      execFileSync(
        'gh',
        [
          'run',
          'download',
          process.env.GITHUB_RUN_ID,
          '--repo',
          process.env.GITHUB_REPOSITORY,
          '--name',
          name,
          '--dir',
          temporary,
        ],
        { stdio: 'inherit' },
      );
      await merge(temporary, directory);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  await appendFile(process.env.GITHUB_OUTPUT, `found=${Boolean(artifact)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
