import { type APIRequestContext, request } from '@playwright/test';
import {
  act,
  cleanup,
  configure,
  fireEvent,
  getConfig,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { FormLeaveProvider } from '../../../src/client/FormLeave.js';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import type { MapState } from '../../../src/shared/map.js';
import { createHousehold, signIn } from '../../support/client.js';
import {
  closeConversationText,
  giveConversationConsent,
  openConversationText,
  startConversationWithText,
  startConversationWithVoice,
} from '../../support/conversation-dom.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { openDraftReview, openNewObjectForm } from '../../support/native-household-unit.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../../support/text-model.js';
import { voiceMedia } from '../../support/voice-media.js';

vi.setConfig({ testTimeout: 30_000 });
const asyncUtilTimeout = getConfig().asyncUtilTimeout;
beforeAll(() => {
  // These workflows use real HTTP and SQLite. Allow CI time to finish the
  // requests while still resolving each wait as soon as its assertion passes.
  configure({ asyncUtilTimeout: 10_000 });
});
afterAll(() => configure({ asyncUtilTimeout }));
let installation: Awaited<ReturnType<typeof createInstallation>>;
let http: APIRequestContext;
const cleanups: (() => void)[] = [];
afterEach(async () => {
  cleanup();
  for (const release of cleanups.splice(0)) release();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'mediaDevices');
  await installation?.close();
  await http?.dispose();
});

async function household({
  unavailable = false,
  reply = () => [modelMessage('Vilken av de två cyklarna menar du?')],
  textUsage,
}: {
  unavailable?: boolean;
  reply?: Parameters<typeof textModel>[0];
  textUsage?: number;
} = {}) {
  const live = liveProvider();
  const model = textModel(reply);
  // Server SDK construction runs before mounting the browser client. Its safety
  // check must see the server environment, rather than jsdom's global window.
  const browser = window;
  vi.stubGlobal('window', undefined);
  try {
    installation = await createInstallation(
      undefined,
      unavailable
        ? {}
        : {
            modelFetch: textUsage
              ? async (url, init) => {
                  const response = await model.provider(url, init);
                  const body = await response.json();
                  body.usage.input_tokens = textUsage;
                  return Response.json(body, { headers: response.headers });
                }
              : model.provider,
            liveFetch: live.provider,
            liveSideband: live.attach,
          },
    );
  } finally {
    vi.stubGlobal('window', browser);
  }
  http = await request.newContext();
  await signIn(http, installation.origin);
  const { household: current } = await (await createHousehold(http, installation.origin)).json();
  const base = `/api/households/${current.id}`;
  const read = async (): Promise<MapState> =>
    (await http.get(`${installation.origin}${base}/map`)).json();
  const post = (route: string, data: unknown) =>
    http.post(`${installation.origin}${base}/${route}`, {
      headers: { origin: installation.origin },
      data,
    });
  const starts: string[] = [];
  const commands: string[] = [];
  const network: {
    before?: (url: string, init?: RequestInit) => Promise<void>;
    after?: (url: string, init: RequestInit | undefined, response: Response) => Promise<Response>;
  } = {};
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (init?.method === 'POST') {
      commands.push(url);
      if (url.endsWith('/text-assistant') || url.endsWith('/voice')) starts.push(url);
    }
    await network.before?.(url, init);
    const response = await http.fetch(new URL(url, installation.origin).href, {
      method: init?.method ?? 'GET',
      headers: { ...Object.fromEntries(new Headers(init?.headers)), origin: installation.origin },
      ...(init?.body ? { data: init.body } : {}),
    });
    const result = new Response(new Uint8Array(await response.body()), {
      status: response.status(),
      headers: response.headers(),
    });
    const delivered = network.after ? await network.after(url, init, result) : result;
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return delivered;
  });
  const media = voiceMedia();
  function Workspace() {
    const [settings, setSettings] = useState(false);
    const [target, setTarget] = useState<HTMLDivElement | null>(null);
    return (
      <main>
        <section aria-label="Inställningar" hidden={!settings}>
          <a
            href="/"
            className="settings-return"
            onClick={(event) => {
              event.preventDefault();
              setSettings(false);
            }}
          >
            Tillbaka till kartan
          </a>
          <div ref={setTarget} />
        </section>
        <HouseholdMap
          householdId={current.id}
          householdName="Linden"
          active={!settings}
          onSettings={() => setSettings(true)}
          onReturnToMap={() => setSettings(false)}
          conversationSettingsTarget={settings ? target : null}
        />
      </main>
    );
  }
  async function open() {
    render(
      <FormLeaveProvider>
        <Workspace />
      </FormLeaveProvider>,
    );
    await screen.findByRole('navigation', { name: 'Kartans verktyg' });
    await waitFor(() => expect(screen.queryByText('Hushållets karta hämtas…')).toBeNull());
  }
  const tools = () => within(screen.getByRole('navigation', { name: 'Kartans verktyg' }));
  const microphone = () => tools().getByRole('button', { name: 'Prata med Skyttel' });
  async function startVoice() {
    await startConversationWithVoice();
    await waitFor(() => expect(media.peers.at(-1)?.connectionState).toBe('connected'));
    act(() =>
      media.peers.at(-1)?.channel.emit({ type: 'session.started', session: { id: 'provider' } }),
    );
    await waitFor(() => expect(microphone().getAttribute('aria-pressed')).toBe('true'));
  }
  async function settings() {
    const expand = tools().queryByRole('button', { name: 'Visa verktygens namn' });
    if (expand) await userEvent.click(expand);
    await userEvent.click(tools().getByRole('button', { name: 'Inställningar' }));
    await screen.findByRole('heading', { name: 'Medgivande' });
  }
  async function addDraft(name = 'Lo Exempel') {
    const state = await read();
    const response = await post('map/draft', {
      id: 'lo',
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: null,
      value: { typeId: state.types[0].id, name },
    });
    expect(response.ok()).toBe(true);
  }
  const history = async () => (await http.get(`${installation.origin}${base}/map/history`)).json();
  return {
    open,
    read,
    post,
    starts,
    commands,
    tools,
    microphone,
    media,
    model,
    live,
    base,
    startVoice,
    settings,
    network,
    addDraft,
    history,
    operations: async () => (await http.get(`${installation.origin}${base}/map/operations`)).json(),
  };
}

