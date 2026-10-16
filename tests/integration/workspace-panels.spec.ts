import type { Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openNewObject,
  openSettings,
  openTable,
  setAllLabels,
  signIn,
  utilityButton,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  closeConversationText,
  microphoneButton,
  openConversationText,
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { closeTableObject, editTableObject, readTableObject } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { createPreparedContext, expect, test } from '../support/test.js';
import { modelMessage, textModel } from '../support/text-model.js';

async function addObject(page: Page, name: string, description = '') {
  const form = await openNewObject(page);
  await form.getByLabel('Namn', { exact: true }).fill(name);
  if (description) await form.getByLabel('Beskrivning', { exact: true }).fill(description);
  await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
  await expect(form).not.toBeVisible();
}

test('PANEL-08: limited space switches between full-width work and text while voice continues', async ({
  page,
}) => {
  const live = liveProvider();
  const installation = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Hej.')]).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await addObject(page, 'Cykeln', 'Bevarad cykeltext');
    const before: MapState = await (await page.request.get(path)).json();
    await startConversationWithText(page);
    await turnMicrophoneOn(page);
    const conversation = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    await conversation.getByLabel('Meddelande till Skyttel').fill('Bevarat meddelande');
    await page.setViewportSize({ width: 640, height: 1000 });
    await expect(conversation).toBeVisible();
    await openTable(page);
    await expect(conversation).not.toBeVisible();
    const reading = await readTableObject(page, 'Cykeln');
    await expect(
      reading.getByRole('heading', { name: 'Cykeln · alla uppgifter', exact: true }),
    ).toBeVisible();
    await expect(reading.getByText('Bevarad cykeltext')).toBeVisible();
    await closeTableObject(page, 'Cykeln');
    await openConversationText(page);
    await expect(conversation.getByLabel('Meddelande till Skyttel')).toHaveValue(
      'Bevarat meddelande',
    );
    await closeConversationText(page);
    await openMap(page);
    await (await utilityButton(page, 'Navigera')).click();
    const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
    await expect(navigation).toBeVisible();
    await openConversationText(page);
    await expect(navigation).not.toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(conversation).toBeVisible();
    await expect(navigation).toBeVisible();
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(voiceBox(page)).toBeVisible();
    await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    await closeConversationText(page);
    await readTableObject(page, 'Cykeln');
    await closeTableObject(page, 'Cykeln');
    await openConversationText(page);
    await expect(conversation.getByLabel('Meddelande till Skyttel')).toHaveValue(
      'Bevarat meddelande',
    );
    const after: MapState = await (await page.request.get(path)).json();
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(after.draft).toEqual(before.draft);
  } finally {
    await installation.close();
  }
});

// PANEL-06 and PANEL-07 were retired with free reading-window geometry.
// Their IDs remain retired in the manual area; ordinary Navigation coverage remains separate.

