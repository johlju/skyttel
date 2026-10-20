import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { SaveOperation, SaveReceipt } from '../../src/shared/map.js';
import type { TextAssistantReview, TextAssistantView } from '../../src/shared/text-assistant.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openMap,
  openTable,
  signIn,
} from '../support/client.js';
import {
  openConversationText,
  openSavedHistory,
  readCommittedHistoryCard,
  startConversationWithText,
} from '../support/conversation-page.js';
import {
  editObjectRelationship,
  editTableObject,
  readDraftProposal,
  readTableObject,
} from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { manualTextDeliverySource } from '../support/manual-text-delivery.js';
import { verifyObjectDepartureAndDiscard } from '../support/object-form-departure.js';
import { propertyRow, setProperty } from '../support/property-controls.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { expect, test } from '../support/test.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../support/text-model.js';

test('manual text launcher public preparation seeded rejects an unaccepted delivery', {
  tag: '@technical',
}, async ({ page }) => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-text-assistant.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  let resolveReady!: (value: { origin: string; directory: string }) => void;
  const ready = new Promise<{ origin: string; directory: string }>((resolve) => {
    resolveReady = resolve;
  });
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
    const line = output.split('\n').find((value) => value.includes('"event":"ready"'));
    if (line) resolveReady(JSON.parse(line));
  });
  child.stderr.on('data', () => {});
  const app = await ready;
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const state = await (await page.request.get(path)).json();
    const response = await page.request.post(`${path}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        id: 'lo',
        baseRevision: null,
        value: {
          typeId: state.types[0].id,
          name: 'Lo Exempel',
          properties: [
            {
              id: 'description',
              label: 'Beskrivning',
              kind: 'text' as const,
              value: 'Påhittad uppgift',
            },
          ],
        },
      },
    });
    expect(response.status()).toBe(200);
    const before = await (await page.request.get(path)).json();
    expect(before.draft.changes).toHaveLength(1);
    expect(before.draft.changes[0]).toMatchObject({
      id: 'lo',
      before: null,
      after: {
        name: 'Lo Exempel',
        properties: expect.arrayContaining([
          expect.objectContaining({
            label: 'Beskrivning',
            kind: 'text',
            value: 'Påhittad uppgift',
          }),
        ]),
      },
    });
    await page.goto(`${app.origin}/households/${household.id}`);
    const result = await page.evaluate(async (url) => {
      const control = (
        window as unknown as {
          skyttelTextDelivery: { arm(): void; status(): { phase: string }; clear(): void };
        }
      ).skyttelTextDelivery;
      control.arm();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const result = { status: response.status, phase: control.status().phase };
      control.clear();
      return result;
    }, `${app.origin}/api/households/${household.id}/text-assistant/missing-session/messages`);
    expect(result).toEqual({ status: 404, phase: 'not-accepted' });
    expect(await (await page.request.get(path)).json()).toEqual(before);
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
    await page.reload();
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as { skyttelTextDelivery: { status(): { phase: string } } }
          ).skyttelTextDelivery.status().phase,
      ),
    ).toBe('idle');
  } finally {
    child.stdin.end('quit\n');
    if (child.exitCode === null) await once(child, 'exit');
    expect(child.exitCode).toBe(0);
    expect(output).toContain('"event":"closed"');
    await expect(access(app.directory)).rejects.toThrow();
  }
});

const assistant = (page: Page) => page.getByRole('region', { name: 'Arbetsyta', exact: true });
const transcript = (page: Page) => page.getByRole('log', { name: 'Samtalstext', exact: true });
const notice = (page: Page) => page.getByRole('region', { name: 'Samtalsnotis', exact: true });
async function consent(page: Page) {
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/text-assistant'),
  );
  await startConversationWithText(page);
  await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toBeVisible();
  return (await (await started).json()) as TextAssistantView;
}
async function send(page: Page, text: string) {
  await openConversationText(page);
  await assistant(page).getByLabel('Meddelande till Skyttel').fill(text);
  await assistant(page).getByRole('button', { name: 'Skicka', exact: true }).click();
}
async function showDraft(page: Page) {
  await openConversationText(page);
  const toggle = page.getByRole('button', { name: /^Visa utkastet/ });
  if (await toggle.isVisible()) await toggle.click();
  return assistant(page).getByRole('region', { name: 'Utkastet', exact: true });
}
async function showAttempts(page: Page) {
  const history = await openSavedHistory(page);
  await history.getByText('Identifiera sparandet och användaren', { exact: true }).last().click();
  return history;
}
async function arrange(page: Page, app: Awaited<ReturnType<typeof createInstallation>>) {
  await signIn(page.request, app.origin);
  const { household } = await (await createHousehold(page.request, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/map`;
  const state = await (await page.request.get(path)).json();
  const value = {
    typeId: state.types[0].id,
    name: 'Lo Exempel',
    properties: [
      { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Påhittad uppgift' },
    ],
  };
  await page.request.post(`${path}/draft`, {
    headers: { origin: app.origin },
    data: { version: 0, contentVersion: 1, id: 'lo', baseRevision: null, value },
  });
  await page.goto(app.origin);
  await openTable(page);
  return { path, value };
}

test('TEXT-01: familjeärendet sparas samlat med bevarad oskickad formulärtext', async ({
  page,
}) => {
  let step = 0;
  let version = 0;
  let releaseModel = () => {};
  const heldModel = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  const model = textModel(async (body) => {
    await heldModel;
    const current = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content))
      .draft as TextAssistantReview;
    if (step++ === 0)
      return [
        modelTool('resolve_conflict', {
          version: current.version,
          contentVersion: current.contentVersion,
          conflict: current.conflicts[0],
          choice: 'proposed',
        }),
      ];
    if (step === 2) {
      version = lastToolResult(body).version;
      return [modelTool('read_map', { query: 'Familjens Molnmusik' })];
    }
    if (step === 3) {
      const { id, householdId: _household, revision, ...value } = lastToolResult(body).objects[0];
      return [
        modelTool('propose_object', {
          version,
          contentVersion: 1,
          id,
          baseRevision: revision,
          value: {
            ...value,
            properties: [
              {
                id: 'description',
                label: 'Beskrivning',
                kind: 'text' as const,
                value: 'Familjeabonnemang 189 kr per månad.',
              },
              { id: 'price', label: 'Pris', kind: 'text' as const, value: '189' },
              { id: 'currency', label: 'Valuta', kind: 'text' as const, value: 'SEK' },
              {
                id: 'paymentInterval',
                label: 'Betalningsintervall',
                kind: 'text' as const,
                value: 'månad',
              },
            ],
          },
        }),
      ];
    }
    return [
      modelTool('save_draft', {
        version: lastToolResult(body).version,
        contentVersion: 1,
        operationId: 'family-request',
      }),
    ];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const household = app.seedDemo();
    await signIn(page.request, app.origin);
    await page.goto(app.origin);
    await consent(page);
    await expect(await showDraft(page)).toContainText('Lo Lind');
    await send(page, 'Behåll Lo-förslaget, rätta priset till 189 kr och spara.');
    await expect.poll(() => model.requests.length).toBe(1);
    await closeTextView(page);
    await editTableObject(page, 'Kim Exempel');
    await setProperty(page, 'Beskrivning', 'Osänd text som ska finnas kvar');
    releaseModel();
    const path = `${app.origin}/api/households/${household.id}/map`;
    await expect
      .poll(async () => (await (await page.request.get(path)).json()).draft.changes)
      .toEqual([]);
    await expect(propertyRow(page, 'Beskrivning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Osänd text som ska finnas kvar',
    );
    await verifyObjectDepartureAndDiscard(page, { Beskrivning: 'Osänd text som ska finnas kvar' });
    await openConversationText(page);
    await expect(
      transcript(page)
        .getByRole('listitem')
        .filter({ hasText: /^Skyttel: Sparat\.$/ }),
    ).toHaveCount(1);
    await expect(await showDraft(page)).toContainText('Utkastet är tomt.');
    await expect(await showAttempts(page)).toContainText('Familjens Molnmusik');
    const savedSubscription = await readTableObject(page, 'Familjens Molnmusik');
    for (const value of ['Familjeabonnemang 189 kr per månad.', '189', 'SEK', 'månad'])
      await expect(savedSubscription).toContainText(value);
    const savedLo = await readTableObject(page, 'Lo Lind');
    await expect(savedLo).toContainText('Spelar piano i musikföreningen.');
    const familyHistory = await openSavedHistory(page);
    const familyReceipt = familyHistory
      .getByRole('article')
      .filter({ hasText: 'Familjens Molnmusik' })
      .first();
    await familyReceipt.getByText('Visa ändringarna', { exact: true }).click();
    for (const value of ['189', 'SEK', 'månad', 'Lo Lind', 'musik@example.test'])
      await expect(familyReceipt.locator('.history-changes')).toContainText(value);
    const map = await (
      await page.request.get(`${app.origin}/api/households/${household.id}/map`)
    ).json();
    expect(
      map.objects
        .find((object: { name: string }) => object.name === 'Familjens Molnmusik')
        .properties.find((property: { id: string }) => property.id === 'price'),
    ).toEqual({ id: 'price', label: 'Pris', kind: 'text', value: '189' });
    expect(map.objects.some((object: { name: string }) => object.name === 'Lo Lind')).toBe(true);
    expect(map.draft.changes).toEqual([]);
    expect(
      map.relationships.every(
        (edge: { sourceId: string; targetId: string }) =>
          typeof edge.sourceId === 'string' && typeof edge.targetId === 'string',
      ),
    ).toBe(true);
    expect(JSON.stringify(map.relationships)).toContain('Osäkert uppgivet');
    expect(model.requests).toHaveLength(4);
  } finally {
    releaseModel();
    await app.close();
  }
});

test('TEXT-02: sena svar efter kastat utkast och avbrott ändrar inte nytt arbete', async ({
  page,
}) => {
  let release!: (output: unknown[]) => void;
  let held = false;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        held = true;
        release = resolve;
      }),
  );
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { path, value } = await arrange(page, app);
    const started = await consent(page);
    await send(page, 'Rätta namnet.');
    await expect.poll(() => held).toBe(true);
    await expect(transcript(page)).toContainText('Skyttel arbetar');
    await page.request.post(`${path}/discard`, {
      headers: { origin: app.origin },
      data: { version: 1, contentVersion: 1 },
    });
    release([
      modelTool('propose_object', {
        version: 1,
        contentVersion: 1,
        id: 'lo',
        baseRevision: null,
        value: { ...value, name: 'För sent' },
      }),
    ]);
    await expect(notice(page)).toHaveText('Skyttel kunde inte slutföra uppdraget. Försök igen.');
    expect(
      (
        await (
          await page.request.get(`${path.replace(/\/map$/, '/text-assistant')}/${started.id}`)
        ).json()
      ).error,
    ).toBe('assistant_draft_changed');
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
    held = false;
    await send(page, 'Skapa ett nytt förslag.');
    await expect.poll(() => held).toBe(true);
    await assistant(page).getByRole('textbox', { name: 'Meddelande till Skyttel' }).press('Escape');
    release([
      modelTool('propose_object', {
        version: 2,
        contentVersion: 1,
        id: 'late',
        baseRevision: null,
        value,
      }),
    ]);
    await expect(assistant(page)).toContainText(
      'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.',
    );
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
    await closeTextView(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const newForm = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await newForm.getByLabel('Namn', { exact: true }).fill('Nytt vanligt arbete');
    await setProperty(newForm, 'Beskrivning', 'Efter båda sena svaren');
    await newForm.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    expect((await (await page.request.get(path)).json()).draft.changes).toMatchObject([
      {
        after: {
          name: 'Nytt vanligt arbete',
          properties: expect.arrayContaining([
            expect.objectContaining({
              label: 'Beskrivning',
              kind: 'text',
              value: 'Efter båda sena svaren',
            }),
          ]),
        },
      },
    ]);
    const ordinaryProposal = await readDraftProposal(page, 'Nytt vanligt arbete');
    await expect(ordinaryProposal).toContainText('Efter båda sena svaren');
  } finally {
    await app.close();
  }
});

