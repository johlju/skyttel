import { act, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import {
  commandConversation,
  conversationCommands,
  deferredResponse,
  requiredCommand,
} from '../../support/conversation-hook.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const choice = { model: 'gpt-6.1-sol', effort: 'high' } as const;

test('a rejected model choice preserves the current conversation and a later confirmed choice applies', async () => {
  let accepted = false;
  const next = { ...commandConversation, modelChoice: choice, modelChoiceRevision: 1 };
  const { result, commands } = await conversationCommands((path) => {
    if (!path.endsWith('/model-choice')) return;
    return accepted
      ? Response.json(next)
      : Response.json({ error: 'request_failed' }, { status: 503 });
  });
  act(() => result.current.setText('Behåll mitt oskickade meddelande.'));
  let changed!: boolean;
  await act(async () => {
    changed = await requiredCommand(result.current.configureModel)(choice);
  });
  expect(changed).toBe(false);
  expect(result.current.session?.modelChoice).toBeUndefined();
  expect(result.current.text).toBe('Behåll mitt oskickade meddelande.');
  accepted = true;
  await act(async () => {
    changed = await requiredCommand(result.current.configureModel)(choice);
  });
  expect(changed).toBe(true);
  expect(result.current.session?.modelChoice).toEqual(choice);
  expect(result.current.transcript.map((row) => row.text)).toEqual(['Tidigare privat samtal.']);
  expect(commands.map((entry) => entry.body)).toEqual([choice, choice]);
});

test('a model choice response cannot replace a conversation after leaving its household', async () => {
  const waiting = deferredResponse();
  const { result, rerender } = await conversationCommands((path) =>
    path.endsWith('/model-choice') ? waiting.promise : undefined,
  );
  let changing!: Promise<boolean>;
  act(() => {
    changing = requiredCommand(result.current.configureModel)(choice);
  });
  rerender({ householdId: 'other-household' });
  await act(async () => {
    waiting.resolve(Response.json({ ...commandConversation, modelChoice: choice }));
    expect(await changing).toBe(false);
  });
  expect(result.current.session?.modelChoice).toBeUndefined();
});

test('ending a conversation waits for confirmation, ignores repeat presses and clears private replies once', async () => {
  const waiting = deferredResponse();
  const { result, commands, onMapChange } = await conversationCommands((path) =>
    path.endsWith('/stop') ? waiting.promise : undefined,
  );
  onMapChange.mockClear();
  let ending!: Promise<void>;
  act(() => {
    ending = result.current.endConversation();
  });
  expect(result.current.pending).toBe(true);
  await act(async () => result.current.endConversation());
  expect(commands.filter((entry) => entry.path.endsWith('/stop'))).toHaveLength(1);
  expect(result.current.transcript).not.toEqual([]);
  await act(async () => {
    waiting.resolve(Response.json({}));
    await ending;
  });
  expect(result.current.session).toBeNull();
  expect(result.current.transcript).toEqual([]);
  expect(result.current.pending).toBe(false);
  expect(onMapChange).toHaveBeenCalledOnce();
  await act(async () => result.current.endConversation());
  expect(commands.filter((entry) => entry.path.endsWith('/stop'))).toHaveLength(1);
  expect(await requiredCommand(result.current.configureModel)(choice)).toBe(false);
});

test('a failed end retains the private conversation for an explicit retry', async () => {
  let accepted = false;
  const { result, commands } = await conversationCommands((path) => {
    if (path.endsWith('/stop'))
      return accepted
        ? Response.json({})
        : Response.json({ error: 'request_failed' }, { status: 503 });
  });
  await act(async () => result.current.endConversation());
  expect(result.current.session?.id).toBe('original');
  expect(result.current.transcript.map((row) => row.text)).toEqual(['Tidigare privat samtal.']);
  expect(result.current.unknown).toBe(true);
  expect(result.current.pending).toBe(false);
  accepted = true;
  await act(async () => result.current.endConversation());
  expect(result.current.session).toBeNull();
  expect(result.current.unknown).toBe(false);
  expect(commands.filter((entry) => entry.path.endsWith('/stop'))).toHaveLength(2);
});

test('a delayed end from the previous household cannot clear the replacement conversation', async () => {
  const waiting = deferredResponse();
  const { result, rerender, onMapChange } = await conversationCommands((path) =>
    path.endsWith('/stop') ? waiting.promise : undefined,
  );
  let ending!: Promise<void>;
  act(() => {
    ending = result.current.endConversation();
  });
  rerender({ householdId: 'other-household' });
  await act(async () => {
    await Promise.resolve();
  });
  onMapChange.mockClear();
  await act(async () => {
    waiting.resolve(Response.json({}));
    await ending;
  });
  expect(result.current.session?.id).toBe('original');
  expect(result.current.transcript.map((row) => row.text)).toEqual(['Tidigare privat samtal.']);
  expect(onMapChange).not.toHaveBeenCalled();
});
