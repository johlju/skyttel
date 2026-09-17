import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REQUIRED_CHECKBOXES = [
  {
    id: 'requirements',
    label:
      'I have reviewed SSDLC requirements for this change and addressed any security, data protection, threat-model, and security-testing impacts.',
  },
];

export const SECURITY_SENSITIVE_PATH_RULES = [
  {
    id: 'application-code',
    label: 'application code',
    patterns: ['src/**', 'index.html'],
  },
  {
    id: 'authentication-authorization',
    label: 'authentication, authorization, or session boundary',
    patterns: ['src/server/auth.ts', 'src/server/app.ts', 'src/server/households.ts'],
  },
  {
    id: 'database',
    label: 'database schema, migration, or persistence layer',
    patterns: ['src/server/database.ts', 'migrations/**'],
  },
  {
    id: 'deployment-configuration',
    label: 'deployment, runtime, or build configuration',
    patterns: [
      'Dockerfile',
      '.dockerignore',
      'compose.yaml',
      '.env.example',
      '.node-version',
      'src/server/config.ts',
      'vite.config.ts',
      'tsconfig.json',
      'tsconfig.server.json',
      'docs/operations/installation.md',
    ],
  },
  {
    id: 'dependency-supply-chain',
    label: 'dependency or supply-chain input',
    patterns: ['package.json', 'package-lock.json'],
  },
  {
    id: 'security-design',
    label: 'security, privacy, or architecture guidance',
    patterns: [
      'docs/adr/0006-export-med-separat-atkomst.md',
      'docs/adr/0007-portabel-applikationscontainer-med-sqlite.md',
      'docs/adr/0008-autentisering-av-skyttel-anvandare.md',
    ],
  },
  {
    id: 'ci-release-security',
    label: 'CI, release, or security validation',
    patterns: [
      '.github/workflows/**',
      '.github/pull_request_template.md',
      'scripts/**',
      'tests/**',
      'playwright.config.ts',
      'docs/development/testing.md',
      '.codex/**',
      'docs/development/codex-permissions.md',
    ],
  },
];

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeChangedFile(filePath) {
  return String(filePath ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//u, '');
}

export function matchesPathPattern(filePath, pattern) {
  const normalizedFilePath = normalizeChangedFile(filePath);
  const normalizedPattern = normalizeChangedFile(pattern);
  if (!normalizedFilePath || !normalizedPattern) return false;
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedFilePath === prefix || normalizedFilePath.startsWith(`${prefix}/`);
  }
  return normalizedFilePath === normalizedPattern;
}

export function classifyChangedFiles(changedFiles, rules = SECURITY_SENSITIVE_PATH_RULES) {
  const normalizedFiles = [...new Set(changedFiles.map(normalizeChangedFile))]
    .filter(Boolean)
    .sort();
  return rules
    .map((rule) => ({
      ...rule,
      files: normalizedFiles.filter((file) =>
        rule.patterns.some((pattern) => matchesPathPattern(file, pattern)),
      ),
    }))
    .filter((rule) => rule.files.length > 0);
}

export function checkboxState(prBody, markerId) {
  const escapedMarker = markerId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const expression = new RegExp(
    `^[ \\t]*[-*][ \\t]*\\[([ xX])\\][^\\r\\n]*<!--[^\\r\\n]*ssdlc:${escapedMarker}(?=\\s|-->)[^\\r\\n]*-->`,
    'gmu',
  );
  const matches = [...String(prBody ?? '').matchAll(expression)];
  if (matches.length === 0) return 'missing';
  if (matches.length > 1) return 'ambiguous';
  return matches[0][1].toLowerCase() === 'x' ? 'checked' : 'unchecked';
}

export function evaluateSsdlcGate({ changedFiles, prBody }) {
  const sensitiveGroups = classifyChangedFiles(changedFiles);
  if (sensitiveGroups.length === 0) {
    return { failures: [], passed: true, requiresGate: false, sensitiveGroups };
  }
  const checkboxResults = REQUIRED_CHECKBOXES.map((checkbox) => ({
    ...checkbox,
    state: checkboxState(prBody, checkbox.id),
  }));
  const failures = [];
  for (const checkbox of checkboxResults) {
    if (checkbox.state === 'missing') {
      failures.push(`Missing SSDLC checkbox marker "ssdlc:${checkbox.id}" in the PR body.`);
    } else if (checkbox.state === 'ambiguous') {
      failures.push(`Duplicate SSDLC checkbox marker "ssdlc:${checkbox.id}" in the PR body.`);
    } else if (checkbox.state !== 'checked') {
      failures.push(`SSDLC checkbox is not checked: ${checkbox.label}`);
    }
  }
  return {
    checkboxResults,
    failures,
    passed: failures.length === 0,
    requiresGate: true,
    sensitiveGroups,
  };
}

export function formatGateReport(result) {
  if (!result.requiresGate) {
    return 'SSDLC gate not required: no security-sensitive paths changed.';
  }
  const touchedPaths = result.sensitiveGroups
    .map((group) => {
      const files = group.files.map((file) => `    - ${file}`).join('\n');
      return `  - ${group.label} (${group.id})\n${files}`;
    })
    .join('\n');
  if (result.passed) {
    return [
      'SSDLC gate passed for security-sensitive changes.',
      'Touched security-sensitive paths:',
      touchedPaths,
    ].join('\n');
  }
  return [
    'SSDLC gate failed.',
    '',
    'This PR changes security-sensitive paths but the PR body does not contain completed SSDLC evidence.',
    '',
    'Touched security-sensitive paths:',
    touchedPaths,
    '',
    'Required fixes:',
    ...result.failures.map((failure) => `  - ${failure}`),
  ].join('\n');
}

