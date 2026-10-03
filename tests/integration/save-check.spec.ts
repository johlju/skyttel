import { expect, test } from '@playwright/test';
import { createHousehold, openSettings, signIn } from '../support/client.js';
import {
  microphoneButton,
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../support/text-model.js';

const checking = 'Det är oklart om utkastet sparades. Skyttel kontrollerar det.';
const saved = 'Kontrollen visar att hela utkastet sparades. Ändringarna finns i hushållets karta.';
const notice = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Samtalsnotis', exact: true });

test('SPARKONTROLL-01: ett tappat sparbesked kontrolleras automatiskt före nytt arbete och förklaras en gång', async ({
  page,
}) => {
  const model = textModel((request) => {
    if (!lastToolResult(request))
      return [
        modelTool('save_draft', { version: 1, contentVersion: 1, operationId: 'checked-save' }),
      ];
    return [];
  });
  const app = await createInstallation(undefined, { modelFetch: model.provider });
  let release!: () => void;
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const state = await (await page.request.get(path)).json();
    await page.request.post(`${path}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: 0,
        contentVersion: 1,
        id: 'lo',
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Lo Exempel', description: '' },
      },
    });
    await page.goto(app.origin);
    await startConversationWithText(page);
    let lost = false;
    await page.route('**/text-assistant/*', async (route) => {
      const response = await route.fetch();
      const result = await response.json();
      if (!lost && result.receipt) {
        lost = true;
        await page.context().setOffline(true);
        await route.abort();
      } else await route.fulfill({ response });
    });
    await page.route('**/text-assistant/*/recover', async (route) => {
      const response = await route.fetch();
      if ((await response.json()).phase !== 'working')
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      await route.fulfill({ response });
    });
    await page.getByLabel('Meddelande till Skyttel').fill('Spara hela utkastet.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(notice(page)).toContainText(checking);
    await page.getByLabel('Meddelande till Skyttel').fill('Nästa uppdrag');
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeDisabled();
    await expect(microphoneButton(page)).toBeEnabled();
    await expect(microphoneButton(page)).toHaveAttribute(
      'aria-description',
      /Inte tillgängligt just nu\./,
    );
    let voiceStarts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/voice')) voiceStarts++;
    });
    await microphoneButton(page).click();
    expect(voiceStarts).toBe(0);
    await expect(notice(page)).toContainText(checking);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(
      page.getByRole('button', { name: 'Kontrollera om utkastet sparades', exact: true }),
    ).toHaveCount(0);
    await page.context().setOffline(false);
    await expect.poll(() => typeof release).toBe('function');
    release();
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(saved);
    await expect(
      page
        .getByRole('log', { name: 'Samtalstext' })
        .getByRole('listitem')
        .filter({ hasText: saved }),
    ).toHaveCount(1);
    await expect(notice(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Skicka', exact: true })).toBeEnabled();
    const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe('succeeded');
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      operations[0].receipt,
    ]);
  } finally {
    release?.();
    await app.close();
  }
});

for (const failCheck of [false, true])
  test(`SPARKONTROLL-02: omstart kontrollerar samma väntande försök utan medgivande${failCheck ? ' och bara en misslyckad kontroll kräver återförsök' : ''}`, async ({
    page,
  }) => {
    const app = await createInstallation(undefined, { modelFetch: textModel(() => []).provider });
    let release!: () => void;
    try {
      await signIn(page.request, app.origin);
      const { household } = await (await createHousehold(page.request, app.origin)).json();
      const path = `${app.origin}/api/households/${household.id}/map`;
      const state = await (await page.request.get(path)).json();
      await page.request.post(`${path}/draft`, {
        headers: { origin: app.origin },
        data: {
          version: 0,
          contentVersion: 1,
          id: 'lo',
          baseRevision: null,
          value: { typeId: state.types[0].id, name: 'Lo Exempel', description: '' },
        },
      });
      const attempt = { operationId: 'original-after-restart', version: 1, contentVersion: 1 };
      await page.request.post(`${path}/operations`, {
        headers: { origin: app.origin },
        data: attempt,
      });
      await app.restart();
      let requests = 0;
      const starts: string[] = [];
      page.on('request', (request) => {
        if (request.url().endsWith('/text-assistant') && request.method() === 'POST')
          starts.push(request.url());
      });
      await page.route('**/text-assistant/recover', async (route) => {
        requests++;
        if (failCheck && requests === 1) {
          await route.abort();
          return;
        }
        const response = await route.fetch();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await route.fulfill({ response });
      });
      await page.goto(app.origin);
      if (failCheck) {
        await expect(notice(page)).toContainText(
          'Skyttel kunde inte kontrollera om utkastet sparades.',
        );
        const retry = notice(page).getByRole('button', {
          name: 'Kontrollera om utkastet sparades',
          exact: true,
        });
        await expect(retry).toBeVisible();
        await retry.focus();
        await page.keyboard.press('Enter');
      }
      await expect(notice(page)).toContainText(checking);
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
      expect(starts).toEqual([]);
      await expect(page.getByRole('dialog', { name: 'Samtalsmedgivande' })).toHaveCount(0);
      await expect(
        notice(page).getByRole('button', { name: 'Kontrollera om utkastet sparades', exact: true }),
      ).toHaveCount(0);
      await expect.poll(() => typeof release).toBe('function');
      release();
      await expect(page.getByText(checking, { exact: true }).filter({ visible: true })).toHaveCount(
        0,
      );
      const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        operationId: attempt.operationId,
        draftVersion: attempt.version,
        contentVersion: attempt.contentVersion,
        status: 'succeeded',
      });
      const receipt = operations[0].receipt;
      expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([receipt]);
      await startConversationWithText(page);
      await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(saved);
      await expect(
        page
          .getByRole('log', { name: 'Samtalstext' })
          .getByRole('listitem')
          .filter({ hasText: saved }),
      ).toHaveCount(1);
      const replay = await page.request.post(`${path}/save`, {
        headers: { origin: app.origin },
        data: attempt,
      });
      expect((await replay.json()).receipt).toEqual(receipt);
      expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([receipt]);
    } finally {
      release?.();
      await app.close();
    }
  });

for (const microphoneOn of [false, true])
  test(`SPARKONTROLL-03: ett oregistrerat sparande förklaras en gång med mikrofonen ${microphoneOn ? 'på' : 'av'}`, async ({
    page,
  }) => {
    const live = liveProvider();
    const app = await createInstallation(undefined, {
      modelFetch: textModel(() => [modelMessage('Utkastet är kvar.')]).provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    const unsaved =
      'Kontrollen visar att utkastet inte sparades. Dina osparade ändringar ligger kvar.';
    try {
      await signIn(page.request, app.origin);
      const { household } = await (await createHousehold(page.request, app.origin)).json();
      await page.addInitScript({ content: liveBrowserFixtureSource });
      await page.goto(app.origin);
      await startConversationWithText(page);
      if (microphoneOn) await turnMicrophoneOn(page);
      await page.route('**/text-assistant/*/messages', async (route) => {
        await route.fetch();
        await route.abort();
      });
      await page.getByLabel('Meddelande till Skyttel').fill('Spara hela utkastet.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      const log = page.getByRole('log', { name: 'Samtalstext' });
      await expect(log).toContainText(unsaved);
      await expect(log.getByRole('listitem').filter({ hasText: unsaved })).toHaveCount(1);
      const commentary = () =>
        live.sent
          .filter(({ event }) => event.type === 'session.commentary.append')
          .map(({ event }) => (event.type === 'session.commentary.append' ? event.content : ''))
          .join('');
      if (microphoneOn) {
        await expect.poll(commentary).toContain(unsaved);
        expect(commentary().split(unsaved)).toHaveLength(2);
        await expect(page.locator('.conversation-announcement')).not.toContainText(unsaved);
        await page.evaluate((delta) => {
          window.skyttelVoiceFixture.emit({
            type: 'session.output_transcript.delta',
            event_id: crypto.randomUUID(),
            delta,
            start_ms: 0,
            end_ms: 100,
          });
          window.skyttelVoiceFixture.setSound('remote', true, 0.7);
        }, unsaved);
        await expect(voiceBox(page)).toHaveText('Skyttel talar');
        await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));
        await expect(voiceBox(page)).toHaveText('Lyssnar');
        await expect(voiceBox(page).locator('.voice-saved')).toHaveCount(0);
      } else {
        expect(commentary()).not.toContain(unsaved);
        await expect(page.locator('.conversation-announcement')).toContainText(unsaved);
        await turnMicrophoneOn(page);
        await page.waitForResponse((response) => response.url().endsWith('/poll'));
        expect(commentary()).not.toContain(unsaved);
      }
      await page.getByLabel('Meddelande till Skyttel').fill('Kontrollera ett nytt uppdrag.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(log.getByRole('listitem').filter({ hasText: unsaved })).toHaveCount(2);
      expect(
        (
          await (
            await page.request.get(`${app.origin}/api/households/${household.id}/map/operations`)
          ).json()
        ).operations,
      ).toEqual([]);
    } finally {
      await app.close();
    }
  });

test('SPARKONTROLL-04: verifierad sparåterhämtning stoppar fångst under kontrollen och visar Sparat först efter svaret', async ({
  page,
}) => {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: textModel(() => []).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  let release!: () => void;
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const state = await (await page.request.get(path)).json();
    await page.request.post(`${path}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: 0,
        contentVersion: 1,
        id: 'lo',
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Lo Exempel', description: '' },
      },
    });
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await startConversationWithText(page);
    await turnMicrophoneOn(page);
    await page.route('**/text-assistant/*/recover', async (route) => {
      const response = await route.fetch();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ response });
    });
    // This durably registered immutable attempt has the same public authority
    // as the user's earlier save command; recovery may not create another one.
    await page.request.post(`${path}/operations`, {
      headers: { origin: app.origin },
      data: { operationId: 'voice-recovered-original', version: 1, contentVersion: 1 },
    });
    await expect(notice(page)).toContainText(checking);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture.stats().microphoneTracks.every((track) => !track.enabled),
      ),
    ).toBe(true);
    await expect.poll(() => typeof release).toBe('function');
    release();
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(saved);
    await expect
      .poll(() =>
        live.sent
          .filter(({ event }) => event.type === 'session.commentary.append')
          .map(({ event }) => (event.type === 'session.commentary.append' ? event.content : ''))
          .join(''),
      )
      .toContain(`${saved} Sparat.`);
    await expect(voiceBox(page).locator('.voice-saved')).toHaveCount(0);
    await page.evaluate((delta) => {
      window.skyttelVoiceFixture.emit({
        type: 'session.output_transcript.delta',
        event_id: crypto.randomUUID(),
        delta,
        start_ms: 0,
        end_ms: 100,
      });
      window.skyttelVoiceFixture.setSound('remote', true, 0.7);
    }, `${saved} Sparat.`);
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    await expect(voiceBox(page).locator('.voice-saved')).toHaveCount(0);
    await voiceBox(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
    await expect(voiceBox(page)).toHaveText('Sparat');
    await expect(voiceBox(page).locator('.voice-saved')).toHaveCount(1);
    const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      operationId: 'voice-recovered-original',
      status: 'succeeded',
    });
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      operations[0].receipt,
    ]);
  } finally {
    release?.();
    await app.close();
  }
});

