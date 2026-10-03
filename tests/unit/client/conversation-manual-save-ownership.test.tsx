import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useConversation } from '../../../src/client/use-conversation.js';
import type { SaveOperation, SaveReceipt } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

const path = '/api/households/linden/text-assistant';
const operation: SaveOperation = {
  operationId: 'known-manual-save',
  householdId: 'linden',
  userId: 'alex',
  draftVersion: 2,
  contentVersion: 1,
  status: 'pending',
  createdAt: '2026-10-03T10:00:00Z',
};
const receipt: SaveReceipt = {
  operationId: operation.operationId,
  householdId: operation.householdId,
  userId: operation.userId,
  draftVersion: operation.draftVersion,
  contentVersion: operation.contentVersion,
  changes: [],
  savedAt: '2026-10-03T10:01:00Z',
};
const initial: TextAssistantView = {
  id: 'conversation',
  revision: 0,
  phase: 'ready',
  operations: [operation],
  review: {
    version: 2,
    contentVersion: 1,
    changes: [],
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [operation],
    readyToSave: false,
  },
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

test('uncertain conversation delivery waits for a known manual save request and automatically checks the original operation when its ownership ends', async () => {
  vi.useFakeTimers();
  const checks: Record<string, unknown>[] = [];
  const changed = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') {
      if (url === path) return Response.json({ available: true });
      if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
      if (url.endsWith('/map/operations')) return Response.json({ operations: [operation] });
      return Response.json(initial);
    }
    if (url.endsWith('/messages')) throw Error('request outcome is unknown');
    if (url.endsWith('/recover')) {
      checks.push(JSON.parse(String(init.body)));
      return Response.json({
        ...initial,
        revision: 1,
        receipt,
        operations: [{ ...operation, status: 'succeeded', receipt }],
        review: { ...initial.review, pendingOperations: [] },
        saveCheck: {
          id: 'checked-original',
          reply: 'Det tidigare sparförsöket är bekräftat. Utkastet sparades.',
          receipt,
          operations: [{ ...operation, status: 'succeeded', receipt }],
        },
      });
    }
    return Response.json(initial);
  });
  const { result, rerender } = renderHook(
    ({ manualSaveOperationId }: { manualSaveOperationId?: string }) =>
      useConversation({
        householdId: 'linden',
        manualSaveOperationId,
        onStarted: () => {},
        onMapChange: changed,
        onAccessLost: () => {},
        onSelectItem: async () => false,
      }),
    {
      initialProps: { manualSaveOperationId: operation.operationId } as {
        manualSaveOperationId?: string;
      },
    },
  );
  await tick(0);
  expect(result.current.saveChecking).toBe(false);
  act(() => result.current.begin('text'));
  await act(async () => result.current.approve(false));
  await tick(0);
  expect(result.current.inputBlocked).toBe(false);
  act(() => result.current.setText('Ett uppdrag vars leverans blir oklar.'));
  await act(async () => result.current.send());
  expect(result.current.unknown).toBe(true);
  act(() => result.current.setText('Oskickat under kontrollen.'));
  await tick(1000);
  await act(async () => result.current.recover());
  expect(checks).toEqual([]);
  expect(result.current.unknown).toBe(true);
  rerender({ manualSaveOperationId: undefined });
  await tick(249);
  expect(checks).toEqual([]);
  await tick(1);
  expect(checks).toEqual([{ checkId: expect.stringMatching(/^[a-f0-9-]{36}$/) }]);
  expect(result.current.session?.receipt).toEqual(receipt);
  expect(result.current.session?.operations).toEqual([
    { ...operation, status: 'succeeded', receipt },
  ]);
  expect(
    result.current.transcript.filter((row) => row.role === 'assistant').map((row) => row.text),
  ).toEqual(['Det tidigare sparförsöket är bekräftat. Utkastet sparades.']);
  expect(result.current.unknown).toBe(false);
  expect(result.current.inputBlocked).toBe(false);
  expect(result.current.text).toBe('Oskickat under kontrollen.');
  expect(changed).toHaveBeenCalledTimes(2);
});