test('unsent object text requires confirmation before unavailable conversation navigation', async () => {
  const home = await household({ unavailable: true });
  await home.open();
  await openNewObjectForm();
  await userEvent.type(screen.getByLabelText('Namn'), 'Oskickad cykel');
  await userEvent.click(home.microphone());
  const loss = within(screen.getByRole('dialog', { name: 'Lämna ändrade uppgifter?' }));
  await userEvent.click(loss.getByRole('button', { name: 'Fortsätt redigera' }));
  expect((screen.getByLabelText('Namn') as HTMLInputElement).value).toBe('Oskickad cykel');
  expect(home.starts).toEqual([]);
  await userEvent.click(home.microphone());
  await userEvent.click(screen.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
  expect((await screen.findByRole('region', { name: 'Samtalsnotis' })).textContent).toContain(
    'Samtal med Skyttel är inte tillgängligt just nu.',
  );
  expect(home.media.getUserMedia).not.toHaveBeenCalled();
  expect((await home.read()).draft.changes).toEqual([]);
});

test('canceling a toolbar conversation returns to its chosen entry and preserves data', async () => {
  const home = await household();
  await home.open();
  const chosen = home.tools().getByRole('button', { name: 'Skriv till Skyttel' });
  await userEvent.click(chosen);
  expect(screen.queryByRole('dialog', { name: 'Samtal med Skyttel' })).toBeNull();
  const start = screen.getByRole('button', { name: 'Nytt samtal' });
  await userEvent.click(start);
  const consent = await screen.findByRole('dialog', { name: 'Samtal med Skyttel' });
  expect(home.starts).toEqual([]);
  await userEvent.click(within(consent).getByRole('button', { name: 'Avbryt' }));
  expect(document.activeElement).toBe(start);
  expect(home.media.getUserMedia).not.toHaveBeenCalled();
  await userEvent.click(start);
  await giveConversationConsent();
  await screen.findByRole('region', { name: 'Skriv till Skyttel' });
  expect(screen.queryByRole('complementary', { name: 'Kom igång med kartan' })).toBeNull();
  expect((await home.read()).draft.changes).toEqual([]);
});

test('voice survives closing text and visiting Settings with its microphone choice and unsent work unchanged', async () => {
  const home = await household();
  await home.open();
  await home.startVoice();
  expect(screen.queryByRole('region', { name: 'Skriv till Skyttel' })).toBeNull();
  expect(screen.getByRole('group', { name: 'Röstruta' }).textContent).toContain('Lyssnar');
  await openConversationText();
  const field = screen.getByLabelText('Meddelande till Skyttel');
  await userEvent.type(field, 'Min privata oskickade fråga');
  await closeConversationText();
  expect(home.media.microphone.enabled).toBe(true);
  await home.settings();
  expect(screen.getByRole('group', { name: 'Röstruta' }).textContent).toContain('Lyssnar');
  expect(home.media.microphone.enabled).toBe(true);
  await userEvent.click(screen.getByRole('link', { name: 'Tillbaka till kartan' }));
  await openConversationText();
  expect((field as HTMLTextAreaElement).value).toBe('Min privata oskickade fråga');
  expect(home.media.peers).toHaveLength(1);
  expect(home.media.getUserMedia).toHaveBeenCalledTimes(1);
  expect((await home.read()).draft.changes).toEqual([]);
});

test('an idle offline press explains the block without opening text and recovery permits a fresh consent choice', async () => {
  const online = vi.spyOn(navigator, 'onLine', 'get');
  const home = await household();
  await home.open();
  online.mockReturnValue(false);
  act(() => window.dispatchEvent(new Event('offline')));
  expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull();
  await userEvent.click(home.microphone());
  const notice = await screen.findByRole('region', { name: 'Samtalsnotis' });
  expect(notice.textContent).toContain(
    'Ingen kontakt med Skyttel. Försök igen när kontakten är tillbaka.',
  );
  expect(screen.queryByRole('region', { name: 'Skriv till Skyttel' })).toBeNull();
  expect(home.starts).toEqual([]);
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull());
  await startConversationWithText();
  await screen.findByRole('region', { name: 'Skriv till Skyttel' });
  expect(home.media.getUserMedia).not.toHaveBeenCalled();
});

