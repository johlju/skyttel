import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { publicEvaluationText } from './public-output.js';

/** Sanitize before sizing, hashing or compression, including older artifacts.
 * Keep the public JSON lossless when diagnostics exceed issue comment limits. */
export function evaluationPublication(markdown: string): string[] {
  markdown = publicEvaluationText(markdown);
  if (markdown.length <= 55_000) return [markdown];
  const matches = [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)];
  if (matches.length !== 1) throw new Error('evaluation_publication_record_required');
  const original = `${matches[0][1]}\n`;
  const value = JSON.parse(original);
  if (value.format !== 'skyttel-model-evaluation' || value.version !== 1)
    throw new Error('evaluation_publication_format_unknown');
  const record = {
    issue: value.issue,
    type: value.type,
    ...(value.type === 'attempt'
      ? {
          profile: value.data.profile,
          scenario: value.data.scenario,
          step: value.data.step,
          modality: value.data.modality,
          repetition: value.data.repetition,
          outcome: value.data.outcome,
          fixed: value.data.fixed,
          content: value.data.content,
          elapsedMs: value.data.elapsedMs,
          backendCostUsd: value.data.backendCostUsd,
          judgeCostUsd: value.data.judgeCostUsd,
          voiceCostUsd: value.data.voiceCostUsd,
        }
      : {}),
  };
  const sha256 = createHash('sha256').update(original).digest('hex');
  const payload = gzipSync(original).toString('base64');
  const parts = Math.ceil(payload.length / 36_000);
  return Array.from({ length: parts }, (_, index) => {
    const transport = {
      format: 'skyttel-model-evaluation-transport',
      version: 1,
      record,
      encoding: 'gzip+base64',
      sha256,
      part: index + 1,
      parts,
      payload: payload.slice(index * 36_000, (index + 1) * 36_000),
    };
    const body =
      `${markdown.split('\n')[0]} (part ${index + 1}/${parts})\n\n` +
      'Lossless public JSON: join payloads in part order, decode base64, ' +
      'decompress gzip and verify SHA-256 before parsing.\n\n' +
      `\`\`\`json\n${JSON.stringify(transport, null, 2)}\n\`\`\`\n`;
    if (body.length > 55_000) throw new Error('evaluation_publication_metadata_too_large');
    return body;
  });
}
