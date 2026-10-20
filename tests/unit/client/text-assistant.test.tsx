import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { defaultConversationPreferences } from '../../../src/shared/conversation-preferences.js';
import type {
  MapObject,
  ObjectType,
  RelationshipType,
  SaveReceipt,
} from '../../../src/shared/map.js';
import { defaultViewSettings } from '../../../src/shared/personal-view.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import {
  closeConversationText,
  findConsentBox,
  openConversationText,
  queryConsentBox,
  startConversationWithText,
  startConversationWithVoice,
} from '../../support/conversation-dom.js';
import { StandaloneConversation } from '../../support/conversation-harness.js';
import { openNewObjectForm, renderHouseholdWork } from '../../support/native-household-unit.js';

const path = '/api/households/linden/text-assistant';
function session(): TextAssistantView {
  return {
    id: 'session',
    revision: 0,
    phase: 'ready',
    operations: [],
    review: {
      version: 0,
      contentVersion: 1,
      changes: [],
      readyToSave: false,
      conflicts: [],
      unresolvedIdentities: [],
      pendingOperations: [],
    },
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('the working row stands last in the conversation text, and no working time is counted', async () => {
  let current: TextAssistantView = { ...session(), phase: 'working', modelReply: 'Ett svar.' };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/cancel'))
      current = { ...current, phase: 'ready', revision: 1, modelReply: undefined };
    return Response.json(current);
  });
  showAssistant();
  await startConversationWithText();
  const rows = () =>
    within(screen.getByRole('log', { name: 'Samtalstext' }))
      .getAllByRole('listitem')
      .map((row) => row.textContent);
  expect(rows()).toEqual([
    'Skyttel: Ett svar.',
    'Skyttel arbetar… 0 meddelanden väntar. Tryck på Escape för att avbryta.',
  ]);
  expect(screen.queryByRole('timer')).toBeNull();
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), '{Escape}');
  expect(rows()).toEqual(['Skyttel: Ett svar.']);
});

function showAssistant(onMapChange = vi.fn(), onAccessLost = vi.fn()) {
  return render(
    <StandaloneConversation
      householdId="linden"
      onMapChange={onMapChange}
      onAccessLost={onAccessLost}
      onSelectItem={async () => false}
    />,
  );
}

test('the shared workspace keeps the map available before consent', async () => {
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.includes('/map?'))
      return Response.json({
        userId: 'alex',
        contentVersion: 1,
        types: [],
        objects: [],
        relationshipTypes: [],
        relationships: [],
        draft: { version: 0, changes: [] },
      });
    if (url.endsWith('/map/view'))
      return Response.json({
        contentVersion: 1,
        positions: [],
        settings: { ...defaultViewSettings, version: 0 },
      });
    if (url.endsWith('/map/conversation-preferences'))
      return Response.json(defaultConversationPreferences);
    if (url.endsWith('/map/operations')) return Response.json({ operations: [] });
    return Response.json({ available: true });
  });
  renderHouseholdWork('linden');
  expect(await screen.findByRole('button', { name: 'Prata med Skyttel' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Aktuell status' })).toBeNull();
  expect(screen.getByRole('region', { name: 'Hushållskarta' })).toBeDefined();
  expect(screen.queryByRole('region', { name: 'Skriv till Skyttel' })).toBeNull();
  const form = await openNewObjectForm();
  expect(form.getByLabelText('Namn', { exact: true })).toBeDefined();
  expect(queryConsentBox()).toBeNull();
  await userEvent.click(form.getByRole('button', { name: 'Avbryt' }));
  // Opening the text view starts nothing; actual use asks for consent.
  await openConversationText();
  expect(queryConsentBox()).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samtal' }));
  expect(await findConsentBox()).toBeDefined();
  expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
});

test('the text view shows empty conversation text, the message field and a collapsed draft', async () => {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
    Response.json(url === path && init?.method !== 'POST' ? { available: true } : session()),
  );
  showAssistant();
  await startConversationWithText();
  const textView = within(await screen.findByRole('region', { name: 'Skriv till Skyttel' }));
  expect(textView.getByRole('heading', { name: 'Skriv till Skyttel', level: 2 })).toBeDefined();
  expect(textView.getByRole('log', { name: 'Samtalstext' }).textContent).toBe(
    'Här visas det du och Skyttel säger och skriver.',
  );
  const field = textView.getByRole('textbox', { name: 'Meddelande till Skyttel' });
  expect(field.getAttribute('placeholder')).toBe('Berätta vad du vill göra…');
  // On a computer the message field has the focus when the text view opens.
  expect(document.activeElement).toBe(field);
  const draftButton = textView.getByRole('button', { name: /^Visa utkastet/ });
  expect(draftButton.getAttribute('aria-expanded')).toBe('false');
  await userEvent.click(draftButton);
  const draft = within(textView.getByRole('region', { name: 'Utkastet' }));
  expect(draft.getByRole('heading', { name: 'Utkast' })).toBeDefined();
  expect(draft.getByText('Utkastet är tomt.')).toBeDefined();
  for (const removed of [
    'Samtalskontroller',
    'Öppna samtalet',
    'Tala eller skriv',
    'Fortsätt skriva',
    'Avsluta samtalet',
    'Samtalstexten kan innehålla fel',
  ])
    expect(screen.queryByText(removed, { exact: false })).toBeNull();

  // The text button closes the text view and opens it again. Unsent text stays.
  await userEvent.type(field, 'Oskickat');
  await userEvent.click(textView.getByRole('button', { name: 'Stäng textvyn' }));
  expect(screen.queryByRole('region', { name: 'Skriv till Skyttel' })).toBeNull();
  await openConversationText();
  expect(
    (screen.getByRole('textbox', { name: 'Meddelande till Skyttel' }) as HTMLTextAreaElement).value,
  ).toBe('Oskickat');
  await closeConversationText();
  expect(screen.queryByRole('region', { name: 'Skriv till Skyttel' })).toBeNull();
});

