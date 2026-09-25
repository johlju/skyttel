import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { validateReleasePlan } from './plan.mjs';

const active = new Set([
  'created',
  'queued',
  'build_in_progress',
  'pre_deploy_in_progress',
  'update_in_progress',
]);
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const imagePattern = /^ghcr\.io\/viscalyx\/skyttel@sha256:[a-f0-9]{64}$/u;

function requireState(condition, code) {
  if (!condition) throw new DeploymentError(code);
}

class DeploymentError extends Error {}

function serviceConfigurationFailures(service) {
  const details = service.serviceDetails;
  // Do not copy arbitrary API strings, especially command overrides, into evidence.
  const observed = (value) => {
    if (value === undefined || value === null) return 'missing';
    if (typeof value === 'boolean') return value;
    if (Number.isSafeInteger(value) && value >= 0 && value <= 10_000) return value;
    if (
      [
        'web_service',
        'not_suspended',
        'suspended',
        'image',
        'docker',
        '/data',
        '/healthz',
      ].includes(value)
    )
      return value;
    return 'unexpected value (redacted)';
  };
  // Image-backed services require explicit deploys; Render's autoDeploy field
  // does not control them: https://render.com/docs/deploys#automatic-deploys
  const checks = [
    ['type', service.type, 'web_service'],
    ['suspended', service.suspended, 'not_suspended'],
    ['serviceDetails.runtime', details?.runtime, 'image'],
    ['serviceDetails.numInstances', details?.numInstances, 1],
    ['serviceDetails.autoscaling.enabled', Boolean(details?.autoscaling?.enabled), false],
    ['serviceDetails.disk.mountPath', details?.disk?.mountPath, '/data'],
    ['serviceDetails.healthCheckPath', details?.healthCheckPath, '/healthz'],
    [
      'serviceDetails.envSpecificDetails.dockerCommand configured',
      Boolean(details?.envSpecificDetails?.dockerCommand),
      false,
    ],
    [
      'serviceDetails.envSpecificDetails.preDeployCommand configured',
      Boolean(details?.envSpecificDetails?.preDeployCommand),
      false,
    ],
    ['imagePath matches Skyttel digest reference', imagePattern.test(service.imagePath), true],
  ];
  return checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(([field, actual, expected]) => ({ field, expected, observed: observed(actual) }));
}

export function deploymentFailureLog(report) {
  return [
    `::error::Render deployment failed: ${report.failure}. Inspect app and database evidence before retry; no automatic rollback was attempted.`,
    ...(report.configurationFailures ?? []).map(
      ({ field, expected, observed }) =>
        `::error::Render preflight: ${field}: expected ${JSON.stringify(expected)}, observed ${JSON.stringify(observed)}. No deployment was requested.`,
    ),
  ].join('\n');
}

function observedDeployId(value) {
  if (typeof value !== 'string' || !/^dep-[a-z0-9]{1,64}$/u.test(value)) return null;
  return value;
}

// Only allowlisted, non-household fields may enter public deployment evidence.
function observedIdentity(value) {
  if (
    !value ||
    !/^[a-f0-9]{40}$/u.test(value.commit) ||
    !/^[0-9A-Za-z.+-]{1,160}$/u.test(value.version) ||
    !Number.isSafeInteger(value.database?.schemaVersion) ||
    !/^[a-f0-9]{64}$/u.test(value.database?.schemaChecksum)
  )
    return null;
  return {
    version: value.version,
    commit: value.commit,
    database: {
      status: value.database.status === 'ready' ? 'ready' : 'unknown',
      schemaVersion: value.database.schemaVersion,
      schemaChecksum: value.database.schemaChecksum,
    },
  };
}

