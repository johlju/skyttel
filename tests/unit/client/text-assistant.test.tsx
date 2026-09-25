import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { TextAssistant } from '../../../src/client/TextAssistant.js';
import type {
  MapObject,
  ObjectType,
  RelationshipType,
  SaveReceipt,
} from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

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

test('working time advances visibly without repeating live announcements and resets for a new request', async () => {
  vi.useFakeTimers();
  let current: TextAssistantView = { ...session(), phase: 'working' };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/cancel')) current = { ...current, phase: 'ready', revision: 1 };
    if (url.endsWith('/messages')) current = { ...current, phase: 'working', revision: 2 };
    return Response.json(current);
  });
  await act(async () => {
    showAssistant();
  });
  fireEvent.click(screen.getByLabelText(/Jag tillåter att OpenAI/));
  fireEvent.click(screen.getByLabelText(/Jag tillåter förslag och sparande/));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Starta textassistenten' })),
  );
  const announcement = screen.getByRole('status').textContent;
  await act(async () => vi.advanceTimersByTimeAsync(3100));
  expect(screen.getByText('3 s')).toBeDefined();
  expect(screen.getByRole('status').textContent).toBe(announcement);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(screen.getByRole('timer').textContent).toBe('1 min 3 s');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Avbryt uppdrag' })));
  expect(screen.queryByText('3 s')).toBeNull();
  expect(screen.queryByRole('timer')).toBeNull();
  fireEvent.change(screen.getByLabelText('Meddelande till textassistenten'), {
    target: { value: 'Fortsätt.' },
  });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Skicka' })));
  expect(screen.getByText('0 s')).toBeDefined();
});

async function consent() {
  await screen.findByRole('button', { name: 'Starta textassistenten' });
  await userEvent.click(screen.getByLabelText(/Jag tillåter att OpenAI/));
  await userEvent.click(screen.getByLabelText(/Jag tillåter förslag och sparande/));
  await userEvent.click(screen.getByRole('button', { name: 'Starta textassistenten' }));
}

function showAssistant(onMapChange = vi.fn(), onAccessLost = vi.fn()) {
  return render(
    <TextAssistant
      householdId="linden"
      onMapChange={onMapChange}
      onAccessLost={onAccessLost}
      onSelectItem={async () => false}
    />,
  );
}