test('a sent message stands in the conversation text, and the message field keeps the focus', async () => {
  let current = session();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/messages'))
      current = { ...current, revision: current.revision + 1, modelReply: 'Hyran är ändrad.' };
    return Response.json(current);
  });
  showAssistant();
  await startConversationWithText();
  const field = await screen.findByRole('textbox', { name: 'Meddelande till Skyttel' });
  const send = screen.getByRole('button', { name: 'Skicka' }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  // Enter does nothing while there is nothing to send.
  await userEvent.type(field, '{Enter}');
  await userEvent.type(field, 'Ändra hyran');
  await userEvent.click(send);
  expect(document.activeElement).toBe(field);
  await userEvent.type(field, 'Rad ett{Shift>}{Enter}{/Shift}rad två{Enter}');
  expect(document.activeElement).toBe(field);
  await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''));
  const rows = within(screen.getByRole('log', { name: 'Samtalstext' })).getAllByRole('listitem');
  expect(rows.map((row) => row.textContent)).toEqual([
    'Du: Ändra hyran',
    'Skyttel: Hyran är ändrad.',
    'Du: Rad ett\nrad två',
    'Skyttel: Hyran är ändrad.',
  ]);
  // No name is shown. Screen readers are told who said what.
  expect(rows.map((row) => row.className)).toEqual([
    'conversation-row user',
    'conversation-row assistant',
    'conversation-row user',
    'conversation-row assistant',
  ]);
  expect(rows[0].querySelector('.visually-hidden')?.textContent).toBe('Du: ');
});

test('voice can start directly after consent and text remains available if the microphone fails', async () => {
  const posts: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(url);
    return Response.json(init?.method === 'POST' ? session() : { available: true });
  });
  showAssistant();
  await startConversationWithVoice();
  expect(screen.queryByRole('textbox', { name: 'Meddelande till Skyttel' })).toBeNull();
  await openConversationText();
  expect(await screen.findByRole('textbox', { name: 'Meddelande till Skyttel' })).toBeTruthy();
  expect((await screen.findByRole('region', { name: 'Samtalsnotis' })).textContent).toContain(
    'Webbläsaren har inte stöd för röst. Du kan skriva till Skyttel.',
  );
  expect(posts).toEqual([path]);
});

test('unverified model conversation stays separate from receipt and selection status, including useful questions', async () => {
  const modelReply = 'Klart. Ändringarna är nu lagrade i hushållets karta. Vem betalar?';
  let current: TextAssistantView = { ...session(), modelReply };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/messages'))
      current = { ...current, revision: 1, displayedSelection: 'bike' };
    return Response.json(current);
  });
  showAssistant();
  await startConversationWithText();
  const conversation = await screen.findByRole('log', { name: 'Samtalstext' });
  expect(conversation.textContent).toContain(modelReply);
  expect(screen.getByRole('status').textContent).toContain('Nya förslag är osparade');
  expect(screen.getByRole('status').textContent).not.toContain('lagrade');
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Markera cykeln.');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  expect(screen.getByRole('status').textContent).toBe('Markerat i kartan.');
  expect(conversation.textContent).toContain('Vem betalar?');
});

