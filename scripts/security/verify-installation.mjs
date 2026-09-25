import { pathToFileURL } from 'node:url';
import { fromBuffer } from 'yauzl';
import { observeDeployedImages } from './monitor-images.mjs';

const repository = 'https://api.github.com/repos/viscalyx/skyttel';
const workflowPath = '.github/workflows/image-monitor.yml';
const freshness = 36 * 60 * 60 * 1_000;
const maximumArtifactSize = 2 * 1024 * 1024;

class VerificationError extends Error {}

function requireState(condition, code) {
  if (!condition) throw new VerificationError(code);
}

function fresh(value, now) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now && now - time <= freshness;
}

async function limitedBody(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    requireState(size <= maximumArtifactSize, 'artifact_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function readStatusArchive(bytes) {
  return new Promise((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      let status;
      const fail = (failure) => {
        archive.close();
        reject(failure);
      };
      archive.on('error', fail);
      archive.on('end', () => {
        archive.close();
        if (!status) reject(new VerificationError('missing_status'));
        else resolve(status);
      });
      archive.on('entry', (entry) => {
        if (
          entry.fileName !== 'status.json' ||
          status ||
          entry.uncompressedSize > maximumArtifactSize
        ) {
          fail(new VerificationError('invalid_status_archive'));
          return;
        }
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError) return fail(streamError);
          const chunks = [];
          stream.on('error', fail);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            try {
              status = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              archive.readEntry();
            } catch (parseError) {
              fail(parseError);
            }
          });
        });
      });
      archive.readEntry();
    });
  });
}