test('TEXT-03: nekade sparbesked och modellfel lämnar formulärarbetet tillgängligt', async ({
  page,
}) => {
  let fail = false;
  const model = textModel(() => {
    if (fail) throw new Error('Synthetic failure');
    return [modelTool('save_draft', { version: 1, contentVersion: 1, operationId: 'no-save' })];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { path } = await arrange(page, app);
    const started = await consent(page);
    const currentTask = async (): Promise<TextAssistantView> =>
      (await page.request.get(`${path.replace(/\/map$/, '/text-assistant')}/${started.id}`)).json();
    let revision = started.revision;
    for (const text of [
      'Spara inte.',
      'Vad händer om vi sparar?',
      'Spara ej.',
      'Spara senare.',
      'Skriv ”spara” i beskrivningen.',
    ]) {
      await send(page, text);
      await expect
        .poll(async () => {
          const current = await currentTask();
          return current.revision > revision && current.error === 'assistant_save_not_requested';
        })
        .toBe(true);
      revision = (await currentTask()).revision;
      await expect(notice(page)).toContainText(
        'Skyttel kunde inte slutföra uppdraget. Försök igen.',
      );
      expect((await (await page.request.get(path)).json()).objects).toEqual([]);
    }
    fail = true;
    await send(page, 'Beskriv mitt utkast.');
    await expect.poll(async () => (await currentTask()).error).toBe('assistant_provider_failed');
    await expect(notice(page)).toContainText('Skyttel kunde inte slutföra');
    await closeTextView(page);
    await editTableObject(page, 'Lo Exempel');
    await page.getByLabel('Namn', { exact: true }).fill('Lo Lind');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    expect((await (await page.request.get(path)).json()).draft.changes[0].after.name).toBe(
      'Lo Lind',
    );
    const corrected = await readDraftProposal(page, 'Lo Lind');
    await expect(corrected).toContainText('Person');
    await expect(corrected).toContainText('Påhittad uppgift');
  } finally {
    await app.close();
  }
});

test('TEXT-04: ett tappat sparbesked återfinns efter omstart utan dubbelt sparande', async ({
  page,
}) => {
  const preparation = await readFile(
    new URL('../../docs/manual-tests/text-conversation-preparation.md', import.meta.url),
    'utf8',
  );
  const consoleScripts = [...preparation.matchAll(/```js\n([\s\S]*?)\n```/g)].map(
    (match) => match[1],
  );
  const captureScript = consoleScripts.find((script) =>
    script.startsWith('const completedDelivery ='),
  );
  const comparisonScript = consoleScripts.find((script) =>
    script.startsWith('const expectedOperationId ='),
  );
  expect(captureScript).toBeDefined();
  expect(comparisonScript).toBeDefined();
  const model = textModel((body) => {
    const current = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    ).draft;
    return [
      modelTool('save_draft', {
        version: current.version,
        contentVersion: current.contentVersion,
        operationId: 'lost-browser-reply',
      }),
    ];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { path } = await arrange(page, app);
    const beforeSave = await (await page.request.get(path)).json();
    await consent(page);
    await page.evaluate(manualTextDeliverySource);
    await page.evaluate(() => {
      (window as unknown as { skyttelTextDelivery: { arm(): void } }).skyttelTextDelivery.arm();
    });
    let dropped = false;
    let committedReceipt: SaveReceipt | undefined;
    await page.route('**/text-assistant/*/messages', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(202);
      await expect
        .poll(async () =>
          (await (await page.request.get(`${path}/operations`)).json()).operations.some(
            (item: { status: string }) => item.status === 'succeeded',
          ),
        )
        .toBe(true);
      const operations = (await (await page.request.get(`${path}/operations`)).json())
        .operations as SaveOperation[];
      const committed = operations.find((operation) => operation.status === 'succeeded');
      if (committed?.status !== 'succeeded')
        throw new Error('Missing original committed receipt before delivery loss');
      committedReceipt = committed.receipt;
      dropped = true;
      await route.fulfill({ response });
    });
    await send(page, 'Spara hela utkastet nu.');
    await expect.poll(() => dropped).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as { skyttelTextDelivery: { status(): { phase: string } } }
            ).skyttelTextDelivery.status().phase,
        ),
      )
      .toBe('dropped-after-commit');
    await expect(notice(page)).toContainText(
      'Det är oklart om utkastet sparades. Skyttel kontrollerar det.',
    );
    const actualOperationId = await page.evaluate(
      () =>
        (
          window as unknown as { skyttelTextDelivery: { status(): { operationId: string } } }
        ).skyttelTextDelivery.status().operationId,
    );
    const capturedId = page.waitForEvent('console', {
      predicate: (message) => message.type() === 'log' && message.text() === actualOperationId,
    });
    await page.evaluate(captureScript as string);
    expect((await capturedId).text()).toBe(actualOperationId);
    await app.restart();
    await page.unroute('**/text-assistant/*/messages');
    await page.reload();
    await openTable(page);
    await consent(page);
    const history = await showAttempts(page);
    await expect(history.getByRole('article')).toHaveCount(1);
    await expect(history).toContainText('Lo Exempel');
    await expect(
      history.getByText(`Sparande: ${actualOperationId}`, { exact: true }),
    ).toBeVisible();
    if (!committedReceipt) throw new Error('Missing captured original receipt');
    expect(committedReceipt.operationId).toBe(actualOperationId);
    await readCommittedHistoryCard(history, committedReceipt);
    const verifiedComparison = page.waitForEvent('console', {
      predicate: (message) =>
        message.type() === 'log' &&
        message.text() === 'Historiken visar det ursprungliga sparandets ID.',
    });
    await page.evaluate(
      (comparisonScript as string).replace('KOPIERAT-FAKTISKT-ID', actualOperationId),
    );
    expect((await verifiedComparison).text()).toBe(
      'Historiken visar det ursprungliga sparandets ID.',
    );
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(history.locator('.history-changes')).toContainText('Påhittad uppgift');
    await expect(history.locator('.history-changes')).toContainText('Person');
    const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe('succeeded');
    expect(operations[0].operationId).toBe(actualOperationId);
    expect(operations[0].receipt).toEqual(committedReceipt);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      committedReceipt,
    ]);
    expect((await (await page.request.get(path)).json()).objects).toHaveLength(1);
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    const recoveredDraft = await showDraft(page);
    await expect(recoveredDraft.getByText('Utkastet är tomt.', { exact: true })).toBeVisible();
    const afterRecovery = await (await page.request.get(path)).json();
    expect(afterRecovery.draft).toEqual({ version: beforeSave.draft.version + 1, changes: [] });
  } finally {
    await app.close();
  }
});

