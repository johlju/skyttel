import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

test('voice requires the existing current assistant consent and creates only the fixed private Live session', async () => {
  const live = liveProvider();
  app = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Ett provsvar.')]).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const base = `${app.origin}/api/households/${household.id}/text-assistant`;
  const started = await browser.post(base, {
    headers: { origin: app.origin },
    data: { externalAi: true, mapWork: true },
  });
  const assistant = await started.json();
  const voice = await browser.post(`${base}/${assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: { sdp: 'synthetic-offer', revision: 0, draftVersion: 0, contentVersion: 1 },
  });
  expect(voice.status(), await voice.text()).toBe(201);
  const result = await voice.json();
  expect(result).toMatchObject({
    sdp: 'synthetic-answer',
    voice: { phase: 'listening', seconds: null, usageFinal: false },
    assistant: { id: assistant.id },
  });
  expect(JSON.stringify(result)).not.toMatch(/synthetic-model-key|Bearer|live_/);
  expect(live.requests).toMatchObject([
    {
      session: {
        model: 'gpt-live-1',
        audio: { output: { voice: 'marin' } },
        delegation: { type: 'client' },
        store: false,
        client: {
          data_channel: {
            allowed_client_events: ['session.close'],
            allowed_server_events: expect.arrayContaining([
              { type: 'session.input_transcript.delta' },
              { type: 'session.output_transcript.delta' },
              { type: 'session.delegation.created' },
            ]),
          },
        },
      },
      transport: { type: 'webrtc', sdp: 'synthetic-offer' },
    },
  ]);
  live.configure({ seconds: 15 });
  const stopped = await browser.post(`${base}/${assistant.id}/voice/${result.voice.id}/stop`, {
    headers: { origin: app.origin },
    data: {},
  });
  expect(await stopped.json()).toMatchObject({
    voice: { phase: 'closed', seconds: 15, usageFinal: true },
  });
  expect(live.channels.size).toBe(0);
});

async function setupVoice(
  modelFetch: typeof fetch,
  configure?: (live: ReturnType<typeof liveProvider>) => void,
) {
  const live = liveProvider();
  configure?.(live);
  app = await createInstallation(undefined, {
    modelFetch,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const assistant = await (
    await browser.post(path, {
      headers: { origin: app.origin },
      data: { externalAi: true, mapWork: true },
    })
  ).json();
  const started = await browser.post(`${path}/${assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: {
      sdp: 'synthetic-offer',
      revision: assistant.revision,
      draftVersion: assistant.review.version,
      contentVersion: assistant.review.contentVersion,
    },
  });
  expect(started.status(), await started.text()).toBe(201);
  const { voice } = await started.json();
  const providerId = [...live.channels.keys()][0];
  let offset = 0;
  function transcript(delta: string, role = 'input') {
    live.emit(providerId, {
      type: `session.${role}_transcript.delta`,
      event_id: crypto.randomUUID(),
      delta,
      start_ms: offset,
      end_ms: ++offset,
    });
  }
  function delegate(id = crypto.randomUUID()) {
    live.emit(providerId, {
      type: 'session.delegation.created',
      event_id: crypto.randomUUID(),
      offset_ms: offset,
      delegation: { id, type: 'delegation', target: 'client' },
    });
    return id;
  }
  async function poll() {
    const current = await (await browser.get(`${path}/${assistant.id}`)).json();
    const response = await browser.post(`${path}/${assistant.id}/voice/${voice.id}/poll`, {
      headers: { origin: app.origin },
      data: {
        revision: current.revision,
        draftVersion: current.review.version,
        contentVersion: current.review.contentVersion,
      },
    });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  }
  return { live, path, assistant, voice, providerId, transcript, delegate, poll };
}

test('only one actual delegation executes raw voice fragments through Terra and the current MCP catalog, and a new explicit save confirms its receipt', async () => {
  let step = 0;
  const model = textModel((body) => {
    if (step++ === 0) return [modelTool('read_type_catalog', {})];
    if (step === 2)
      return [
        modelTool('propose_object', {
          version: 0,
          contentVersion: 1,
          id: 'family-music',
          baseRevision: null,
          value: {
            typeId: lastToolResult(body).types[0].id,
            name: 'Familjens musik',
            description: '',
          },
        }),
      ];
    if (step === 3) return [modelMessage('Familjens musik finns i utkastet. Vill du spara?')];
    return [
      modelTool('save_draft', { version: 1, contentVersion: 1, operationId: 'model-chosen' }),
    ];
  });
  const voice = await setupVoice(model.provider);
  voice.transcript('Lägg till Familjens');
  voice.transcript(' musik.');
  expect(model.requests).toHaveLength(0);
  const delegationId = voice.delegate();
  voice.delegate(delegationId);
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  const proposed = await voice.poll();
  expect(proposed.assistant.review.changes).toMatchObject([{ id: 'family-music' }]);
  expect(model.requests).toHaveLength(3);
  const sent = voice.live.sent.find(({ event }) => event.type === 'session.commentary.append');
  expect(sent?.event).toMatchObject({ delegation_id: delegationId });
  expect(JSON.stringify(model.requests[0])).toContain('Lägg till Familjens musik.');
  expect(model.requests[0].tools.some(({ name }) => name === 'read_merge_review')).toBe(true);
  voice.transcript('Vill du spara?', 'output');
  voice.transcript('Spara.');
  const saveId = voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(2);
  const saved = await voice.poll();
  expect(saved.assistant.receipt.changes).toMatchObject([{ after: { id: 'family-music' } }]);
  expect(voice.live.sent.at(-1)?.event).toMatchObject({
    type: 'session.commentary.append',
    delegation_id: saveId,
  });
  expect(JSON.stringify(voice.live.sent.at(-1))).toContain('Sparat');
  const map = await (await browser.get(voice.path.replace('/text-assistant', '/map'))).json();
  expect(map.objects).toMatchObject([{ id: 'family-music' }]);
  expect(map.draft.changes).toEqual([]);
});

async function proposal(path: string) {
  const mapPath = path.replace('/text-assistant', '/map');
  const map = await (await browser.get(mapPath)).json();
  const response = await browser.post(`${mapPath}/draft`, {
    headers: { origin: app.origin },
    data: {
      id: 'web-object',
      baseRevision: null,
      version: map.draft.version,
      contentVersion: map.contentVersion,
      value: { typeId: map.types[0].id, name: 'Formulärförslag', description: '' },
    },
  });
  expect(response.status()).toBe(200);
}

test.each([
  { instruction: 'Rätta beskrivningen till Information om bilen. Spara nu.', save: true },
  { instruction: 'Ändra beskrivningen till Information om bilen och spara.', save: true },
  {
    instruction: 'Rätta beskrivningen till Information om den blå bilen. Spara nu.',
    description: 'Information om den blå bilen',
    save: true,
  },
  {
    instruction: 'Rätta beskrivningen till Information om bilen och lånet. Spara nu.',
    description: 'Information om bilen och lånet',
    save: true,
  },
  {
    instruction: 'Ändra beskrivningen till Försäkringsuppgifter om mina stora bilar och spara.',
    description: 'Försäkringsuppgifter om mina stora bilar',
    save: true,
  },
  {
    instruction: 'Rätta beskrivningen till Information om bilen. Spara om du är säker.',
    save: false,
  },
  {
    instruction: 'Ändra beskrivningen till Information om bilen och spara inte.',
    save: false,
  },
  {
    instruction: 'Rätta beskrivningen till Information om bilen startar. Spara nu.',
    save: false,
  },
  {
    instruction: 'Ändra beskrivningen till Information om kostnaden understiger 200 och spara.',
    save: false,
  },
  {
    instruction: 'Rätta beskrivningen till Information om det godkänns. Spara nu.',
    save: false,
  },
  {
    instruction: 'Rätta beskrivningen till Information bara om Elsa sa ja. Spara nu.',
    save: false,
  },
  {
    instruction:
      'Rätta beskrivningen till Information endast om våra anställda godkänner. Spara nu.',
    save: false,
  },
  {
    instruction: 'Ändra beskrivningen till Information enbart om Vera sa ja och spara.',
    save: false,
  },
])(
  'spoken description correction $instruction requires a current unconditional save command',
  async ({ instruction, save, description = 'Information om bilen' }) => {
    let typeId = '';
    const model = textModel(() => [
      modelTool('submit_changes', {
        version: 1,
        contentVersion: 1,
        completion: 'save',
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'web-object',
              baseRevision: null,
              value: { typeId, name: 'Formulärförslag', description },
            },
          },
        ],
      }),
    ]);
    const voice = await setupVoice(model.provider);
    await proposal(voice.path);
    const mapPath = voice.path.replace('/text-assistant', '/map');
    typeId = (await (await browser.get(mapPath)).json()).types[0].id;
    await voice.poll();
    voice.transcript(instruction);
    voice.delegate();
    await expect
      .poll(
        () =>
          voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
      )
      .toBe(1);
    const { assistant } = await voice.poll();
    const map = await (await browser.get(mapPath)).json();
    const { history } = await (await browser.get(`${mapPath}/history`)).json();
    if (save) {
      expect(assistant).toMatchObject({
        phase: 'ready',
        receipt: {
          changes: [{ after: { id: 'web-object', description } }],
        },
      });
      expect(map.objects).toMatchObject([{ id: 'web-object', description }]);
      expect(map.draft.changes).toEqual([]);
      expect(history).toEqual([assistant.receipt]);
      expect(JSON.stringify(voice.live.sent.at(-1))).toContain('Sparat');
    } else {
      expect(assistant).toMatchObject({ phase: 'error', error: 'assistant_save_not_requested' });
      expect(assistant.receipt).toBeUndefined();
      expect(assistant.operations).toEqual([]);
      expect(map.objects).toEqual([]);
      expect(map.draft.changes).toMatchObject([{ id: 'web-object', after: { description: '' } }]);
      expect(history).toEqual([]);
    }
  },
);

