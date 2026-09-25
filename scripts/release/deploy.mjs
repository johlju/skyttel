import { appendFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { validateReleasePlan } from './plan.mjs';
import { isProductionInput } from './production-inputs.mjs';

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

class DeploymentError extends Error {
  constructor(code, request) {
    super(code);
    this.request = request;
  }
}

function errorCode(error) {
  const codes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_SOCKET',
    'CERT_HAS_EXPIRED',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'ENOENT',
    'EACCES',
    'ENOSPC',
  ]);
  for (const code of [error?.code, error?.cause?.code]) {
    if (codes.has(code)) return code;
  }
  if (error?.name === 'TimeoutError') return 'timeout';
  if (error?.name === 'AbortError') return 'aborted';
  return 'unknown';
}

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
    `Failure phase: ${report.failurePhase ?? 'unknown'}.`,
    ...(report.failedRequest ? [`Failed request: ${JSON.stringify(report.failedRequest)}`] : []),
    ...(report.errorCode ? [`Error code: ${report.errorCode}.`] : []),
    ...(report.deployId ? [`Render deployment: ${report.deployId}.`] : []),
    'See deployment.json and requests.ndjson in the render-deployment artifact; request diagnostics also appear above in this job log.',
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
  sourceCommit,
  serviceId,
  origin,
  githubToken,
  renderToken,
  fetch: send = globalThis.fetch,
  sleep = delay,
  attempts = 120,
  onEvent = () => {},
}) {
  const report = {
    outcome: 'failure',
    requested: {
      version: identity.fullVersion,
      commit: sourceCommit,
      digest: identity.digest,
    },
    checks: [],
    database: 'unknown',
    requests: [],
  };
  const servicePath = `/services/${serviceId}`;
  let deploymentId;
  let phase = 'preflight';
  let validated = false;
  async function http(target, path, token, method = 'GET', body, format = 'json') {
    const base =
      target === 'render'
        ? 'https://api.render.com/v1'
        : target === 'github'
          ? 'https://api.github.com/repos/viscalyx/skyttel'
          : origin;
    const request = {
      timestamp: new Date().toISOString(),
      phase,
      target,
      method,
      path: path
        .replace(servicePath, '/services/{serviceId}')
        .replace(/\/deploys\/dep-[a-z0-9]+$/u, '/deploys/{deployId}')
        .replace(/\/deployments\/\d+\/statuses$/u, '/deployments/{deploymentId}/statuses'),
      status: null,
    };
    const started = performance.now();
    let code = 'network_request_failed';
    try {
      const response = await send(`${base}${path}`, {
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
      request.status = response.status;
      code = 'http_request_failed';
      requireState(response.ok, code);
      code = 'response_read_failed';
      const text = await response.text();
      if (format === 'text') return text;
      code = 'invalid_json_response';
      return JSON.parse(text);
    } catch (error) {
      request.failure = code;
      if (code === 'network_request_failed' || code === 'response_read_failed')
        request.errorCode = errorCode(error);
      throw new DeploymentError(code, request);
    } finally {
      request.durationMs = Math.round(performance.now() - started);
      report.requests.push(request);
      onEvent(request);
    }
  }
  const render = async (path, method, body) => http('render', path, renderToken, method, body);
  const github = async (path, method, body) => http('github', path, githubToken, method, body);
  const application = async (path) => http('application', path);
  const latest = async () => {
    const list = await render(`${servicePath}/deploys?limit=1`);
    return list[0]?.deploy;
  };
  const status = async (state) => {
    if (Number.isSafeInteger(deploymentId) && deploymentId > 0)
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
      service.status === 'fulfilled' && imagePattern.test(service.value?.imagePath)
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
      health.status === 'fulfilled' && health.value?.status === 'ok' ? 'ok' : 'unknown';
  };
  try {
    requireState(
      typeof sourceCommit === 'string' && /^[a-f0-9]{40}$/u.test(sourceCommit),
      'invalid_source_commit',
    );
    requireState(identity.commit === sourceCommit, 'release_commit_mismatch');
    validateReleasePlan(identity, {
      repository: 'viscalyx/skyttel',
      commit: sourceCommit,
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
    validated = true;
    const superseded = async () => {
      const currentMain = (await github('/git/ref/heads/main')).object.sha;
      requireState(/^[a-f0-9]{40}$/u.test(currentMain), 'invalid_main_revision');
      if (currentMain === sourceCommit) return false;
      // Request paths use the workflow revision, never data from the release file.
      const comparison = await github(`/compare/${sourceCommit}...${currentMain}`);
      // A rewritten branch cannot authorize an older candidate. Only permit
      // descendants with a complete comparison and unchanged production inputs.
      if (comparison.status !== 'ahead') return true;
      requireState(
        Array.isArray(comparison.files) &&
          comparison.files.length < 300 &&
          comparison.files.every(
            (file) =>
              typeof file?.filename === 'string' &&
              (file.previous_filename === undefined || typeof file.previous_filename === 'string'),
          ),
        'main_comparison_incomplete',
      );
      return comparison.files.some(
        (file) =>
          isProductionInput(file.filename) ||
          (file.previous_filename !== undefined && isProductionInput(file.previous_filename)),
      );
    };
    if (await superseded()) {
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
    phase = 'wait-for-previous-deployment';
    for (let count = 0; active.has(previous?.status) && count < attempts; count++) {
      await sleep(10_000);
      previous = await latest();
    }
    requireState(!active.has(previous?.status), 'deployment_still_active');
    // A deploy that finished while we waited may have changed the saved reference.
    service = await render(servicePath);
    if (await superseded()) {
      report.outcome = 'superseded';
      return report;
    }
    // Never automatically retry an unresolved failed migration or unknown result.
    requireState(!previous || previous.status === 'live', 'previous_deployment_requires_diagnosis');
    if (previous) {
      phase = 'verify-previous-application';
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
    if (await superseded()) {
      report.outcome = 'superseded';
      return report;
    }
    phase = 'create-deployment-record';
    deploymentId = (
      await github('/deployments', 'POST', {
        ref: sourceCommit,
        environment: 'production',
        auto_merge: false,
        required_contexts: [],
        production_environment: true,
        payload: { image: `${identity.image}@${identity.digest}`, version: identity.fullVersion },
      })
    ).id;
    requireState(
      Number.isSafeInteger(deploymentId) && deploymentId > 0,
      'deployment_record_failed',
    );
    await status('in_progress');
    const imageUrl = `${identity.image}@${identity.digest}`;
    let deploy = previous;
    if (service.imagePath !== imageUrl || previous?.image?.sha !== identity.digest) {
      phase = 'update-service-image';
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
      phase = 'trigger-deployment';
      deploy = await render(`${servicePath}/deploys`, 'POST', { imageUrl });
    }
    report.checks.push('saved-image');
    const deployId = observedDeployId(deploy.id);
    requireState(deployId !== null, 'missing_deploy_id');
    report.deployId = deployId;
    phase = 'wait-for-deployment';
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
    phase = 'verify-application';
    const health = await application('/healthz');
    requireState(health.status === 'ok', 'health_failed');
    const running = observedIdentity(await application('/api/version'));
    requireState(
      running?.commit === sourceCommit &&
        running.version === identity.fullVersion &&
        running.database.status === 'ready',
      'running_identity_mismatch',
    );
    report.checks.push('readiness', 'version', 'database');
    phase = 'smoke-checks';
    const bootstrap = await application('/api/bootstrap');
    requireState(
      bootstrap.status === 'anonymous' &&
        bootstrap.providers?.includes('google') &&
        bootstrap.providers?.includes('microsoft'),
      'smoke_failed',
    );
    const page = await http('application', '/', undefined, 'GET', undefined, 'text');
    requireState(page.includes('<html'), 'smoke_failed');
    report.checks.push('smoke');
    phase = 'final-snapshot';
    await snapshot();
    requireState(
      report.savedImage === imageUrl &&
        report.observedDeploy?.id === report.deployId &&
        report.observedDeploy.status === 'live' &&
        report.observedDeploy.digest === identity.digest &&
        report.application?.commit === sourceCommit &&
        report.application.version === identity.fullVersion &&
        report.database === 'ready' &&
        report.health === 'ok',
      'final_state_changed',
    );
    phase = 'record-success';
    await status('success');
    report.outcome = 'success';
  } catch (error) {
    // Retain request metadata, never arbitrary error messages or response bodies.
    report.failure =
      error instanceof DeploymentError ? error.message : 'deployment_verification_failed';
    report.failurePhase = phase;
    if (error instanceof DeploymentError && error.request) report.failedRequest = error.request;
    else report.errorCode = errorCode(error);
    phase = 'failure-snapshot';
    if (validated) await snapshot();
    phase = 'record-failure';
    await status('failure').catch(() => {
      report.statusRecording = 'failed';
    });
  }
  return report;
}

export async function main(env = process.env) {
  const directory = env.DEPLOYMENT_DIRECTORY ?? 'deployment';
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'requests.ndjson'), '');
  const onEvent = (event) => {
    const line = `${JSON.stringify(event)}\n`;
    console.log(line.trimEnd());
    try {
      appendFileSync(join(directory, 'requests.ndjson'), line);
    } catch (error) {
      console.error(`::error::Cannot retain request log: ${errorCode(error)}. See job output.`);
    }
  };
  let report;
  try {
    requireState(
      env.GITHUB_EVENT_NAME === 'push' &&
        env.GITHUB_REF === 'refs/heads/main' &&
        env.GITHUB_REPOSITORY === 'viscalyx/skyttel',
      'untrusted_deployment_context',
    );
    const identity = JSON.parse(await readFile('release/release.json', 'utf8'));
    requireState(identity.commit === env.GITHUB_SHA, 'release_commit_mismatch');
    report = await deployRelease({
      identity,
      sourceCommit: env.GITHUB_SHA,
      serviceId: env.RENDER_SERVICE_ID,
      origin: env.SKYTTEL_ORIGIN,
      githubToken: env.GH_TOKEN,
      renderToken: env.RENDER_API_KEY,
      onEvent,
    });
  } catch (error) {
    report = {
      outcome: 'failure',
      failure: error instanceof DeploymentError ? error.message : 'deployment_setup_failed',
      failurePhase: 'setup',
      errorCode: errorCode(error),
    };
  }
  if (report.outcome === 'failure') {
    console.error(deploymentFailureLog(report));
    process.exitCode = 1;
  }
  await writeFile(join(directory, 'deployment.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      `Render deployment: **${report.outcome}**.\n\nDownload the render-deployment artifact for deployment.json and requests.ndjson. Request diagnostics are also in the job log.\n${report.outcome === 'failure' ? `\n\`\`\`text\n${deploymentFailureLog(report)}\n\`\`\`\n` : ''}`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `::error::Deployment evidence could not be completed: ${errorCode(error)}. Read the request diagnostics and failure above in the job log.`,
    );
    process.exitCode = 1;
  });
}