test('contact loss stops capture and sending while text remains editable and returning contact never restarts the microphone', async () => {
  const online = vi.spyOn(navigator, 'onLine', 'get');
  const home = await household();
  await home.open();
  await home.startVoice();
  await openConversationText();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  cleanups.push(release);
  let checkHeld = false;
  let checkDelivered = false;
  home.network.after = async (url, init, response) => {
    if (!checkHeld && url === `${home.base}/text-assistant` && init?.method === 'GET') {
      expect(response.status).toBe(200);
      expect(await response.clone().json()).toEqual({ available: true });
      checkHeld = true;
      await held;
      checkDelivered = true;
    }
    return response;
  };
  // An admitted contact check can finish after contact is lost. Its actual
  // successful reply must not authorize capture while the browser is offline.
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(checkHeld).toBe(true));
  online.mockReturnValue(false);
  act(() => window.dispatchEvent(new Event('offline')));
  const notice = await screen.findByRole('region', { name: 'Samtalsnotis' });
  expect(notice.textContent).toContain(
    'Mikrofonen är av. Slå på den igen när kontakten är tillbaka.',
  );
  expect(within(notice).queryByRole('button', { name: 'Stäng notisen' })).toBeNull();
  expect(home.media.microphone.enabled).toBe(false);
  const field = screen.getByLabelText('Meddelande till Skyttel');
  await userEvent.type(field, 'Väntande text');
  expect((field as HTMLTextAreaElement).value).toBe('Väntande text');
  expect(screen.getByRole('button', { name: 'Skicka' }).hasAttribute('disabled')).toBe(true);
  await act(async () => {
    release();
    await waitFor(() => expect(checkDelivered).toBe(true));
  });
  expect(screen.getByRole('region', { name: 'Samtalsnotis' })).toBe(notice);
  expect(screen.getByRole('button', { name: 'Skicka' }).hasAttribute('disabled')).toBe(true);
  await closeConversationText();
  await userEvent.click(home.microphone());
  expect(home.media.getUserMedia).toHaveBeenCalledTimes(1);
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull());
  expect(home.media.microphone.enabled).toBe(false);
  await userEvent.click(home.microphone());
  await waitFor(() => expect(home.media.microphone.enabled).toBe(true));
  await openConversationText();
  expect((field as HTMLTextAreaElement).value).toBe('Väntande text');
  expect(home.model.requests).toHaveLength(0);
});