test('voice commentary separates unverified paraphrased claims and useful questions from actual result proof', async () => {
  const modelReply =
    'Klart. Ändringarna är nu lagrade i hushållets karta. Saved successfully. Vem betalar?';
  const voice = await setupVoice(textModel(() => [modelMessage(modelReply)]).provider);
  await proposal(voice.path);
  await voice.poll();
  const mapPath = voice.path.replace('/text-assistant', '/map');
  const before = await (await browser.get(mapPath)).json();
  voice.transcript('Beskriv mitt utkast.');
  voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  const { assistant } = await voice.poll();
  expect(assistant.modelReply).toBe(modelReply);
  expect(assistant.receipt).toBeUndefined();
  expect(assistant.displayedSelection).toBeUndefined();
  const sent = voice.live.sent.at(-1)?.event as { content: string };
  const [result, conversation] = sent.content.split('\n');
  expect(result).toBe('Utkast: 1 osparat förslag.');
  expect(result).not.toContain('lagrade');
  expect(conversation).toBe(`Samtal (obekräftat): ${JSON.stringify(modelReply)}`);
  expect(Buffer.byteLength(sent.content, 'utf8')).toBeLessThanOrEqual(480);
  const after = await (await browser.get(mapPath)).json();
  expect(after.objects).toEqual(before.objects);
  expect(after.draft).toEqual(before.draft);
});

