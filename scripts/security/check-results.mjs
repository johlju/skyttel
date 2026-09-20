import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function jobs(required) {
  requireValue(required.length > 0, 'No required jobs specified');
  const results = JSON.parse(process.env.REQUIRED_RESULTS);
  for (const name of required) {
    requireValue(results?.[name]?.result === 'success', `Required job did not succeed: ${name}`);
  }
}

function codeql(directory) {
  const files = readdirSync(directory);
  for (const language of ['javascript', 'actions']) {
    requireValue(files.includes(`${language}.sarif`), `Missing CodeQL report: ${language}`);
  }
  for (const file of files.filter((name) => name.endsWith('.sarif'))) {
    const report = json(join(directory, file));
    requireValue(report.version === '2.1.0' && report.runs?.length > 0, 'Invalid SARIF report');
    for (const run of report.runs) {
      requireValue(
        run.tool?.driver?.name === 'CodeQL' && Array.isArray(run.results),
        'Incomplete CodeQL run',
      );
      requireValue(
        !run.invocations?.some((invocation) => invocation.executionSuccessful === false),
        'CodeQL execution failed',
      );
      const rules = [run.tool.driver, ...(run.tool.extensions ?? [])].flatMap(
        (tool) => tool.rules ?? [],
      );
      for (const result of run.results) {
        const rule = rules.find((item) => item.id === result.ruleId);
        requireValue(rule, 'Missing CodeQL rule metadata');
        const severity = rule.properties?.['security-severity'];
        if (severity !== undefined)
          requireValue(Number.isFinite(Number(severity)), 'Invalid CodeQL severity');
        const level = result.level ?? rule.defaultConfiguration?.level ?? 'warning';
        requireValue(
          level !== 'error' && !(Number(severity) >= 7),
          `Blocking CodeQL finding: ${rule.id}`,
        );
      }
    }
  }
}

function zap(path) {
  const report = json(path);
  requireValue(Array.isArray(report.site) && report.site.length > 0, 'Missing ZAP site');
  requireValue(
    report.site.some((site) => site['@name'] === 'http://localhost:3000'),
    'ZAP did not scan the expected target',
  );
  for (const site of report.site) {
    requireValue(Array.isArray(site.alerts), 'Missing ZAP alerts');
    for (const alert of site.alerts) {
      requireValue(['0', '1', '2', '3'].includes(String(alert.riskcode)), 'Invalid ZAP risk');
      requireValue(Number(alert.riskcode) < 3, `Blocking ZAP finding: ${alert.pluginid}`);
    }
  }
}

function trivy(path) {
  const report = json(path);
  requireValue(
    report.SchemaVersion === 2 && Array.isArray(report.Results),
    'Missing Trivy results',
  );
  for (const target of ['Dockerfile', '.devcontainer/Dockerfile']) {
    const result = report.Results.find((item) => item.Target === target && item.Class === 'config');
    requireValue(result?.MisconfSummary?.Successes > 0, `Trivy did not inspect ${target}`);
  }
  for (const result of report.Results) {
    requireValue(
      result.MisconfSummary?.Failures === 0,
      `Blocking Trivy findings: ${result.Target}`,
    );
  }
}

function grype(directory, exceptionsPath) {
  const imageId = readFileSync(join(directory, 'image-id.txt'), 'utf8').trim();
  requireValue(/^sha256:[a-f0-9]{64}$/u.test(imageId), 'Invalid image ID');
  const report = json(join(directory, 'grype.json'));
  requireValue(
    report.source?.type === 'image' && report.source.target?.imageID === imageId,
    'Grype image mismatch',
  );
  requireValue(
    report.descriptor?.name === 'grype' &&
      report.descriptor.db?.status?.valid === true &&
      Date.now() - Date.parse(report.descriptor.db.status.built) >= 0 &&
      Date.now() - Date.parse(report.descriptor.db.status.built) <= 5 * 86_400_000,
    'Invalid Grype database',
  );
  requireValue(Array.isArray(report.matches), 'Missing Grype matches');
  const sbom = json(join(directory, 'sbom.spdx.json'));
  requireValue(
    sbom.spdxVersion === 'SPDX-2.3' &&
      sbom.packages?.length > 0 &&
      sbom.creationInfo?.creators?.some((creator) => creator.startsWith('Tool: syft-')),
    'Missing Syft SPDX inventory',
  );
  const document = json(exceptionsPath);
  requireValue(
    sbom.packages.some(
      (pkg) =>
        pkg.primaryPackagePurpose === 'CONTAINER' &&
        pkg.versionInfo === report.source.target.manifestDigest,
    ),
    'SBOM image mismatch',
  );
  requireValue(document.version === 1 && Array.isArray(document.exceptions), 'Invalid exceptions');
  const exceptions = validateExceptions(document.exceptions, imageId);
  const used = new Set();
  for (const match of report.matches) {
    const severity = match.vulnerability?.severity;
    requireValue(
      ['Negligible', 'Low', 'Medium', 'High', 'Critical', 'Unknown'].includes(severity),
      'Invalid Grype severity',
    );
    if (['High', 'Critical'].includes(severity)) {
      const key = JSON.stringify([
        match.vulnerability.id,
        match.artifact?.name,
        match.artifact?.version,
        match.artifact?.type,
      ]);
      requireValue(exceptions.has(key), `Blocking Grype finding: ${match.vulnerability.id}`);
      used.add(key);
    }
  }
  requireValue(used.size === exceptions.size, 'Unused exception; remove or reassess it');
}

function validateExceptions(records, imageId) {
  const exceptions = new Set();
  const now = Date.now();
  for (const record of records) {
    for (const field of [
      'vulnerability',
      'package',
      'version',
      'type',
      'owner',
      'reviewer',
      'rationale',
      'evidence',
      'created',
      'expires',
      'imageId',
    ]) {
      requireValue(
        typeof record?.[field] === 'string' && record[field].trim().length > 0,
        `Missing exception field: ${field}`,
      );
    }
    for (const field of ['vulnerability', 'package', 'version', 'type']) {
      requireValue(!/[*?]/u.test(record[field]), 'Wildcard exception scope');
    }
    requireValue(record.imageId === imageId, 'Exception image mismatch');
    requireValue(
      new URL(record.evidence).protocol === 'https:',
      'Exception evidence must use HTTPS',
    );
    const created = Date.parse(record.created);
    const expires = Date.parse(record.expires);
    requireValue(
      created <= now && now < expires && expires - created <= 30 * 86_400_000,
      'Exception is expired, future-dated, or exceeds 30 days',
    );
    const key = JSON.stringify([record.vulnerability, record.package, record.version, record.type]);
    requireValue(!exceptions.has(key), 'Duplicate exception');
    exceptions.add(key);
  }
  return exceptions;
}

try {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'jobs') jobs(args);
  else if (mode === 'codeql' && args.length === 1) codeql(args[0]);
  else if (mode === 'zap' && args.length === 1) zap(args[0]);
  else if (mode === 'trivy' && args.length === 1) trivy(args[0]);
  else if (mode === 'grype' && args.length === 2) grype(args[0], args[1]);
  else throw new Error('Unknown policy mode or invalid arguments');
  console.log('Security policy passed');
} catch (error) {
  console.error(`Security policy failed: ${error.message}`);
  process.exitCode = 1;
}