test('recovery retains the pending operation until its durable receipt replaces model claims', async () => {
  let current: TextAssistantView = { ...session(), phase: 'recovery' };
  const identity = {
    operationId: 'same-save',
    householdId: 'linden',
    userId: 'alex',
    draftVersion: 2,
    contentVersion: 1,
    createdAt: '2026-09-24T12:00:00Z',
  };
  const receipt: SaveReceipt = { ...identity, savedAt: identity.createdAt, changes: [] };
  const requests: { url: string; body: unknown }[] = [];
  let recoveries = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/stop')) return Response.json({ stopped: true });
    if (init?.method === 'POST') requests.push({ url, body: JSON.parse(String(init.body)) });
    if (url.endsWith('/recover') && recoveries++ === 0)
      current = {
        ...current,
        phase: 'recovery',
        error: 'assistant_save_unknown',
        operations: [
          { ...identity, operationId: 'older-save', status: 'rejected', error: 'content_conflict' },
          { ...identity, status: 'pending' },
        ],
      };
    else if (url.endsWith('/recover'))
      current = {
        ...current,
        phase: 'ready',
        error: undefined,
        receipt,
        reply: 'Ett obekräftat modellpåstående som inte ska ersätta kvittot.',
        saveCheck: {
          id: 'checked-save',
          reply:
            'Kontrollen visar att hela utkastet sparades. Ändringarna finns i hushållets karta.',
          receipt,
          operations: [{ ...identity, status: 'succeeded', receipt }],
        },
        operations: [{ ...identity, status: 'succeeded', receipt }],
      };
    if (url.endsWith('/new'))
      current = {
        ...current,
        revision: current.revision + 1,
        receipt: undefined,
        saveCheck: undefined,
        reply: 'Nytt samtal. Utkastet är tomt.',
      };
    return Response.json(current);
  });
  const changed = vi.fn();
  showAssistant(changed);
  await startConversationWithText();
  await userEvent.type(await screen.findByLabelText('Meddelande till Skyttel'), 'Nästa ändring');
  expect((screen.getByRole('button', { name: 'Skicka' }) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(recoveries).toBe(2));
  await waitFor(() =>
    expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).toContain(
      'Kontrollen visar att hela utkastet sparades.',
    ),
  );
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual({
    url: `${path}/session/recover`,
    body: { checkId: expect.any(String) },
  });
  expect(requests[1]).toEqual(requests[0]);
  expect(screen.queryByRole('button', { name: 'Kontrollera sparresultat' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Aktuell status' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Kontrollera sparresultat' })).toBeNull();
  expect(screen.queryByText(/Ett obekräftat modellpåstående/)).toBeNull();
  expect(changed).toHaveBeenCalledTimes(2);
  expect((screen.getByRole('button', { name: 'Skicka' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  // A new conversation empties the conversation text without the consent box.
  // The unsent text stays, and Skyttel says what the draft keeps.
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samtal' }));
  await waitFor(() =>
    expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).toBe(
      'Skyttel: Nytt samtal. Utkastet är tomt.',
    ),
  );
  expect(queryConsentBox()).toBeNull();
  expect((screen.getByLabelText('Meddelande till Skyttel') as HTMLTextAreaElement).value).toBe(
    'Nästa ändring',
  );
  expect(screen.queryByText('Visa kvittot')).toBeNull();
  expect(requests.at(-1)).toEqual({ url: `${path}/session/new`, body: { discard: false } });
});

test.each([
  'assistant_save_not_requested',
  'assistant_draft_changed',
  'assistant_conflict',
  'operation_pending',
  'provider_unavailable',
])('a %s task failure shows the shared notice and preserves newly typed text', async (code) => {
  let release!: (response: Response) => void;
  const current = session();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/stop')) return Response.json({ stopped: true });
    if (url.endsWith('/messages'))
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    return Response.json(current);
  });
  showAssistant();
  await startConversationWithText();
  const input = await screen.findByLabelText('Meddelande till Skyttel');
  await userEvent.type(input, 'Ändra hyran');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await userEvent.clear(input);
  await userEvent.type(input, 'Mitt nästa meddelande');
  await act(async () =>
    release(
      Response.json({ ...current, phase: 'error', error: code, reply: 'Kontrollera förslaget.' }),
    ),
  );
  expect(screen.getByRole('region', { name: 'Samtalsnotis' }).textContent).toContain(
    'Skyttel kunde inte slutföra uppdraget. Försök igen.',
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect((input as HTMLTextAreaElement).value).toBe('Mitt nästa meddelande');
});

