function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

// Shared by the release gate and daily scans of retained images.
export function containerPolicy({
  report,
  sbom,
  imageId,
  document,
  now = Date.now(),
  retainedImageIds = [imageId],
}) {
  requireValue(/^sha256:[a-f0-9]{64}$/u.test(imageId), 'Invalid image ID');
  requireValue(
    report.source?.type === 'image' && report.source.target?.imageID === imageId,
    'Grype image mismatch',
  );
  requireValue(
    report.descriptor?.name === 'grype' &&
      report.descriptor.db?.status?.valid === true &&
      now - Date.parse(report.descriptor.db.status.built) >= 0 &&
      now - Date.parse(report.descriptor.db.status.built) <= 5 * 86_400_000,
    'Invalid Grype database',
  );
  requireValue(Array.isArray(report.matches), 'Missing Grype matches');
  requireValue(
    sbom.spdxVersion === 'SPDX-2.3' &&
      sbom.packages?.length > 0 &&
      sbom.creationInfo?.creators?.some((creator) => creator.startsWith('Tool: syft-')),
    'Missing Syft SPDX inventory',
  );
  requireValue(
    sbom.packages.some(
      (pkg) =>
        pkg.primaryPackagePurpose === 'CONTAINER' &&
        pkg.versionInfo === report.source.target.manifestDigest,
    ),
    'SBOM image mismatch',
  );
  requireValue(document.version === 1 && Array.isArray(document.exceptions), 'Invalid exceptions');
  let exceptions;
  try {
    exceptions = validateExceptions(document.exceptions, imageId, retainedImageIds, now);
  } catch {
    return { outcome: 'blocked', reason: 'invalid_exception' };
  }
  const used = new Set();
  let blocked = false;
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
      if (!exceptions.has(key)) blocked = true;
      if (exceptions.has(key)) used.add(key);
    }
  }
  if (used.size !== exceptions.size) return { outcome: 'blocked', reason: 'unused_exception' };
  return { outcome: blocked ? 'blocked' : 'passed', reason: blocked ? 'high_critical' : null };
}

function validateExceptions(records, imageId, retainedImageIds, now) {
  const exceptions = new Set();
  const scopes = new Set();
  for (const record of records) {
    for (const field of [
      'vulnerability',
      'package',
      'version',
      'type',
      'owner',
      'reviewer',
      'rationale',
      'actionPlan',
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
    requireValue(
      /^sha256:[a-f0-9]{64}$/u.test(record.imageId) && retainedImageIds.includes(record.imageId),
      'Exception image mismatch',
    );
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
    const scope = JSON.stringify([record.imageId, key]);
    requireValue(!scopes.has(scope), 'Duplicate exception');
    scopes.add(scope);
    if (record.imageId === imageId) exceptions.add(key);
  }
  return exceptions;
}