test('a failed typed task exposes a dismissible notice and preserves both the private draft and a newer unsent message', async () => {
  const home = await household({
    reply: () => {
      throw new Error('Synthetic provider outage');
    },
  });
  await home.open();
  await startConversationWithText();
  const field = await screen.findByLabelText('Meddelande till Skyttel');
  await userEvent.type(field, 'Fråga Skyttel');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''));
  await userEvent.type(field, 'En ny oskickad tanke');
  const notice = await screen.findByRole('region', { name: 'Samtalsnotis' });
  expect(notice.textContent).toContain('Skyttel kunde inte slutföra uppdraget. Försök igen.');
  await userEvent.click(within(notice).getByRole('button', { name: 'Stäng notisen' }));
  expect((field as HTMLTextAreaElement).value).toBe('En ny oskickad tanke');
  expect((await home.read()).draft.changes).toEqual([]);
  expect(home.media.getUserMedia).not.toHaveBeenCalled();
});

test('Settings saves and revokes consent without starting a conversation or altering the private draft', async () => {
  const home = await household();
  await home.addDraft();
  const original = await home.read();
  await home.open();
  await home.settings();
  await userEvent.click(screen.getByRole('button', { name: 'Spara medgivandet' }));
  await screen.findByText('Medgivandet är sparat');
  await userEvent.click(screen.getByRole('button', { name: 'Återkalla medgivandet' }));
  await screen.findByText('Medgivandet är återkallat');
  expect(screen.queryByRole('dialog', { name: 'Återkalla medgivandet' })).toBeNull();
  expect(home.starts).toEqual([]);
  expect(home.media.getUserMedia).not.toHaveBeenCalled();
  expect((await home.read()).draft).toEqual(original.draft);
});

test('confirmed Settings revocation ends live audio, keeps the unsent message and draft, and requires consent at the next start', async () => {
  const home = await household();
  await home.addDraft();
  const original = await home.read();
  await home.open();
  await home.startVoice();
  await openConversationText();
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Inte skickat');
  await home.settings();
  await userEvent.click(screen.getByRole('button', { name: 'Återkalla medgivandet' }));
  const dialog = await screen.findByRole('dialog', { name: 'Återkalla medgivandet' });
  expect(dialog.textContent).toContain('Utkastet med 1 osparade ändringar ligger kvar.');
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Återkalla och avsluta samtalet' }),
  );
  expect(home.media.microphone.stopped).toBe(true);
  await screen.findByText('Medgivandet är återkallat');
  expect(home.media.peers[0].connectionState).toBe('closed');
  expect(screen.queryByRole('group', { name: 'Röstruta' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull();
  expect((await home.read()).draft).toEqual(original.draft);
  await userEvent.click(screen.getByRole('link', { name: 'Tillbaka till kartan' }));
  await startConversationWithText();
  const field = await screen.findByLabelText('Meddelande till Skyttel');
  expect((field as HTMLTextAreaElement).value).toBe('Inte skickat');
  expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).not.toContain(
    'Inte skickat',
  );
});

test('a new conversation clears the dialogue but keeps the draft, unsent input and microphone OFF through provider renewal', async () => {
  const home = await household();
  await home.addDraft();
  const original = await home.read();
  await home.open();
  await home.startVoice();
  await userEvent.click(home.microphone());
  expect(home.media.microphone.enabled).toBe(false);
  await openConversationText();
  const field = screen.getByLabelText('Meddelande till Skyttel');
  await userEvent.type(field, 'En vanlig fråga');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await waitFor(() =>
    expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).toContain(
      'Vilken av de två cyklarna menar du?',
    ),
  );
  await userEvent.type(field, 'Min nya oskickade fråga');
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samtal' }));
  await waitFor(() => expect(home.media.peers).toHaveLength(2));
  await waitFor(() => expect(home.media.peers[1].connectionState).toBe('connected'));
  act(() =>
    home.media.peers[1].channel.emit({ type: 'session.started', session: { id: 'provider-2' } }),
  );
  await waitFor(() =>
    expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).not.toContain(
      'En vanlig fråga',
    ),
  );
  expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).toContain(
    '1 osparad ändring',
  );
  expect(home.media.microphone.enabled).toBe(false);
  expect(home.media.getUserMedia).toHaveBeenCalledTimes(1);
  expect(home.media.peers[0].remote.stopped).toBe(true);
  expect((field as HTMLTextAreaElement).value).toBe('Min nya oskickade fråga');
  expect((await home.read()).draft).toEqual(original.draft);
});

