import { execFileSync } from 'node:child_process';

// Run only from a maintainer's trusted checkout, never with PR credentials.
const repository = 'repos/viscalyx/skyttel';
function api(path, body) {
  const args = ['api', `${repository}${path}`];
  if (body) args.push('--method', path.startsWith('/rulesets/') ? 'PUT' : 'PATCH', '--input', '-');
  return JSON.parse(
    execFileSync('gh', args, { encoding: 'utf8', input: body && JSON.stringify(body) }),
  );
}

const apply = process.argv[2] === '--apply';
if (process.argv.length > (apply ? 3 : 2))
  throw new Error('Usage: repository-settings.mjs [--apply]');
let settings = api('');
const summaries = api('/rulesets');
const summary = summaries.find((item) => item.name === 'main' && item.source_type === 'Repository');
if (!summary) throw new Error('Expected existing repository ruleset named main');
let ruleset = api(`/rulesets/${summary.id}`);
if (apply) {
  settings = api('', {
    allow_auto_merge: false,
    security_and_analysis: {
      secret_scanning: { status: 'enabled' },
      secret_scanning_push_protection: { status: 'enabled' },
    },
  });
  const rules = ruleset.rules.filter((rule) => rule.type !== 'required_status_checks');
  const pullRequest = rules.find((rule) => rule.type === 'pull_request');
  if (!pullRequest) throw new Error('Expected an existing pull request rule');
  // A sole maintainer accepts by manually merging; self-approval is unavailable.
  pullRequest.parameters.required_approving_review_count = 0;
  const existing = ruleset.rules.find((rule) => rule.type === 'required_status_checks');
  const checks = existing?.parameters.required_status_checks ?? [];
  for (const context of ['application', 'security-gate']) {
    const check = checks.find((item) => item.context === context);
    if (check) check.integration_id = 15368;
    else checks.push({ context, integration_id: 15368 });
  }
  rules.push({
    type: 'required_status_checks',
    parameters: {
      strict_required_status_checks_policy: true,
      do_not_enforce_on_create: false,
      required_status_checks: checks,
    },
  });
  ruleset = api(`/rulesets/${summary.id}`, {
    name: ruleset.name,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: ruleset.conditions,
    rules,
  });
  settings = api('');
}

const failures = [];
if (settings.allow_auto_merge !== false) failures.push('Automatic merging is enabled');
for (const feature of ['secret_scanning', 'secret_scanning_push_protection']) {
  if (settings.security_and_analysis?.[feature]?.status !== 'enabled')
    failures.push(`${feature} is disabled`);
}
if (ruleset.enforcement !== 'active' || ruleset.bypass_actors.length !== 0) {
  failures.push('The main ruleset must be active without bypass actors');
}
if (
  !ruleset.conditions.ref_name.include.includes('~DEFAULT_BRANCH') ||
  ruleset.conditions.ref_name.exclude.length
) {
  failures.push('The ruleset must cover the default branch without exclusions');
}
if (!ruleset.rules.some((rule) => rule.type === 'pull_request'))
  failures.push('Pull requests are required');
const required = ruleset.rules.find((rule) => rule.type === 'required_status_checks')?.parameters;
if (!required?.strict_required_status_checks_policy)
  failures.push('Checks must be current with main');
for (const context of ['application', 'security-gate']) {
  if (
    !required?.required_status_checks.some(
      (check) => check.context === context && check.integration_id === 15368,
    )
  ) {
    failures.push(`Missing required GitHub Actions check: ${context}`);
  }
}
if (failures.length) throw new Error(failures.join('\n'));
console.log('Repository security settings verified');
