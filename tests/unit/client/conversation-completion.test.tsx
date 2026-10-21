import { expect, test } from 'vitest';
import { conversationCompletion } from '../../../src/client/conversation-completion.js';
import type { ConversationReply, TextAssistantView } from '../../../src/shared/text-assistant.js';

const view: TextAssistantView = {
  id: 'conversation',
  revision: 1,
  phase: 'ready',
  review: {
    version: 1,
    contentVersion: 1,
    changes: [],
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
    readyToSave: true,
  },
  operations: [],
};
function updated(revision: number, subject: string, action = 'lades till'): ConversationReply {
  return {
    id: `task-${revision}`,
    revision,
    text: '',
    reply: 'Utkastet är uppdaterat.',
    result: { kind: 'draft', message: 'Utkastet är uppdaterat.', changes: [{ subject, action }] },
  };
}

test('one final summary covers every queued update and is not repeated by polling', () => {
  const complete = conversationCompletion();
  const first = updated(1, 'Spotify');
  const second = updated(2, 'Abonnemanget', 'ändrades till Premium');
  expect(complete({ ...view, phase: 'working', completedReplies: [first] })).toBeUndefined();
  expect(
    complete({ ...view, queuedMessages: 1, completedReplies: [first, second] }),
  ).toBeUndefined();
  const final = { ...view, revision: 2, completedReplies: [first, second] };
  expect(complete(final)?.text).toBe('Spotify lades till. Abonnemanget ändrades till Premium.');
  expect(complete(final)).toBeUndefined();
  const third = updated(3, 'Johan');
  expect(complete({ ...final, revision: 3, completedReplies: [first, second, third] })?.text).toBe(
    'Johan lades till.',
  );
});

test('partial changes, failed instructions and outstanding questions stay distinct', () => {
  const complete = conversationCompletion();
  const first = updated(1, 'Spotify');
  const failed = {
    ...updated(2, 'Abonnemanget', 'ändrades till Premium'),
    request: 'Byt abonnemang och koppla Johan.',
    failed: true,
    reply: 'Anslutningen till modellen bröts innan kopplingen kunde göras.',
  };
  expect(
    complete({ ...view, phase: 'working', completedReplies: [first, failed] }),
  ).toBeUndefined();
  const result = complete({
    ...view,
    revision: 3,
    questionPending: true,
    questions: ['Ska Sonja läggas till som en ny person?'],
    completedReplies: [first, failed],
  });
  expect(result?.text).toBe(
    'Spotify lades till. Abonnemanget ändrades till Premium. ”Byt abonnemang och koppla Johan.”: Anslutningen till modellen bröts innan kopplingen kunde göras. Ska Sonja läggas till som en ny person?',
  );
  expect(result?.voiced).toBe(false);
});

test('the final checked questions replace questions answered by later queued instructions', () => {
  const complete = conversationCompletion();
  const first = {
    ...updated(1, 'Spotify'),
    questionPending: true,
    text: 'Vilken Johan?',
  };
  complete({ ...view, phase: 'working', completedReplies: [first] });
  const text = complete({
    ...view,
    revision: 2,
    completedReplies: [first, updated(2, 'Johan', 'lades till som användare för Spotify')],
    questionPending: false,
  })?.text;
  expect(text).toContain('Johan lades till som användare för Spotify.');
  expect(text).not.toContain('Vilken Johan?');
});

test('reset clears an unfinished summary and cancellation does not claim all tasks succeeded', () => {
  const complete = conversationCompletion();
  const first = updated(1, 'Spotify');
  complete({ ...view, phase: 'working', completedReplies: [first] });
  expect(complete({ ...view, contextRevision: 1 })).toBeUndefined();
  expect(
    complete({
      ...view,
      contextRevision: 1,
      canceled: true,
      completedReplies: [first],
    })?.text,
  ).toBe('Arbetet avbröts. Återstående uppgifter slutfördes inte. Spotify lades till.');
});

test('recovery and active task status defer the summary until the outcome is known', () => {
  const complete = conversationCompletion();
  const first = updated(1, 'Spotify');
  expect(complete({ ...view, phase: 'recovery', completedReplies: [first] })).toBeUndefined();
  expect(
    complete({
      ...view,
      tasks: [{ id: 'next', status: 'working', receivedAt: 0, deadline: 100 }],
      completedReplies: [first],
    }),
  ).toBeUndefined();
  expect(complete({ ...view, completedReplies: [first] })?.text).toBe('Spotify lades till.');
});

test('the final reply groups object additions and relationships across queued messages', () => {
  const complete = conversationCompletion();
  const lina = updated(1, 'Lina');
  lina.result?.changes?.push({ subject: 'Lina', action: 'använder Spotify' });
  const kajsa = updated(2, 'Kajsa');
  kajsa.result?.changes?.push({ subject: 'Kajsa', action: 'använder Spotify' });
  expect(complete({ ...view, phase: 'working', completedReplies: [lina] })).toBeUndefined();
  expect(complete({ ...view, revision: 2, completedReplies: [lina, kajsa] })?.text).toBe(
    'Lina och Kajsa lades till. Lina och Kajsa använder Spotify.',
  );
});

test('independent facts survive when a later queued instruction resolves the question', () => {
  const complete = conversationCompletion();
  const first: ConversationReply = {
    id: 'first',
    revision: 1,
    text: 'Lo är en person. Vilken Johan?',
    questionPending: true,
    questions: ['Vilken Johan?'],
  };
  expect(complete({ ...view, phase: 'working', completedReplies: [first] })).toBeUndefined();
  expect(
    complete({
      ...view,
      revision: 2,
      completedReplies: [first, updated(2, 'Johan', 'lades till som användare för Spotify')],
      questionPending: false,
    })?.text,
  ).toBe('Johan lades till som användare för Spotify. Lo är en person.');
});

test('conversation alone is not evidence of a draft update', () => {
  expect(
    conversationCompletion()({
      ...view,
      modelReply: 'Allt är ordnat!',
      completedReplies: [{ id: 'model', revision: 1, text: 'Allt är ordnat!' }],
    }),
  ).toBeUndefined();
});

test('questions survive completed reply and final view changes until explicitly resolved', () => {
  const complete = conversationCompletion();
  const question = 'Vem använder cykeln?';
  const asked: ConversationReply = {
    id: 'question',
    revision: 1,
    text: question,
    questionPending: true,
    questions: [question],
  };
  expect(complete({ ...view, phase: 'working', completedReplies: [asked] })).toBeUndefined();
  const final = { ...view, revision: 2, completedReplies: [updated(2, 'Väskan')] };
  expect(complete(final)?.text).toBe(`Väskan lades till. ${question}`);
  expect(complete(final)).toBeUndefined();
  expect(
    complete({
      ...view,
      revision: 3,
      completedReplies: [updated(3, 'Hjälmen')],
      questionPending: false,
    })?.text,
  ).toBe('Hjälmen lades till.');
});