test('PANEL-05: pending object staging keeps the modal and returns to reading before a new search', async ({
  page,
}) => {
  const installation = await createInstallation();
  let releaseResponse = () => {};
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openTable(page);
    const newObject = await utilityButton(page, 'Nytt objekt');
    for (const name of ['Cykeln', 'Bilen']) {
      await newObject.click();
      await page.getByLabel('Namn', { exact: true }).fill(name);
      await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(newObject).toBeFocused();
    }
    const search = page.getByLabel('Sök objekt i tabellen', { exact: true });
    await search.fill('Cykeln');
    const edit = page.getByRole('button', { name: 'Redigera Cykeln', exact: true });
    await edit.click();
    const form = page.getByRole('dialog', { name: 'Redigera Cykeln', exact: true });
    await form.getByLabel('Beskrivning', { exact: true }).fill('Skickad beskrivning');
    let responseReady = () => {};
    const ready = new Promise<void>((resolve) => {
      responseReady = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route('**/map/object-form', async (route) => {
      const response = await route.fetch();
      responseReady();
      await released;
      await route.fulfill({ response });
    });
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await ready;
    await expect(form.getByLabel('Beskrivning', { exact: true })).toBeDisabled();
    await expect(
      form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(form).toBeVisible();
    expect(
      await search.evaluate((element) => {
        element.focus();
        return document.activeElement === element;
      }),
    ).toBe(false);
    releaseResponse();
    await expect(form).not.toBeVisible();
    await expect(edit).toBeFocused();
    await openTable(page);
    await search.fill('Bi');
    await page.keyboard.type('len');
    await expect(search).toHaveValue('Bilen');
    await expect(search).toBeFocused();
    await expect(page.getByRole('button', { name: 'Redigera Bilen', exact: true })).toBeVisible();
    const state: MapState = await (await page.request.get(path)).json();
    expect(state.objects).toEqual([]);
    await search.fill('');
    const draft = await openDraftReview(page);
    await draft.getByRole('button', { name: 'Visa förslaget: Cykeln', exact: true }).click();
    const proposal = page.getByRole('dialog', { name: 'Cykeln', exact: true });
    await expect(proposal.getByText('Skickad beskrivning', { exact: true })).toBeVisible();
    await expect(proposal).toContainText('Cykeln');
    expect(
      state.draft.changes.find((change) => change.after?.name === 'Cykeln')?.after?.description,
    ).toBe('Skickad beskrivning');
  } finally {
    releaseResponse();
    await installation.close();
  }
});

test('PANEL-01: complete object dialogs stage separate proposals and native readers reuse each object', async ({
  page,
}) => {
  const installation = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Hej.')]).provider,
  });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    for (const name of ['Cykeln', 'Bilen', 'Garaget']) {
      const form = await openNewObject(page);
      await form.getByLabel('Namn', { exact: true }).fill(name);
      await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
      await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
      await expect(form.getByLabel('Namn', { exact: true })).toHaveValue(name);
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(form).not.toBeVisible();
    }
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    for (const name of ['Cykeln', 'Bilen', 'Garaget']) {
      const reader = await readTableObject(page, name);
      await expect(
        reader.getByRole('heading', { name: `${name} · alla uppgifter`, exact: true }),
      ).toBeVisible();
      await closeTableObject(page, name);
      const form = await editTableObject(page, name);
      await form.getByLabel('Beskrivning', { exact: true }).fill(`Lagt i utkastet om ${name}`);
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(form).not.toBeVisible();
    }
    await startConversationWithText(page);
    const conversation = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    await conversation.getByLabel('Meddelande till Skyttel').fill('Bevarat meddelande');
    await closeConversationText(page);
    for (let attempt = 0; attempt < 2; attempt++) {
      const reader = await readTableObject(page, 'Cykeln');
      await expect(reader).toHaveCount(1);
      await expect(reader.getByText('Lagt i utkastet om Cykeln')).toBeVisible();
      await expect(
        reader.getByRole('heading', { name: 'Cykeln · alla uppgifter', exact: true }),
      ).toBeVisible();
      await closeTableObject(page, 'Cykeln');
    }
    await openConversationText(page);
    await expect(conversation.getByLabel('Meddelande till Skyttel')).toHaveValue(
      'Bevarat meddelande',
    );
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    for (const name of ['Cykeln', 'Bilen', 'Garaget']) {
      const reader = await readTableObject(page, name);
      await expect(reader.getByText(`Lagt i utkastet om ${name}`, { exact: true })).toBeVisible();
      await closeTableObject(page, name);
    }
    const state: MapState = await (await page.request.get(path)).json();
    expect(state.objects).toHaveLength(3);
    expect(state.draft.changes).toEqual([]);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toHaveLength(2);
    await (await utilityButton(page, 'Rapporter')).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
    await expect(history.getByRole('article')).toHaveCount(2);
    const newest = history.getByRole('article').first();
    await newest.getByText('Visa ändringarna', { exact: true }).click();
    for (const name of ['Cykeln', 'Bilen', 'Garaget'])
      await expect(
        newest.getByText(`Beskrivning: Lagt i utkastet om ${name}`, { exact: true }),
      ).toBeVisible();
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
  } finally {
    await installation.close();
  }
});