test.each(['voice-stop', 'text-escape'] as const)(
  'a delayed browser cancellation cannot stop work in a new conversation: %s',
  async (gesture) => {
    let finish!: () => void;
    const reply = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let deliver!: () => void;
    const held = new Promise<void>((resolve) => {
      deliver = resolve;
    });
    cleanups.push(finish, deliver);
    const home = await household({
      reply: async () => {
        await reply;
        return [modelMessage('Ett nytt svar.')];
      },
    });
    await home.addDraft();
    const original = await home.read();
    await home.open();
    await home.startVoice();
    await openConversationText();
    const field = screen.getByLabelText('Meddelande till Skyttel');
    await userEvent.type(field, 'Ett gammalt uppdrag.');
    await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
    await waitFor(() => expect(home.model.requests).toHaveLength(1));
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''));
    await userEvent.type(field, 'Oskickat efter avbrottet.');
    let cancelUrl = '';
    let cancelBody: Record<string, unknown> | undefined;
    let cancelStatus: number | undefined;
    let cancelError: unknown;
    home.network.before = async (url, init) => {
      if (url.endsWith('/cancel') && init?.method === 'POST') {
        cancelUrl = url;
        cancelBody = JSON.parse(String(init.body));
        await held;
      }
    };
    home.network.after = async (url, _init, response) => {
      if (url === cancelUrl) {
        cancelError = await response.clone().json();
        cancelStatus = response.status;
      }
      return response;
    };
    try {
      if (gesture === 'voice-stop')
        await userEvent.click(
          within(screen.getByRole('group', { name: 'Röstruta' })).getByRole('button', {
            name: 'Avbryt',
          }),
        );
      else fireEvent.keyDown(field, { key: 'Escape' });
      await waitFor(() => expect(cancelUrl).not.toBe(''));
      // The ordinary browser request is already sent. Hold its transport before
      // the real handler while the same session starts a successor conversation.
      const sessionPath = cancelUrl.slice(`${home.base}/`.length, -'/cancel'.length);
      const reset = await home.post(`${sessionPath}/new`, {});
      expect(reset.status(), await reset.text()).toBe(200);
      const renewed = await reset.json();
      const accepted = await home.post(`${sessionPath}/messages`, {
        revision: renewed.revision,
        draftVersion: renewed.review.version,
        contentVersion: renewed.review.contentVersion,
        requestId: crypto.randomUUID(),
        text: 'Ett nytt uppdrag.',
      });
      expect(accepted.status(), await accepted.text()).toBe(202);
      const fresh = await accepted.json();
      await waitFor(() => expect(home.model.requests).toHaveLength(2));
      deliver();
      await waitFor(() => expect(cancelStatus).toBeDefined());
      const status = await http.get(
        `${installation.origin}${home.base}/${sessionPath}/messages/${fresh.taskId}`,
      );
      expect(await status.json()).toMatchObject({
        revision: fresh.revision,
        taskStatus: 'working',
      });
      expect(cancelStatus).toBe(409);
      expect(cancelError).toEqual({ error: 'assistant_turn_changed' });
      expect(cancelBody).toEqual({
        revision: renewed.revision - 1,
        contextRevision: (renewed.contextRevision ?? 0) - 1,
        all: true,
      });
      expect(home.model.requests[1].input).toHaveLength(1);
      expect(JSON.stringify(home.model.requests[1].input)).not.toContain('Ett gammalt uppdrag.');
      finish();
      await waitFor(async () => {
        const completed = await http.get(`${installation.origin}${home.base}/${sessionPath}`);
        expect(await completed.json()).toMatchObject({
          revision: fresh.revision,
          phase: 'ready',
          modelReply: 'Ett nytt svar.',
        });
      });
      expect((field as HTMLTextAreaElement).value).toBe('Oskickat efter avbrottet.');
      expect(await home.read()).toEqual(original);
      expect(await home.history()).toEqual({ history: [] });
    } finally {
      deliver();
      finish();
    }
  },
);

test('a necessary question is retained across microphone OFF and text closure without frontend question controls', async () => {
  const question = 'Vilken av de två personerna Lo menar du?';
  const home = await household({
    reply: () => [modelTool('ask_questions', { questions: [question] })],
  });
  await home.open();
  await home.startVoice();
  await openConversationText();
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Red ut identiteten');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await waitFor(() =>
    expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).toContain(question),
  );
  await waitFor(() =>
    expect(home.live.sent.some(({ event }) => event.type === 'session.commentary.append')).toBe(
      true,
    ),
  );
  act(() =>
    home.media.peers[0].channel.emit({
      type: 'session.output_transcript.delta',
      delta: question,
      start_ms: 0,
      end_ms: 200,
    }),
  );
  home.media.signals.set(home.media.peers[0].remote, 20);
  await waitFor(() =>
    expect(screen.getByRole('group', { name: 'Röstruta' }).textContent).toContain('Skyttel talar'),
  );
  home.media.signals.set(home.media.peers[0].remote, 0);
  await waitFor(() =>
    expect(screen.getByRole('group', { name: 'Röstruta' }).textContent).toContain(
      'Väntar på ditt svar',
    ),
  );
  await userEvent.click(home.microphone());
  await closeConversationText();
  expect(screen.getByRole('group', { name: 'Röstruta' }).textContent).toContain(
    'Väntar på ditt svar',
  );
  expect(home.microphone().getAttribute('aria-pressed')).toBe('false');
  for (const removed of ['Nödvändigt svar', 'Svara i samtalet', 'Besked från Skyttel'])
    expect(screen.queryByText(removed, { exact: true })).toBeNull();
  await openConversationText();
  expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).toContain(question);
  expect((await home.read()).draft.changes).toEqual([]);
});