test('SPARKONTROLL-05: ett avvisat väntande försök förklaras som osparat och behåller samma privata utkast', async ({
  page,
}) => {
  const app = await createInstallation(undefined, { modelFetch: textModel(() => []).provider });
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const state = await (await page.request.get(path)).json();
    await page.request.post(`${path}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: 0,
        contentVersion: 1,
        id: 'lo',
        baseRevision: null,
        value: {
          typeId: state.types[0].id,
          name: 'Oklart Lo',
          description: '',
          identity: 'unresolved',
        },
      },
    });
    const draft = (await (await page.request.get(path)).json()).draft;
    await page.request.post(`${path}/operations`, {
      headers: { origin: app.origin },
      data: { operationId: 'rejected-original', version: 1, contentVersion: 1 },
    });
    await app.restart();
    await page.goto(app.origin);
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`${path}/operations`)).json()).operations[0]?.status,
      )
      .toBe('rejected');
    await startConversationWithText(page);
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Kontrollen visar att utkastet inte sparades. Dina osparade ändringar ligger kvar.',
    );
    const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      operationId: 'rejected-original',
      status: 'rejected',
      error: 'unresolved_identity',
    });
    expect((await (await page.request.get(path)).json()).draft).toEqual(draft);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
    await expect(
      page.getByRole('button', { name: 'Kontrollera om utkastet sparades', exact: true }),
    ).toHaveCount(0);
  } finally {
    await app.close();
  }
});

for (const lostRevocationReply of [false, true])
  test(`SPARKONTROLL-06: ett oklart sparförsök kontrolleras efter återkallat medgivande utan nytt sparande${lostRevocationReply ? ' även när återkallandets svar tappas' : ''}`, async ({
    page,
  }) => {
    const live = liveProvider();
    let step = 0;
    const model = textModel(() =>
      step++ === 0
        ? [modelTool('prepare_save', { version: 1, contentVersion: 1, operationId: 'provider-id' })]
        : [modelMessage('Försöket är förberett.')],
    );
    const app = await createInstallation(undefined, {
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    let release: (() => void) | undefined;
    try {
      await signIn(page.request, app.origin);
      const { household } = await (await createHousehold(page.request, app.origin)).json();
      const base = `${app.origin}/api/households/${household.id}`;
      const path = `${base}/map`;
      const state = await (await page.request.get(path)).json();
      await page.request.post(`${path}/draft`, {
        headers: { origin: app.origin },
        data: {
          version: 0,
          contentVersion: 1,
          id: 'lo',
          baseRevision: null,
          value: { typeId: state.types[0].id, name: 'Lo Exempel', description: '' },
        },
      });
      await page.addInitScript({ content: liveBrowserFixtureSource });
      await page.goto(app.origin);
      await startConversationWithText(page);
      await turnMicrophoneOn(page);
      await page.route('**/text-assistant/*/recover', (route) => route.abort());
      await page.getByLabel('Meddelande till Skyttel').fill('Spara hela utkastet.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(notice(page)).toContainText(
        'Skyttel kunde inte kontrollera om utkastet sparades.',
      );
      const original = (await (await page.request.get(`${path}/operations`)).json()).operations[0];
      expect(original.status).toBe('pending');
      await page.getByLabel('Meddelande till Skyttel').fill('Text som inte har skickats.');
      await openSettings(page);
      await page
        .locator('.settings-cards')
        .getByRole('link', { name: /^Samtal med Skyttel/ })
        .click();
      await page.getByRole('button', { name: 'Återkalla medgivandet', exact: true }).click();
      if (lostRevocationReply) {
        await page.route('**/conversation-consent/revoke', async (route) => {
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          await route.abort();
        });
        await page.route('**/text-assistant/recover', async (route) => {
          const response = await route.fetch();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          await route.fulfill({ response });
        });
      }
      await page
        .getByRole('button', { name: 'Återkalla och avsluta samtalet', exact: true })
        .click();
      await expect
        .poll(
          async () =>
            await page.evaluate(() =>
              window.skyttelVoiceFixture
                .stats()
                .microphoneTracks.every((track) => track.state === 'ended'),
            ),
        )
        .toBe(true);
      if (lostRevocationReply) await expect.poll(() => typeof release).toBe('function');
      else
        await expect(
          page.getByRole('status').filter({ hasText: 'Medgivandet är återkallat' }),
        ).toBeVisible();
      expect(
        (await (await page.request.get(`${base}/conversation-consent`)).json()).saved,
      ).toBeNull();
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      if (lostRevocationReply) {
        await expect(notice(page)).toContainText(checking);
        await expect(microphoneButton(page)).toBeEnabled();
        await expect(microphoneButton(page)).toHaveAttribute(
          'aria-description',
          /Inte tillgängligt just nu\./,
        );
        const microphoneRequests = await page.evaluate(
          () => window.skyttelVoiceFixture.stats().microphoneRequests,
        );
        await microphoneButton(page).click();
        expect(
          await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneRequests),
        ).toBe(microphoneRequests);
        await expect(notice(page)).toContainText(checking);
        await expect(page.getByRole('dialog', { name: 'Samtalsmedgivande' })).toHaveCount(0);
        release?.();
        await expect(
          page.getByText(checking, { exact: true }).filter({ visible: true }),
        ).toHaveCount(0);
      } else {
        await expect(notice(page)).toHaveCount(0);
        await expect(
          page.getByRole('status').filter({ hasText: `Kvitto: ${original.operationId}` }),
        ).toBeVisible();
      }
      const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        operationId: original.operationId,
        householdId: original.householdId,
        userId: original.userId,
        contentVersion: original.contentVersion,
        draftVersion: original.draftVersion,
        status: 'succeeded',
      });
      expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
        operations[0].receipt,
      ]);
      expect((await (await page.request.get(path)).json()).draft.changes).toHaveLength(0);
      expect(model.requests).toHaveLength(2);
      await startConversationWithText(page);
      await expect(page.getByLabel('Meddelande till Skyttel')).toHaveValue(
        'Text som inte har skickats.',
      );
      if (lostRevocationReply) {
        await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(saved);
        await expect(
          page.getByRole('log').getByRole('listitem').filter({ hasText: saved }),
        ).toHaveCount(1);
      } else
        await expect(page.getByRole('log', { name: 'Samtalstext' })).toHaveText(
          'Här visas det du och Skyttel säger och skriver.',
        );
      expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual(
        operations,
      );
    } finally {
      release?.();
      await app.close();
    }
  });
