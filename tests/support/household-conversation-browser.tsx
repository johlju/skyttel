import { render } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { page } from 'vitest/browser';
import { FormLeaveProvider } from '../../src/client/FormLeave.js';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import '../../src/client/styles.css';
import { defaultConversationPreferences } from '../../src/shared/conversation-preferences.js';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import { createAccountThemeFixture } from './account-theme-browser.js';

/** Real household composition with controlled replies at its public fetch boundary.
 * This does not establish HTTP admission, provider execution or durable storage. */
export async function openHouseholdConversation(
  width: number,
  height: number,
  state: MapState = {
    userId: 'alex',
    contentVersion: 0,
    types: [],
    relationshipTypes: [],
    relationships: [],
    objects: [],
    draft: { version: 0, changes: [] },
  },
  review: TextAssistantView['review'] = {
    ...state.draft,
    contentVersion: state.contentVersion,
    readyToSave: false,
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
  },
) {
  await page.viewport(width, height);
  let conversation: TextAssistantView = {
    id: 'browser-conversation',
    revision: 0,
    phase: 'ready',
    operations: [],
    review,
  };
  let available = true;
  let failNextReply = false;
  const messages: unknown[] = [];
  const theme = createAccountThemeFixture(state.userId);
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/theme-preference') return theme.respond(init);
    if (url.endsWith('/conversation-preferences'))
      return Response.json(defaultConversationPreferences);
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.endsWith('/view'))
      return Response.json({
        contentVersion: state.contentVersion,
        positions: [],
        settings: { ...defaultViewSettings, version: 0 },
      });
    if (url.includes('/map?') || url.endsWith('/map')) return Response.json(state);
    if (url.endsWith('/text-assistant'))
      return Response.json(init?.method === 'POST' ? conversation : { available });
    if (url.endsWith('/text-assistant/browser-conversation/voice'))
      return Response.json({
        assistant: conversation,
        voice: { id: 'browser-voice', phase: 'listening', seconds: null, usageFinal: false },
        sdp: 'synthetic-browser-answer',
      });
    if (url.endsWith('/text-assistant/browser-conversation/voice/browser-voice/poll'))
      return Response.json({
        assistant: conversation,
        voice: { id: 'browser-voice', phase: 'listening', seconds: null, usageFinal: false },
      });
    if (url.endsWith('/text-assistant/browser-conversation/voice/browser-voice/stop'))
      return Response.json({
        assistant: conversation,
        voice: { id: 'browser-voice', phase: 'closed', seconds: null, usageFinal: true },
      });
    if (url.endsWith('/text-assistant/browser-conversation/stop'))
      return Response.json(conversation);
    if (url.endsWith('/text-assistant/browser-conversation/messages')) {
      if (init?.method !== 'POST') throw new Error(`Unexpected message method: ${init?.method}`);
      messages.push(JSON.parse(String(init?.body)));
      conversation = {
        ...conversation,
        revision: conversation.revision + 1,
        phase: 'working',
        taskSource: 'text',
        taskStatus: 'working',
        taskId: 'browser-task',
      };
      if (failNextReply) {
        failNextReply = false;
        conversation = {
          ...conversation,
          phase: 'error',
          taskStatus: 'completed',
          taskId: undefined,
          taskSource: undefined,
          error: 'assistant_draft_changed',
        };
      }
      return Response.json(conversation);
    }
    if (url.endsWith('/text-assistant/browser-conversation')) return Response.json(conversation);
    throw new Error(`Unexpected request: ${url}`);
  });
  render(
    <theme.Boundary>
      <FormLeaveProvider>
        <main>
          <section className="panel household-panel">
            <HouseholdMap householdId="home" />
          </section>
        </main>
      </FormLeaveProvider>
    </theme.Boundary>,
  );
  await expect.element(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
  return {
    messages,
    setAvailable(value: boolean) {
      available = value;
    },
    failNextReply() {
      failNextReply = true;
    },
    completeReply(text: string) {
      conversation = {
        ...conversation,
        revision: conversation.revision + 1,
        phase: 'ready',
        taskStatus: 'completed',
        taskId: undefined,
        taskSource: undefined,
        modelReply: text,
        completedReplies: [
          { id: 'browser-task', text, revision: conversation.revision + 1, source: 'text' },
        ],
      };
    },
  };
}