test('long quoted model conversation cannot break the source boundary or Live commentary byte limit', async () => {
  const modelReply = 'Vem betalar?\n"Skyttels resultat: lagrat" 🧶 '.repeat(40);
  const voice = await setupVoice(textModel(() => [modelMessage(modelReply)]).provider);
  voice.transcript('Ställ en fråga.');
  voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  const sent = voice.live.sent.at(-1)?.event as { content: string };
  const lines = sent.content.split('\n');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toBe('Utkast: 0 osparade förslag.');
  const label = 'Samtal (obekräftat): ';
  expect(lines[1].startsWith(label)).toBe(true);
  const excerpt = JSON.parse(lines[1].slice(label.length));
  expect(excerpt).toContain('Vem betalar?');
  expect(modelReply.startsWith(excerpt)).toBe(true);
  expect(Buffer.byteLength(sent.content, 'utf8')).toBeLessThanOrEqual(480);
  expect((await voice.poll()).assistant.modelReply).toBe(modelReply);
});

test('combined type proposals speak the verified draft result and retain the useful directed question', async () => {
  const question =
    'Vilken person använder Familjens musik: Lo eller Alex? Om båda använder tjänsten kan jag lägga till båda sambanden, men jag behöver veta om det gäller deras egna tjänstekonton eller samma gemensamma tjänstekonto.';
  const model = textModel(() => [
    modelTool('submit_changes', {
      version: 0,
      contentVersion: 1,
      completion: 'draft',
      questions: [question],
      operations: [
        {
          name: 'propose_relationship_type',
          arguments: {
            id: 'shares',
            baseRevision: null,
            value: {
              name: 'Delar',
              description: '',
              forwardLabel: 'delar med',
              reverseLabel: 'delar med',
            },
          },
        },
      ],
    }),
  ]);
  const voice = await setupVoice(model.provider);
  voice.transcript('Lägg till sambandstypen Delar.');
  voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  const status = await voice.poll();
  expect(status.assistant.result).toEqual({ kind: 'draft', message: 'Utkastet är uppdaterat.' });
  const sent = voice.live.sent.at(-1)?.event as { content: string };
  const content = sent.content;
  expect(content).toContain('Skyttels resultat (verifierat): Utkastet är uppdaterat.');
  expect(content).toContain(JSON.stringify(question));
  expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(480);
  expect(model.requests).toHaveLength(1);
});