test('PANEL-02: mobile reading navigation retains conversation and staged object details across resizing', async ({
  page,
}) => {
  const installation = await createInstallation(undefined, {
    modelFetch: async () => Response.json({ output: [] }),
  });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await addObject(page, 'Cykeln', 'Bevarad cykeltext');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    const before: MapState = await (await page.request.get(path)).json();
    await startConversationWithText(page);
    const conversation = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    await conversation.getByLabel('Meddelande till Skyttel').fill('Oskickad samtalstext');
    for (const width of [390, 320, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await closeConversationText(page);
      const reader = await readTableObject(page, 'Cykeln');
      const heading = reader.getByRole('heading', { name: 'Cykeln · alla uppgifter', exact: true });
      await expect(heading).toBeVisible();
      await expect(reader.getByText('Bevarad cykeltext')).toBeVisible();
      await expect(reader).toHaveCount(1);
      await closeTableObject(page, 'Cykeln');
      await expect(page.getByRole('button', { name: 'Cykeln', exact: true })).toBeFocused();
      await openConversationText(page);
      await expect(conversation.getByLabel('Meddelande till Skyttel')).toHaveValue(
        'Oskickad samtalstext',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect(await (await page.request.get(path)).json()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('PANEL-03: an intervening proposal preserves local text and rejects stale complete staging', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openTable(page);
    await addObject(page, 'Cykeln');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    const state: MapState = await (await page.request.get(path)).json();
    const source = state.objects[0];
    await editTableObject(page, 'Cykeln');
    const form = page.getByRole('dialog', { name: 'Redigera Cykeln', exact: true });
    await form.getByLabel('Beskrivning', { exact: true }).fill('Min oskickade text');
    const other = await createPreparedContext(browser);
    try {
      await signIn(other.request, installation.origin);
      const second = await other.newPage();
      await second.goto(installation.origin);
      const secondForm = await editTableObject(second, 'Cykeln');
      await secondForm
        .getByLabel('Beskrivning', { exact: true })
        .fill('Nyare förslag från samma användares andra klient');
      await secondForm
        .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
        .click();
      const reader = await readTableObject(second, 'Cykeln');
      await expect(
        reader.getByText(/Ditt förslag: Nyare förslag från samma användares andra klient/),
      ).toBeVisible();
      const native: MapState = await (await page.request.get(path)).json();
      expect(native.draft.changes[0].after).toMatchObject({
        name: 'Cykeln',
        description: 'Nyare förslag från samma användares andra klient',
        typeId: source.typeId,
      });
    } finally {
      await other.close();
    }
    const native: MapState = await (await page.request.get(path)).json();
    const response = await page.request.post(`${path}/draft`, {
      headers: { origin: installation.origin },
      data: {
        id: source.id,
        baseRevision: source.revision,
        version: native.draft.version,
        contentVersion: state.contentVersion,
        value: { ...source, description: 'Nyare förslag från samma användares andra klient' },
      },
    });
    expect(response.status()).toBe(200);
    const newer: MapState = await (await page.request.get(path)).json();
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('Dina uppgifter finns kvar.');
    await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue('Min oskickade text');
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Cykeln');
    expect(await (await page.request.get(path)).json()).toEqual(newer);
    await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await page.reload();
    await editTableObject(page, 'Cykeln');
    await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Nyare förslag från samma användares andra klient',
    );
    expect((await (await page.request.get(`${path}/history`)).json()).history).toHaveLength(1);
    await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    await (await utilityButton(page, 'Rapporter')).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
    await expect(history.getByRole('article')).toHaveCount(1);
    await history.getByRole('article').getByText('Visa ändringarna', { exact: true }).click();
    await expect(history.getByRole('article')).toContainText('Cykeln');
    await expect(history.getByRole('article')).not.toContainText(
      'Nyare förslag från samma användares andra klient',
    );
  } finally {
    await installation.close();
  }
});

test('PANEL-04: map selection preserves unsent relationship and type forms', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const headers = { origin: installation.origin };
    const initial: MapState = await (await page.request.get(path)).json();
    for (const [version, id, name] of [
      [0, 'bike', 'Cykeln'],
      [1, 'garage', 'Garaget'],
    ] as const) {
      expect(
        (
          await page.request.post(`${path}/draft`, {
            headers,
            data: {
              version,
              contentVersion: initial.contentVersion,
              id,
              baseRevision: null,
              value: { typeId: initial.types[0].id, name, description: '' },
            },
          })
        ).ok(),
      ).toBe(true);
    }
    expect(
      (
        await page.request.post(`${path}/relationship`, {
          headers,
          data: {
            version: 2,
            contentVersion: initial.contentVersion,
            id: 'edge',
            baseRevision: null,
            value: {
              typeId: initial.relationshipTypes[0].id,
              sourceId: 'bike',
              targetId: 'garage',
              knowledge: 'known',
            },
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await page.request.post(`${path}/save`, {
          headers,
          data: { version: 3, contentVersion: initial.contentVersion, operationId: 'setup' },
        })
      ).ok(),
    ).toBe(true);
    await page.goto(installation.origin);
    await setAllLabels(page, true);
    await openTable(page);
    await page.getByRole('button', { name: 'Samband för Cykeln', exact: true }).click();
    const relationships = page.getByRole('dialog', { name: 'Samband för Cykeln', exact: true });
    await relationships.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await relationships.getByLabel('Från objekt', { exact: true }).selectOption('garage');
    const blockedEdge = page.locator('[data-table-object="bike"][data-table-action="expand"]');
    expect(
      await blockedEdge.evaluate((element) => {
        element.focus();
        return document.activeElement === element;
      }),
    ).toBe(false);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(relationships.getByLabel('Från objekt', { exact: true })).toHaveValue('garage');
    await relationships.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await openMap(page);
    for (const [button, label, value, close] of [
      ['Ny objekttyp', 'Typens namn', 'Oskickad typ', 'Stäng typformuläret utan att skicka'],
      [
        'Ny sambandstyp',
        'Sambandstypens namn',
        'Oskickad riktning',
        'Stäng sambandstypen utan att skicka',
      ],
    ]) {
      await openSettings(page);
      await page
        .getByRole('navigation', { name: 'Inställningarnas sidor', exact: true })
        .getByRole('link', { name: 'Typer och egna fält', exact: true })
        .click();
      await page.getByRole('button', { name: button, exact: true }).click();
      await page.getByLabel(label, { exact: true }).fill(value);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await openMap(page);
      const edge = page.locator('.spatial-labels').getByRole('button', { name: /^Välj samband:/ });
      await edge.focus();
      await page.keyboard.press('Enter');
      await openSettings(page);
      await page
        .getByRole('navigation', { name: 'Inställningarnas sidor', exact: true })
        .getByRole('link', { name: 'Typer och egna fält', exact: true })
        .click();
      await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
      await page.getByRole('button', { name: close, exact: true }).click();
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    }
    const after: MapState = await (await page.request.get(path)).json();
    expect(after.draft.changes).toEqual([]);
    expect(after.draft.objectTypes ?? []).toEqual([]);
    expect(after.draft.relationshipTypes ?? []).toEqual([]);
  } finally {
    await installation.close();
  }
});