test('a working task can be cancelled and an expired session clears private text without removing household access', async () => {
  let current = { ...session(), phase: 'working' as const, revision: 3 } as TextAssistantView;
  const lost = vi.fn();
  const cancelled = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/cancel')) {
      cancelled(JSON.parse(String(init?.body)));
      current = { ...current, revision: 4, phase: 'ready' };
    }
    if (url.endsWith('/new')) return Response.json({ error: 'not_found' }, { status: 404 });
    if (url.endsWith('/stop')) return Response.json({ stopped: true });
    return Response.json(current);
  });
  showAssistant(vi.fn(), lost);
  await startConversationWithText();
  expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).toContain(
    'Skyttel arbetar…',
  );
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), '{Escape}');
  expect(cancelled).toHaveBeenCalledExactlyOnceWith({
    revision: 3,
    contextRevision: 0,
    all: true,
  });
  expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).not.toContain(
    'Skyttel arbetar…',
  );
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Privat nästa meddelande');
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samtal' }));
  expect(
    await screen.findByText(/Samtalet har avslutats eller innehållet har ersatts/),
  ).toBeDefined();
  expect(screen.queryByDisplayValue('Privat nästa meddelande')).toBeNull();
  // An expired conversation permits an explicit new start; empty text cannot send.
  expect((screen.getByRole('button', { name: 'Nytt samtal' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  expect((screen.getByRole('button', { name: 'Skicka' }) as HTMLButtonElement).disabled).toBe(true);
  expect(lost).not.toHaveBeenCalled();
});

test.each([false, 'unreachable'])(
  'unavailable assistant (%s) leaves the manual map as the offered path',
  async (availability) => {
    vi.stubGlobal('fetch', async () => {
      if (availability === 'unreachable') throw new TypeError('Synthetic unavailable service');
      return Response.json({ available: availability });
    });
    showAssistant();
    expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull();
    await openConversationText();
    expect(queryConsentBox()).toBeNull();
    expect(await screen.findByRole('region', { name: 'Samtalsnotis' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Samtalsnotis' }).textContent).toContain(
      availability === 'unreachable'
        ? 'Ingen kontakt med Skyttel. Försök igen när kontakten är tillbaka.'
        : 'Samtal med Skyttel är inte tillgängligt just nu.',
    );
    expect(screen.getByRole('region', { name: 'Skriv till Skyttel' })).toBeDefined();
  },
);

test('closing the panel during connection creation stops the late session', async () => {
  let release!: (response: Response) => void;
  const stopped = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/stop')) {
      stopped(url);
      return Response.json({ stopped: true });
    }
    if (init?.method === 'POST')
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    return Response.json({ available: true });
  });
  const panel = showAssistant();
  await openConversationText();
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samtal' }));
  await userEvent.click(
    within(await findConsentBox()).getByRole('button', { name: 'Godkänn och starta' }),
  );
  panel.unmount();
  await act(async () => release(Response.json(session())));
  expect(stopped).toHaveBeenCalledExactlyOnceWith(`${path}/session/stop`);
});

test.each(['Escape', 'Nytt samtal'])(
  'a delayed working poll cannot restore a task or select an object after %s',
  async (action) => {
    let release!: (response: Response) => void;
    const polled = vi.fn();
    const selected = vi.fn(async () => false);
    const current: TextAssistantView = { ...session(), revision: 2, phase: 'working' };
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === path)
        return Response.json(init?.method === 'POST' ? current : { available: true });
      if (url.endsWith('/cancel'))
        return Response.json({ ...current, revision: 3, phase: 'ready' });
      if (url.endsWith('/new'))
        return Response.json({
          ...current,
          revision: 3,
          phase: 'ready',
          reply: 'Nytt samtal. Utkastet är tomt.',
        });
      if (url.endsWith('/stop')) return Response.json({ stopped: true });
      if (url === `${path}/session`) {
        polled();
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    render(
      <StandaloneConversation
        householdId="linden"
        onMapChange={vi.fn()}
        onAccessLost={vi.fn()}
        onSelectItem={selected}
      />,
    );
    await startConversationWithText();
    await waitFor(() => expect(polled).toHaveBeenCalledOnce());
    if (action === 'Escape')
      await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), '{Escape}');
    else await userEvent.click(screen.getByRole('button', { name: action }));
    await act(async () =>
      release(
        Response.json({
          ...current,
          selection: { objectId: 'stale-bike', revision: 2 },
          reply: 'Ett gammalt svar',
        }),
      ),
    );
    expect(selected).not.toHaveBeenCalled();
    expect(screen.queryByText('Ett gammalt svar')).toBeNull();
    expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).not.toContain(
      'Skyttel arbetar…',
    );
    expect(screen.getByRole('status').textContent).toContain('Nya förslag är osparade');
    expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).toBe(
      action === 'Nytt samtal'
        ? 'Skyttel: Nytt samtal. Utkastet är tomt.'
        : 'Här visas det du och Skyttel säger och skriver.',
    );
  },
);

