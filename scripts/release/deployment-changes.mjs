import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isProductionInput } from './production-inputs.mjs';

export function deploymentChanges({ before, after, ref, eventName }, cwd = process.cwd()) {
  if (eventName !== 'push' || ref !== 'refs/heads/main') return [];
  if (![before, after].every((sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/u.test(sha)))
    throw new Error('Cannot determine production changes without both push revisions.');
  const args =
    before === '0'.repeat(40)
      ? ['ls-tree', '-r', '--name-only', '-z', after]
      : ['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', before, after, '--'];
  // Full local history avoids truncation of changed-file lists from API responses.
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)
    .filter(isProductionInput);
}

export function main(env = process.env) {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const paths = deploymentChanges({
    before: event.before,
    after: env.GITHUB_SHA,
    ref: env.GITHUB_REF,
    eventName: env.GITHUB_EVENT_NAME,
  });
  const deploy = paths.length > 0;
  appendFileSync(env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
  const message = deploy
    ? 'Render deployment required: this push changes production inputs.'
    : 'Render deployment skipped: no production input changes in this push. Build and publication continue.';
  console.log(message);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${message}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