test('large verified draft details finish within the Live limit and remain available in the text result', async () => {
  const model = textModel(() => [modelTool('report_result', { source: 'draft' })]);
  const voice = await setupVoice(model.provider);
  const mapPath = voice.path.replace('/text-assistant', '/map');
  const map = await (await browser.get(mapPath)).json();
  for (let i = 0; i < 4; i++) {
    const response = await browser.post(`${mapPath}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: i,
        contentVersion: 1,
        id: `bike-${i}`,
        baseRevision: null,
        value: { typeId: map.types[0].id, name: `${i} ${'Cykel '.repeat(30)}`, description: '' },
      },
    });
    expect(response.status()).toBe(200);
  }
  await voice.poll();
  voice.transcript('Beskriv hela utkastet.');
  voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  const status = await voice.poll();
  expect(status.assistant.result.message).toContain('3 Cykel');
  const sent = voice.live.sent.at(-1)?.event as { content: string };
  const content = sent.content;
  expect(content).toContain('Lägg till 0 Cykel');
  expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(480);
});

test.each([
  'Spara inte.',
  'Spara ej.',
  'Spara senare.',
  'Spara när jag säger till.',
  'Om jag säger spara.',
  'Säg ”spara”.',
  'Ja.',
])('a new voice task %s cannot reuse an older save instruction from raw context', async (text) => {
  let step = 0;
  const model = textModel(() =>
    step++ === 0
      ? [modelMessage('Vad vill du spara?')]
      : [modelTool('save_draft', { version: 1, contentVersion: 1, operationId: 'untrusted' })],
  );
  const voice = await setupVoice(model.provider);
  voice.transcript('Spara.');
  voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  await proposal(voice.path);
  await voice.poll();
  voice.transcript('Vill du spara?', 'output');
  voice.transcript(text);
  voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(2);
  const result = await voice.poll();
  expect(result.assistant.error).toBe('assistant_save_not_requested');
  const latest = JSON.parse(
    String(model.requests.at(-1)?.input.findLast((item) => item.role === 'user')?.content),
  );
  expect(latest.message).toBe(text);
  expect(latest.voiceContext).toContain('Spara.');
  const map = await (await browser.get(voice.path.replace('/text-assistant', '/map'))).json();
  expect(map.objects).toEqual([]);
  expect(map.draft.changes).toHaveLength(1);
});

test('a held voice proposal is synchronously invalidated by new speech and by stop before its late tool result', async () => {
  let release: ((value: unknown[]) => void) | undefined;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  const voice = await setupVoice(model.provider);
  const map = await (await browser.get(voice.path.replace('/text-assistant', '/map'))).json();
  voice.transcript('Lägg till ett förslag.');
  voice.delegate();
  await expect.poll(() => model.requests.length).toBe(1);
  voice.transcript('Nej, vänta.');
  release?.([
    modelTool('propose_object', {
      version: 0,
      contentVersion: 1,
      id: 'late',
      baseRevision: null,
      value: { typeId: map.types[0].id, name: 'För sent', description: '' },
    }),
  ]);
  await expect.poll(async () => (await voice.poll()).assistant.phase).not.toBe('working');
  expect((await voice.poll()).assistant.review.changes).toEqual([]);
  expect(voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append')).toEqual(
    [],
  );
  const stopped = await browser.post(
    `${voice.path}/${voice.assistant.id}/voice/${voice.voice.id}/stop`,
    {
      headers: { origin: app.origin },
      data: {},
    },
  );
  expect((await stopped.json()).voice.phase).toBe('closed');
  voice.delegate();
  expect(model.requests).toHaveLength(1);
});

test('the first fragment retains its displayed draft anchor when a web edit arrives before delegation', async () => {
  const model = textModel(() => [modelMessage('Detta ska inte skickas.')]);
  const voice = await setupVoice(model.provider);
  voice.transcript('Spara');
  await proposal(voice.path);
  await voice.poll();
  voice.transcript('.');
  voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  expect(model.requests).toHaveLength(0);
  expect((await voice.poll()).assistant.review.changes).toHaveLength(1);
});

test('a correction spoken during held work becomes the new task without reusing the canceled task or its approval', async () => {
  let release: ((value: unknown[]) => void) | undefined;
  const model = textModel(() =>
    model.requests.length === 1
      ? new Promise<unknown[]>((resolve) => {
          release = resolve;
        })
      : [modelMessage('Det nya uppdraget är förstått.')],
  );
  const voice = await setupVoice(model.provider);
  voice.transcript('Spara.');
  voice.delegate();
  await expect.poll(() => model.requests.length).toBe(1);
  voice.transcript('Nej, ändra namnet till Nytt.');
  voice.delegate();
  await expect.poll(() => model.requests.length).toBe(2);
  release?.([modelMessage('Gammalt svar.')]);
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  expect((await voice.poll()).assistant.modelReply).toBe('Det nya uppdraget är förstått.');
});

test('delegation timing cannot complete a transcript fragment or include a later save fragment', async () => {
  const model = textModel(() => [modelMessage('Ett ofullständigt uppdrag behöver förtydligas.')]);
  const voice = await setupVoice(model.provider);
  voice.live.emit(voice.providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'input-1',
    delta: 'Förklara utkastet och spara.',
    start_ms: 0,
    end_ms: 2000,
  });
  voice.live.emit(voice.providerId, {
    type: 'session.delegation.created',
    event_id: 'delegation-1',
    offset_ms: 1000,
    delegation: { id: 'before-fragment-end', target: 'client', type: 'delegation' },
  });
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  expect(model.requests).toHaveLength(0);
});

test('voice checks a pending save before new work and retries only the exact durable attempt on a new explicit spoken instruction', async () => {
  let step = 0;
  const model = textModel(() =>
    step++ === 0
      ? [modelTool('prepare_save', { version: 1, contentVersion: 1, operationId: 'provider-id' })]
      : [modelMessage('Försöket är förberett.')],
  );
  const voice = await setupVoice(model.provider);
  await proposal(voice.path);
  await voice.poll();
  voice.transcript('Spara.');
  voice.delegate();
  await expect.poll(async () => (await voice.poll()).assistant.phase).toBe('recovery');
  const pending = (await voice.poll()).assistant.operations[0];
  expect(pending.status).toBe('pending');
  expect(pending.operationId).not.toBe('provider-id');
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  voice.transcript('Ja.');
  voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(2);
  expect((await voice.poll()).assistant.receipt).toBeUndefined();
  voice.transcript('Slutför samma sparförsök.');
  voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(3);
  const saved = (await voice.poll()).assistant;
  expect(saved.receipt.operationId).toBe(pending.operationId);
  expect(saved.operations).toHaveLength(1);
  expect(model.requests).toHaveLength(2);
});

test('ending the shared text authority immediately closes its idle voice without waiting for the browser lease', async () => {
  const voice = await setupVoice(textModel(() => []).provider);
  const response = await browser.post(`${voice.path}/${voice.assistant.id}/stop`, {
    headers: { origin: app.origin },
    data: {},
  });
  expect(response.status()).toBe(200);
  await expect.poll(() => voice.live.channels.size).toBe(0);
});

test.each([
  { type: 'session.delegation.created', event_id: 'bad' },
  {
    type: 'session.delegation.created',
    event_id: 'bad',
    delegation: { id: '../bad', target: 'client' },
    offset_ms: 1,
  },
  { type: 'session.input_transcript.delta', event_id: 'bad', delta: 'x', start_ms: 2, end_ms: 1 },
  {
    type: 'session.input_transcript.delta',
    event_id: 'bad',
    delta: 'x'.repeat(4001),
    start_ms: 0,
    end_ms: 1,
  },
])(
  'a malformed or excessive provider event closes safely without dispatch: $type',
  async (event) => {
    const model = textModel(() => []);
    const voice = await setupVoice(model.provider);
    expect(() => voice.live.emit(voice.providerId, event)).not.toThrow();
    await expect.poll(() => voice.live.channels.size).toBe(0);
    expect(model.requests).toEqual([]);
    expect((await voice.poll()).voice.phase).toBe('error');
  },
);

test('a duplicate fragment and a delegation without new speech never duplicate a task or reuse an old approval', async () => {
  const model = textModel(() => [modelMessage('Ett svar.')]);
  const voice = await setupVoice(model.provider);
  const fragment = {
    type: 'session.input_transcript.delta',
    event_id: 'one-fragment',
    delta: 'Läs utkastet.',
    start_ms: 0,
    end_ms: 0,
  };
  voice.live.emit(voice.providerId, fragment);
  voice.live.emit(voice.providerId, fragment);
  voice.delegate();
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  voice.delegate();
  expect(model.requests).toHaveLength(1);
  expect(
    JSON.parse(String(model.requests[0].input.findLast((item) => item.role === 'user')?.content))
      .message,
  ).toBe('Läs utkastet.');
  expect(
    voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append'),
  ).toHaveLength(2);
});

test('provider startup failure records unknown usage and leaves the same text session and draft usable', async () => {
  const usage: unknown[] = [];
  app = await createInstallation(undefined, {
    modelFetch: textModel(() => []).provider,
    liveFetch: async () => {
      throw new Error('Synthetic private provider failure');
    },
    liveUsage: (value) => {
      usage.push(value);
    },
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  await proposal(path);
  const session = await (
    await browser.post(path, {
      headers: { origin: app.origin },
      data: { externalAi: true, mapWork: true },
    })
  ).json();
  const response = await browser.post(`${path}/${session.id}/voice`, {
    headers: { origin: app.origin },
    data: { sdp: 'synthetic-offer', revision: 0, draftVersion: 1, contentVersion: 1 },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: 'voice_connection_failed' });
  expect(usage).toHaveLength(2);
  expect(usage[1]).toMatchObject({
    sessionId: null,
    seconds: null,
    final: false,
    outcome: 'failed',
  });
  const current = await (await browser.get(`${path}/${session.id}`)).json();
  expect(current.review.changes).toHaveLength(1);
  expect(current.phase).toBe('ready');
});

test('an aborted public retry request cannot commit its previously prepared operation after its body arrives', async () => {
  let step = 0;
  const model = textModel(() =>
    step++ === 0
      ? [modelTool('prepare_save', { version: 1, contentVersion: 1, operationId: 'provider-id' })]
      : [modelMessage('Försöket väntar.')],
  );
  const voice = await setupVoice(model.provider);
  await proposal(voice.path);
  await voice.poll();
  voice.transcript('Spara.');
  voice.delegate();
  await expect.poll(async () => (await voice.poll()).assistant.phase).toBe('recovery');
  const before = (await voice.poll()).assistant;
  const operation = before.operations[0];
  for (const data of [
    { operationId: operation.operationId, revision: before.revision - 1 },
    { operationId: 'unknown-operation', revision: before.revision },
  ]) {
    expect(
      (
        await browser.post(`${voice.path}/${voice.assistant.id}/retry`, {
          headers: { origin: app.origin },
          data,
        })
      ).status(),
    ).toBe(409);
  }
  const controller = new AbortController();
  let release!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      release = () => {
        stream.enqueue(
          new TextEncoder().encode(
            JSON.stringify({ operationId: operation.operationId, revision: before.revision }),
          ),
        );
        stream.close();
      };
    },
  });
  const cookie = (await browser.storageState()).cookies
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
  const init = {
    method: 'POST',
    headers: { cookie, origin: app.origin, 'content-type': 'application/json' },
    body,
    signal: controller.signal,
    duplex: 'half',
  } satisfies RequestInit & { duplex: 'half' };
  const response = app.fetch(new Request(`${voice.path}/${voice.assistant.id}/retry`, init));
  controller.abort();
  release();
  expect((await response).status).toBe(409);
  const map = await (await browser.get(voice.path.replace('/text-assistant', '/map'))).json();
  expect(map.objects).toEqual([]);
  expect(map.draft.changes).toHaveLength(1);
  expect((await voice.poll()).assistant.operations[0]).toMatchObject({
    operationId: operation.operationId,
    status: 'pending',
  });
});

test('voice selection commentary waits for the actual browser acknowledgement', async () => {
  let step = 0;
  const model = textModel(() =>
    step++ === 0
      ? [modelTool('show_map_object', { objectId: 'web-object' })]
      : [modelMessage('Visat.')],
  );
  const voice = await setupVoice(model.provider);
  await proposal(voice.path);
  await voice.poll();
  voice.transcript('Markera objektet.');
  voice.delegate();
  await expect
    .poll(async () => (await voice.poll()).assistant.selection?.objectId)
    .toBe('web-object');
  expect(voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append')).toEqual(
    [],
  );
  const current = (await voice.poll()).assistant;
  const response = await browser.post(`${voice.path}/${voice.assistant.id}/selection`, {
    headers: { origin: app.origin },
    data: { objectId: 'web-object', revision: current.revision, displayed: true },
  });
  expect(response.status()).toBe(200);
  await expect
    .poll(
      () =>
        voice.live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
    )
    .toBe(1);
  expect(JSON.stringify(voice.live.sent.at(-1))).toContain('markerat i den öppna kartan');
});

test('the Live answer waits for actual sideband attachment and a replacement closes the previous connection', async () => {
  const voice = await setupVoice(textModel(() => []).provider, (live) => {
    const attach = live.attach;
    live.attach = (client, id) => {
      const channel = attach(client, id);
      const socket = live.sockets.get(id);
      if (!socket) throw new Error('Missing synthetic socket');
      socket.readyState = 0;
      queueMicrotask(() => {
        socket.readyState = 1;
        socket.emit('open');
      });
      return channel;
    };
  });
  const response = await browser.post(`${voice.path}/${voice.assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: { sdp: 'replacement-offer', revision: 0, draftVersion: 0, contentVersion: 1 },
  });
  expect(response.status(), await response.text()).toBe(201);
  expect(voice.live.channels.size).toBe(1);
  expect(voice.live.channels.has(voice.providerId)).toBe(false);
  const unknown = await browser.post(`${voice.path}/${voice.assistant.id}/voice/unknown/poll`, {
    headers: { origin: app.origin },
    data: { revision: 0, draftVersion: 0, contentVersion: 1 },
  });
  expect(unknown.status()).toBe(404);
});

test('an idle browser that stops its heartbeat releases Live resources without erasing the draft', async () => {
  const voice = await setupVoice(textModel(() => []).provider);
  await proposal(voice.path);
  await expect.poll(() => voice.live.channels.size, { timeout: 13_000, interval: 200 }).toBe(0);
  const current = await voice.poll();
  expect(current.voice).toMatchObject({ phase: 'error', error: 'voice_connection_lost' });
  expect(current.assistant.review.changes).toHaveLength(1);
}, 15_000);

test('sideband attachment failure closes the allocated session and preserves the authorized text fallback', async () => {
  let failAttachment = false;
  const voice = await setupVoice(textModel(() => []).provider, (live) => {
    const attach = live.attach;
    live.attach = (client, id) => {
      const channel = attach(client, id);
      if (failAttachment) {
        const socket = live.sockets.get(id);
        if (!socket) throw new Error('Missing synthetic socket');
        socket.readyState = 0;
        queueMicrotask(() => socket.emit('error', new Error('Synthetic attachment failure')));
      }
      return channel;
    };
  });
  failAttachment = true;
  const response = await browser.post(`${voice.path}/${voice.assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: { sdp: 'replacement-offer', revision: 0, draftVersion: 0, contentVersion: 1 },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: 'voice_connection_failed' });
  expect(voice.live.channels.size).toBe(0);
  expect((await browser.get(`${voice.path}/${voice.assistant.id}`)).status()).toBe(200);
});