test.each([true, false])(
  'map selection is acknowledged only with the actual map result (%s)',
  async (displayable) => {
    const current: TextAssistantView = {
      ...session(),
      phase: 'working',
      selection: { objectId: 'bike', revision: 0 },
    };
    const acknowledged = vi.fn();
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === path)
        return Response.json(init?.method === 'POST' ? current : { available: true });
      if (url.endsWith('/selection')) {
        acknowledged(JSON.parse(String(init?.body)));
        return Response.json({
          ...current,
          selection: undefined,
          phase: 'ready',
          displayedSelection: displayable ? 'bike' : undefined,
        });
      }
      if (url.endsWith('/stop')) return Response.json({ stopped: true });
      return Response.json(current);
    });
    function HouseholdSelection() {
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <>
          {selected && <p>Kartans markerade objekt: {selected}</p>}
          <StandaloneConversation
            householdId="linden"
            onMapChange={vi.fn()}
            onAccessLost={vi.fn()}
            onSelectItem={async (target) => {
              if (displayable) setSelected(target.id);
              return displayable;
            }}
          />
        </>
      );
    }
    render(<HouseholdSelection />);
    await startConversationWithText();
    await waitFor(() =>
      expect(acknowledged).toHaveBeenCalledExactlyOnceWith({
        objectId: 'bike',
        kind: 'object',
        id: 'bike',
        revision: 0,
        displayed: displayable,
      }),
    );
    if (displayable) {
      expect(screen.getByText('Kartans markerade objekt: bike')).toBeDefined();
      expect(await screen.findByText('Markerat i kartan.')).toBeDefined();
    } else expect(screen.queryByText('Markerat i kartan.')).toBeNull();
  },
);

