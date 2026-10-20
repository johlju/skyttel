import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openNewObject,
  signIn,
} from '../support/client.js';
import {
  giveConversationConsent,
  microphoneButton,
  openConversationText,
  turnMicrophoneOn,
} from '../support/conversation-page.js';
import { editTableObject } from '../support/domain-work.js';
import {
  openProperties,
  propertyRow,
  propertyValue,
  propertyValues,
  setProperty,
} from '../support/property-controls.js';
import { createPreparedContext, expect, test } from '../support/test.js';

// Retain the populated workflow; its independently empty starting state is retired.
test('literal household preparation completes the family tools on seeded public installation', {
  tag: '@technical',
}, async ({ page, browser }) => {
  const document = await readFile('docs/manual-tests/household-work-preparation.md', 'utf8');
  const commands = [...document.matchAll(/^tool REQUEST [^\n]+$/gmu)].map((match) => match[0]);
  const replies = [...document.matchAll(/^reply REQUEST [^\n]+$/gmu)].map((match) => match[0]);
  const user = document.match(/^user Kim[^\n]+$/mu)?.[0];
  const delegate = document.match(/^delegate$/mu)?.[0];
  const graphics = [...document.matchAll(/```js\n([\s\S]*?)\n```/gu)]
    .map((match) => match[1])
    .find((source) => source.includes('WEBGL_lose_context'));
  if (commands.length !== 5 || replies.length !== 2 || !user || !delegate || !graphics)
    throw new Error('Missing published household preparation');
  // Literal recipes are extracted before the public launcher owns resources.
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/manual-voice.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: undefined },
  });
  type Event = {
    event: string;
    id?: string;
    name?: string;
    origin?: string;
    directory?: string;
    draft?: TextAssistantReview;
    lastToolResult?: MapState | TextAssistantReview;
  };
  const events: Event[] = [];
  let buffer = '';
  let diagnostics = '';
  child.stdout.on('data', (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) if (line.startsWith('{')) events.push(JSON.parse(line));
  });
  child.stderr.on('data', (chunk) => {
    diagnostics += String(chunk);
  });
  const memberContext = await createPreparedContext(browser);
  const member = await memberContext.newPage();
  const command = (line: string) => child.stdin.write(`${line}\n`);
  async function held(after: number) {
    await expect.poll(() => events.slice(after).some((item) => item.event === 'held')).toBe(true);
    const result = events.slice(after).find((item) => item.event === 'held');
    if (!result?.id) throw new Error('No current real held request');
    return result;
  }
  const replacements: Record<string, string> = {
    SUB: randomUUID(),
    PERSON: randomUUID(),
    EDGE: randomUUID(),
  };
  function render(template: string, request: Event, currentTask = false) {
    const review =
      !currentTask && request.lastToolResult && 'version' in request.lastToolResult
        ? request.lastToolResult
        : request.draft;
    const values = {
      ...replacements,
      REQUEST: request.id,
      V: review?.version,
      C: review?.contentVersion,
    };
    return template.replace(
      /\b(?:REQUEST|V|C|SUB|PERSON|EDGE|SUBTYPE|PERSON_TYPE|PAYMENT_TYPE|SR|PR|RR)\b/gu,
      (key) => String(values[key as keyof typeof values]),
    );
  }
  async function release(template: string, request: Event) {
    const after = events.length;
    command(render(template, request));
    return held(after);
  }
  try {
    await expect.poll(() => events.some((item) => item.event === 'ready')).toBe(true);
    const ready = events.find((item) => item.event === 'ready');
    if (!ready?.origin || !ready.directory) throw new Error('No real public installation');
    await signIn(page.request, ready.origin);
    const { household } = await (await createHousehold(page.request, ready.origin)).json();
    const path = `${ready.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const history = async (): Promise<SaveReceipt[]> =>
      (await (await page.request.get(`${path}/history`)).json()).history;
    await page.goto(ready.origin);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Bevarad cykel');
    await setProperty(page, 'Beskrivning', 'Oberoende sparat innehåll');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openDraftReview(page);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toHaveText(
      'Utkastet är sparat',
    );
    const before = await read();
    const previousReceipts = await history();
    expect(previousReceipts).toHaveLength(1);
    expect(before.objects).toHaveLength(1);
    command('identity robin');
    await expect
      .poll(() => events.some((item) => item.event === 'identity' && item.name === 'robin'))
      .toBe(true);
    await signIn(member.request, ready.origin, 'microsoft');
    const recipient = await (await member.request.get(`${ready.origin}/api/bootstrap`)).json();
    const identityAt = events.length;
    command('identity alex');
    await expect
      .poll(() =>
        events.slice(identityAt).some((item) => item.event === 'identity' && item.name === 'alex'),
      )
      .toBe(true);
    const invitation = await page.request.post(
      `${ready.origin}/api/households/${household.id}/invitations`,
      {
        headers: { origin: ready.origin },
        data: { userId: recipient.user.id },
      },
    );
    expect(invitation.status()).toBe(201);
    expect(
      (
        await member.request.post(`${ready.origin}/api/invitations/accept`, {
          headers: { origin: ready.origin },
          data: { code: (await invitation.json()).code },
        })
      ).status(),
    ).toBe(200);
    await member.goto(ready.origin);
    await openNewObject(member);
    await member.getByLabel('Namn', { exact: true }).fill('Robins notering');
    await setProperty(member, 'Beskrivning', 'Meningsfullt separat arbete');
    await member.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const privateDraft = (await (await member.request.get(path)).json()).draft;
    expect(privateDraft.changes).toHaveLength(1);
    expect(privateDraft.changes[0].after).toMatchObject({
      name: 'Robins notering',
      properties: expect.arrayContaining([
        expect.objectContaining({
          label: 'Beskrivning',
          kind: 'text',
          value: 'Meningsfullt separat arbete',
        }),
      ]),
    });
    await expect(page.locator('canvas')).toBeVisible();
    await page.evaluate(graphics);
    await expect(
      page.getByText('Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.', {
        exact: true,
      }),
    ).toBeVisible();
    await openConversationText(page);
    await page.getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await giveConversationConsent(page);
    await expect(page.getByRole('region', { name: 'Arbetsyta', exact: true })).toHaveAttribute(
      'data-session-active',
      'true',
    );
    const field = page.getByLabel('Meddelande till Skyttel');
    const after = events.length;
    await field.fill('Föreslå Familjens Molnmusik, ett familjeabonnemang för 179 SEK per månad.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    let request = await release(commands[0], await held(after));
    const catalog = request.lastToolResult as MapState;
    for (const [placeholder, collection, name, revision] of [
      ['SUBTYPE', catalog.types, 'Abonnemang', 'SR'],
      ['PERSON_TYPE', catalog.types, 'Person', 'PR'],
      ['PAYMENT_TYPE', catalog.relationshipTypes, 'Betalar', 'RR'],
    ] as const) {
      const type = collection.find((value) => value.name === name);
      if (!type) throw new Error('Missing actual catalogue type');
      replacements[placeholder] = type.id;
      replacements[revision] = String(type.revision);
    }
    request = await release(commands[1], request);
    command(render(replies[0], request));
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Familjeabonnemanget är föreslaget',
    );
    expect((await read()).objects).toEqual(before.objects);
    await turnMicrophoneOn(page);
    const voiceAt = events.length;
    command(user);
    command(delegate);
    request = await release(commands[2], await held(voiceAt));
    request = await release(commands[3], request);
    command(render(replies[1], request));
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Förslagen är fortfarande privata.',
    );
    const proposed = await read();
    expect(proposed.draft.changes).toHaveLength(2);
    expect(proposed.draft.relationships).toHaveLength(1);
    await closeTextView(page);
    const form = await editTableObject(page, 'Familjens Molnmusik');
    await openProperties(form);
    await expect(propertyRow(form, 'Pris').getByLabel('Värde', { exact: true })).toHaveValue('179');
    await setProperty(form, 'Pris', '189', 'text');
    await form.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
    await setProperty(form, 'Beskrivning', 'Rättad för hand');
    const correction = page.waitForResponse(`${path}/object-form`);
    const correctionDraft = correction.then(
      (response) => response.json() as Promise<MapState['draft']>,
    );
    const correctedMap = page.waitForResponse(async (response) => {
      const url = new URL(response.url());
      if (
        `${url.origin}${url.pathname}` !== path ||
        !url.searchParams.has('reload') ||
        response.request().method() !== 'GET' ||
        response.status() !== 200
      )
        return false;
      const draft = await correctionDraft;
      const refreshed = (await response.json()) as MapState;
      const changed = draft.changes.find(({ id }) => id === replacements.SUB)?.after;
      return (
        refreshed.draft.version === draft.version &&
        propertyValue(changed, 'Beskrivning') === 'Rättad för hand' &&
        propertyValues(changed).price === '189' &&
        JSON.stringify(refreshed.draft.changes.find(({ id }) => id === replacements.SUB)?.after) ===
          JSON.stringify(changed)
      );
    });
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const correctionResponse = await correction;
    expect(correctionResponse.status()).toBe(200);
    const correctedProperties = correctionResponse.request().postDataJSON().value.properties;
    expect(correctedProperties).toEqual([
      { id: 'price', label: 'Pris', kind: 'text', value: '189' },
      { id: 'currency', label: 'Valuta', kind: 'text', value: 'SEK' },
      { id: 'paymentInterval', label: 'Betalningsintervall', kind: 'text', value: 'månad' },
      {
        id: expect.stringMatching(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i),
        label: 'Beskrivning',
        kind: 'text',
        value: 'Rättad för hand',
      },
    ]);
    await (await correctedMap).finished();
    await expect(form).not.toBeVisible();
    const corrected = await read();
    await openConversationText(page);
    const savedAt = events.length;
    await field.fill('Spara hela utkastet nu.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    const saveRequest = await held(savedAt);
    expect(saveRequest.draft?.version).toBe(corrected.draft.version);
    expect(saveRequest.draft?.contentVersion).toBe(corrected.contentVersion);
    command(render(commands[4], saveRequest, true));
    await expect.poll(async () => (await history()).length).toBe(previousReceipts.length + 1);
    const receipts = await history();
    expect(receipts.slice(1)).toEqual(previousReceipts);
    const receipt = receipts[0];
    expect(receipt).toMatchObject({
      userId: corrected.userId,
      householdId: household.id,
      draftVersion: corrected.draft.version,
      contentVersion: corrected.contentVersion,
    });
    expect(receipt.changes).toHaveLength(2);
    for (const change of corrected.draft.changes)
      expect(receipt.changes.find(({ after }) => after?.id === change.id)).toMatchObject({
        before: null,
        after: change.after,
      });
    expect(receipt.relationships).toHaveLength(1);
    expect(receipt.relationships?.[0]).toMatchObject({
      before: null,
      after: corrected.draft.relationships?.[0].after,
    });
    const operations = await (await page.request.get(`${path}/operations`)).json();
    expect(operations.operations).toHaveLength(previousReceipts.length + 1);
    expect(
      operations.operations.find(
        (operation: { operationId: string }) => operation.operationId === receipt.operationId,
      ),
    ).toMatchObject({ status: 'succeeded', receipt });
    await expect(page.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toHaveText(
      'Utkastet är sparat',
    );
    const saved = await read();
    expect(saved.objects).toHaveLength(before.objects.length + 2);
    expect(saved.draft.changes).toEqual([]);
    expect(saved.draft.relationships ?? []).toEqual([]);
    for (const object of before.objects)
      expect(saved.objects.find(({ id }) => id === object.id)).toEqual(object);
    expect(JSON.stringify(receipt)).not.toContain('Robins notering');
    expect(JSON.stringify(saved)).not.toContain('Robins notering');
    expect(saved.relationships).toHaveLength(before.relationships.length + 1);
    expect(saved.objects.find((object) => object.id === replacements.SUB)).toMatchObject({
      name: 'Familjens Molnmusik',
      properties: correctedProperties,
    });
    expect((await (await member.request.get(path)).json()).draft).toEqual(privateDraft);
    await microphoneButton(page).click();
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    command('restart');
    await expect.poll(() => events.some((item) => item.event === 'restarted')).toBe(true);
    await page.reload();
    await expect(page.locator('canvas')).toBeVisible();
    await page.evaluate(graphics);
    expect(await read()).toEqual(saved);
    expect(await history()).toEqual(receipts);
    expect((await (await member.request.get(path)).json()).draft).toEqual(privateDraft);
    command('quit');
    await expect.poll(() => child.exitCode).toBe(0);
    await expect(stat(ready.directory)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(events.filter((item) => item.event === 'error')).toEqual([]);
    expect(diagnostics).toBe('');
  } finally {
    if (child.exitCode === null) command('quit');
    await expect.poll(() => child.exitCode).toBe(0);
    await test.info().attach('literal-household-preparation-events', {
      body: JSON.stringify(events, null, 2),
      contentType: 'application/json',
    });
    await memberContext.close();
  }
});