test('the shared workspace keeps the map, draft and conversation available before consent', async () => {
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${url}`);
    return Response.json({ available: true });
  });
  render(
    <TextAssistant
      householdId="linden"
      onMapChange={vi.fn()}
      onAccessLost={vi.fn()}
      onSelectItem={async () => false}
      draftSummary={<p>Cykeln: föreslaget namn</p>}
    >
      <section aria-label="Hushållets karta">Kartan är tillgänglig</section>
    </TextAssistant>,
  );
  expect(await screen.findByRole('region', { name: 'Talsamtal' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Hushållets karta' }).textContent).toContain(
    'Kartan är tillgänglig',
  );
  expect(screen.getByRole('region', { name: 'Ändringar under samtalet' }).textContent).toContain(
    'Cykeln: föreslaget namn',
  );
  expect(screen.getByRole('region', { name: 'Samtalet' }).textContent).toContain(
    'Här visas vad du säger och vad Skyttel svarar.',
  );
  expect(
    ((await screen.findByRole('button', { name: 'Starta textassistenten' })) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
});

test('voice can start directly after consent and text remains available if the microphone fails', async () => {
  const posts: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(url);
    return Response.json(init?.method === 'POST' ? session() : { available: true });
  });
  showAssistant();
  const startVoice = await screen.findByRole('button', { name: 'Starta talsamtal' });
  expect((startVoice as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByLabelText(/Jag tillåter att OpenAI/));
  await userEvent.click(screen.getByLabelText(/Jag tillåter förslag och sparande/));
  await userEvent.click(startVoice);
  expect(
    await screen.findByRole('textbox', { name: 'Meddelande till textassistenten' }),
  ).toBeTruthy();
  expect(await screen.findByRole('alert')).toBeTruthy();
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
  await consent();
  const conversation = await screen.findByRole('region', { name: 'Assistentens samtalstext' });
  expect(within(conversation).getByRole('heading').textContent).toBe(
    'Assistentens samtalstext – inte en bekräftelse',
  );
  expect(conversation.textContent).toContain(modelReply);
  expect(conversation.textContent).toContain(
    'Sparande och markering bekräftas bara av Skyttels status och kvitton.',
  );
  expect(screen.getByRole('status').textContent).toContain('Nya förslag är osparade');
  expect(screen.getByRole('status').textContent).not.toContain('lagrade');
  await userEvent.type(screen.getByLabelText('Meddelande till textassistenten'), 'Markera cykeln.');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  expect(screen.getByRole('status').textContent).toBe('Markerat i kartan.');
  expect(conversation.textContent).toContain('Vem betalar?');
});

test('a pending save is recovered with the same operation and a durable receipt replaces model claims', async () => {
  let current = session();
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
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/stop')) return Response.json({ stopped: true });
    if (init?.method === 'POST') requests.push({ url, body: JSON.parse(String(init.body)) });
    if (url.endsWith('/recover'))
      current = {
        ...current,
        phase: 'recovery',
        error: 'assistant_save_unknown',
        operations: [
          { ...identity, operationId: 'older-save', status: 'rejected', error: 'content_conflict' },
          { ...identity, status: 'pending' },
        ],
      };
    if (url.endsWith('/retry'))
      current = {
        ...current,
        phase: 'ready',
        error: undefined,
        receipt,
        reply: 'Ett obekräftat modellpåstående som inte ska ersätta kvittot.',
        operations: [{ ...identity, status: 'succeeded', receipt }],
      };
    return Response.json(current);
  });
  const changed = vi.fn();
  showAssistant(changed);
  await consent();
  await userEvent.type(
    await screen.findByLabelText('Meddelande till textassistenten'),
    'Nästa ändring',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Kontrollera sparresultat' }));
  expect(await screen.findByText('Väntande sparförsök: same-save')).toBeDefined();
  expect(screen.getByText(/Avvisat: hushållets innehåll har ersatts/)).toBeDefined();
  expect((screen.getByRole('button', { name: 'Skicka' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Kontrollera det tidigare sparförsöket');
  await userEvent.click(screen.getByRole('button', { name: 'Slutför samma sparförsök' }));
  expect(requests).toEqual([
    { url: `${path}/session/recover`, body: {} },
    { url: `${path}/session/retry`, body: { operationId: 'same-save' } },
  ]);
  expect(await screen.findByText('Sparat. Hela utkastet finns i hushållets karta.')).toBeDefined();
  await userEvent.click(screen.getByText('Visa kvittot'));
  expect(screen.getAllByText('Sparat: . Kvitto: same-save.')).toHaveLength(2);
  expect(screen.getByText('Sparat: 2026-09-24T12:00:00Z')).toBeDefined();
  expect(screen.queryByText(/Ett obekräftat modellpåstående/)).toBeNull();
  expect(changed).toHaveBeenCalledTimes(2);
  expect((screen.getByRole('button', { name: 'Skicka' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Avsluta textassistenten' }));
  expect(screen.queryByLabelText('Meddelande till textassistenten')).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Starta textassistenten' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test.each([
  ['assistant_save_not_requested', 'Inget sparades. Skriv ett tydligt aktuellt sparbesked'],
  ['assistant_draft_changed', 'Utkastet eller kartan har ändrats.'],
  ['assistant_conflict', 'Utkastet eller kartan har ändrats.'],
  ['operation_pending', 'Sparresultatet behöver kontrolleras'],
  ['provider_unavailable', 'Du kan fortsätta i kartans formulär.'],
])(
  'a %s reply explains the next safe action and preserves newly typed text',
  async (code, message) => {
    let release!: (response: Response) => void;
    const current = session();
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === path)
        return Response.json(init?.method === 'POST' ? current : { available: true });
      if (url.endsWith('/stop')) return Response.json({ stopped: true });
      if (url.endsWith('/messages'))
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return Response.json(current);
    });
    showAssistant();
    await consent();
    const input = await screen.findByLabelText('Meddelande till textassistenten');
    await userEvent.type(input, 'Ändra hyran');
    await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
    await userEvent.clear(input);
    await userEvent.type(input, 'Mitt nästa meddelande');
    await act(async () =>
      release(
        Response.json({ ...current, phase: 'error', error: code, reply: 'Kontrollera förslaget.' }),
      ),
    );
    expect(screen.getByRole('alert').textContent).toContain(message);
    expect(screen.getByText('Kontrollera förslaget.')).toBeDefined();
    expect((input as HTMLTextAreaElement).value).toBe('Mitt nästa meddelande');
  },
);

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
    if (url.endsWith('/recover')) return Response.json({ error: 'not_found' }, { status: 404 });
    if (url.endsWith('/stop')) return Response.json({ stopped: true });
    return Response.json(current);
  });
  showAssistant(vi.fn(), lost);
  await consent();
  expect(screen.getByRole('status').textContent).toContain('Assistenten arbetar');
  await userEvent.click(screen.getByRole('button', { name: 'Avbryt uppdrag' }));
  expect(cancelled).toHaveBeenCalledExactlyOnceWith({ revision: 3 });
  expect(screen.queryByRole('button', { name: 'Avbryt uppdrag' })).toBeNull();
  await userEvent.type(
    screen.getByLabelText('Meddelande till textassistenten'),
    'Privat nästa meddelande',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Kontrollera sparresultat' }));
  expect(
    await screen.findByText(/Samtalet har avslutats eller innehållet har ersatts/),
  ).toBeDefined();
  expect(screen.queryByDisplayValue('Privat nästa meddelande')).toBeNull();
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
    expect(
      await screen.findByText(
        'Textassistenten är inte tillgänglig. Du kan använda kartan och formulären.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Starta textassistenten' })).toBeNull();
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
  await consent();
  panel.unmount();
  await act(async () => release(Response.json(session())));
  expect(stopped).toHaveBeenCalledExactlyOnceWith(`${path}/session/stop`);
});

test.each(['Avbryt uppdrag', 'Avsluta textassistenten'])(
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
      <TextAssistant
        householdId="linden"
        onMapChange={vi.fn()}
        onAccessLost={vi.fn()}
        onSelectItem={selected}
      />,
    );
    await consent();
    await waitFor(() => expect(polled).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole('button', { name: action }));
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
    expect(screen.queryByRole('button', { name: 'Avbryt uppdrag' })).toBeNull();
    if (action === 'Avsluta textassistenten')
      expect(screen.getByRole('button', { name: 'Starta textassistenten' })).toBeDefined();
    else expect(screen.getByRole('status').textContent).toContain('Nya förslag är osparade');
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
          <TextAssistant
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
    await consent();
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
    <TextAssistant
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
  await consent();
  await waitFor(() => expect(displaySignal).toBeDefined());
  expect(acknowledged).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Avbryt uppdrag' }));
  expect(displaySignal.aborted).toBe(true);
  await act(async () => finishDisplay(true));
  expect(acknowledged).not.toHaveBeenCalled();
  await act(async () =>
    finishCancel(Response.json({ ...current, revision: 2, phase: 'ready', selection: undefined })),
  );
  expect(screen.queryByRole('button', { name: 'Avbryt uppdrag' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('whole draft review exposes object facts, type edits, uncertain relationships, merge sources and current conflicts', async () => {
  const type: ObjectType = {
    id: 'vehicle',
    householdId: 'linden',
    revision: 1,
    name: 'Fordon',
    description: 'Hushållets fordon',
    fields: [{ id: 'colour', name: 'Färg', description: 'Lackens färg', kind: 'text' }],
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
    description: 'Före rättning',
    customValues: { colour: 'Blå' },
    financialFacts: { price: { knowledge: 'known', value: '100' } },
  };
  const duplicate: MapObject = {
    ...old,
    id: 'duplicate',
    name: 'Dubblett',
    description: 'Det andra objektet',
  };
  const edge = {
    id: 'edge',
    householdId: 'linden',
    revision: 1,
    typeId: edgeType.id,
    sourceId: 'alex',
    targetId: 'bike',
    knowledge: 'known' as const,
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
          description: 'Efter rättning',
          customValues: { colour: 'Röd' },
          financialFacts: { price: { knowledge: 'known', value: '150' } },
          lifecycle: 'ended',
        },
        merge: {
          survivorId: 'bike',
          absorbedId: 'duplicate',
          identityConfirmed: true,
          objects: [old, duplicate],
          types: [type],
          relationships: [edge],
          relationshipTypes: [edgeType],
          objectNames: { alex: 'Alex', bike: 'Gammal cykel' },
          previousChanges: [],
          previousRelationships: [],
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
        after: { ...edge, knowledge: 'uncertain' },
        objectNames: { alex: 'Alex', bike: 'Rättad cykel' },
      },
      {
        id: 'none',
        type: edgeType,
        before: null,
        after: { ...edge, targetId: null, knowledge: 'none' },
      },
      {
        id: 'unknown',
        type: edgeType,
        before: null,
        after: { ...edge, targetId: null, knowledge: 'unknown' },
      },
      {
        id: 'unresolved',
        type: edgeType,
        before: null,
        after: { ...edge, targetId: null, knowledge: 'unresolved' },
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
        current: { ...edge, knowledge: 'uncertain' },
        duplicates: [edge],
      },
      { kind: 'relationship', id: 'removed', current: null, missingEndpoints: ['robin'] },
      { kind: 'relationship', id: 'none', current: { ...edge, targetId: null, knowledge: 'none' } },
      {
        kind: 'relationship',
        id: 'unknown',
        current: { ...edge, typeId: 'removed-type', targetId: null, knowledge: 'unknown' },
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
  await consent();
  const review = within(await screen.findByRole('region', { name: 'Assistentens hela utkast' }));
  const compact = review.getByRole('list', { name: 'Alla föreslagna ändringar' });
  expect(compact.textContent).toContain('Namn: Gammal cykel → Rättad cykel');
  expect(compact.textContent).toContain('Färg: Blå → Röd');
  expect(compact.textContent).toContain('Pris: 100 → 150');
  expect(compact.textContent).toContain('Alex → använder → Rättad cykel (osäkert uppgivet)');
  expect(compact.textContent).toContain('Objekttyp: Fordon → Cykeltyp');
  expect(compact.textContent).toContain('Sambandstyp: Använder → Delad användning');
  expect(compact.textContent).toContain('Ta bort samband: robin');
  expect(review.getByText('Ta bort: Dubblett')).toBeDefined();
  expect(review.getByText('Lägg till: Oklar cykel')).toBeDefined();
  expect(review.queryByText('Inga förslag.')).toBeNull();
  await userEvent.click(review.getByText('Visa hela utkastets detaljer'));
  expect(review.getByText('Gammal cykel · Tidigare fordonstyp')).toBeDefined();
  expect(review.getByText('Rättad cykel · Fordon')).toBeDefined();
  expect(review.getByText('Färg: Röd')).toBeDefined();
  expect(review.getByText('Identiteten behöver redas ut.')).toBeDefined();
  expect(review.getByText('Uttryckligen ospecificerat objekt.')).toBeDefined();
  expect(
    review.getByText('Förslag: Alex → använder → Rättad cykel (osäkert uppgivet)'),
  ).toBeDefined();
  expect(review.getByText('Förslag: alex → använder → Uttryckligen inget')).toBeDefined();
  expect(review.getByText('Förslag: alex → använder → Okänt')).toBeDefined();
  expect(review.getByText('Förslag: alex → använder → Olöst identitet')).toBeDefined();
  expect(review.getByText('Robins rättning · Fordon')).toBeDefined();
  expect(review.getByText(/Typen har ändrats: Ny gemensam fordonstyp/)).toBeDefined();
  expect(review.getByText('Typen finns inte längre.')).toBeDefined();
  expect(review.getByText('Sambandet hänvisar till borttagna objekt.')).toBeDefined();
  expect(review.getByText('Motsvarande samband finns redan i kartan.')).toBeDefined();
  expect(review.getByText('Borttagningen berör även sparade samband.')).toBeDefined();
  expect(review.getAllByText('Finns inte i kartan').length).toBeGreaterThan(0);
  expect(review.getByText('alex → Samband → Okänt')).toBeDefined();
  expect(review.getByText('Alex → använder → Rättad cykel (osäkert uppgivet)')).toBeDefined();
  await userEvent.click(review.getByText('Granskade objekt före sammanslagningen'));
  expect(review.getByText('Dubblett · Identitet: duplicate')).toBeDefined();
  expect(review.getByText('Identitet: edge. Från alex till bike.')).toBeDefined();
});

test('separate choices start the conversation and a lost reply retains the message with recovery controls', async () => {
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
    <TextAssistant
      householdId="linden"
      onMapChange={vi.fn()}
      onAccessLost={vi.fn()}
      onSelectItem={async () => false}
    />,
  );
  const start = await screen.findByRole('button', { name: 'Starta textassistenten' });
  expect((start as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByLabelText(/Jag tillåter att OpenAI/));
  expect((start as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByLabelText(/Jag tillåter förslag och sparande/));
  await userEvent.click(start);
  const input = await screen.findByLabelText('Meddelande till textassistenten');
  await userEvent.type(input, 'Rätta priset och spara.');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  expect(await screen.findByText(/Svaret saknas/)).toBeDefined();
  expect((input as HTMLTextAreaElement).value).toBe('Rätta priset och spara.');
  expect(screen.getByRole('button', { name: 'Kontrollera sparresultat' })).toBeDefined();
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
    <TextAssistant
      householdId="linden"
      onMapChange={vi.fn()}
      onAccessLost={lost}
      onSelectItem={async () => false}
    />,
  );
  await screen.findByRole('button', { name: 'Starta textassistenten' });
  await userEvent.click(screen.getByLabelText(/Jag tillåter att OpenAI/));
  await userEvent.click(screen.getByLabelText(/Jag tillåter förslag och sparande/));
  await userEvent.click(screen.getByRole('button', { name: 'Starta textassistenten' }));
  await userEvent.type(
    await screen.findByLabelText('Meddelande till textassistenten'),
    'Privat meddelande',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  expect(lost).toHaveBeenCalledOnce();
  expect(screen.queryByDisplayValue('Privat meddelande')).toBeNull();
});
