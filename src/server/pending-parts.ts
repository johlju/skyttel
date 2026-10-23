import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { PendingPart, TextAssistantReview } from '../shared/text-assistant.js';
import { MapError } from './map-error.js';

const text = z.string().trim().min(1).max(1000);
export const pendingQuestion = z
  .object({
    kind: z.enum(['change', 'information']),
    request: text,
    question: text,
    dependsOnDraft: z.boolean(),
  })
  .strict();
// Short questions still acquire server-owned identity and conservative save rules.
export const pendingQuestions = z.array(z.union([text, pendingQuestion])).max(3);
export const partReference = z
  .object({ id: z.string(), revision: z.number().int().nonnegative() })
  .strict();
export const partUpdates = z
  .array(
    z
      .object({
        id: z.string(),
        revision: z.number().int().nonnegative(),
        action: z.enum(['rephrase', 'clarify', 'withdraw', 'replace']),
        messageId: z.string(),
        evidence: text,
        question: text.optional(),
        replacement: pendingQuestion.optional(),
        answer: text.optional(),
        expected: z
          .array(
            z
              .object({
                kind: z.enum(['object', 'relationship', 'objectType', 'relationshipType']),
                id: text,
                value: z
                  .record(z.string(), z.unknown())
                  .refine((value) => Object.keys(value).length > 0),
              })
              .strict(),
          )
          .min(1)
          .max(24)
          .optional(),
      })
      .strict(),
  )
  .max(12);

