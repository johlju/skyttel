import { createHash, randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { evaluationPublication } from '../../../scripts/model-evaluation/publication.js';

test.each([0, 60_000])(
  'publication sanitizes legacy Markdown before transport (%i padding)',
  {
    tags: ['technical'],
  },
  (padding) => {
    const sessionId = ['live', 'u1', 'A'.repeat(32)].join('_');
    const alias = `session-sha256-${createHash('sha256').update(sessionId).digest('hex')}`;
    const record = {
      format: 'skyttel-model-evaluation',
      version: 1,
      issue: 368,
      type: 'diagnostic',
      data: { sessions: [{ sessionId }, { sessionId }], padding: 'x'.repeat(padding) },
    };
    const original = `${JSON.stringify(record, null, 2)}\n`;
    const markdown = `## Session ${sessionId}\n\nSession ${sessionId} ended.\n\n\`\`\`json\n${original}\`\`\`\n`;
    const expectedJson = original.replaceAll(sessionId, alias);
    const bodies = evaluationPublication(markdown);
    expect(bodies.every((body) => body.length <= 55_000 && !body.includes(sessionId))).toBe(true);
    expect(bodies.every((body) => body.startsWith(`## Session ${alias}`))).toBe(true);
    if (padding === 0) {
      expect(bodies).toEqual([markdown.replaceAll(sessionId, alias)]);
    } else {
      const parts = bodies.map((body) =>
        JSON.parse(body.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? ''),
      );
      expect(parts[0].sha256).toBe(createHash('sha256').update(expectedJson).digest('hex'));
      const restored = gunzipSync(
        Buffer.from(parts.map((part) => part.payload).join(''), 'base64'),
      ).toString('utf8');
      expect(restored).toBe(expectedJson);
      expect(restored).not.toContain(sessionId);
    }
    expect(evaluationPublication(bodies[0])).toEqual([bodies[0]]);
  },
);

test('publication preserves ordinary evidence without provider session IDs', {
  tags: ['technical'],
}, () => {
  const markdown =
    '## Result\n\nModel: gpt-live-1.\n\n```json\n{"sessionId":null,"elapsedMs":42}\n```\n';
  expect(evaluationPublication(markdown)).toEqual([markdown]);
});

test('oversized result records publish in bounded parts without losing their original JSON', {
  tags: ['technical'],
}, () => {
  for (const diagnostics of [
    Array.from({ length: 10_000 }, (_, index) => ({
      name: 'read_my_draft',
      taskId: 'observed-task',
      startedMs: index * 20,
      elapsedMs: 3,
    })),
    randomBytes(120_000).toString('base64'),
  ]) {
    const record = {
      format: 'skyttel-model-evaluation',
      version: 1,
      issue: 341,
      type: 'attempt',
      data: {
        profile: 'supplied-high',
        scenario: 'change-price-payment',
        step: 'kort-utan-sparande',
        modality: 'text',
        repetition: 1,
        outcome: 'fail',
        fixed: ['effective_objects'],
        content: [{ id: 'backend-0', outcome: 'fail', reason: 'Ändringen saknas.' }],
        elapsedMs: null,
        backendCostUsd: 0.012,
        diagnostics,
      },
    };
    const original = `${JSON.stringify(record, null, 2)}\n`;
    const markdown = `## Ändringsbesked\n\n\`\`\`json\n${original}\`\`\`\n`;
    const bodies = evaluationPublication(markdown);
    expect(bodies.length).toBeGreaterThanOrEqual(1);
    expect(bodies.every((body) => body.length <= 55_000)).toBe(true);
    const parts = bodies.map((body) => {
      const match = body.match(/```json\n([\s\S]*?)\n```/);
      expect(match).not.toBeNull();
      const part = JSON.parse(match?.[1] ?? '');
      expect(part).toMatchObject({
        format: 'skyttel-model-evaluation-transport',
        version: 1,
        encoding: 'gzip+base64',
        sha256: createHash('sha256').update(original).digest('hex'),
        parts: bodies.length,
        record: { issue: 341, type: 'attempt', outcome: 'fail' },
      });
      return part;
    });
    expect(parts.map((part) => part.part)).toEqual(
      Array.from({ length: bodies.length }, (_, index) => index + 1),
    );
    const restored = gunzipSync(
      Buffer.from(parts.map((part) => part.payload).join(''), 'base64'),
    ).toString('utf8');
    expect(restored).toBe(original);
    expect(JSON.parse(restored)).toEqual(record);
  }
});
