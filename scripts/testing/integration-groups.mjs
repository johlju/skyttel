#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

function read(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function identities(report) {
  if (!report.config?.rootDir || !Array.isArray(report.suites) || report.errors?.length)
    throw new Error('Incomplete Playwright discovery');
  const tests = [];
  function visit(suite, parents) {
    const titles = [...parents, suite.title];
    for (const spec of suite.specs ?? []) {
      const file = relative(process.cwd(), resolve(report.config.rootDir, spec.file));
      if (!Array.isArray(spec.tests) || !spec.tests.length)
        throw new Error('Missing runtime identities');
      for (const test of spec.tests) {
        if (typeof test.projectName !== 'string') throw new Error('Missing runtime project');
        tests.push({ file, id: JSON.stringify([test.projectName, file, ...titles, spec.title]) });
      }
    }
    for (const child of suite.suites ?? []) visit(child, titles);
  }
  for (const suite of report.suites) visit(suite, []);
  if (!tests.length || new Set(tests.map((test) => test.id)).size !== tests.length)
    throw new Error('Empty or duplicate test/runtime identities');
  return tests;
}

function partition(tests, timings, count) {
  if (
    timings.version !== 1 ||
    !timings.files ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 32
  )
    throw new Error('Invalid timing configuration or group count');
  const samples = Object.values(timings.files)
    .map((sample) => {
      if (!(sample.seconds > 0) || !Number.isSafeInteger(sample.tests) || sample.tests < 1)
        throw new Error('Invalid observed duration');
      return sample.seconds / sample.tests;
    })
    .sort((a, b) => a - b);
  if (!samples.length) throw new Error('Missing baseline durations');
  const estimate = samples[Math.floor(samples.length / 2)];
  const files = new Map();
  for (const test of tests) {
    if (!files.has(test.file)) files.set(test.file, []);
    files.get(test.file).push(test.id);
  }
  if (files.size < count) throw new Error('Group count would create an empty required group');
  const measured = [...files]
    .map(([file, tests]) => ({
      file,
      tests: tests.sort(),
      seconds:
        tests.length *
        (timings.files[file] ? timings.files[file].seconds / timings.files[file].tests : estimate),
    }))
    .sort((a, b) => b.seconds - a.seconds || a.file.localeCompare(b.file, 'en'));
  const groups = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    files: [],
    tests: [],
    estimatedSeconds: 0,
  }));
  for (const file of measured) {
    const target = [...groups].sort(
      (a, b) => a.estimatedSeconds - b.estimatedSeconds || a.id - b.id,
    )[0];
    target.files.push(file.file);
    target.tests.push(...file.tests);
    target.estimatedSeconds += file.seconds;
  }
  for (const group of groups) {
    group.files.sort();
    group.tests.sort();
    group.estimatedSeconds = Math.round(group.estimatedSeconds * 1000) / 1000;
  }
  return groups;
}

function main() {
  const { values } = parseArgs({
    options: {
      plan: { type: 'boolean' },
      group: { type: 'string' },
      groups: { type: 'string' },
      discovery: { type: 'string' },
      timings: { type: 'string' },
      config: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'Usage: npm run test:integration:group -- --group <number>\nUse --plan to print complete discovered coverage without executing tests.\nOptional --groups, --config, --timings; --discovery accepts saved JSON only with --plan.',
    );
    return 0;
  }
  if (Boolean(values.plan) === Boolean(values.group) || (values.discovery && !values.plan))
    throw new Error('Choose --plan or --group; saved discovery is for planning only');
  const config = resolve(values.config ?? 'playwright.config.ts');
  const timings = read(
    values.timings ?? fileURLToPath(new URL('./integration-durations.json', import.meta.url)),
  );
  const count = values.groups === undefined ? timings.groups : Number(values.groups);
  const playwright = resolve('node_modules/@playwright/test/cli.js');
  let discovery;
  if (values.discovery) discovery = read(values.discovery);
  else {
    const listed = spawnSync(
      process.execPath,
      [playwright, 'test', '--config', config, '--list', '--reporter=json'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    if (listed.error || listed.status !== 0)
      throw new Error(`Playwright discovery failed: ${listed.error?.message ?? listed.stderr}`);
    discovery = JSON.parse(listed.stdout);
  }
  const tests = identities(discovery);
  const groups = partition(tests, timings, count);
  const discovered = tests.map((test) => test.id).sort();
  const union = groups.flatMap((group) => group.tests).sort();
  if (JSON.stringify(union) !== JSON.stringify(discovered))
    throw new Error('Partition does not cover the discovered suite exactly');
  const plan = {
    version: 1,
    config: relative(process.cwd(), config),
    timingDigest: digest(timings),
    coverageDigest: digest(discovered),
    discovered,
    groups,
  };
  if (values.plan) {
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }
  const selected = groups.find((group) => group.id === Number(values.group));
  if (!selected) throw new Error('Unknown integration group');
  mkdirSync('logs/tests', { recursive: true });
  writeFileSync(
    `logs/tests/integration-group-${selected.id}.json`,
    `${JSON.stringify(plan, null, 2)}\n`,
  );
  console.log(
    `Integration group ${selected.id}/${count}: ${selected.tests.length}/${tests.length} test/runtime identities, coverage ${plan.coverageDigest}`,
  );
  const patterns = selected.files.map(
    (file) => `^${resolve(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
  );
  const result = spawnSync(
    process.execPath,
    [
      playwright,
      'test',
      '--config',
      config,
      '--max-failures=1',
      '--reporter=line,./tests/support/diagnostics-reporter.ts',
      ...patterns,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, SKYTTEL_INTEGRATION_GROUP: `${selected.id}/${count}` },
    },
  );
  if (result.error) throw result.error;
  return result.status ?? (result.signal ? 128 + (constants.signals[result.signal] ?? 1) : 1);
}
try {
  process.exitCode = main();
} catch (error) {
  console.error(`Integration grouping failed: ${error.message}`);
  process.exitCode = 1;
}
