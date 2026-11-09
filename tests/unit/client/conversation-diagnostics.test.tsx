import { expect, test } from 'vitest';
import { conversationDiagnosticReport } from '../../../src/client/conversation-diagnostics.js';
import { firstConversationNotice } from '../../../src/client/conversation-notice.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

const session: TextAssistantView = {
  id: 'conversation',
  revision: 3,
  phase: 'working',
  operations: [],
  review: {
    version: 0,
    contentVersion: 1,
    changes: [],
    readyToSave: true,
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
  },
  completedReplies: [
    {
      id: 'first',
      revision: 1,
      text: '',
      failed: true,
      request: 'Min första begäran.\nBehåll denna rad.',
      securityReference: 'reference-first',
      source: 'text',
    },
    {
      id: 'second',
      revision: 2,
      text: '',
      failed: true,
      request: 'En annan begäran.',
      securityReference: 'reference-second',
      source: 'voice',
    },
  ],
  queuedRequests: [{ id: 'third', text: 'Köad begäran som inte ska kopieras.' }],
};

test('the security reference selects the original prompt despite later failed and queued tasks', () => {
  const definition = firstConversationNotice({ actionBlocked: true });
  if (!definition) throw new Error('Missing notice');
  const report = conversationDiagnosticReport(
    { ...definition, text: `${definition.text} reference-first` },
    session,
  );
  expect(report).toContain('Min första begäran.\nBehåll denna rad.');
  expect(report).toContain('Uppdrags-ID: first');
  expect(report).toContain('Inmatning: text');
  expect(report).not.toMatch(/En annan|Köad|reference-second|review/);
});

test('retained failed work selects its own request, not the last completed reply', () => {
  const definition = firstConversationNotice({ taskFailed: true });
  if (!definition) throw new Error('Missing notice');
  const report = conversationDiagnosticReport(definition, {
    ...session,
    workFailure: {
      requestId: 'retained',
      request: 'Det ursprungliga uppdraget.',
      code: 'assistant_model_temporary',
      message: 'Modellen kunde inte svara.',
    },
  });
  expect(report).toContain('Det ursprungliga uppdraget.');
  expect(report).toContain('Uppdrags-ID: retained');
  expect(report).toContain('Felkod: assistant_model_temporary');
  expect(report).not.toContain('En annan begäran.');
});

test('a microphone notice does not attribute an unrelated failed prompt to the device error', () => {
  const definition = firstConversationNotice({ microphoneDenied: true });
  if (!definition) throw new Error('Missing notice');
  const report = conversationDiagnosticReport(definition, session);
  expect(report).toBeUndefined();
});