test('canceling while the map display is pending aborts it and prevents a late acknowledgement', async () => {
  const current: TextAssistantView = {
    ...session(),
    phase: 'working',
    revision: 1,
    selection: { objectId: 'bike', revision: 1 },
  };
  let finishDisplay!: (displayed: boolean) => void;
  let displaySignal!: AbortSignal;
  let finishCancel!: (response: Response) => void;
  const acknowledged = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/cancel'))
      return new Promise<Response>((resolve) => {
        finishCancel = resolve;
      });
    if (url.endsWith('/selection')) {
      acknowledged();
      return Response.json({ error: 'assistant_turn_changed' }, { status: 409 });
    }
    if (url.endsWith('/stop')) return Response.json({ stopped: true });
    return Response.json(current);
  });
  render(
    <StandaloneConversation
      householdId="linden"
      onMapChange={vi.fn()}
      onAccessLost={vi.fn()}
      onSelectItem={(_target, signal) => {
        displaySignal = signal;
        return new Promise<boolean>((resolve) => {
          finishDisplay = resolve;
        });
      }}
    />,
  );
  await startConversationWithText();
  await waitFor(() => expect(displaySignal).toBeDefined());
  expect(acknowledged).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), '{Escape}');
  expect(displaySignal.aborted).toBe(true);
  await act(async () => finishDisplay(true));
  expect(acknowledged).not.toHaveBeenCalled();
  await act(async () =>
    finishCancel(Response.json({ ...current, revision: 2, phase: 'ready', selection: undefined })),
  );
  expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).not.toContain(
    'Skyttel arbetar…',
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

test('the draft table exposes every change, free properties, type edits and relationship endpoints', async () => {
  const type: ObjectType = {
    id: 'vehicle',
    householdId: 'linden',
    revision: 1,
    name: 'Fordon',
    description: 'Hushållets fordon',
  };
  const edgeType: RelationshipType = {
    id: 'uses',
    householdId: 'linden',
    revision: 1,
    name: 'Använder',
    description: 'Användning',
    forwardLabel: 'använder',
    reverseLabel: 'används av',
  };
  const old: MapObject = {
    id: 'bike',
    householdId: 'linden',
    revision: 1,
    typeId: type.id,
    name: 'Gammal cykel',

    properties: [
      { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Före rättning' },
      { id: 'colour', label: 'Färg', kind: 'text', value: 'Blå' },
      { id: 'price', label: 'Pris', kind: 'number', value: 100 },
    ],
  };
  const duplicate: MapObject = {
    ...old,
    id: 'duplicate',
    name: 'Dubblett',

    properties: [
      { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Det andra objektet' },
    ],
  };
  const edge = {
    id: 'edge',
    householdId: 'linden',
    revision: 1,
    typeId: edgeType.id,
    sourceId: 'alex',
    targetId: 'bike',
  };
  const current = session();
  current.review = {
    ...current.review,
    version: 5,
    changes: [
      {
        id: 'bike',
        type,
        beforeType: { ...type, name: 'Tidigare fordonstyp' },
        before: old,
        after: {
          ...old,
          name: 'Rättad cykel',

          lifecycle: 'ended',
          properties: [
            { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Efter rättning' },
            { id: 'colour', label: 'Färg', kind: 'text', value: 'Röd' },
            { id: 'price', label: 'Pris', kind: 'number', value: 150 },
          ],
        },
      },
      { id: 'duplicate', type, before: duplicate, after: null },
      {
        id: 'unknown-bike',
        type,
        before: null,
        after: { ...old, name: 'Oklar cykel', identity: 'unresolved' },
      },
      {
        id: 'unspecified-bike',
        type,
        before: null,
        after: { ...old, name: 'En annan cykel', identity: 'unspecified' },
      },
    ],
    relationships: [
      {
        id: 'edge',
        type: edgeType,
        before: edge,
        after: {
          ...edge,
          properties: [
            { id: 'uncertainty', label: 'Osäkert uppgivet', kind: 'boolean', value: true },
          ],
        },
        objectNames: { alex: 'Alex', bike: 'Rättad cykel' },
      },
      {
        id: 'none',
        type: edgeType,
        before: null,
        after: { ...edge, targetId: 'none-bike' },
      },
      {
        id: 'unknown',
        type: edgeType,
        before: null,
        after: { ...edge, targetId: 'unknown-bike' },
      },
      {
        id: 'unresolved',
        type: edgeType,
        before: null,
        after: { ...edge, targetId: 'unresolved-bike' },
      },
      { id: 'removed', type: edgeType, before: { ...edge, sourceId: 'robin' }, after: null },
    ],
    objectTypes: [
      { id: type.id, before: type, after: { ...type, name: 'Cykeltyp' } },
      {
        id: 'retired-type',
        before: { ...type, id: 'retired-type', name: 'Utgående typ' },
        after: null,
      },
    ],
    relationshipTypes: [
      { id: edgeType.id, before: edgeType, after: { ...edgeType, name: 'Delad användning' } },
      {
        id: 'retired-edge',
        before: { ...edgeType, id: 'retired-edge', name: 'Utgående sambandstyp' },
        after: null,
      },
    ],
    current: { types: [type], relationshipTypes: [edgeType] },
    conflicts: [
      {
        kind: 'object',
        id: 'bike',
        current: { ...old, name: 'Robins rättning', revision: 2 },
        type: { ...type, name: 'Ny gemensam fordonstyp' },
      },
      { kind: 'object', id: 'duplicate', current: duplicate, connections: [edge] },
      { kind: 'object', id: 'unknown-bike', current: null, type: null },
      { kind: 'objectType', id: type.id, current: { ...type, name: 'Robins typförslag' } },
      {
        kind: 'relationshipType',
        id: edgeType.id,
        current: { ...edgeType, name: 'Robins sambandstyp' },
      },
      {
        kind: 'relationship',
        id: 'edge',
        current: { ...edge },
        duplicates: [edge],
      },
      { kind: 'relationship', id: 'removed', current: null, missingEndpoints: ['robin'] },
      { kind: 'relationship', id: 'none', current: { ...edge, targetId: 'bike' } },
      {
        kind: 'relationship',
        id: 'unknown',
        current: { ...edge, typeId: 'removed-type', targetId: 'bike' },
      },
    ],
    unresolvedIdentities: [{ kind: 'object', id: 'unknown-bike' }],
  };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/stop')) return Response.json({ stopped: true });
    return Response.json(current);
  });
  showAssistant();
  await startConversationWithText();
  await userEvent.click(screen.getByRole('button', { name: /^Visa utkastet/ }));
  const review = within(await screen.findByRole('region', { name: 'Utkastet' }));
  const compact = review.getByRole('table', { name: 'Osparade ändringar' });
  expect(compact.textContent).toContain('Namn: Gammal cykel → Rättad cykel');
  expect(compact.textContent).toContain('Färg: Blå (Text) → Färg: Röd (Text)');
  expect(compact.textContent).toContain('Pris: 100 (Tal) → Pris: 150 (Tal)');
  expect(compact.textContent).toContain('Alex → använder → Rättad cykel');
  expect(compact.textContent).toContain('Objekttyp: Tidigare fordonstyp → Fordon');
  expect(compact.textContent).toContain('Namn: Fordon → Cykeltyp');
  expect(compact.textContent).toContain('Namn: Använder → Delad användning');
  expect(review.getAllByRole('row')).toHaveLength(14);
  const removed = within(review.getByRole('row', { name: /Dubblett/ }));
  expect(removed.getByText('Ta bort')).toBeDefined();
  const added = within(
    review.getByRole('rowheader', { name: 'Oklar cykel' }).closest('tr') as HTMLElement,
  );
  expect(added.getByText('Lägg till')).toBeDefined();
  expect(compact.textContent).toContain('alex → använder → none-bike');
  expect(compact.textContent).toContain('alex → använder → Oklar cykel');
  expect(compact.textContent).toContain('alex → använder → unresolved-bike');
  expect(review.queryByRole('link')).toBeNull();
});

test('a lost reply retains the message with recovery controls', async () => {
  const current = session();
  let posts = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url === `${path}/session`) return Response.json(current);
    if (url.endsWith('/stop')) return Response.json({ stopped: true });
    if (url.endsWith('/messages')) {
      posts++;
      throw new TypeError('Synthetic lost response');
    }
    throw new Error(`Unexpected request ${url}`);
  });
  render(
    <StandaloneConversation
      householdId="linden"
      onMapChange={vi.fn()}
      onAccessLost={vi.fn()}
      onSelectItem={async () => false}
    />,
  );
  await startConversationWithText();
  const input = await screen.findByLabelText('Meddelande till Skyttel');
  await userEvent.type(input, 'Rätta priset och spara.');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  expect(
    await screen.findByText('Skyttel kunde inte kontrollera om utkastet sparades.'),
  ).toBeDefined();
  expect((input as HTMLTextAreaElement).value).toBe('Rätta priset och spara.');
  expect(screen.getByRole('button', { name: 'Kontrollera om utkastet sparades' })).toBeDefined();
  expect((screen.getByRole('button', { name: 'Skicka' }) as HTMLButtonElement).disabled).toBe(true);
  expect(posts).toBe(1);
});

test('provider errors preserve manual work and revoked access clears the conversation', async () => {
  const current = session();
  const lost = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/messages')) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (url.endsWith('/stop')) return Response.json({ stopped: true });
    return Response.json(current);
  });
  render(
    <StandaloneConversation
      householdId="linden"
      onMapChange={vi.fn()}
      onAccessLost={lost}
      onSelectItem={async () => false}
    />,
  );
  await startConversationWithText();
  await userEvent.type(
    await screen.findByLabelText('Meddelande till Skyttel'),
    'Privat meddelande',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  expect(lost).toHaveBeenCalledOnce();
  expect(screen.queryByDisplayValue('Privat meddelande')).toBeNull();
});