/** Conversation-local state. Only verified executor outcomes complete changes. */
export function pendingParts() {
  let parts: PendingPart[] = [];
  const applied = new Set<string>();
  const collections = ['changes', 'relationships', 'objectTypes', 'relationshipTypes'] as const;
  type Effect = { collection: (typeof collections)[number]; id: string; value: unknown };
  const completedOperations: {
    parts: string[];
    name: string;
    args: Record<string, unknown>;
    effects: Effect[];
  }[] = [];
  const operationArgs = ({
    version: _version,
    contentVersion: _contentVersion,
    ...args
  }: Record<string, unknown>) => args;
  const active = (part: PendingPart) => part.status === 'waiting' || part.status === 'ready';
  function find(ref: z.infer<typeof partReference>) {
    const part = parts.find((part) => part.id === ref.id);
    if (!part || part.revision !== ref.revision || !active(part))
      throw new MapError('assistant_pending_part_changed');
    return part;
  }
  function create(question: z.infer<typeof pendingQuestion>, messageId: string): PendingPart {
    return {
      ...question,
      id: randomUUID(),
      revision: 0,
      messageId,
      status: 'waiting',
      operations: [],
    };
  }
  return {
    read: () => structuredClone(parts),
    questions: () => parts.filter((part) => part.status === 'waiting').map((part) => part.question),
    blocked: () => parts.some((part) => part.kind === 'change' && active(part)),
    validateReply(refs: z.infer<typeof partReference>[]) {
      for (const ref of refs)
        if (find(ref).status !== 'waiting') throw new MapError('assistant_pending_part_changed');
    },
    apply(
      questions: z.infer<typeof pendingQuestions>,
      updates: z.infer<typeof partUpdates>,
      turn: { id: string; text: string; callId: string },
    ) {
      const key = `${turn.id}:${turn.callId}`;
      if (applied.has(key)) return { questions: [] as string[], answers: [] as string[] };
      const ids = new Set<string>();
      // Validate the entire transition before changing any part.
      for (const update of updates) {
        const part = find(update);
        if (
          ids.has(part.id) ||
          part.messageId === turn.id ||
          update.messageId !== turn.id ||
          !turn.text.includes(update.evidence) ||
          (update.action === 'rephrase' && !update.question) ||
          (update.action === 'replace' && !update.replacement) ||
          (update.answer && (part.kind !== 'information' || update.action !== 'clarify')) ||
          (part.kind === 'information' &&
            update.action === 'clarify' &&
            !update.question &&
            !update.answer) ||
          (update.expected &&
            (part.kind !== 'change' ||
              update.action !== 'clarify' ||
              update.question !== undefined)) ||
          (update.replacement && update.action !== 'replace')
        )
          throw new MapError('invalid_request', 400);
        ids.add(part.id);
      }
      const announced: string[] = [];
      const answers: string[] = [];
      for (const update of updates) {
        const part = find(update);
        part.revision++;
        part.evidence = { messageId: turn.id, text: update.evidence };
        if (update.action === 'withdraw') {
          part.status = 'withdrawn';
          answers.push(`Den väntande delen är återtagen: ${part.request}.`);
        } else if (update.action === 'replace' && update.replacement) {
          part.status = 'superseded';
          parts.push(create(update.replacement, turn.id));
          announced.push(update.replacement.question);
        } else if (update.question) {
          part.question = update.question;
          part.status = 'waiting';
          announced.push(update.question);
        } else if (update.answer) {
          part.status = 'completed';
          answers.push(update.answer);
        } else part.status = update.expected ? 'completed' : 'ready';
      }
      for (const question of questions) {
        if (
          typeof question === 'string' &&
          parts.some((part) => active(part) && part.question === question)
        )
          continue;
        const value =
          typeof question === 'string'
            ? { kind: 'change' as const, request: question, question, dependsOnDraft: true }
            : question;
        parts.push(create(value, turn.id));
        announced.push(value.question);
      }
      applied.add(key);
      return { questions: announced, answers };
    },
    validateCompletion(refs: z.infer<typeof partReference>[]) {
      if (new Set(refs.map((ref) => ref.id)).size !== refs.length)
        throw new MapError('invalid_request', 400);
      for (const ref of refs) {
        const part = find(ref);
        if (part.kind !== 'change' || part.status !== 'ready')
          throw new MapError('invalid_request', 400);
      }
    },
    shouldRun(
      refs: z.infer<typeof partReference>[],
      name: string,
      args: Record<string, unknown>,
      current: TextAssistantReview,
    ) {
      const completed = completedOperations.find(
        (item) =>
          item.name === name &&
          refs.some((ref) => item.parts.includes(ref.id)) &&
          isDeepStrictEqual(item.args, operationArgs(args)),
      );
      if (!completed) return true;
      const latest = completedOperations
        .filter((item) => refs.some((ref) => item.parts.includes(ref.id)))
        .flatMap((item) => item.effects);
      if (
        !completed.effects.every((effect) => {
          const final =
            latest.findLast(
              (item) => item.collection === effect.collection && item.id === effect.id,
            ) ?? effect;
          return isDeepStrictEqual(
            current[effect.collection]?.find((item) => item.id === effect.id)?.after,
            final.value,
          );
        })
      )
        throw new MapError('assistant_draft_changed');
      return false;
    },
    operation(
      refs: z.infer<typeof partReference>[],
      name: string,
      args: Record<string, unknown>,
      before: TextAssistantReview,
      after: TextAssistantReview,
    ) {
      if (!refs.length) return;
      const normalized = operationArgs(args);
      const effects: Effect[] = [];
      for (const collection of collections) {
        const ids = new Set(
          [...(before[collection] ?? []), ...(after[collection] ?? [])].map((item) => item.id),
        );
        for (const id of ids) {
          const value = after[collection]?.find((item) => item.id === id)?.after;
          if (!isDeepStrictEqual(before[collection]?.find((item) => item.id === id)?.after, value))
            effects.push({ collection, id, value: structuredClone(value) });
        }
      }
      completedOperations.push({
        parts: refs.map((ref) => ref.id),
        name,
        args: structuredClone(normalized),
        effects,
      });
      for (const ref of refs)
        find(ref).operations.push({ name, arguments: structuredClone(normalized) });
    },
    complete(refs: z.infer<typeof partReference>[]) {
      for (const ref of refs) find(ref);
      for (const ref of refs) {
        const part = find(ref);
        part.status = 'completed';
        part.revision++;
      }
    },
    discard() {
      for (const part of parts)
        if (active(part) && (part.kind === 'change' || part.dependsOnDraft)) {
          part.status = 'discarded';
          part.revision++;
        }
    },
    clear() {
      parts = [];
      applied.clear();
      completedOperations.length = 0;
    },
  };
}