/** Deploy one approved main release. HTTP and time are the external boundaries. */
export async function deployRelease({
  identity,
  serviceId,
  origin,
  githubToken,
  renderToken,
  fetch: send = globalThis.fetch,
  sleep = delay,
  attempts = 120,
}) {
  const report = {
    outcome: 'failure',
    requested: {
      version: identity.fullVersion,
      commit: identity.commit,
      digest: identity.digest,
    },
    checks: [],
    database: 'unknown',
  };
  const servicePath = `/services/${serviceId}`;
  let deploymentId;
  async function http(url, token, method = 'GET', body) {
    const response = await send(url, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    requireState(response.ok, 'http_request_failed');
    return response;
  }
  const render = async (path, method, body) =>
    (await http(`https://api.render.com/v1${path}`, renderToken, method, body)).json();
  const github = async (path, method, body) =>
    (
      await http(`https://api.github.com/repos/viscalyx/skyttel${path}`, githubToken, method, body)
    ).json();
  const application = async (path) => (await http(`${origin}${path}`)).json();
  const latest = async () => {
    const list = await render(`${servicePath}/deploys?limit=1`);
    return list[0]?.deploy;
  };
  const status = async (state) => {
    if (deploymentId)
      await github(`/deployments/${deploymentId}/statuses`, 'POST', {
        state,
        environment: 'production',
        auto_inactive: state === 'success',
        description:
          state === 'success'
            ? 'Digest, readiness and smoke checks verified'
            : state === 'failure'
              ? 'Inspect deployment evidence and database before retry'
              : 'Verifying Render deployment',
      });
  };
  const snapshot = async () => {
    const [service, deploy, version, health] = await Promise.allSettled([
      render(servicePath),
      latest(),
      application('/api/version'),
      application('/healthz'),
    ]);
    report.savedImage =
      service.status === 'fulfilled' && imagePattern.test(service.value.imagePath)
        ? service.value.imagePath
        : null;
    report.observedDeploy =
      deploy.status === 'fulfilled' && deploy.value
        ? {
            id: observedDeployId(deploy.value.id),
            status: [
              ...active,
              'live',
              'deactivated',
              'build_failed',
              'update_failed',
              'pre_deploy_failed',
              'canceled',
            ].includes(deploy.value.status)
              ? deploy.value.status
              : 'unknown',
            digest: digestPattern.test(deploy.value.image?.sha) ? deploy.value.image.sha : null,
          }
        : null;
    report.application = version.status === 'fulfilled' ? observedIdentity(version.value) : null;
    report.database = report.application?.database.status ?? 'unknown';
    report.health =
      health.status === 'fulfilled' && health.value.status === 'ok' ? 'ok' : 'unknown';
  };
  try {
    validateReleasePlan(identity, {
      repository: 'viscalyx/skyttel',
      commit: identity.commit,
      ref: 'refs/heads/main',
      eventName: 'push',
    });
    requireState(digestPattern.test(identity.digest), 'invalid_digest');
    requireState(/^srv-[a-z0-9]+$/u.test(serviceId), 'invalid_service');
    requireState(
      new URL(origin).origin === origin && origin.startsWith('https://'),
      'invalid_origin',
    );
    requireState(Boolean(githubToken && renderToken), 'missing_credentials');
    const currentMain = async () => (await github('/git/ref/heads/main')).object.sha;
    if ((await currentMain()) !== identity.commit) {
      report.outcome = 'superseded';
      return report;
    }
    let service = await render(servicePath);
    const configurationFailures = serviceConfigurationFailures(service);
    if (configurationFailures.length) {
      report.configurationFailures = configurationFailures;
      throw new DeploymentError('unsafe_service_configuration');
    }
    requireState(
      (await render(`${servicePath}/env-vars/SKYTTEL_DATABASE_PATH`)).value ===
        '/data/skyttel.sqlite',
      'database_not_on_persistent_disk',
    );
    let previous = await latest();
    for (let count = 0; active.has(previous?.status) && count < attempts; count++) {
      await sleep(10_000);
      previous = await latest();
    }
    requireState(!active.has(previous?.status), 'deployment_still_active');
    // A deploy that finished while we waited may have changed the saved reference.
    service = await render(servicePath);
    if ((await currentMain()) !== identity.commit) {
      report.outcome = 'superseded';
      return report;
    }
    // Never automatically retry an unresolved failed migration or unknown result.
    requireState(!previous || previous.status === 'live', 'previous_deployment_requires_diagnosis');
    if (previous) {
      requireState((await application('/healthz')).status === 'ok', 'previous_health_failed');
      const before = observedIdentity(await application('/api/version'));
      requireState(before?.database.status === 'ready', 'database_status_unknown');
      requireState(
        previous.image?.ref === service.imagePath &&
          service.imagePath.endsWith(`@${previous.image?.sha}`),
        'previous_image_not_reconciled',
      );
      report.before = before;
    }
    // Recheck after waiting: GitHub concurrency does not promise queue order.
    if ((await currentMain()) !== identity.commit) {
      report.outcome = 'superseded';
      return report;
    }
    deploymentId = (
      await github('/deployments', 'POST', {
        ref: identity.commit,
        environment: 'production',
        auto_merge: false,
        required_contexts: [],
        production_environment: true,
        payload: { image: `${identity.image}@${identity.digest}`, version: identity.fullVersion },
      })
    ).id;
    requireState(Number.isSafeInteger(deploymentId), 'deployment_record_failed');
    await status('in_progress');
    const imageUrl = `${identity.image}@${identity.digest}`;
    let deploy = previous;
    if (service.imagePath !== imageUrl || previous?.image?.sha !== identity.digest) {
      await render(servicePath, 'PATCH', {
        image: {
          ownerId: service.ownerId,
          imagePath: imageUrl,
          ...(service.registryCredential?.id
            ? { registryCredentialId: service.registryCredential.id }
            : {}),
        },
      });
      requireState((await render(servicePath)).imagePath === imageUrl, 'saved_image_mismatch');
      deploy = await render(`${servicePath}/deploys`, 'POST', { imageUrl });
    }
    report.checks.push('saved-image');
    const deployId = observedDeployId(deploy.id);
    requireState(deployId !== null, 'missing_deploy_id');
    report.deployId = deployId;
    for (let count = 0; active.has(deploy.status) && count < attempts; count++) {
      await sleep(10_000);
      deploy = await render(`${servicePath}/deploys/${report.deployId}`);
    }
    requireState(
      deploy.status === 'live',
      active.has(deploy.status) ? 'deployment_still_active' : 'deployment_failed',
    );
    requireState(
      deploy.image?.ref === imageUrl && deploy.image?.sha === identity.digest,
      'running_digest_mismatch',
    );
    report.checks.push('running-digest');
    const health = await application('/healthz');
    requireState(health.status === 'ok', 'health_failed');
    const running = observedIdentity(await application('/api/version'));
    requireState(
      running?.commit === identity.commit &&
        running.version === identity.fullVersion &&
        running.database.status === 'ready',
      'running_identity_mismatch',
    );
    report.checks.push('readiness', 'version', 'database');
    const bootstrap = await application('/api/bootstrap');
    requireState(
      bootstrap.status === 'anonymous' &&
        bootstrap.providers?.includes('google') &&
        bootstrap.providers?.includes('microsoft'),
      'smoke_failed',
    );
    const page = await http(`${origin}/`);
    requireState((await page.text()).includes('<html'), 'smoke_failed');
    report.checks.push('smoke');
    await snapshot();
    requireState(
      report.savedImage === imageUrl &&
        report.observedDeploy?.id === report.deployId &&
        report.observedDeploy.status === 'live' &&
        report.observedDeploy.digest === identity.digest &&
        report.application?.commit === identity.commit &&
        report.application.version === identity.fullVersion &&
        report.database === 'ready' &&
        report.health === 'ok',
      'final_state_changed',
    );
    await status('success');
    report.outcome = 'success';
  } catch (error) {
    // API bodies, network errors, logs and household responses are never published.
    report.failure =
      error instanceof DeploymentError ? error.message : 'deployment_verification_failed';
    await snapshot();
    await status('failure').catch(() => {
      report.statusRecording = 'failed';
    });
  }
  return report;
}

export async function main(env = process.env) {
  const directory = env.DEPLOYMENT_DIRECTORY ?? 'deployment';
  await mkdir(directory, { recursive: true });
  requireState(
    env.GITHUB_EVENT_NAME === 'push' &&
      env.GITHUB_REF === 'refs/heads/main' &&
      env.GITHUB_REPOSITORY === 'viscalyx/skyttel',
    'untrusted_deployment_context',
  );
  const identity = JSON.parse(await readFile('release/release.json', 'utf8'));
  requireState(identity.commit === env.GITHUB_SHA, 'release_commit_mismatch');
  const report = await deployRelease({
    identity,
    serviceId: env.RENDER_SERVICE_ID,
    origin: env.SKYTTEL_ORIGIN,
    githubToken: env.GH_TOKEN,
    renderToken: env.RENDER_API_KEY,
  });
  await writeFile(join(directory, 'deployment.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      `Render deployment: **${report.outcome}**.\n\nSee the deployment evidence artifact for image and database status.\n`,
    );
  if (report.outcome === 'failure') {
    console.error(deploymentFailureLog(report));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(
      '::error::Deployment setup failed. Verify configuration and retained release evidence.',
    );
    process.exitCode = 1;
  });
}
