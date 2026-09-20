import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
  parseOperatorUpgradeNotes,
} from './operator-upgrade-notes.mjs';

const stableVersion = '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)';
const stableTagPattern = new RegExp(`^refs/tags/v${stableVersion}$`, 'u');
const fullVersionPattern = new RegExp(
  `^${stableVersion}(?:-preview\\.(?:0|[1-9]\\d*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
  'u',
);

export function createReleasePlan({ gitVersion, repository, commit, ref, eventName }) {
  if (eventName !== 'push' || (ref !== 'refs/heads/main' && !stableTagPattern.test(ref ?? ''))) {
    throw new Error('Release planning requires a push to main or a stable vX.Y.Z tag.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(repository ?? '')) {
    throw new Error('A valid GITHUB_REPOSITORY is required.');
  }
  if (!/^[a-f0-9]{40}$/u.test(commit ?? '') || gitVersion?.Sha !== commit) {
    throw new Error('GitVersion and the release must identify the same full source commit.');
  }
  const fullVersion = gitVersion.FullSemVer;
  if (typeof fullVersion !== 'string' || !fullVersionPattern.test(fullVersion)) {
    throw new Error('GitVersion must produce a valid stable or preview semantic version.');
  }
  const version = fullVersion.split('+')[0];
  const channel = ref === 'refs/heads/main' ? 'preview' : 'stable';
  if (
    gitVersion.SemVer !== version ||
    (channel === 'preview' && !version.includes('-preview.')) ||
    (channel === 'stable' && ref !== `refs/tags/v${version}`)
  ) {
    throw new Error('Calculated version does not match the release channel or stable tag.');
  }
  if (version.length > 128) throw new Error('Calculated version exceeds the container tag limit.');
  return {
    repository,
    commit,
    sourceRef: ref,
    channel,
    version,
    fullVersion,
    tag: `v${version}`,
    image: `ghcr.io/${repository.toLowerCase()}`,
    imageTags:
      channel === 'preview' ? [version, `sha-${commit.slice(0, 7)}`, `sha-${commit}`] : [version],
  };
}

export function validateReleasePlan(plan, context) {
  if (!plan || typeof plan !== 'object') throw new Error('Release plan is missing or malformed.');
  const expected = createReleasePlan({
    ...context,
    gitVersion: context.gitVersion ?? {
      Sha: plan.commit,
      SemVer: plan.version,
      FullSemVer: plan.fullVersion,
    },
  });
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(plan[key]) !== JSON.stringify(value)) {
      throw new Error(`Restored release plan conflicts with the release ${key}.`);
    }
  }
  return plan;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function writeCompatible(file, content) {
  try {
    fs.writeFileSync(file, content, { flag: 'wx' });
    return;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (fs.readFileSync(file, 'utf8') !== content) {
    throw new Error(`Existing release artifact conflicts with the source revision: ${file}`);
  }
}

export function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 2) {
    throw new Error('Usage: node scripts/release/plan.mjs <gitversion.json> <output-directory>');
  }
  const [gitVersionPath, outputDirectory] = args;
  const context = {
    repository: env.GITHUB_REPOSITORY,
    commit: env.GITHUB_SHA,
    ref: env.GITHUB_REF,
    eventName: env.GITHUB_EVENT_NAME,
  };
  const planPath = path.join(outputDirectory, 'plan.json');
  const restored = fs.existsSync(planPath);
  const preservedGitVersionPath = path.join(outputDirectory, 'gitversion.json');
  const gitVersionContent = fs.readFileSync(
    restored && fs.existsSync(preservedGitVersionPath) ? preservedGitVersionPath : gitVersionPath,
    'utf8',
  );
  context.gitVersion = JSON.parse(gitVersionContent);
  const plan = restored
    ? validateReleasePlan(JSON.parse(fs.readFileSync(planPath, 'utf8')), context)
    : createReleasePlan(context);

  if (git('rev-parse', '--is-shallow-repository') !== 'false') {
    throw new Error('Release planning requires full Git history and tags.');
  }
  if (git('rev-parse', 'HEAD') !== plan.commit) {
    throw new Error('Checked-out source does not match the release commit.');
  }
  if (plan.channel === 'stable') {
    if (git('rev-parse', `${context.ref}^{commit}`) !== plan.commit) {
      throw new Error('Stable Git tag does not match the release commit.');
    }
    try {
      git('merge-base', '--is-ancestor', plan.commit, 'refs/remotes/origin/main');
    } catch {
      throw new Error('Stable releases must reference a commit already approved on origin/main.');
    }
  }

  const sourceNotes = execFileSync(
    'git',
    ['show', `${plan.commit}:${DEFAULT_OPERATOR_UPGRADE_NOTES_PATH}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const notes = parseOperatorUpgradeNotes(sourceNotes).unreleased;
  fs.mkdirSync(outputDirectory, { recursive: true });
  writeCompatible(preservedGitVersionPath, gitVersionContent);
  writeCompatible(path.join(outputDirectory, 'operator-upgrade-notes.source.md'), sourceNotes);
  writeCompatible(
    path.join(outputDirectory, 'operator-upgrade-notes.md'),
    `${notes || 'No operator upgrade actions apply to this release.'}\n`,
  );
  if (!restored) {
    writeCompatible(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  }
  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      env.GITHUB_OUTPUT,
      ['version', 'tag', 'commit', 'channel', 'image']
        .map((key) => `${key}=${plan[key]}\n`)
        .join(''),
    );
  }
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(main(), null, 2));
  } catch (error) {
    console.error(`Release planning failed: ${error.message}`);
    process.exitCode = 1;
  }
}