test('TEXT-05: markering kräver visning och skyddar oskickad text', async ({ page }) => {
  let step = 0;
  let releaseDisplay = () => {};
  const heldDisplay = new Promise<void>((resolve) => {
    releaseDisplay = resolve;
  });
  const model = textModel(async () => {
    if (step === 2) await heldDisplay;
    return step++ % 2 === 0
      ? [modelTool('show_map_object', { objectId: 'lo' })]
      : [modelMessage('Markerat!')];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    await arrange(page, app);
    await consent(page);
    await send(page, 'Markera Lo i kartan.');
    const selected = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    const mapStatus = page.getByRole('region', { name: 'Kartans status', exact: true });
    await expect(mapStatus).toContainText('Markerat i kartan.');
    await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toContainText(
      'Påhittad uppgift',
    );
    await openConversationText(page);
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await send(page, 'Markera Lo igen.');
    await expect.poll(() => model.requests.length).toBe(3);
    await closeTextView(page);
    await editTableObject(page, 'Lo Exempel');
    await setProperty(page, 'Beskrivning', 'Osänd uppgift');
    releaseDisplay();
    await expect.poll(() => model.requests.length).toBe(4);
    expect(lastToolResult(model.requests[3])).toMatchObject({ displayed: false });
    await expect(propertyRow(page, 'Beskrivning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Osänd uppgift',
    );
    await verifyObjectDepartureAndDiscard(page, { Beskrivning: 'Osänd uppgift' });
    await openConversationText(page);
    await expect(transcript(page)).toContainText('Markerat!');
    await openMap(page);
    await expect(mapStatus).not.toContainText('Markerat i kartan.');
  } finally {
    releaseDisplay();
    await app.close();
  }
});

test('TEXT-06: obekräftad samtalstext skiljs från sparande och markering', async ({ page }) => {
  const replies = [
    'Klart. Ändringarna är nu lagrade i hushållets karta.',
    'Saved successfully.',
    'Lo är nu vald och visas i kartan.',
    'Har du sparat tidigare, och vem betalar?',
  ];
  let step = 0;
  const model = textModel(() =>
    step < replies.length
      ? [modelMessage(replies[step++])]
      : [
          modelTool('save_draft', {
            version: 1,
            contentVersion: 1,
            operationId: 'provider-choice',
          }),
        ],
  );
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { path } = await arrange(page, app);
    const before = await (await page.request.get(path)).json();
    await openMap(page);
    await consent(page);
    const object = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    const selected = await object.getAttribute('aria-pressed');
    for (const reply of replies) {
      await send(page, 'Beskriv mitt utkast.');
      const conversation = assistant(page).getByRole('log', { name: 'Samtalstext', exact: true });
      await expect(conversation).toContainText(reply);
      // The reservation about errors stands in the consent text, not in the text view.
      await expect(
        assistant(page).getByRole('button', { name: 'Visa utkastet (1)', exact: true }),
      ).toBeVisible();
      await expect(object).toHaveAttribute('aria-pressed', selected ?? 'false');
      const current = await (await page.request.get(path)).json();
      expect(current.objects).toEqual(before.objects);
      expect(current.draft).toEqual(before.draft);
      expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
      const retained = await readDraftProposal(page, 'Lo Exempel');
      await expect(retained).toContainText('Lo Exempel');
      await expect(retained).toContainText('Person');
      await expect(retained).toContainText('Påhittad uppgift');
      await closeSupportDialog(page, 'Lo Exempel');
      await assistant(page)
        .getByRole('button', { name: /^Dölj utkastet/ })
        .click();
    }
    await send(page, 'Spara hela utkastet nu.');
    await expect(
      transcript(page)
        .getByRole('listitem')
        .filter({ hasText: /^Skyttel: Sparat\.$/ }),
    ).toHaveCount(1);
    const history = await showAttempts(page);
    await expect(history.getByRole('article')).toHaveCount(1);
    await expect(history).toContainText('Lo Exempel');
    expect((await (await page.request.get(path)).json()).objects).toMatchObject([{ id: 'lo' }]);
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(history.locator('.history-changes')).toContainText('Person');
    await expect(history.locator('.history-changes')).toContainText('Påhittad uppgift');
  } finally {
    await app.close();
  }
});

test('TEXT-09: samtalet beskriver verkliga ändringar i utkast och kvitto', async ({ page }) => {
  let step = 0;
  const model = textModel((body) => {
    const current = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    ).draft;
    const turn = step++;
    return [
      turn === 1
        ? modelTool('save_draft', {
            version: current.version,
            contentVersion: current.contentVersion,
            operationId: 'details-save',
          })
        : modelTool('report_result', { source: turn === 0 ? 'draft' : 'latest_save' }),
    ];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  try {
    const { path } = await arrange(page, app);
    const read = async () => (await page.request.get(path)).json();
    const post = async (route: string, data: object) => {
      const state = await read();
      const response = await page.request.post(`${path}/${route}`, {
        headers: { origin: app.origin },
        data: { version: state.draft.version, contentVersion: state.contentVersion, ...data },
      });
      expect(response.status(), await response.text()).toBe(200);
    };
    const state = await read();
    const usageType = state.relationshipTypes.find(
      (type: { name: string }) => type.name === 'Använder',
    );
    const paymentType = state.relationshipTypes.find(
      (type: { name: string }) => type.name === 'Betalar',
    );
    const service = {
      typeId: state.types.find((type: { name: string }) => type.name === 'Tjänst').id,
      name: 'Tonrum',
    };
    const relationship = { sourceId: 'lo', targetId: 'tonrum' };
    await post('draft', {
      id: 'tonrum',
      baseRevision: null,
      value: { ...service, lifecycle: 'active' },
    });
    await post('relationship', {
      id: 'lo-tonrum',
      baseRevision: null,
      value: { ...relationship, typeId: usageType.id },
    });
    await post('save', { operationId: 'details-baseline' });
    await page.reload();
    const relationshipForm = await editObjectRelationship(
      page,
      'Lo Exempel',
      'Lo Exempel → Använder → Tonrum',
    );
    await relationshipForm
      .getByLabel('Sambandstyp', { exact: true })
      .selectOption({ label: 'Betalar' });
    await stageRelationshipAndClose(page);
    const objectForm = await editTableObject(page, 'Tonrum');
    await objectForm.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await objectForm.getByLabel('Objektets status', { exact: true }).selectOption('ended');
    await objectForm
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    const nativeProposal = await showDraft(page);
    await expect(nativeProposal).toContainText('Gäller: Aktuellt → Upphört');
    await expect(nativeProposal).toContainText('Använder → Betalar');
    const nativeState = await read();
    expect(nativeState.draft.changes).toMatchObject([
      { id: 'tonrum', after: { ...service, lifecycle: 'ended' } },
    ]);
    expect(nativeState.draft.relationships).toMatchObject([
      { id: 'lo-tonrum', after: { ...relationship, typeId: paymentType.id } },
    ]);
    await post('draft', {
      id: 'tonrum',
      baseRevision: 1,
      value: { ...service, lifecycle: 'ended' },
    });
    await post('relationship', {
      id: 'lo-tonrum',
      baseRevision: 1,
      value: { ...relationship, typeId: paymentType.id },
    });
    await page.reload();
    await openTable(page);
    await consent(page);
    await openTable(page);
    const listPanel = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    const report = transcript(page);
    const beforeReview = await read();

    await send(page, 'Läs upp hela utkastet.');
    await expect(report).toContainText('Utkast:');
    await expect(report).toContainText('Tonrum (Gäller: aktuellt → upphört)');
    await expect(report).toContainText('Lo Exempel Använder Tonrum → Lo Exempel Betalar Tonrum');
    await expect(listPanel).toBeVisible();
    expect(await read()).toEqual(beforeReview);

    await send(page, 'Spara hela utkastet nu.');
    await expect(
      transcript(page)
        .getByRole('listitem')
        .filter({ hasText: /^Skyttel: Sparat\.$/ }),
    ).toHaveCount(1);
    const saved = await read();
    expect(saved.draft.changes).toEqual([]);
    expect(saved.draft.relationships ?? []).toEqual([]);
    expect(saved.objects.find((object: { id: string }) => object.id === 'tonrum').lifecycle).toBe(
      'ended',
    );
    expect(saved.relationships).toMatchObject([{ typeId: paymentType.id }]);
    await openTable(page);
    await page
      .getByRole('region', { name: 'Hushållets tabell', exact: true })
      .getByRole('button', { name: 'Filter', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Tabellens filter', exact: true })
      .getByLabel('Ta med upphörda', { exact: true })
      .check();
    await page.keyboard.press('Escape');
    const savedTonrum = await readTableObject(page, 'Tonrum');
    await expect(savedTonrum).toContainText('Manuellt upphört');
    await expect(savedTonrum).toContainText('Tjänst');
    const operations = await (await page.request.get(`${path}/operations`)).json();

    await send(page, 'Vad sparades senast?');
    await expect(report).toContainText('Sparandet:');
    await expect(report).toContainText('Tonrum (Gäller: aktuellt → upphört)');
    await expect(report).toContainText('Lo Exempel Använder Tonrum → Lo Exempel Betalar Tonrum');
    await expect(listPanel).toBeVisible();
    expect(await read()).toEqual(saved);
    expect(await (await page.request.get(`${path}/operations`)).json()).toEqual(operations);
    expect(model.requests).toHaveLength(3);
  } finally {
    await app.close();
  }
});
