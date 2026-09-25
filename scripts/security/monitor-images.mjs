import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { containerPolicy } from './container-policy.mjs';

const imagePattern = /^ghcr\.io\/viscalyx\/skyttel@sha256:[a-f0-9]{64}$/u;
const marker = '<!-- skyttel-image-monitor:v1 -->';
const title = 'Production image security status';
const execute = promisify(execFile);

function requireState(condition) {
  if (!condition) throw new Error('Monitoring evidence unavailable');
}

function client(root, token, send) {
  return async (path, method = 'GET', body) => {
    const response = await send(`${root}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    requireState(response.ok);
    return response.status === 204 ? null : response.json();
  };
}

async function* pages(api, path) {
  for (let page = 1; page <= 100; page++) {
    const values = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    requireState(Array.isArray(values));
    yield* values;
    if (values.length < 100) return;
  }
  throw new Error('History exceeds safe pagination limit');
}

async function liveImage(render, serviceId) {
  const [service, records] = await Promise.all([
    render(`/services/${serviceId}`),
    render(`/services/${serviceId}/deploys?status=live&limit=2`),
  ]);
  const deploy = records[0]?.deploy;
  requireState(
    records.length === 1 &&
      imagePattern.test(deploy?.image?.ref) &&
      deploy?.status === 'live' &&
      deploy.image.ref.endsWith(`@${deploy.image.sha}`),
  );
  return { image: deploy.image.ref, savedMatches: service.imagePath === deploy.image.ref };
}

async function targets(github, current) {
  const selected = [];
  // The latest distinct accepted predecessor is retained for recovery. Failed
  // attempts, tags, newly built candidates and duplicate retries cannot select it.
  for await (const record of pages(github, '/deployments?environment=production')) {
    const states = [];
    for await (const state of pages(github, `/deployments/${record.id}/statuses`)) {
      states.push(state.state);
    }
    if (!['success', 'inactive'].includes(states[0]) || !states.includes('success')) continue;
    requireState(
      imagePattern.test(record.payload?.image) &&
        /^[a-f0-9]{40}$/u.test(record.sha) &&
        /^[0-9A-Za-z.+-]{1,160}$/u.test(record.payload.version) &&
        Number.isSafeInteger(record.id),
    );
    if (selected.some((target) => target.image === record.payload.image)) continue;
    if (selected.length === 0) requireState(record.payload.image === current);
    selected.push({
      role: selected.length === 0 ? 'running' : 'rollback',
      image: record.payload.image,
      commit: record.sha,
      version: record.payload.version,
      deployment: record.id,
    });
    if (selected.length === 2) break;
  }
  requireState(selected.length > 0);
  return selected;
}

/** Read the live image and its accepted deployment history without scanning or notifying. */
export async function observeDeployedImages({
  githubToken,
  renderToken,
  serviceId,
  fetch: send = globalThis.fetch,
}) {
  requireState(githubToken && renderToken && /^srv-[a-z0-9]+$/u.test(serviceId));
  const github = client('https://api.github.com/repos/viscalyx/skyttel', githubToken, send);
  const render = client('https://api.render.com/v1', renderToken, send);
  const current = await liveImage(render, serviceId);
  return { current, targets: await targets(github, current.image) };
}

function scanResult(target, evidence, exceptions, scannedAt, retainedImageIds) {
  const { report, sbom } = evidence;
  const manifest = target.image.split('@')[1];
  requireState(report.source?.target?.manifestDigest === manifest);
  const scanner = report.descriptor?.version;
  const inventory = sbom.creationInfo?.creators?.find((entry) => /^Tool: syft-/.test(entry));
  const database = report.descriptor?.db?.status;
  requireState(
    /^[0-9]+\.[0-9]+\.[0-9]+$/u.test(scanner) &&
      /^Tool: syft-[0-9]+\.[0-9]+\.[0-9]+$/u.test(inventory) &&
      /^[0-9]+(?:\.[0-9]+)*$/u.test(String(database?.schemaVersion)) &&
      Number.isFinite(Date.parse(database.built)),
  );
  requireState(exceptions.version === 1 && Array.isArray(exceptions.exceptions));
  const imageId = report.source.target.imageID;
  const policy = containerPolicy({
    report,
    sbom,
    imageId,
    // Validate every record before selecting this image's exceptions. A record
    // for the other retained image must still match a finding in its own scan.
    document: exceptions,
    retainedImageIds,
    now: Date.parse(scannedAt),
  });
  const findings = report.matches
    .filter((match) => ['High', 'Critical'].includes(match.vulnerability.severity))
    .map((match) =>
      createHash('sha256')
        .update(
          JSON.stringify([
            match.vulnerability.id,
            match.artifact.name,
            match.artifact.version,
            match.artifact.type,
          ]),
        )
        .digest('hex'),
    )
    .sort();
  return {
    ...target,
    scannedAt,
    imageId,
    scanner: `grype-${scanner}`,
    inventory: inventory.slice(6),
    database: {
      schemaVersion: String(database.schemaVersion),
      built: new Date(database.built).toISOString(),
    },
    policy: policy.outcome,
    reason: policy.reason,
    findings,
  };
}

/** External scanner boundary. Raw output stays in private runner temporary files. */
export async function scanImage(image) {
  const options = {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
    timeout: 10 * 60_000,
    env: { ...process.env, GRYPE_DB_REQUIRE_UPDATE_CHECK: 'true' },
  };
  const inventory = await execute(
    'syft',
    [`registry:${image}`, '-o', 'spdx-json', '--quiet'],
    options,
  );
  const vulnerabilities = await execute(
    'grype',
    [`registry:${image}`, '--config', '.github/grype.yaml', '-o', 'json', '--quiet'],
    options,
  );
  return { sbom: JSON.parse(inventory.stdout), report: JSON.parse(vulnerabilities.stdout) };
}

function issueBody(report, recipient, runUrl) {
  const state = createHash('sha256')
    .update(
      JSON.stringify([
        report.status,
        report.targets.map((target) => [target.image, target.policy, target.findings]),
      ]),
    )
    .digest('hex');
  return [
    marker,
    `<!-- state:${state} -->`,
    `@${recipient}: image security status is **${report.status}**.`,
    '',
    `Checked: ${report.checkedAt}. [Verification run](${runUrl}).`,
    '',
    ...report.targets.map(
      (target) => `- ${target.role}: \`${target.image}\` — **${target.policy}**.`,
    ),
    '',
    'Review the sanitized evidence artifact. Investigate findings privately.',
    'Unknown status does not clear earlier findings. No image was changed.',
    'A fix requires a verified release deployed by digest or a valid reviewed exception.',
    'Do not post credentials, household data, package findings or exploit details here.',
  ].join('\n');
}