export function parseArgs(args) {
  const options = {};
  const knownOptions = new Set(['--github-pr', '--changed-files', '--pr-body']);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (!knownOptions.has(arg)) throw new Error(`Unexpected argument: ${arg}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  if (options['github-pr'] && (options['changed-files'] || options['pr-body'])) {
    throw new Error('--github-pr cannot be combined with local file inputs.');
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/security/ssdlc-gate.mjs --github-pr <number>
  node scripts/security/ssdlc-gate.mjs --changed-files <path> --pr-body <path>`;
}

async function fetchGitHubJson(url, { fetchImpl, token }) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'skyttel-ssdlc-gate',
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

export async function readPullRequestFromGitHub({
  fetchImpl = fetch,
  prNumber,
  repository,
  token,
}) {
  const cleanRepository = readNonEmpty(repository);
  const cleanToken = readNonEmpty(token);
  const cleanPrNumber = readNonEmpty(prNumber);
  if (!cleanRepository) throw new Error('GITHUB_REPOSITORY is required.');
  if (!cleanToken) throw new Error('GITHUB_TOKEN is required.');
  if (!cleanPrNumber) throw new Error('Pull request number is required.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(cleanRepository)) {
    throw new Error(`Invalid GitHub repository: ${cleanRepository}`);
  }
  if (!/^[1-9]\d*$/u.test(cleanPrNumber)) throw new Error('Invalid pull request number.');

  const baseUrl = `https://api.github.com/repos/${cleanRepository}/pulls/${cleanPrNumber}`;
  const requestOptions = { fetchImpl, token: cleanToken };
  const pullRequest = await fetchGitHubJson(baseUrl, requestOptions);
  const expectedCount = pullRequest?.changed_files;
  // GitHub returns at most 3,000 changed files, so larger PRs cannot be classified safely.
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 0 || expectedCount > 3_000) {
    throw new Error(
      'GitHub changed-file count is missing, invalid, or exceeds the 3,000-file API limit.',
    );
  }
  if (pullRequest.body != null && typeof pullRequest.body !== 'string') {
    throw new Error('GitHub pull request body is invalid.');
  }

  const changedFiles = [];
  const filenames = new Set();
  // Use the declared count, including exact full pages, and reject truncated/duplicate results.
  for (let page = 1; page <= Math.ceil(expectedCount / 100); page += 1) {
    const files = await fetchGitHubJson(
      `${baseUrl}/files?per_page=100&page=${page}`,
      requestOptions,
    );
    const expectedPageSize = Math.min(100, expectedCount - (page - 1) * 100);
    if (!Array.isArray(files) || files.length !== expectedPageSize) {
      throw new Error('GitHub returned an incomplete or inconsistent changed-file list.');
    }
    for (const file of files) {
      if (!readNonEmpty(file?.filename) || filenames.has(file.filename)) {
        throw new Error('GitHub returned an invalid or duplicate changed-file path.');
      }
      filenames.add(file.filename);
      changedFiles.push(file.filename);
      if (file.status === 'renamed' && !readNonEmpty(file.previous_filename)) {
        throw new Error('GitHub returned a renamed file without its previous path.');
      }
      if (file.previous_filename != null) {
        if (!readNonEmpty(file.previous_filename)) {
          throw new Error('GitHub returned an invalid previous file path.');
        }
        changedFiles.push(file.previous_filename);
      }
    }
  }
  return { changedFiles, prBody: pullRequest.body ?? '' };
}

export async function main(args = process.argv.slice(2), options = {}) {
  const consoleObj = options.consoleObj ?? console;
  const env = options.env ?? process.env;
  const fsImpl = options.fsImpl ?? fs;
  try {
    const parsedArgs = parseArgs(args);
    if (parsedArgs.help) {
      consoleObj.log(usage());
      return 0;
    }
    let input;
    if (parsedArgs['changed-files'] || parsedArgs['pr-body']) {
      if (!parsedArgs['changed-files'] || !parsedArgs['pr-body']) {
        throw new Error('--changed-files and --pr-body must be provided together.');
      }
      input = {
        changedFiles: fsImpl
          .readFileSync(parsedArgs['changed-files'], 'utf8')
          .split(/\r?\n/u)
          .map(normalizeChangedFile)
          .filter(Boolean),
        prBody: fsImpl.readFileSync(parsedArgs['pr-body'], 'utf8'),
      };
    } else {
      input = await readPullRequestFromGitHub({
        fetchImpl: options.fetchImpl ?? fetch,
        prNumber: parsedArgs['github-pr'] ?? env.PR_NUMBER ?? env.GITHUB_PR_NUMBER,
        repository: env.GITHUB_REPOSITORY,
        token: env.GITHUB_TOKEN,
      });
    }
    const result = evaluateSsdlcGate(input);
    const report = formatGateReport(result);
    if (result.passed) {
      consoleObj.log(report);
      return 0;
    }
    consoleObj.error(report);
    return 1;
  } catch (error) {
    consoleObj.error(`SSDLC gate error: ${error.message}`);
    consoleObj.error(usage());
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
