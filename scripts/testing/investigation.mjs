#!/usr/bin/env node
import {
  closeSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const failed = new Set(['failed', 'timedOut', 'interrupted']);
function read(path) {
  const descriptor = openSync(path, 'r');
  try {
    // Read one extra byte to detect overflow without trusting a size snapshot.
    const buffer = Buffer.alloc(8 * 1024 * 1024 + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const count = readSync(descriptor, buffer, bytes, buffer.length - bytes, null);
      if (count === 0) return buffer.subarray(0, bytes).toString('utf8');
      bytes += count;
    }
    throw new Error('Evidence exceeds 8 MiB; select the relevant records first');
  } finally {
    closeSync(descriptor);
  }
}
function evidence(entry) {
  if (
    entry.version !== 1 ||
    !entry.test?.key ||
    !entry.test.runner ||
    !entry.test.file ||
    !entry.execution?.id ||
    !['passed', 'failed', 'timedOut', 'interrupted', 'skipped'].includes(entry.outcome) ||
    !Array.isArray(entry.artifacts)
  ) {
    throw new Error(
      'Expected version 1 execution evidence with test identity, execution identity, outcome and artifact references',
    );
  }
  return entry;
}

function disposition(value, record) {
  if (
    !['unresolved', 'confirmed'].includes(value.cause) ||
    !['open', 'fixed'].includes(value.resolution) ||
    !['unknown', 'environment', 'test-synchronization', 'test-isolation', 'product-race'].includes(
      value.classification,
    ) ||
    !Array.isArray(value.facts) ||
    !Array.isArray(value.hypotheses) ||
    !Array.isArray(value.experiments) ||
    typeof value.nextStep !== 'string'
  )
    throw new Error('Invalid cause disposition');
  const executions = new Map(record.executions.map((entry) => [entry.execution.id, entry]));
  for (const fact of value.facts) {
    if (!executions.has(fact.execution) || !fact.observation)
      throw new Error('Each fact needs an existing execution and observation');
  }
  for (const experiment of value.experiments) {
    if (
      !experiment.hypothesis ||
      !experiment.command ||
      !experiment.selection ||
      !Number.isSafeInteger(experiment.maxAttempts) ||
      experiment.maxAttempts < 1 ||
      !experiment.stop ||
      !Array.isArray(experiment.results) ||
      experiment.results.some((id) => !executions.has(id))
    )
      throw new Error(
        'Each experiment needs hypothesis, command, selection, finite attempt budget, stop condition and recorded results',
      );
  }
  if (
    value.cause === 'confirmed' &&
    (value.classification === 'unknown' ||
      !value.explanation ||
      !value.facts.some((fact) => failed.has(executions.get(fact.execution).outcome)))
  )
    throw new Error(
      'Confirmed causes need classification, explanation and original failure evidence',
    );
  if (
    value.resolution === 'fixed' &&
    (value.cause !== 'confirmed' ||
      !value.repair ||
      !Array.isArray(value.regressions) ||
      !value.regressions.length ||
      value.regressions.some((id) => executions.get(id)?.outcome !== 'passed'))
  )
    throw new Error(
      'A fix needs a confirmed cause, repair reference and passing regression executions',
    );
  if (value.resolution === 'open' && !value.nextStep.trim())
    throw new Error('Open investigations need a specific next step');
  return value;
}

function main() {
  const { values } = parseArgs({
    options: {
      record: { type: 'string' },
      append: { type: 'string' },
      test: { type: 'string' },
      disposition: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'Usage: npm run test:investigate -- --record <record.json> (--append <execution.json-or-jsonl> [--test <key>] | --disposition <assessment.json>)\nRecords evidence only; never runs or retries tests. See docs/development/testing.md#intermittent-failures.',
    );
    return;
  }
  if (!values.record || Boolean(values.append) === Boolean(values.disposition))
    throw new Error('Provide --record and exactly one of --append or --disposition');
  const path = resolve(values.record);
  if (path === resolve(values.append ?? values.disposition))
    throw new Error('Record and input must be different files');
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  mkdirSync(lock);
  try {
    let record;
    try {
      record = JSON.parse(read(path));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (record && (record.version !== 1 || !Array.isArray(record.executions) || !record.original))
      throw new Error('Invalid existing investigation');
    if (values.append) {
      const text = read(values.append);
      let incoming;
      try {
        incoming = [JSON.parse(text)];
      } catch {
        incoming = text
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      }
      const entries = incoming
        .map(evidence)
        .filter((entry) => !values.test || entry.test.key === values.test);
      if (!entries.length) throw new Error('No matching execution evidence');
      for (const entry of entries) {
        if (!record) {
          if (!failed.has(entry.outcome))
            throw new Error('Start with the original failure, then append later attempts');
          record = {
            version: 1,
            test: entry.test,
            original: entry.execution.id,
            executions: [],
            disposition: {
              cause: 'unresolved',
              resolution: 'open',
              classification: 'unknown',
              facts: [],
              hypotheses: [],
              experiments: [],
              nextStep: 'Inspect retained failure evidence and record one bounded experiment.',
            },
          };
        }
        if (entry.test.key !== record.test.key)
          throw new Error('Mixed test identities; select one --test key per investigation');
        const existing = record.executions.find((item) => item.execution.id === entry.execution.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(entry))
          throw new Error('An existing execution is immutable');
        if (!existing) {
          record.executions.push(entry);
          if (failed.has(entry.outcome) && record.disposition.resolution === 'fixed') {
            record.previousDispositions ??= [];
            record.previousDispositions.push(record.disposition);
            record.disposition = {
              ...record.disposition,
              cause: 'unresolved',
              resolution: 'open',
              classification: 'unknown',
              nextStep:
                'Investigate the new failure; the earlier repair does not establish its cause.',
            };
          }
        }
      }
    } else {
      if (!record) throw new Error('Append the original failure before assessing its cause');
      const next = disposition(JSON.parse(read(values.disposition)), record);
      record.previousDispositions ??= [];
      record.previousDispositions.push(record.disposition);
      record.disposition = next;
    }
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
    console.log(
      JSON.stringify({
        record: path,
        original: record.original,
        executions: record.executions.length,
        latestOutcome: record.executions.at(-1).outcome,
        cause: record.disposition.cause,
        resolution: record.disposition.resolution,
      }),
    );
  } finally {
    rmSync(lock, { recursive: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`Investigation not updated: ${error.message}`);
  process.exitCode = 1;
}