/** Verify existing live evidence using GET only; never scan, deploy or send an alert. */
export async function verifyInstallation({
  origin,
  githubToken,
  renderToken,
  serviceId,
  fetch: send = globalThis.fetch,
  now = () => new Date().toISOString(),
}) {
  const report = {
    outcome: 'failure',
    checkedAt: now(),
    checks: [],
    humanNotification: 'unverified',
  };
  const timestamp = Date.parse(report.checkedAt);
  async function request(address, token, redirect = 'error') {
    return send(address, {
      method: 'GET',
      redirect,
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }
  async function json(address, token) {
    const response = await request(address, token);
    requireState(response.ok, 'http_request_failed');
    return response.json();
  }
  const github = (path) => json(`${repository}${path}`, githubToken);
  const observe = () => observeDeployedImages({ githubToken, renderToken, serviceId, fetch: send });
  const runs = (query = '') =>
    github(`/actions/workflows/image-monitor.yml/runs?branch=main&per_page=1${query}`);
  function validateRun(run, scheduled = false) {
    requireState(
      Number.isSafeInteger(run?.id) &&
        run.head_branch === 'main' &&
        run.path === workflowPath &&
        /^[a-f0-9]{40}$/u.test(run.head_sha) &&
        run.repository?.full_name === 'viscalyx/skyttel' &&
        run.head_repository?.full_name === 'viscalyx/skyttel' &&
        ['schedule', 'workflow_dispatch'].includes(run.event),
      'invalid_workflow_run',
    );
    requireState(!scheduled || run.event === 'schedule', 'scheduled_run_missing');
    requireState(
      run.status === 'completed' && run.conclusion === 'success',
      'workflow_not_successful',
    );
    requireState(fresh(run.created_at, timestamp), 'stale_workflow_run');
  }
  try {
    requireState(Boolean(githubToken && renderToken), 'missing_credentials');
    const address = new URL(origin);
    requireState(
      address.protocol === 'https:' && address.origin === origin,
      'invalid_https_origin',
    );
    const workflow = await github('/actions/workflows/image-monitor.yml');
    requireState(
      workflow.state === 'active' && workflow.path === workflowPath,
      'workflow_disabled',
    );
    const latest = (await runs()).workflow_runs?.[0];
    const scheduled = (await runs('&event=schedule')).workflow_runs?.[0];
    validateRun(latest);
    validateRun(scheduled, true);
    report.latestRun = latest.id;
    report.scheduledRun = scheduled.id;
    report.checks.push('active-workflow', 'recent-successful-scheduled-run', 'latest-run-success');

    const artifacts = await github(`/actions/runs/${latest.id}/artifacts?per_page=100`);
    requireState(
      artifacts.total_count <= 100 && Array.isArray(artifacts.artifacts),
      'invalid_artifact_list',
    );
    const matches = artifacts.artifacts.filter((item) => item.name === 'deployed-image-security');
    requireState(matches.length === 1, 'missing_or_duplicate_artifact');
    const artifact = matches[0];
    requireState(
      Number.isSafeInteger(artifact.id) &&
        artifact.expired === false &&
        artifact.size_in_bytes <= maximumArtifactSize &&
        artifact.workflow_run?.id === latest.id &&
        artifact.workflow_run?.head_sha === latest.head_sha &&
        artifact.workflow_run?.head_branch === 'main',
      'invalid_artifact_identity',
    );
    const download = await request(
      `${repository}/actions/artifacts/${artifact.id}/zip`,
      githubToken,
      'manual',
    );
    requireState(download.status === 302, 'artifact_download_unavailable');
    const location = new URL(download.headers.get('location'));
    requireState(
      location.protocol === 'https:' && !location.username && !location.password,
      'invalid_artifact_location',
    );
    // Signed artifact downloads use a separate host and must not receive the GitHub token.
    const archive = await request(location.href);
    requireState(archive.ok, 'artifact_download_failed');
    const status = await readStatusArchive(await limitedBody(archive));
    requireState(
      status.version === 1 &&
        status.status === 'passed' &&
        ['not-needed', 'accepted-by-github'].includes(status.notification),
      'monitoring_not_passed',
    );
    requireState(
      fresh(status.checkedAt, timestamp) &&
        Date.parse(status.checkedAt) >= Date.parse(latest.created_at) &&
        Date.parse(status.checkedAt) <= Date.parse(latest.updated_at),
      'stale_or_unbound_status',
    );
    const before = await observe();
    requireState(before.current.savedMatches, 'saved_image_drift');
    requireState(
      Array.isArray(status.targets) &&
        status.targets.length === before.targets.length &&
        before.targets.every((target, index) => {
          const scanned = status.targets[index];
          return (
            ['role', 'image', 'commit', 'version', 'deployment'].every(
              (key) => scanned?.[key] === target[key],
            ) &&
            scanned.policy === 'passed' &&
            fresh(scanned.scannedAt, timestamp) &&
            Date.parse(scanned.scannedAt) >= Date.parse(status.checkedAt) &&
            Date.parse(scanned.scannedAt) <= Date.parse(latest.updated_at)
          );
        }),
      'monitored_images_mismatch',
    );
    report.checks.push('fresh-monitoring-artifact', 'running-and-rollback-images');

    const health = await json(`${origin}/healthz`);
    requireState(health.status === 'ok', 'health_failed');
    const version = await json(`${origin}/api/version`);
    requireState(
      version.commit === before.targets[0].commit &&
        version.version === before.targets[0].version &&
        version.database?.status === 'ready' &&
        Number.isSafeInteger(version.database.schemaVersion) &&
        /^[a-f0-9]{64}$/u.test(version.database.schemaChecksum),
      'application_identity_mismatch',
    );
    const bootstrap = await json(`${origin}/api/bootstrap`);
    requireState(
      bootstrap.status === 'anonymous' &&
        bootstrap.providers?.includes('google') &&
        bootstrap.providers?.includes('microsoft'),
      'provider_availability_failed',
    );
    const page = await request(origin);
    requireState(page.ok && (await page.text()).includes('<html'), 'application_page_failed');
    report.checks.push('https-health', 'application-version', 'database-ready', 'sign-in-page');

    const after = await observe();
    requireState(JSON.stringify(after) === JSON.stringify(before), 'deployment_changed');
    const finalRun = (await runs()).workflow_runs?.[0];
    validateRun(finalRun);
    requireState(
      finalRun.id === latest.id && finalRun.run_attempt === latest.run_attempt,
      'monitoring_changed',
    );
    report.targets = before.targets;
    report.outcome = 'success';
  } catch (error) {
    report.reason = error instanceof VerificationError ? error.message : 'evidence_unavailable';
  }
  return report;
}

async function main() {
  const report = await verifyInstallation({
    origin: process.env.SKYTTEL_ORIGIN,
    githubToken: process.env.GH_TOKEN,
    renderToken: process.env.RENDER_API_KEY,
    serviceId: process.env.RENDER_SERVICE_ID,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.outcome !== 'success') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Installation evidence unavailable. No live result was verified.');
    process.exitCode = 1;
  });
}