test('a playback blocker can be recovered in Settings and restores logical focus without reopening text', async () => {
  const home = await household();
  await home.open();
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
    new DOMException('Blocked', 'NotAllowedError'),
  );
  await startConversationWithVoice();
  await waitFor(() => expect(home.media.peers.at(-1)?.connectionState).toBe('connected'));
  act(() =>
    home.media.peers[0].channel.emit({ type: 'session.started', session: { id: 'provider' } }),
  );
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Samtalsnotis' }).textContent).toContain(
      'Webbläsaren stoppade ljudet.',
    ),
  );
  expect(home.media.microphone.enabled).toBe(false);
  await home.settings();
  const notice = screen.getByRole('region', { name: 'Samtalsnotis' });
  vi.mocked(HTMLMediaElement.prototype.play).mockResolvedValue();
  await userEvent.click(within(notice).getByRole('button', { name: 'Starta ljudet' }));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Tillbaka till kartan' }));
  expect(screen.queryByRole('region', { name: 'Skriv till Skyttel' })).toBeNull();
  expect(home.media.getUserMedia).toHaveBeenCalledTimes(1);
});

test('a failed automatic save check offers the sole retry action and verifies the same immutable operation without consent', async () => {
  const home = await household();
  await home.addDraft();
  const original = await home.read();
  const attempt = {
    operationId: 'registered-before-reload',
    version: original.draft.version,
    contentVersion: original.contentVersion,
  };
  expect((await home.post('map/operations', attempt)).ok()).toBe(true);
  let failed = false;
  home.network.before = async (url) => {
    if (url.endsWith('/text-assistant/recover') && !failed) {
      failed = true;
      throw new Error('Synthetic recovery network failure');
    }
  };
  await home.open();
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Samtalsnotis' }).textContent).toContain(
      'Skyttel kunde inte kontrollera om utkastet sparades.',
    ),
  );
  const notice = screen.getByRole('region', { name: 'Samtalsnotis' });
  expect(home.media.getUserMedia).not.toHaveBeenCalled();
  expect(home.starts).toEqual([]);
  await userEvent.click(
    within(notice).getByRole('button', { name: 'Kontrollera om utkastet sparades' }),
  );
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull());
  const history = await home.history();
  expect(history.history).toHaveLength(1);
  expect(history.history[0].operationId).toBe(attempt.operationId);
  expect((await home.read()).objects).toEqual([
    expect.objectContaining({ id: 'lo', name: 'Lo Exempel' }),
  ]);
  expect((await home.read()).draft.changes).toEqual([]);
  expect(screen.queryByRole('dialog', { name: 'Samtal med Skyttel' })).toBeNull();
});

test('stopping a pending task from Settings restores Settings focus and cannot deliver its late model answer', async () => {
  let finish!: () => void;
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  cleanups.push(finish);
  const home = await household({
    reply: async () => {
      await held;
      return [modelMessage('Ett för sent svar')];
    },
  });
  await home.open();
  await home.startVoice();
  await openConversationText();
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Ett uppdrag att avbryta');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await waitFor(() => expect(home.model.requests).toHaveLength(1));
  await waitFor(() =>
    expect((screen.getByLabelText('Meddelande till Skyttel') as HTMLTextAreaElement).value).toBe(
      '',
    ),
  );
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Ny oskickad text');
  await home.settings();
  const box = screen.getByRole('group', { name: 'Röstruta' });
  expect(box.textContent).toContain('Skyttel arbetar');
  await userEvent.click(within(box).getByRole('button', { name: 'Avbryt' }));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Tillbaka till kartan' })),
  );
  await userEvent.click(screen.getByRole('link', { name: 'Tillbaka till kartan' }));
  await openConversationText();
  await screen.findByText('Avbrutet. Föreslagna ändringar ligger kvar i utkastet.');
  finish();
  expect((screen.getByLabelText('Meddelande till Skyttel') as HTMLTextAreaElement).value).toBe(
    'Ny oskickad text',
  );
  expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).not.toContain(
    'Ett för sent svar',
  );
  expect((await home.read()).draft.changes).toEqual([]);
});

