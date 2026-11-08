import { renderHook, waitFor } from '@testing-library/react';
import { type ContextType, createElement, type ReactNode } from 'react';
import { expect, vi } from 'vitest';
import { TaskDeliveryContext } from '../../src/client/task-delivery.js';
import { useConversation } from '../../src/client/use-conversation.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';

export const commandConversation: TextAssistantView = {
  id: 'original',
  revision: 3,
  phase: 'ready',
  operations: [],
  modelReply: 'Tidigare privat samtal.',
  conversation: [{ role: 'assistant', text: 'Tidigare privat samtal.' }],
  review: {
    version: 0,
    contentVersion: 1,
    changes: [],
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
    readyToSave: false,
  },
};

export function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function requiredCommand<T extends (...args: never[]) => unknown>(
  command: T | undefined,
): T {
  if (!command) throw new Error('Expected the concrete conversation command');
  return command;
}

/** Exercise public hook commands with responses at the browser HTTP boundary. */
export async function conversationCommands(
  respond: (
    path: string,
    body: Record<string, unknown> | undefined,
  ) => Response | Promise<Response> | undefined,
  view = commandConversation,
  consent = true,
  delivery: ContextType<typeof TaskDeliveryContext> = null,
) {
  const commands: { path: string; body: Record<string, unknown> }[] = [];
  const onAccessLost = vi.fn();
  const onMapChange = vi.fn();
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    const body = init?.method === 'POST' ? JSON.parse(String(init.body)) : undefined;
    if (body) commands.push({ path, body });
    const response = respond(path, body);
    if (response) return response;
    if (path.endsWith('/conversation-consent'))
      return Response.json({
        saved: consent ? { textVersion: 4, savedAt: '2026-10-01T08:00:00Z' } : null,
      });
    if (path.endsWith('/text-assistant')) return Response.json({ available: true });
    if (path.endsWith('/restore')) return Response.json({ conversation: view });
    if (path.endsWith('/map/operations')) return Response.json({ operations: [] });
    return Response.json(view);
  });
  const hook = renderHook(
    ({ householdId }) =>
      useConversation({
        householdId,
        onAccessLost,
        onMapChange,
        onSelectItem: async () => false,
      }),
    {
      initialProps: { householdId: 'linden' },
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(TaskDeliveryContext.Provider, { value: delivery }, children),
    },
  );
  await waitFor(() => expect(hook.result.current.available).toBe(true));
  await waitFor(() => expect(hook.result.current.session?.id).toBe(view.id));
  return { ...hook, commands, onAccessLost, onMapChange };
}