async function notify(github, report, recipient, runUrl, verifyNotification) {
  requireState(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/u.test(recipient));
  // Validate assignee permission even on a clean run; a configured but undeliverable
  // alarm must not masquerade as healthy monitoring.
  await github(`/assignees/${recipient}`);
  const issues = [];
  for await (const issue of pages(github, '/issues?state=all&creator=github-actions%5Bbot%5D')) {
    if (!issue.pull_request && issue.body?.startsWith(marker)) issues.push(issue);
  }
  requireState(issues.length <= 1);
  const previous = issues[0];
  if (!previous && report.status === 'passed' && !verifyNotification) return 'not-needed';
  const body = issueBody(report, recipient, runUrl);
  let issue = previous;
  if (!issue) {
    issue = await github('/issues', 'POST', { title, body, assignees: [recipient] });
  } else {
    issue = await github(`/issues/${issue.number}`, 'PATCH', {
      title,
      body,
      assignees: [recipient],
      state: report.status === 'passed' && !verifyNotification ? 'closed' : 'open',
    });
    const previousState = previous.body.match(/<!-- state:([a-f0-9]{64}) -->/u)?.[1];
    const nextState = body.match(/<!-- state:([a-f0-9]{64}) -->/u)?.[1];
    if (previousState !== nextState && report.status !== 'passed') {
      await github(`/issues/${issue.number}/comments`, 'POST', {
        body: `@${recipient}: image security status changed to **${report.status}**. [Review this run](${runUrl}). Details stay private.`,
      });
    }
  }
  requireState(
    Number.isSafeInteger(issue.number) &&
      issue.assignees?.some((user) => user.login.toLowerCase() === recipient.toLowerCase()),
  );
  if (verifyNotification) {
    await github(`/issues/${issue.number}/comments`, 'POST', {
      body: `@${recipient}: controlled notification delivery check. Confirm receipt through the private operator record. [Verification run](${runUrl}). No synthetic vulnerability is being reported.`,
    });
  }
  // API acceptance is not proof that the operator received email or a push.
  return 'accepted-by-github';
}