test('the context failure notice resets the conversation without submitting unsent text or losing its private draft', async () => {
  const home = await household({
    textUsage: 1_040_000,
    reply: (request) => {
      if (!request.tools.length) throw new Error('Synthetic summary failure');
      return [modelMessage('Vi har pratat om vårt utkast.')];
    },
  });
  await home.addDraft();
  const original = await home.read();
  await home.open();
  await startConversationWithText();
  const field = await screen.findByLabelText('Meddelande till Skyttel');
  await userEvent.type(field, 'Minns vårt utkast');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Samtalsnotis' }).textContent).toContain(
      'Kontexten är full',
    ),
  );
  await userEvent.type(field, 'Oskickat under återställning');
  expect(screen.getByRole('button', { name: 'Skicka' }).hasAttribute('disabled')).toBe(true);
  await userEvent.click(
    within(screen.getByRole('region', { name: 'Samtalsnotis' })).getByRole('button', {
      name: 'Nytt samtal',
    }),
  );
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull());
  expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).not.toContain(
    'Minns vårt utkast',
  );
  expect((field as HTMLTextAreaElement).value).toBe('Oskickat under återställning');
  expect(home.model.requests).toHaveLength(2);
  expect((await home.read()).draft).toEqual(original.draft);
  expect(home.media.getUserMedia).not.toHaveBeenCalled();
});

test('pending or unknown object staging must be checked before navigating to Settings', async () => {
  const home = await household();
  await home.open();
  await openNewObjectForm();
  await userEvent.type(screen.getByLabelText('Namn'), 'Ett privat provobjekt');
  let finish!: () => void;
  let delivered = false;
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  cleanups.push(finish);
  home.network.after = async (url, init, response) => {
    if (url.endsWith('/map/object-form') && init?.method === 'POST') {
      delivered = true;
      await held;
      throw new Error('Synthetic lost proposal acknowledgment');
    }
    return response;
  };
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() => expect(delivered).toBe(true));
  await userEvent.click(home.tools().getByRole('button', { name: 'Visa verktygens namn' }));
  await userEvent.click(home.tools().getByRole('button', { name: 'Inställningar' }));
  expect(screen.queryByRole('heading', { name: 'Medgivande' })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Nytt objekt' })).toBeTruthy();
  finish();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await home.settings();
  const after = await home.read();
  expect(after.objects).toEqual([]);
  expect(after.draft.changes).toHaveLength(1);
  expect(after.draft.changes[0].after?.name).toBe('Ett privat provobjekt');
});

test('an assistant map request cannot replace unsent object work or acknowledge an unseen selection', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  cleanups.push(() => release());
  const home = await household({
    reply: async (request) => {
      if (!lastToolResult(request)) await held;
      return lastToolResult(request)
        ? [modelMessage('Lo kunde inte visas medan formuläret har oskickad text.')]
        : [modelTool('show_map_item', { kind: 'object', id: 'lo' })];
    },
  });
  await home.addDraft();
  await home.open();
  await startConversationWithText();
  const field = await screen.findByLabelText('Meddelande till Skyttel');
  await userEvent.type(field, 'Visa Lo i kartan');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await openNewObjectForm();
  await userEvent.type(screen.getByLabelText('Namn'), 'Oskickad och privat');
  const original = await home.read();
  const acknowledgements: unknown[] = [];
  home.network.before = async (url, init) => {
    if (url.endsWith('/selection')) acknowledgements.push(JSON.parse(String(init?.body)));
  };
  release();
  await waitFor(() =>
    expect(acknowledgements).toEqual([
      expect.objectContaining({ kind: 'object', id: 'lo', displayed: false }),
    ]),
  );
  expect((screen.getByLabelText('Namn') as HTMLInputElement).value).toBe('Oskickad och privat');
  expect((await home.read()).draft).toEqual(original.draft);
  await waitFor(() =>
    expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).toContain(
      'Lo kunde inte visas medan formuläret har oskickad text.',
    ),
  );
  expect(screen.getByRole('log', { name: 'Samtalstext' }).textContent).not.toContain(
    'Markerat i kartan.',
  );
});

