import { closeSync, openSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Each record is a complete gzip member containing one JSONL line. Consumers
 * can decompress the concatenated members as a stream, even after a stop. */
export function privateEvaluationRecords(directory: string) {
  const observations = openSync(join(directory, 'private-observations.jsonl.gz'), 'wx', 0o600);
  let calls: number;
  try {
    calls = openSync(join(directory, 'private-calls.jsonl.gz'), 'wx', 0o600);
  } catch (error) {
    closeSync(observations);
    throw error;
  }
  let closed = false;
  function write(descriptor: number, value: unknown) {
    if (closed) throw new Error('evaluation_private_records_closed');
    const bytes = gzipSync(`${JSON.stringify(value)}\n`);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
  }
  return {
    observation(value: unknown) {
      write(observations, value);
    },
    call(value: unknown) {
      write(calls, value);
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        closeSync(observations);
      } finally {
        closeSync(calls);
      }
    },
  };
}