/** Observe deployed images, scan them, and reconcile one sanitized status issue. */
export async function monitorImages({
  githubToken,
  renderToken,
  serviceId,
  recipient,
  runUrl,
  exceptions,
  verifyNotification = false,
  fetch: send = globalThis.fetch,
  scan = scanImage,
  now = () => new Date().toISOString(),
}) {
  const report = {
    version: 1,
    checkedAt: now(),
    status: 'unknown',
    targets: [],
    notification: 'failed',
  };
  const github = client('https://api.github.com/repos/viscalyx/skyttel', githubToken, send);
  const render = client('https://api.render.com/v1', renderToken, send);
  try {
    requireState(githubToken && renderToken && /^srv-[a-z0-9]+$/u.test(serviceId));
    requireState(/^https:\/\/github\.com\/viscalyx\/skyttel\/actions\/runs\/[0-9]+$/u.test(runUrl));
    const { current, targets: selected } = await observeDeployedImages({
      githubToken,
      renderToken,
      serviceId,
      fetch: send,
    });
    const scans = [];
    for (const target of selected) {
      try {
        scans.push({ evidence: await scan(target.image), scannedAt: now() });
      } catch {
        scans.push({ evidence: undefined, scannedAt: now() });
      }
    }
    const retainedImageIds = scans.map((entry) => entry.evidence?.report?.source?.target?.imageID);
    for (const [index, target] of selected.entries()) {
      const { evidence, scannedAt } = scans[index];
      try {
        report.targets.push(scanResult(target, evidence, exceptions, scannedAt, retainedImageIds));
      } catch {
        report.targets.push({
          ...target,
          scannedAt,
          policy: 'unknown',
          reason: 'scan_evidence_unavailable',
        });
      }
    }
    const after = await liveImage(render, serviceId);
    requireState(after.image === current.image && current.savedMatches && after.savedMatches);
    report.status = report.targets.some((target) => target.policy === 'unknown')
      ? 'unknown'
      : report.targets.some((target) => target.policy === 'blocked')
        ? 'blocked'
        : 'passed';
  } catch {
    report.reason = 'deployment_evidence_unavailable';
  }
  try {
    requireState(/^https:\/\/github\.com\/viscalyx\/skyttel\/actions\/runs\/[0-9]+$/u.test(runUrl));
    report.notification = await notify(github, report, recipient, runUrl, verifyNotification);
  } catch {
    report.notification = 'failed';
    report.status = 'unknown';
  }
  return report;
}

async function main(env = process.env) {
  requireState(
    env.GITHUB_REPOSITORY === 'viscalyx/skyttel' && env.GITHUB_REF === 'refs/heads/main',
  );
  const directory = env.MONITOR_DIRECTORY ?? 'monitoring';
  await mkdir(directory, { recursive: true });
  let exceptions;
  try {
    exceptions = JSON.parse(await readFile('.github/security-exceptions.json', 'utf8'));
  } catch {
    // Missing mandatory policy input is handled as unknown for every target.
  }
  const report = await monitorImages({
    githubToken: env.GH_TOKEN,
    renderToken: env.RENDER_API_KEY,
    serviceId: env.RENDER_SERVICE_ID,
    recipient: env.SECURITY_MONITOR_RECIPIENT,
    runUrl: `https://github.com/viscalyx/skyttel/actions/runs/${env.GITHUB_RUN_ID}`,
    exceptions,
    verifyNotification: env.VERIFY_NOTIFICATION === 'true',
    scan:
      env.SCAN_PREREQUISITES_OK === 'true'
        ? scanImage
        : async () => {
            throw new Error('Required setup did not succeed');
          },
  });
  await writeFile(join(directory, 'status.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      `Image security: **${report.status}**. Alarm: **${report.notification}**.\n\nRead the sanitized status artifact; a report older than 36 hours means unknown current status.\n`,
    );
  if (report.status !== 'passed' || report.notification === 'failed') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(
      '::error::Image monitoring failed; status is unknown. Check workflow configuration and notifications.',
    );
    process.exitCode = 1;
  });
}