test('revocation finishes an already registered save and exposes its receipt while retiring the conversation', async () => {
  let finish!: () => void;
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  cleanups.push(finish);
  const home = await household({
    reply: async (request) => {
      if (!lastToolResult(request))
        return [
          modelTool('prepare_save', {
            version: 1,
            contentVersion: 1,
            operationId: 'registered-revocation',
          }),
        ];
      await held;
      return [];
    },
  });
  await home.addDraft();
  await home.open();
  await home.startVoice();
  await openConversationText();
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Spara hela utkastet.');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await waitFor(() => expect(home.model.requests).toHaveLength(2));
  const registered = (await home.operations()).operations;
  expect(registered).toHaveLength(1);
  expect(registered[0].status).toBe('pending');
  await home.settings();
  await userEvent.click(screen.getByRole('button', { name: 'Återkalla medgivandet' }));
  const dialog = await screen.findByRole('dialog', { name: 'Återkalla medgivandet' });
  await waitFor(() =>
    expect(dialog.textContent).toContain('Skyttel sparar ditt utkast. Sparandet slutförs.'),
  );
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Återkalla och avsluta samtalet' }),
  );
  await screen.findByText('Medgivandet är återkallat');
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Utkastets återkoppling' }).textContent).toContain(
      'Sparat · kvitto bekräftat',
    ),
  );
  const history = await home.history();
  expect(history.history).toHaveLength(1);
  expect(history.history[0].operationId).toBe(registered[0].operationId);
  expect((await home.read()).draft.changes).toEqual([]);
  expect((await home.read()).objects[0].name).toBe('Lo Exempel');
  expect(home.media.microphone.stopped).toBe(true);
  expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull();
  finish();
});

test('a known live manual save is not replayed by the conversation poll and keeps its exact operation and receipt', async () => {
  const home = await household();
  await home.addDraft();
  await home.open();
  await home.startVoice();
  await openConversationText();
  let finish!: () => void;
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  cleanups.push(finish);
  let operationId = '';
  let seenLiveOperation = false;
  home.network.before = async (url, init) => {
    if (url.endsWith('/map/save')) {
      operationId = JSON.parse(String(init?.body)).operationId;
      await held;
    }
  };
  home.network.after = async (url, _init, response) => {
    if (url.endsWith('/poll')) {
      const body = await response.clone().json();
      if (
        body.assistant?.operations?.some(
          (item: { operationId: string; status: string }) =>
            item.operationId === operationId && item.status === 'pending',
        )
      )
        seenLiveOperation = true;
    }
    return response;
  };
  const draft = await openDraftReview();
  await userEvent.click(draft.getByRole('button', { name: 'Spara hela utkastet' }));
  await waitFor(() => expect(operationId).not.toBe(''));
  await waitFor(() => expect(seenLiveOperation).toBe(true));
  expect(home.commands.some((url) => url.endsWith('/recover'))).toBe(false);
  expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull();
  expect((await home.read()).objects).toEqual([]);
  finish();
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Sparbekräftelse' }).textContent).toBe(
      'Utkastet är sparat',
    ),
  );
  const history = await home.history();
  expect(history.history).toHaveLength(1);
  expect(history.history[0].operationId).toBe(operationId);
  expect(home.commands.filter((url) => url.endsWith('/map/save'))).toHaveLength(1);
  expect((await home.read()).draft.changes).toEqual([]);
});

test('typing and unsent conversation text survive confirmed loss of only the object form', async () => {
  const home = await household();
  await home.open();
  await startConversationWithText();
  const field = screen.getByLabelText('Meddelande till Skyttel');
  await userEvent.type(field, 'Oskickat till Skyttel');
  await openNewObjectForm();
  const form = within(screen.getByRole('dialog', { name: 'Nytt objekt' }));
  await userEvent.type(form.getByLabelText('Namn'), 'Privat oskickat namn');
  await userEvent.click(form.getByRole('button', { name: 'Stäng objektdialogen' }));
  await userEvent.click(screen.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
  expect((field as HTMLTextAreaElement).value).toBe('Oskickat till Skyttel');
  expect(home.media.getUserMedia).not.toHaveBeenCalled();
  await closeConversationText();
  await openConversationText();
  expect((field as HTMLTextAreaElement).value).toBe('Oskickat till Skyttel');
  expect((await home.read()).draft.changes).toEqual([]);
});
